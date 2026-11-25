from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field


class ModelEvaluationResult(BaseModel):
    model_name: str
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape: Optional[float] = None
    mape_note: Optional[str] = None
    r2_score: Optional[float] = None
    r2_note: Optional[str] = None
    cv_rmse_mean: Optional[float] = None
    is_selected: bool = False


class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float


class TestPredictionPoint(BaseModel):
    timestamp: str
    actual: float
    predicted: float
    residual: float


class TargetTrainingResult(BaseModel):
    target: str
    status: Literal["trained", "insufficient_data", "unavailable", "failed"]
    reason: Optional[str] = None
    total_samples: int = 0
    training_samples: int = 0
    testing_samples: int = 0
    split_ratio: float = 0.8
    selected_model: Optional[str] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape: Optional[float] = None
    mape_note: Optional[str] = None
    r2_score: Optional[float] = None
    r2_note: Optional[str] = None
    residual_std: Optional[float] = None
    models_compared: List[ModelEvaluationResult] = []
    feature_importances: List[FeatureImportanceItem] = []
    features_used: List[str] = []
    test_predictions: List[TestPredictionPoint] = []
    warnings: List[str] = []


class TrainRequest(BaseModel):
    dataset_id: str
    targets: List[str] = Field(default_factory=lambda: ["solar", "wind", "demand"])
    test_ratio: float = Field(default=0.2, ge=0.1, le=0.4)
    include_environmental_features: bool = True


class TrainResponse(BaseModel):
    dataset_id: str
    trained_at: str
    overall_status: str
    sampling_frequency: str
    interval_minutes: float
    results: Dict[str, TargetTrainingResult]


class FutureForecastPoint(BaseModel):
    timestamp: str
    step_index: int
    predicted_value: float
    confidence_low: float
    confidence_high: float


class CombinedForecastPoint(BaseModel):
    timestamp: str
    is_future: bool
    solar_actual: Optional[float] = None
    solar_predicted: Optional[float] = None
    solar_low: Optional[float] = None
    solar_high: Optional[float] = None
    wind_actual: Optional[float] = None
    wind_predicted: Optional[float] = None
    wind_low: Optional[float] = None
    wind_high: Optional[float] = None
    demand_actual: Optional[float] = None
    demand_predicted: Optional[float] = None
    demand_low: Optional[float] = None
    demand_high: Optional[float] = None
    total_renewable_predicted: Optional[float] = None
    expected_net_balance_kw: Optional[float] = None


class PredictRequest(BaseModel):
    dataset_id: str
    horizon: Literal["24h", "48h", "7d"] = "24h"
    targets: Optional[List[str]] = None
    model_override: Optional[str] = None


class PredictResponse(BaseModel):
    dataset_id: str
    generated_at: str
    horizon: str
    interval_minutes: float
    models_used: Dict[str, str]
    uncertainty_method: str
    combined_series: List[CombinedForecastPoint]
    summary: Dict[str, float]
    warnings: List[str] = []
