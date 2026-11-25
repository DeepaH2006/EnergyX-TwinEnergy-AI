from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field
from app.schemas.common import SystemComponentSpec


class DigitalTwinSimulateRequest(BaseModel):
    dataset_id: str
    mode: Literal["historical", "predicted", "combined"] = "combined"
    system_config: SystemComponentSpec = Field(default_factory=SystemComponentSpec)
    wind_turbine_rated_kw: Optional[float] = None
    wind_cut_in_ms: float = 3.0
    wind_rated_ms: float = 12.0
    wind_cut_out_ms: float = 25.0


class DigitalTwinStep(BaseModel):
    timestamp: str
    data_origin: Literal["historical_dataset", "ml_prediction"]
    solar_kw: float
    wind_kw: float
    total_renewable_kw: float
    demand_kw: float
    battery_power_kw: float  # + charge, - discharge
    battery_soc_pct: float
    battery_energy_kwh: float
    grid_import_kw: float
    grid_export_kw: float
    curtailment_kw: float
    shortage_kw: float
    losses_kw: float
    energy_balance_residual_kw: float
    renewable_utilization_pct: float
    grid_dependency_pct: float


class DigitalTwinAlert(BaseModel):
    severity: Literal["info", "warning", "critical"]
    component: str
    timestamp: str
    message: str


class DigitalTwinSimulateResponse(BaseModel):
    dataset_id: str
    data_source_label: str
    interval_minutes: float
    latest_historical_state: Optional[DigitalTwinStep] = None
    latest_predicted_state: Optional[DigitalTwinStep] = None
    timeline: List[DigitalTwinStep]
    summary: Dict[str, float]
    alerts: List[DigitalTwinAlert]
    assumptions_used: List[str]
