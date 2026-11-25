import json
import pickle
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.schemas.datasets import ColumnMappingConfig
from app.schemas.forecasting import (
    FeatureImportanceItem,
    ModelEvaluationResult,
    TargetTrainingResult,
    TestPredictionPoint,
    TrainRequest,
    TrainResponse,
)
from app.services.data_loader import (
    get_dataset_dir,
    load_dataset_dataframe,
    load_dataset_metadata,
    save_dataset_metadata,
)
from app.services.feature_engineering import (
    build_causal_features,
    estimate_steps_per_day,
    resolve_target_series,
)

try:
    from xgboost import XGBRegressor  # type: ignore
    HAS_XGBOOST = True
except Exception:
    HAS_XGBOOST = False


def compute_safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> Tuple[Optional[float], Optional[str]]:
    max_abs = float(np.max(np.abs(y_true))) if len(y_true) > 0 else 0.0
    threshold = max(1.0, 0.05 * max_abs)
    mask = np.abs(y_true) >= threshold
    if int(mask.sum()) == 0:
        return None, f"MAPE omitted: all actual test values are near zero (< {round(threshold, 2)})."
    mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100.0)
    omitted = int((~mask).sum())
    note = f"Computed on {int(mask.sum())}/{len(y_true)} non-zero intervals (|y| >= {round(threshold, 2)})." if omitted > 0 else None
    return round(mape, 2), note


def compute_safe_r2(y_true: np.ndarray, y_pred: np.ndarray) -> Tuple[Optional[float], Optional[str]]:
    if len(y_true) < 3 or float(np.var(y_true)) < 1e-6:
        return None, "R² omitted: target test variance is effectively zero."
    score = float(r2_score(y_true, y_pred))
    return round(score, 4), None


