import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.config import settings
from app.schemas.datasets import (
    ColumnMappingConfig,
    ColumnProfile,
    DataQualitySnapshot,
    DatasetUploadResponse,
)

# Role detection patterns ordered by specificity
ROLE_PATTERNS: List[Tuple[str, List[str]]] = [
    ("timestamp_col", [r"timestamp", r"date_time", r"datetime", r"^date$", r"^time$", r"utc", r"period", r"interval"]),
    ("solar_col", [r"solar", r"pv_?power", r"pv_?gen", r"pv_?output", r"pv_?kw", r"photovoltaic"]),
    ("wind_col", [r"wind_?power", r"wind_?gen", r"wind_?output", r"wind_?kw", r"turbine", r"^wind$"]),
    ("building_load_col", [r"building", r"hvac", r"facility_load", r"campus_load", r"base_load"]),
    ("ev_load_col", [r"ev_?load", r"ev_?charging", r"ev_?demand", r"charger", r"charging_kw"]),
    ("demand_col", [r"demand", r"total_?load", r"^load$", r"consumption", r"load_kw", r"power_demand", r"usage"]),
    ("battery_soc_col", [r"soc", r"state_of_charge", r"battery_pct", r"batt_soc"]),
    ("battery_charge_col", [r"batt.*charg", r"charge_kw", r"charging_power"]),
    ("battery_discharge_col", [r"batt.*discharg", r"discharge_kw", r"discharging_power"]),
    ("grid_import_col", [r"grid_?import", r"import_kw", r"grid_buy", r"from_grid"]),
    ("grid_export_col", [r"grid_?export", r"export_kw", r"grid_sell", r"to_grid", r"feed_in"]),
    ("tariff_col", [r"tariff", r"price", r"rate_per_kwh", r"cost_per_kwh"]),
    ("carbon_intensity_col", [r"carbon", r"co2", r"emission"]),
    ("irradiance_col", [r"irradiance", r"ghi", r"dni", r"dhi", r"radiation", r"insolation"]),
    ("wind_speed_col", [r"wind_?speed", r"wind_vel", r"ws_?ms", r"anemometer"]),
    ("temperature_col", [r"temp", r"ambient_c", r"air_temp", r"cell_temp"]),
    ("humidity_col", [r"humid", r"rh_pct", r"relative_humidity"]),
    ("voltage_col", [r"volt", r"v_bus", r"kv"]),
    ("current_col", [r"current", r"amp", r"i_bus"]),
]


def _normalize_col_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def get_dataset_dir(dataset_id: str) -> Path:
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", dataset_id)
    if not safe_id:
        raise ValueError("Invalid dataset ID")
    return settings.UPLOAD_DIR / safe_id


