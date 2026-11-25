from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from app.schemas.datasets import ColumnMappingConfig


def resolve_target_series(
    df: pd.DataFrame, mapping: ColumnMappingConfig, target: str
) -> Tuple[Optional[pd.Series], Optional[str]]:
    if target == "solar":
        if mapping.solar_col and mapping.solar_col in df.columns:
            return pd.to_numeric(df[mapping.solar_col], errors="coerce"), None
        return None, "No solar generation column mapped."

    if target == "wind":
        if mapping.wind_col and mapping.wind_col in df.columns:
            return pd.to_numeric(df[mapping.wind_col], errors="coerce"), None
        return None, "No wind generation column mapped."

    if target == "total_renewable":
        has_s = bool(mapping.solar_col and mapping.solar_col in df.columns)
        has_w = bool(mapping.wind_col and mapping.wind_col in df.columns)
        if not has_s and not has_w:
            return None, "Neither solar nor wind column is mapped."
        s = pd.to_numeric(df[mapping.solar_col], errors="coerce").fillna(0.0) if has_s else 0.0
        w = pd.to_numeric(df[mapping.wind_col], errors="coerce").fillna(0.0) if has_w else 0.0
        return pd.Series(s + w, index=df.index), None

    if target == "demand":
        if mapping.demand_col and mapping.demand_col in df.columns:
            return pd.to_numeric(df[mapping.demand_col], errors="coerce"), None
        has_b = bool(mapping.building_load_col and mapping.building_load_col in df.columns)
        has_e = bool(mapping.ev_load_col and mapping.ev_load_col in df.columns)
        if has_b or has_e:
            b = pd.to_numeric(df[mapping.building_load_col], errors="coerce").fillna(0.0) if has_b else 0.0
            e = pd.to_numeric(df[mapping.ev_load_col], errors="coerce").fillna(0.0) if has_e else 0.0
            return pd.Series(b + e, index=df.index), None
        return None, "No demand/load column mapped."

    if target == "grid_import":
        if mapping.grid_import_col and mapping.grid_import_col in df.columns:
            return pd.to_numeric(df[mapping.grid_import_col], errors="coerce"), None
        return None, "No grid import column mapped."

    return None, f"Unknown target '{target}'."


def estimate_steps_per_day(timestamps: pd.Series) -> Tuple[float, int]:
    ts = pd.to_datetime(timestamps, errors="coerce").dropna().sort_values()
    if len(ts) < 2:
        return 60.0, 24
    diffs = ts.diff().dropna().dt.total_seconds() / 60.0
    pos = diffs[diffs > 0]
    if pos.empty:
        return 60.0, 24
    interval_min = float(pos.median())
    interval_min = max(1.0, interval_min)
    steps_per_day = max(1, int(round(1440.0 / interval_min)))
    return round(interval_min, 2), steps_per_day


def build_causal_features(
    timestamps: pd.Series,
    target_series: pd.Series,
    df: pd.DataFrame,
    mapping: ColumnMappingConfig,
    interval_minutes: float,
    include_environmental: bool = True,
) -> Tuple[pd.DataFrame, pd.Series, pd.Series, List[str], Dict[str, float]]:
    """
    Constructs strictly causal time-series features available at prediction origin.
    Never uses future target or future exogenous values.
    """
    ts = pd.to_datetime(timestamps)
    y = pd.to_numeric(target_series, errors="coerce")
    steps_per_day = max(1, int(round(1440.0 / max(1.0, interval_minutes))))

    feat = pd.DataFrame(index=df.index)
    feat["hour_of_day"] = ts.dt.hour + ts.dt.minute / 60.0
    feat["hour_sin"] = np.sin(2 * np.pi * feat["hour_of_day"] / 24.0)
    feat["hour_cos"] = np.cos(2 * np.pi * feat["hour_of_day"] / 24.0)
    feat["day_of_week"] = ts.dt.day_of_week.astype(float)
    feat["month"] = ts.dt.month.astype(float)
    feat["is_weekend"] = (ts.dt.day_of_week >= 5).astype(float)

    # Autoregressive target lags (strictly past values)
    feat["lag_1"] = y.shift(1)
    feat["lag_2"] = y.shift(2)
    feat["lag_3"] = y.shift(3)

    use_daily_lag = len(y) > steps_per_day + 12 and steps_per_day <= 288
    if use_daily_lag:
        feat["lag_24h"] = y.shift(steps_per_day)

    # Strictly causal rolling statistics computed on shifted series y(t-1)
    y_past = y.shift(1)
    roll_win = min(4, max(2, len(y) // 8))
    feat["rolling_mean_past"] = y_past.rolling(window=roll_win, min_periods=1).mean()
    feat["rolling_std_past"] = y_past.rolling(window=roll_win, min_periods=1).std().fillna(0.0)

    # Causal lagged environmental features (only available up to t-1 at prediction time)
    latest_exo: Dict[str, float] = {}
    if include_environmental:
        exo_candidates = []
        for col in [
            mapping.irradiance_col,
            mapping.wind_speed_col,
            mapping.temperature_col,
            mapping.humidity_col,
            *mapping.feature_cols,
        ]:
            if col and col in df.columns and col not in exo_candidates:
                # Avoid leaking target into itself
                if col not in (mapping.solar_col, mapping.wind_col, mapping.demand_col, mapping.grid_import_col):
                    exo_candidates.append(col)

        for col in exo_candidates[:6]:
            s_exo = pd.to_numeric(df[col], errors="coerce")
            if s_exo.notna().sum() >= max(10, int(0.6 * len(df))):
                lag_col = f"exo_{col}_lag1"
                feat[lag_col] = s_exo.shift(1)
                valid_exo = s_exo.dropna()
                if not valid_exo.empty:
                    latest_exo[lag_col] = float(valid_exo.iloc[-1])

    combined = feat.copy()
    combined["_target"] = y
    combined["_ts"] = ts
    combined = combined.dropna().reset_index(drop=True)

    feature_names = [c for c in feat.columns]
    X = combined[feature_names]
    y_clean = combined["_target"]
    ts_clean = combined["_ts"]

    return X, y_clean, ts_clean, feature_names, latest_exo
