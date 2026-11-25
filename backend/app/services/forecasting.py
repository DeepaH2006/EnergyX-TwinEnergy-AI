import json
import pickle
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.schemas.datasets import ColumnMappingConfig
from app.schemas.forecasting import (
    CombinedForecastPoint,
    PredictRequest,
    PredictResponse,
)
from app.services.data_loader import (
    get_dataset_dir,
    load_dataset_dataframe,
    load_dataset_metadata,
)
from app.services.feature_engineering import resolve_target_series


def _generate_future_steps_for_target(
    artifact: Dict[str, Any],
    horizon_hours: int,
    model_override: Optional[str] = None,
) -> tuple[list[dict], str]:
    interval_min = max(1.0, float(artifact["interval_minutes"]))
    raw_steps = int(round((horizon_hours * 60.0) / interval_min))
    # Cap multi-step horizon at 672 steps (7 days @ 15min) for computational reliability
    n_steps = max(1, min(672, raw_steps))
    effective_step_min = (horizon_hours * 60.0) / n_steps if raw_steps > 672 else interval_min

    history = list(artifact["history_values"])
    last_ts = pd.to_datetime(artifact["last_timestamp"])
    feature_names: List[str] = artifact["feature_names"]
    latest_exo: Dict[str, float] = artifact.get("latest_exo", {})
    non_negative: bool = artifact.get("non_negative", True)
    steps_per_day: int = artifact.get("steps_per_day", 24)
    residual_std: float = float(artifact.get("residual_std", 0.0))
    q_low: float = float(artifact.get("q_low", -1.28 * residual_std))
    q_high: float = float(artifact.get("q_high", 1.28 * residual_std))

    chosen_model_name = artifact["selected_model"]
    model_type = artifact["model_type"]
    model_obj = artifact["final_model"]

    if model_override and model_override in artifact.get("all_models", {}):
        chosen_model_name = model_override
        model_type = "sklearn"
        model_obj = artifact["all_models"][model_override]
    elif model_override == "Persistence Baseline":
        chosen_model_name = "Persistence Baseline"
        model_type = "persistence"
    elif model_override == "Seasonal Naive (24h)" and len(history) >= steps_per_day:
        chosen_model_name = "Seasonal Naive (24h)"
        model_type = "seasonal_naive"

    future_points = []
    for step in range(1, n_steps + 1):
        ts = last_ts + timedelta(minutes=effective_step_min * step)
        lag_1 = history[-1] if len(history) >= 1 else 0.0
        lag_2 = history[-2] if len(history) >= 2 else lag_1
        lag_3 = history[-3] if len(history) >= 3 else lag_2
        lag_24h = history[-steps_per_day] if len(history) >= steps_per_day else lag_1

        if model_type == "persistence":
            y_hat = lag_1
        elif model_type == "seasonal_naive":
            y_hat = lag_24h
        else:
            hour_dec = ts.hour + ts.minute / 60.0
            past_window = history[-4:] if len(history) >= 4 else history
            row_dict: Dict[str, float] = {
                "hour_of_day": hour_dec,
                "hour_sin": float(np.sin(2 * np.pi * hour_dec / 24.0)),
                "hour_cos": float(np.cos(2 * np.pi * hour_dec / 24.0)),
                "day_of_week": float(ts.day_of_week),
                "month": float(ts.month),
                "is_weekend": float(1.0 if ts.day_of_week >= 5 else 0.0),
                "lag_1": float(lag_1),
                "lag_2": float(lag_2),
                "lag_3": float(lag_3),
                "lag_24h": float(lag_24h),
                "rolling_mean_past": float(np.mean(past_window)) if past_window else 0.0,
                "rolling_std_past": float(np.std(past_window)) if len(past_window) > 1 else 0.0,
            }
            for k, v in latest_exo.items():
                row_dict[k] = v

            X_step = pd.DataFrame([{fn: row_dict.get(fn, 0.0) for fn in feature_names}])
            y_hat = float(model_obj.predict(X_step)[0])

        if non_negative:
            y_hat = max(0.0, y_hat)

        # Empirical prediction interval widens modestly with sqrt of horizon normalized by daily cycle
        horizon_scale = np.sqrt(1.0 + (step / max(1, steps_per_day)) * 0.5)
        low = y_hat + q_low * horizon_scale
        high = y_hat + q_high * horizon_scale
        if non_negative:
            low = max(0.0, low)
            high = max(y_hat, high)

        history.append(y_hat)
        future_points.append({
            "timestamp": ts.isoformat(),
            "predicted": round(float(y_hat), 3),
            "low": round(float(low), 3),
            "high": round(float(high), 3),
        })

    return future_points, chosen_model_name