def read_tabular_file(file_path: Path) -> pd.DataFrame:
    ext = file_path.suffix.lower()
    if ext == ".csv":
        for encoding in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                return pd.read_csv(file_path, encoding=encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("Unable to decode CSV file with utf-8 or latin-1 encoding.")
    elif ext in (".xlsx", ".xls"):
        engine = "openpyxl" if ext == ".xlsx" else "xlrd"
        return pd.read_excel(file_path, engine=engine)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Allowed: .csv, .xlsx, .xls")


def infer_timestamp_series(series: pd.Series) -> Tuple[pd.Series, float]:
    if pd.api.types.is_datetime64_any_dtype(series):
        return pd.to_datetime(series, errors="coerce"), 1.0
    if pd.api.types.is_numeric_dtype(series):
        return pd.Series([pd.NaT] * len(series)), 0.0
    sample = series.dropna().astype(str).head(50)
    if sample.empty:
        return pd.Series([pd.NaT] * len(series)), 0.0
    parsed_sample = pd.to_datetime(sample, errors="coerce")
    success_rate = float(parsed_sample.notna().mean())
    if success_rate >= 0.7:
        return pd.to_datetime(series, errors="coerce"), success_rate
    return pd.Series([pd.NaT] * len(series)), success_rate


def detect_frequency_info(ts: pd.Series) -> Tuple[str, Optional[float], bool, int]:
    valid_ts = ts.dropna().sort_values()
    if len(valid_ts) < 2:
        return "Unknown (< 2 valid timestamps)", None, False, 0

    diffs = valid_ts.diff().dropna().dt.total_seconds() / 60.0
    positive_diffs = diffs[diffs > 0]
    if positive_diffs.empty:
        return "Duplicate / Zero-interval timestamps", 0.0, False, int(len(diffs))

    median_min = float(positive_diffs.median())
    irregular_count = int((np.abs(positive_diffs - median_min) > max(1.0, 0.15 * median_min)).sum())
    is_regular = irregular_count == 0

    if median_min < 1.0:
        freq_label = f"{round(median_min * 60, 1)} sec"
    elif abs(median_min - 5) < 0.5:
        freq_label = "5 min"
    elif abs(median_min - 15) < 0.5:
        freq_label = "15 min"
    elif abs(median_min - 30) < 1.0:
        freq_label = "30 min"
    elif abs(median_min - 60) < 2.0:
        freq_label = "1 hour"
    elif abs(median_min - 1440) < 30.0:
        freq_label = "1 day"
    else:
        freq_label = f"~{round(median_min, 1)} min"

    if not is_regular:
        freq_label += f" (irregular: {irregular_count} gaps)"

    return freq_label, round(median_min, 2), is_regular, irregular_count


def auto_detect_columns(df: pd.DataFrame) -> Tuple[ColumnMappingConfig, List[ColumnProfile]]:
    mapping_dict: Dict[str, Any] = {}
    profiles: List[ColumnProfile] = []
    assigned_cols = set()

    # First pass: inspect every column for type, stats, and role match
    candidates: List[Tuple[str, str, float, ColumnProfile]] = []

    for col in df.columns:
        series = df[col]
        norm = _normalize_col_name(col)
        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / max(1, len(df))) * 100.0, 2)

        numeric_series = pd.to_numeric(series, errors="coerce")
        non_null_count = int(series.notna().sum())
        numeric_valid = int(numeric_series.notna().sum())
        numeric_pct = round((numeric_valid / max(1, non_null_count)) * 100.0, 1) if non_null_count > 0 else 0.0

        min_val = float(numeric_series.min()) if numeric_valid > 0 else None
        max_val = float(numeric_series.max()) if numeric_valid > 0 else None
        mean_val = round(float(numeric_series.mean()), 3) if numeric_valid > 0 else None

        sample_vals = [
            None if pd.isna(v) else (v.item() if hasattr(v, "item") else str(v) if isinstance(v, pd.Timestamp) else v)
            for v in series.head(5).tolist()
        ]

        best_role = None
        best_conf = 0.0

        # Check timestamp parseability first
        _, ts_rate = infer_timestamp_series(series)
        if ts_rate >= 0.75:
            best_role = "timestamp_col"
            best_conf = min(0.99, ts_rate)

        for role, patterns in ROLE_PATTERNS:
            for pat in patterns:
                if re.search(pat, norm):
                    conf = 0.92 if role != "timestamp_col" else max(0.85, ts_rate)
                    # Sanity check numeric ranges for specific roles
                    if role == "battery_soc_col" and max_val is not None and max_val > 105:
                        conf *= 0.4
                    if role in ("solar_col", "wind_col", "demand_col", "building_load_col", "ev_load_col") and numeric_pct < 50:
                        conf *= 0.3
                    if conf > best_conf:
                        best_role = role
                        best_conf = round(conf, 2)
                    break

        profile = ColumnProfile(
            name=str(col),
            dtype=str(series.dtype),
            missing_count=missing_count,
            missing_pct=missing_pct,
            numeric_parseable_pct=numeric_pct,
            min_val=round(min_val, 3) if min_val is not None and np.isfinite(min_val) else None,
            max_val=round(max_val, 3) if max_val is not None and np.isfinite(max_val) else None,
            mean_val=mean_val if mean_val is not None and np.isfinite(mean_val) else None,
            detected_role=best_role,
            confidence=round(best_conf, 2),
            sample_values=sample_vals,
        )
        profiles.append(profile)
        if best_role:
            candidates.append((best_role, str(col), best_conf, profile))

    # Assign highest confidence column per role
    candidates.sort(key=lambda x: x[2], reverse=True)
    for role, col_name, conf, _ in candidates:
        if role not in mapping_dict and col_name not in assigned_cols and conf >= 0.5:
            mapping_dict[role] = col_name
            assigned_cols.add(col_name)

    # Identify environmental / auxiliary feature columns
    feature_roles = ("irradiance_col", "wind_speed_col", "temperature_col", "humidity_col", "voltage_col", "current_col")
    feature_cols = [mapping_dict[r] for r in feature_roles if r in mapping_dict]
    mapping_dict["feature_cols"] = feature_cols

    return ColumnMappingConfig(**mapping_dict), profiles


