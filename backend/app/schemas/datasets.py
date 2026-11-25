from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    missing_count: int
    missing_pct: float
    numeric_parseable_pct: float
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    detected_role: Optional[str] = None
    confidence: float = 0.0
    sample_values: List[Any] = []


class ColumnMappingConfig(BaseModel):
    timestamp_col: Optional[str] = None
    solar_col: Optional[str] = None
    wind_col: Optional[str] = None
    demand_col: Optional[str] = None
    building_load_col: Optional[str] = None
    ev_load_col: Optional[str] = None
    battery_soc_col: Optional[str] = None
    battery_charge_col: Optional[str] = None
    battery_discharge_col: Optional[str] = None
    grid_import_col: Optional[str] = None
    grid_export_col: Optional[str] = None
    tariff_col: Optional[str] = None
    carbon_intensity_col: Optional[str] = None
    irradiance_col: Optional[str] = None
    wind_speed_col: Optional[str] = None
    temperature_col: Optional[str] = None
    humidity_col: Optional[str] = None
    voltage_col: Optional[str] = None
    current_col: Optional[str] = None
    feature_cols: List[str] = []


class DataQualitySnapshot(BaseModel):
    record_count: int
    column_count: int
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None
    detected_frequency: str
    detected_interval_minutes: Optional[float] = None
    is_regular_interval: bool = True
    irregular_interval_count: int = 0
    missing_value_count: int
    duplicate_timestamp_count: int
    invalid_numeric_count: int
    suspicious_outlier_count: int
    negative_generation_count: int = 0
    data_quality_status: Literal["good", "warning", "critical"]
    warnings: List[str] = []


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    filename: str
    file_size_bytes: int
    record_count: int
    column_count: int
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None
    detected_frequency: str
    detected_interval_minutes: Optional[float] = None
    missing_value_count: int
    duplicate_record_count: int
    data_quality_status: Literal["good", "warning", "critical"]
    suggested_mapping: ColumnMappingConfig
    columns: List[ColumnProfile]
    preview_rows: List[Dict[str, Any]]
    warnings: List[str] = []


class DatasetSummaryResponse(BaseModel):
    dataset_id: str
    filename: str
    file_size_bytes: int
    is_preprocessed: bool
    mapping: ColumnMappingConfig
    raw_quality: DataQualitySnapshot
    cleaned_quality: Optional[DataQualitySnapshot] = None
    columns: List[ColumnProfile]
    preprocessing_actions: List[str] = []
    available_targets: List[str] = []
    unavailable_targets_reasons: Dict[str, str] = {}


class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    source: Literal["raw", "cleaned"]
    total_rows: int
    offset: int
    limit: int
    columns: List[str]
    rows: List[Dict[str, Any]]


class PreprocessRequest(BaseModel):
    mapping: ColumnMappingConfig
    missing_strategy: Literal["past_ffill", "rolling_past_mean", "zero_fill_gen_past_ffill_load", "drop_rows"] = "past_ffill"
    duplicate_strategy: Literal["keep_first", "keep_last", "mean_aggregate"] = "mean_aggregate"
    clamp_negative_generation: bool = True
    max_ffill_steps: int = Field(default=4, ge=1, le=96)
    selected_targets: List[str] = []


class PreprocessResponse(BaseModel):
    dataset_id: str
    status: str
    before_quality: DataQualitySnapshot
    after_quality: DataQualitySnapshot
    actions_taken: List[str]
    warnings: List[str]
    available_targets: List[str]
    unavailable_targets_reasons: Dict[str, str]
    mapping: ColumnMappingConfig
    preview_rows: List[Dict[str, Any]]