def _build_candidate_models(n_train: int) -> Dict[str, Any]:
    models: Dict[str, Any] = {
        "Linear Regression (Ridge)": Pipeline([
            ("scaler", StandardScaler()),
            ("reg", Ridge(alpha=1.0)),
        ]),
        "Random Forest Regressor": RandomForestRegressor(
            n_estimators=80 if n_train >= 50 else 40,
            max_depth=10,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
        "HistGradientBoosting Regressor": HistGradientBoostingRegressor(
            max_iter=100,
            max_depth=6,
            learning_rate=0.08,
            min_samples_leaf=max(3, min(10, n_train // 10)),
            random_state=42,
        ),
    }
    if HAS_XGBOOST and n_train >= 40:
        models["XGBoost Regressor"] = XGBRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.08,
            random_state=42,
            verbosity=0,
        )
    return models


def _train_single_target(
    df: pd.DataFrame,
    mapping: ColumnMappingConfig,
    target: str,
    interval_minutes: float,
    steps_per_day: int,
    test_ratio: float,
    include_environmental: bool,
) -> Tuple[TargetTrainingResult, Optional[Dict[str, Any]]]:
    series, unavail_reason = resolve_target_series(df, mapping, target)
    if series is None:
        return (
            TargetTrainingResult(
                target=target,
                status="unavailable",
                reason=unavail_reason,
            ),
            None,
        )

    ts_col = mapping.timestamp_col
    if not ts_col or ts_col not in df.columns:
        return (
            TargetTrainingResult(
                target=target,
                status="unavailable",
                reason="Timestamp column is missing.",
            ),
            None,
        )

    X, y, ts_clean, feature_names, latest_exo = build_causal_features(
        df[ts_col],
        series,
        df,
        mapping,
        interval_minutes=interval_minutes,
        include_environmental=include_environmental,
    )

    n_total = len(X)
    if n_total < 20:
        return (
            TargetTrainingResult(
                target=target,
                status="insufficient_data",
                reason=(
                    f"Only {n_total} usable samples remain after lag feature engineering "
                    "(minimum 20 chronological samples required for train/test validation)."
                ),
                total_samples=n_total,
                warnings=["Insufficient historical records to train and validate a reliable ML model."],
            ),
            None,
        )

    # Strictly chronological train / test split (NO shuffling)
    split_idx = max(14, int(round(n_total * (1.0 - test_ratio))))
    if n_total - split_idx < 5:
        split_idx = n_total - 5

    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx].to_numpy(dtype=float), y.iloc[split_idx:].to_numpy(dtype=float)
    ts_test = ts_clean.iloc[split_idx:].tolist()

    warnings: List[str] = []
    if len(X_train) < 30:
        warnings.append(
            f"Small training set ({len(X_train)} samples). Accuracy may improve with more historical records."
        )

    non_negative = target in ("solar", "wind", "total_renewable", "demand", "grid_import")
    evaluated: List[ModelEvaluationResult] = []
    fitted_artifacts: Dict[str, Any] = {}

    # 1. Persistence Baseline: y_hat(t) = lag_1 = y(t-1)
    pers_pred = X_test["lag_1"].to_numpy(dtype=float)
    if non_negative:
        pers_pred = np.maximum(0.0, pers_pred)
    pers_mae = float(mean_absolute_error(y_test, pers_pred))
    pers_rmse = float(np.sqrt(mean_squared_error(y_test, pers_pred)))
    pers_mape, pers_mape_note = compute_safe_mape(y_test, pers_pred)
    pers_r2, pers_r2_note = compute_safe_r2(y_test, pers_pred)
    evaluated.append(
        ModelEvaluationResult(
            model_name="Persistence Baseline",
            mae=round(pers_mae, 3),
            rmse=round(pers_rmse, 3),
            mape=pers_mape,
            mape_note=pers_mape_note,
            r2_score=pers_r2,
            r2_note=pers_r2_note,
        )
    )
    fitted_artifacts["Persistence Baseline"] = {"type": "persistence", "preds": pers_pred}

    # 2. Seasonal Naive Baseline (if lag_24h exists)
    if "lag_24h" in X_test.columns:
        seas_pred = X_test["lag_24h"].to_numpy(dtype=float)
        if non_negative:
            seas_pred = np.maximum(0.0, seas_pred)
        s_mae = float(mean_absolute_error(y_test, seas_pred))
        s_rmse = float(np.sqrt(mean_squared_error(y_test, seas_pred)))
        s_mape, s_mape_note = compute_safe_mape(y_test, seas_pred)
        s_r2, s_r2_note = compute_safe_r2(y_test, seas_pred)
        evaluated.append(
            ModelEvaluationResult(
                model_name="Seasonal Naive (24h)",
                mae=round(s_mae, 3),
                rmse=round(s_rmse, 3),
                mape=s_mape,
                mape_note=s_mape_note,
                r2_score=s_r2,
                r2_note=s_r2_note,
            )
        )
        fitted_artifacts["Seasonal Naive (24h)"] = {"type": "seasonal_naive", "preds": seas_pred}

    # 3. ML Regressors with chronological TimeSeriesSplit CV where sufficient data exists
    candidates = _build_candidate_models(len(X_train))
    cv_splits = 3 if len(X_train) >= 60 else (2 if len(X_train) >= 36 else 0)

    for model_name, model in candidates.items():
        cv_rmse_mean: Optional[float] = None
        if cv_splits >= 2:
            tscv = TimeSeriesSplit(n_splits=cv_splits)
            fold_rmses = []
            for tr_idx, val_idx in tscv.split(X_train):
                from sklearn.base import clone
                m_cv = clone(model)
                m_cv.fit(X_train.iloc[tr_idx], y_train[tr_idx])
                p_val = m_cv.predict(X_train.iloc[val_idx])
                if non_negative:
                    p_val = np.maximum(0.0, p_val)
                fold_rmses.append(float(np.sqrt(mean_squared_error(y_train[val_idx], p_val))))
            cv_rmse_mean = round(float(np.mean(fold_rmses)), 3)

        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        if non_negative:
            preds = np.maximum(0.0, preds)

        mae = float(mean_absolute_error(y_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
        mape, mape_note = compute_safe_mape(y_test, preds)
        r2, r2_note = compute_safe_r2(y_test, preds)

        evaluated.append(
            ModelEvaluationResult(
                model_name=model_name,
                mae=round(mae, 3),
                rmse=round(rmse, 3),
                mape=mape,
                mape_note=mape_note,
                r2_score=r2,
                r2_note=r2_note,
                cv_rmse_mean=cv_rmse_mean,
            )
        )
        fitted_artifacts[model_name] = {"type": "sklearn", "model": model, "preds": preds}

    # Select best model strictly by lowest held-out test RMSE (tie-breaker MAE)
    evaluated.sort(key=lambda m: (m.rmse if m.rmse is not None else 1e12, m.mae if m.mae is not None else 1e12))
    best_eval = evaluated[0]
    best_eval.is_selected = True
    best_name = best_eval.model_name
    best_art = fitted_artifacts[best_name]
    best_preds = best_art["preds"]

    # Held-out test residuals for empirical uncertainty intervals
    residuals = y_test - best_preds
    residual_std = float(np.std(residuals)) if len(residuals) > 1 else 0.0
    q_low = float(np.quantile(residuals, 0.05))
    q_high = float(np.quantile(residuals, 0.95))

    # Feature importances from held-out test set
    importances: List[FeatureImportanceItem] = []
    if best_art["type"] == "sklearn":
        try:
            perm = permutation_importance(
                best_art["model"], X_test, y_test, n_repeats=5, random_state=42, scoring="neg_root_mean_squared_error"
            )
            raw_imp = np.maximum(0.0, perm.importances_mean)
            total_imp = float(raw_imp.sum())
            if total_imp > 0:
                norm_imp = raw_imp / total_imp
            else:
                norm_imp = np.ones(len(feature_names)) / max(1, len(feature_names))
            pairs = sorted(zip(feature_names, norm_imp), key=lambda x: x[1], reverse=True)
            importances = [
                FeatureImportanceItem(feature=f, importance=round(float(w), 4))
                for f, w in pairs[:8]
            ]
        except Exception:
            importances = []
    else:
        lag_name = "lag_1" if best_name.startswith("Persistence") else "lag_24h"
        importances = [FeatureImportanceItem(feature=lag_name, importance=1.0)]

    # Refit selected ML model on ALL data for forward future prediction, keeping held-out metrics untouched!
    final_model_obj = None
    if best_art["type"] == "sklearn":
        from sklearn.base import clone
        final_model_obj = clone(best_art["model"])
        final_model_obj.fit(X, y.to_numpy(dtype=float))

    test_points = [
        TestPredictionPoint(
            timestamp=pd.Timestamp(ts_val).isoformat(),
            actual=round(float(a), 3),
            predicted=round(float(p), 3),
            residual=round(float(a - p), 3),
        )
        for ts_val, a, p in zip(ts_test, y_test, best_preds)
    ]

    result = TargetTrainingResult(
        target=target,
        status="trained",
        total_samples=n_total,
        training_samples=len(X_train),
        testing_samples=len(X_test),
        split_ratio=round(len(X_train) / n_total, 2),
        selected_model=best_name,
        mae=best_eval.mae,
        rmse=best_eval.rmse,
        mape=best_eval.mape,
        mape_note=best_eval.mape_note,
        r2_score=best_eval.r2_score,
        r2_note=best_eval.r2_note,
        residual_std=round(residual_std, 3),
        models_compared=evaluated,
        feature_importances=importances,
        features_used=feature_names,
        test_predictions=test_points,
        warnings=warnings,
    )

    artifact = {
        "target": target,
        "selected_model": best_name,
        "model_type": best_art["type"],
        "final_model": final_model_obj,
        "all_models": {
            k: v.get("model") for k, v in fitted_artifacts.items() if v["type"] == "sklearn"
        },
        "feature_names": feature_names,
        "latest_exo": latest_exo,
        "non_negative": non_negative,
        "residual_std": residual_std,
        "q_low": q_low,
        "q_high": q_high,
        "steps_per_day": steps_per_day,
        "interval_minutes": interval_minutes,
        "history_values": pd.to_numeric(series, errors="coerce").dropna().tail(max(steps_per_day + 12, 48)).tolist(),
        "last_timestamp": pd.to_datetime(df[ts_col]).iloc[-1].isoformat(),
    }
    return result, artifact


def train_forecasting_models(request: TrainRequest) -> TrainResponse:
    metadata = load_dataset_metadata(request.dataset_id)
    df = load_dataset_dataframe(request.dataset_id, cleaned=True)
    mapping = ColumnMappingConfig(**metadata["mapping"])

    if not mapping.timestamp_col or mapping.timestamp_col not in df.columns:
        raise ValueError("Dataset must have a mapped timestamp column and be preprocessed before training.")

    interval_minutes, steps_per_day = estimate_steps_per_day(df[mapping.timestamp_col])
    if interval_minutes >= 60:
        freq_label = f"{round(interval_minutes / 60.0, 2)} hour(s)"
    else:
        freq_label = f"{interval_minutes} min"

    results: Dict[str, TargetTrainingResult] = {}
    artifacts: Dict[str, Any] = {}

    for target in request.targets:
        res, art = _train_single_target(
            df=df,
            mapping=mapping,
            target=target,
            interval_minutes=interval_minutes,
            steps_per_day=steps_per_day,
            test_ratio=request.test_ratio,
            include_environmental=request.include_environmental_features,
        )
        results[target] = res
        if art is not None:
            artifacts[target] = art

    ds_dir = get_dataset_dir(request.dataset_id)
    with open(ds_dir / "models.pkl", "wb") as f:
        pickle.dump(artifacts, f)

    trained_at = datetime.now(timezone.utc).isoformat()
    trained_summary = {
        "dataset_id": request.dataset_id,
        "trained_at": trained_at,
        "sampling_frequency": freq_label,
        "interval_minutes": interval_minutes,
        "results": {k: v.model_dump() for k, v in results.items()},
    }
    (ds_dir / "training_metrics.json").write_text(json.dumps(trained_summary, indent=2), encoding="utf-8")

    trained_count = sum(1 for r in results.values() if r.status == "trained")
    overall_status = "trained" if trained_count > 0 else "no_models_trained"

    metadata["last_trained_at"] = trained_at
    save_dataset_metadata(request.dataset_id, metadata)

    return TrainResponse(
        dataset_id=request.dataset_id,
        trained_at=trained_at,
        overall_status=overall_status,
        sampling_frequency=freq_label,
        interval_minutes=interval_minutes,
        results=results,
    )


def get_saved_training_metrics(dataset_id: str) -> TrainResponse:
    ds_dir = get_dataset_dir(dataset_id)
    metrics_path = ds_dir / "training_metrics.json"
    if not metrics_path.exists():
        raise FileNotFoundError(f"No trained models found for dataset '{dataset_id}'. Please train models first.")
    data = json.loads(metrics_path.read_text(encoding="utf-8"))
    results = {k: TargetTrainingResult(**v) for k, v in data["results"].items()}
    trained_count = sum(1 for r in results.values() if r.status == "trained")
    return TrainResponse(
        dataset_id=dataset_id,
        trained_at=data["trained_at"],
        overall_status="trained" if trained_count > 0 else "no_models_trained",
        sampling_frequency=data["sampling_frequency"],
        interval_minutes=data["interval_minutes"],
        results=results,
    )