def compute_quality_snapshot(df: pd.DataFrame, mapping: ColumnMappingConfig) -> DataQualitySnapshot:
    record_count = int(len(df))
    column_count = int(len(df.columns))
    missing_value_count = int(df.isna().sum().sum())
    warnings: List[str] = []

    ts_col = mapping.timestamp_col
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    freq_label = "No timestamp column mapped"
    interval_minutes: Optional[float] = None
    is_regular = False
    irregular_count = 0
    duplicate_ts_count = 0

    if ts_col and ts_col in df.columns:
        ts = pd.to_datetime(df[ts_col], errors="coerce")
        invalid_ts = int(ts.isna().sum())
        if invalid_ts > 0:
            warnings.append(f"{invalid_ts} row(s) have unparseable timestamps in '{ts_col}'.")
        valid_ts = ts.dropna()
        if not valid_ts.empty:
            date_start = valid_ts.min().isoformat()
            date_end = valid_ts.max().isoformat()
            duplicate_ts_count = int(valid_ts.duplicated().sum())
            freq_label, interval_minutes, is_regular, irregular_count = detect_frequency_info(valid_ts)
    else:
        duplicate_ts_count = int(df.duplicated().sum())
        warnings.append("No timestamp column detected or mapped. Chronological forecasting requires a timestamp column.")

    # Count invalid numerics, outliers, and negative generation across mapped numeric energy columns
    numeric_cols = [
        c for c in [
            mapping.solar_col,
            mapping.wind_col,
            mapping.demand_col,
            mapping.building_load_col,
            mapping.ev_load_col,
            mapping.battery_soc_col,
            mapping.grid_import_col,
            mapping.grid_export_col,
            mapping.irradiance_col,
            mapping.wind_speed_col,
            mapping.temperature_col,
        ]
        if c and c in df.columns
    ]

    invalid_numeric_count = 0
    suspicious_outlier_count = 0
    negative_generation_count = 0

    for col in numeric_cols:
        raw_non_null = df[col].dropna()
        parsed = pd.to_numeric(raw_non_null, errors="coerce")
        inv = int(parsed.isna().sum())
        invalid_numeric_count += inv

        valid_num = parsed.dropna()
        if len(valid_num) >= 8:
            q1 = valid_num.quantile(0.25)
            q3 = valid_num.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                outliers = ((valid_num < (q1 - 3.5 * iqr)) | (valid_num > (q3 + 3.5 * iqr))).sum()
                suspicious_outlier_count += int(outliers)

        if col in (mapping.solar_col, mapping.wind_col):
            neg = int((valid_num < 0).sum())
            negative_generation_count += neg

    if duplicate_ts_count > 0:
        warnings.append(f"Detected {duplicate_ts_count} duplicate timestamp record(s).")
    if missing_value_count > 0:
        warnings.append(f"Detected {missing_value_count} missing cell(s) across dataset.")
    if invalid_numeric_count > 0:
        warnings.append(f"Detected {invalid_numeric_count} non-numeric invalid value(s) in mapped energy columns.")
    if negative_generation_count > 0:
        warnings.append(f"Detected {negative_generation_count} negative renewable generation value(s).")
    if irregular_count > 0:
        warnings.append(f"Detected {irregular_count} irregular time interval step(s).")
    if record_count < 30:
        warnings.append(f"Only {record_count} records found. At least 30-50 records are recommended for ML validation.")

    if not ts_col or record_count < 10 or (invalid_numeric_count > record_count * 0.3):
        status = "critical"
    elif missing_value_count > 0 or duplicate_ts_count > 0 or invalid_numeric_count > 0 or irregular_count > 0 or record_count < 30:
        status = "warning"
    else:
        status = "good"

    return DataQualitySnapshot(
        record_count=record_count,
        column_count=column_count,
        date_range_start=date_start,
        date_range_end=date_end,
        detected_frequency=freq_label,
        detected_interval_minutes=interval_minutes,
        is_regular_interval=is_regular,
        irregular_interval_count=irregular_count,
        missing_value_count=missing_value_count,
        duplicate_timestamp_count=duplicate_ts_count,
        invalid_numeric_count=invalid_numeric_count,
        suspicious_outlier_count=suspicious_outlier_count,
        negative_generation_count=negative_generation_count,
        data_quality_status=status,
        warnings=warnings,
    )