def generate_future_forecast(request: PredictRequest) -> PredictResponse:
    metadata = load_dataset_metadata(request.dataset_id)
    df = load_dataset_dataframe(request.dataset_id, cleaned=True)
    mapping = ColumnMappingConfig(**metadata["mapping"])

    ds_dir = get_dataset_dir(request.dataset_id)
    models_path = ds_dir / "models.pkl"
    metrics_path = ds_dir / "training_metrics.json"
    if not models_path.exists() or not metrics_path.exists():
        raise FileNotFoundError(f"Trained models not found for dataset '{request.dataset_id}'. Train models first.")

    with open(models_path, "rb") as f:
        artifacts: Dict[str, Any] = pickle.load(f)
    metrics_data = json.loads(metrics_path.read_text(encoding="utf-8"))

    horizon_map = {"24h": 24, "48h": 48, "7d": 168}
    horizon_hours = horizon_map[request.horizon]
    requested_targets = request.targets or list(artifacts.keys())

    warnings: List[str] = []
    models_used: Dict[str, str] = {}
    future_by_target: Dict[str, List[Dict[str, Any]]] = {}

    for target in requested_targets:
        if target not in artifacts:
            warnings.append(f"Target '{target}' has no trained model in this dataset.")
            continue
        fut_pts, used_name = _generate_future_steps_for_target(
            artifacts[target], horizon_hours=horizon_hours, model_override=request.model_override
        )
        future_by_target[target] = fut_pts
        models_used[target] = used_name

    if not future_by_target:
        raise ValueError("No trained targets are available to forecast.")

    # Build recent historical + held-out test actual/predicted series (last 72 points for crisp chart)
    ts_col = mapping.timestamp_col
    recent_tail = min(96, len(df))
    df_recent = df.tail(recent_tail).reset_index(drop=True)

    test_pred_lookup: Dict[str, Dict[str, float]] = {}
    for t_name, t_res in metrics_data.get("results", {}).items():
        if t_res.get("status") == "trained":
            test_pred_lookup[t_name] = {
                pt["timestamp"]: pt["predicted"] for pt in t_res.get("test_predictions", [])
            }

    solar_s, _ = resolve_target_series(df_recent, mapping, "solar")
    wind_s, _ = resolve_target_series(df_recent, mapping, "wind")
    demand_s, _ = resolve_target_series(df_recent, mapping, "demand")

    combined: List[CombinedForecastPoint] = []
    for idx, row in df_recent.iterrows():
        ts_iso = pd.to_datetime(row[ts_col]).isoformat()
        s_act = round(float(solar_s.iloc[idx]), 3) if solar_s is not None and pd.notna(solar_s.iloc[idx]) else None
        w_act = round(float(wind_s.iloc[idx]), 3) if wind_s is not None and pd.notna(wind_s.iloc[idx]) else None
        d_act = round(float(demand_s.iloc[idx]), 3) if demand_s is not None and pd.notna(demand_s.iloc[idx]) else None

        s_pred = test_pred_lookup.get("solar", {}).get(ts_iso)
        w_pred = test_pred_lookup.get("wind", {}).get(ts_iso)
        d_pred = test_pred_lookup.get("demand", {}).get(ts_iso)

        combined.append(
            CombinedForecastPoint(
                timestamp=ts_iso,
                is_future=False,
                solar_actual=s_act,
                solar_predicted=s_pred,
                wind_actual=w_act,
                wind_predicted=w_pred,
                demand_actual=d_act,
                demand_predicted=d_pred,
            )
        )

    # Append future predictions aligned by step index
    ref_target = next(iter(future_by_target.keys()))
    n_future = len(future_by_target[ref_target])

    total_future_solar = 0.0
    total_future_wind = 0.0
    total_future_demand = 0.0
    total_future_ren = 0.0
    interval_min = float(metrics_data["interval_minutes"])
    dt_hours = (horizon_hours / n_future) if n_future > 0 else (interval_min / 60.0)

    for i in range(n_future):
        ts_iso = future_by_target[ref_target][i]["timestamp"]
        s_pt = future_by_target["solar"][i] if "solar" in future_by_target else None
        w_pt = future_by_target["wind"][i] if "wind" in future_by_target else None
        d_pt = future_by_target["demand"][i] if "demand" in future_by_target else None
        tr_pt = future_by_target["total_renewable"][i] if "total_renewable" in future_by_target else None

        s_val = s_pt["predicted"] if s_pt else None
        w_val = w_pt["predicted"] if w_pt else None
        d_val = d_pt["predicted"] if d_pt else None

        if tr_pt is not None:
            ren_total = tr_pt["predicted"]
        elif s_val is not None or w_val is not None:
            ren_total = round((s_val or 0.0) + (w_val or 0.0), 3)
        else:
            ren_total = None

        net_bal = round(ren_total - d_val, 3) if (ren_total is not None and d_val is not None) else None

        if s_val is not None:
            total_future_solar += s_val * dt_hours
        if w_val is not None:
            total_future_wind += w_val * dt_hours
        if d_val is not None:
            total_future_demand += d_val * dt_hours
        if ren_total is not None:
            total_future_ren += ren_total * dt_hours

        combined.append(
            CombinedForecastPoint(
                timestamp=ts_iso,
                is_future=True,
                solar_predicted=s_val,
                solar_low=s_pt["low"] if s_pt else None,
                solar_high=s_pt["high"] if s_pt else None,
                wind_predicted=w_val,
                wind_low=w_pt["low"] if w_pt else None,
                wind_high=w_pt["high"] if w_pt else None,
                demand_predicted=d_val,
                demand_low=d_pt["low"] if d_pt else None,
                demand_high=d_pt["high"] if d_pt else None,
                total_renewable_predicted=ren_total,
                expected_net_balance_kw=net_bal,
            )
        )

    generated_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "predicted_solar_kwh": round(total_future_solar, 2),
        "predicted_wind_kwh": round(total_future_wind, 2),
        "predicted_renewable_kwh": round(total_future_ren, 2),
        "predicted_demand_kwh": round(total_future_demand, 2),
        "expected_net_kwh": round(total_future_ren - total_future_demand, 2),
        "horizon_hours": float(horizon_hours),
        "steps": float(n_future),
    }

    # Save latest forecast JSON for downstream Digital Twin, Optimization, and Recommendations
    forecast_cache = {
        "dataset_id": request.dataset_id,
        "generated_at": generated_at,
        "horizon": request.horizon,
        "interval_minutes": round(dt_hours * 60.0, 2),
        "models_used": models_used,
        "combined_series": [pt.model_dump() for pt in combined],
        "summary": summary,
    }
    (ds_dir / "latest_forecast.json").write_text(json.dumps(forecast_cache, indent=2), encoding="utf-8")

    return PredictResponse(
        dataset_id=request.dataset_id,
        generated_at=generated_at,
        horizon=request.horizon,
        interval_minutes=round(dt_hours * 60.0, 2),
        models_used=models_used,
        uncertainty_method="Empirical held-out test residual quantiles (5th–95th percentile) with horizon-scaled variance",
        combined_series=combined,
        summary=summary,
        warnings=warnings,
    )
