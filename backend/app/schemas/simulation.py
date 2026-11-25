from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field
from app.schemas.common import SystemComponentSpec
from app.schemas.optimization import OptimizationMetricsSummary, OptimizationSchedulePoint


class ScenarioAssumptions(BaseModel):
    name: str
    description: str = ""
    solar_pct: float = Field(default=100.0, ge=0.0, le=300.0)
    wind_pct: float = Field(default=100.0, ge=0.0, le=300.0)
    demand_pct: float = Field(default=100.0, ge=10.0, le=300.0)
    renewable_availability_pct: float = Field(default=100.0, ge=0.0, le=200.0)
    battery_capacity_kwh: float = Field(default=500.0, ge=0.0, le=50000.0)
    initial_soc_pct: float = Field(default=60.0, ge=0.0, le=100.0)
    grid_import_limit_kw: float = Field(default=450.0, ge=0.0, le=50000.0)
    grid_export_limit_kw: float = Field(default=250.0, ge=0.0, le=50000.0)


class ScenarioSimulateRequest(BaseModel):
    dataset_id: str
    horizon: Literal["24h", "48h", "7d"] = "24h"
    assumptions: ScenarioAssumptions
    base_system_config: SystemComponentSpec = Field(default_factory=SystemComponentSpec)


class ScenarioSimulateResponse(BaseModel):
    dataset_id: str
    scenario_name: str
    assumptions: ScenarioAssumptions
    solver_status: str
    infeasibility_reasons: List[str] = []
    summary: Optional[OptimizationMetricsSummary] = None
    baseline_reference: Optional[OptimizationMetricsSummary] = None
    schedule: List[OptimizationSchedulePoint] = []
    deltas_vs_baseline: Dict[str, Optional[float]] = {}


class ScenarioCompareRequest(BaseModel):
    dataset_id: str
    horizon: Literal["24h", "48h", "7d"] = "24h"
    base_system_config: SystemComponentSpec = Field(default_factory=SystemComponentSpec)
    custom_scenarios: List[ScenarioAssumptions] = []


class ScenarioComparisonRow(BaseModel):
    scenario_id: str
    scenario_name: str
    category: Literal["baseline", "forecast_based", "optimized", "what_if"]
    assumptions_summary: str
    solver_status: str
    renewable_utilization_pct: float
    grid_import_kwh: float
    grid_export_kwh: float
    energy_shortage_kwh: float
    battery_utilization_kwh: float
    energy_wastage_kwh: float
    peak_grid_import_kw: float
    operating_cost: Optional[float] = None
    delta_grid_import_pct_vs_baseline: Optional[float] = None
    delta_renewable_util_pct_vs_baseline: Optional[float] = None


class ScenarioCompareResponse(BaseModel):
    dataset_id: str
    horizon: str
    time_period_start: str
    time_period_end: str
    tariff_available: bool
    rows: List[ScenarioComparisonRow]
    notes: List[str] = []


class RecommendationItem(BaseModel):
    id: str
    title: str
    category: Literal[
        "battery_charging",
        "peak_discharge",
        "renewable_utilization",
        "grid_reduction",
        "deficit_preparation",
        "anomaly_investigation",
        "battery_limits",
    ]
    priority: Literal["high", "medium", "low"]
    reason: str
    supporting_data: str
    expected_operational_benefit: str
    relevant_time_period: str
    rejected_alternatives: List[str] = []


class RecommendationGenerateRequest(BaseModel):
    dataset_id: str
    horizon: Literal["24h", "48h", "7d"] = "24h"
    system_config: SystemComponentSpec = Field(default_factory=SystemComponentSpec)


class RecommendationGenerateResponse(BaseModel):
    dataset_id: str
    generated_at: str
    recommendations: List[RecommendationItem]
    system_context_summary: Dict[str, Optional[float]]
    warnings: List[str] = []


class ExplainAIRequest(BaseModel):
    question: Optional[str] = None
    summary_context: Dict[str, object]
    user_consent: bool = False


class ExplainAIResponse(BaseModel):
    status: Literal["success", "disabled", "unavailable", "error"]
    explanation: str
    grounded_metrics_used: Dict[str, object] = {}