def save_uploaded_dataset(filename: str, content: bytes) -> DatasetUploadResponse:
    safe_filename = Path(filename).name
    ext = Path(safe_filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension '{ext}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}")
    if len(content) == 0:
        raise ValueError("Uploaded file is empty.")
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValueError(f"File exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB.")

    dataset_id = str(uuid.uuid4())[:12]
    ds_dir = get_dataset_dir(dataset_id)
    ds_dir.mkdir(parents=True, exist_ok=True)

    raw_path = ds_dir / f"raw{ext}"
    raw_path.write_bytes(content)

    df = read_tabular_file(raw_path)
    if df.empty:
        raise ValueError("Uploaded dataset contains 0 rows.")

    # Save raw CSV snapshot for fast loading later
    df.to_csv(ds_dir / "raw_parsed.csv", index=False)

    suggested_mapping, profiles = auto_detect_columns(df)
    quality = compute_quality_snapshot(df, suggested_mapping)

    metadata = {
        "dataset_id": dataset_id,
        "filename": safe_filename,
        "file_size_bytes": len(content),
        "raw_ext": ext,
        "is_preprocessed": False,
        "mapping": suggested_mapping.model_dump(),
        "raw_quality": quality.model_dump(),
        "cleaned_quality": None,
        "columns": [p.model_dump() for p in profiles],
        "preprocessing_actions": [],
    }
    (ds_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    preview = df.head(15).replace({np.nan: None}).to_dict(orient="records")

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        filename=safe_filename,
        file_size_bytes=len(content),
        record_count=quality.record_count,
        column_count=quality.column_count,
        date_range_start=quality.date_range_start,
        date_range_end=quality.date_range_end,
        detected_frequency=quality.detected_frequency,
        detected_interval_minutes=quality.detected_interval_minutes,
        missing_value_count=quality.missing_value_count,
        duplicate_record_count=quality.duplicate_timestamp_count,
        data_quality_status=quality.data_quality_status,
        suggested_mapping=suggested_mapping,
        columns=profiles,
        preview_rows=preview,
        warnings=quality.warnings,
    )


def load_dataset_metadata(dataset_id: str) -> Dict[str, Any]:
    ds_dir = get_dataset_dir(dataset_id)
    meta_path = ds_dir / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Dataset '{dataset_id}' not found.")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def save_dataset_metadata(dataset_id: str, metadata: Dict[str, Any]) -> None:
    ds_dir = get_dataset_dir(dataset_id)
    (ds_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def load_dataset_dataframe(dataset_id: str, cleaned: bool = True) -> pd.DataFrame:
    ds_dir = get_dataset_dir(dataset_id)
    cleaned_path = ds_dir / "cleaned.csv"
    raw_path = ds_dir / "raw_parsed.csv"
    if cleaned and cleaned_path.exists():
        return pd.read_csv(cleaned_path)
    if raw_path.exists():
        return pd.read_csv(raw_path)
    raise FileNotFoundError(f"Dataset files for '{dataset_id}' not found.")
