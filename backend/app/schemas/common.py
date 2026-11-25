from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    solver_available: bool
    ml_engine_available: bool
    timestamp: str


class SystemComponentSpec(BaseModel):
    solar_rated_kw: Optional[float] = Field(default=None, description="Configured Solar PV capacity (kW)")
    wind_rated_kw: Optional[float] = Field(default=None, description="Configured Wind Turbine capacity (kW)")
    battery_capacity_kwh: float = 500.0
    battery_max_charge_kw: float = 150.0
    battery_max_discharge_kw: float = 150.0
    battery_charge_efficiency: float = 0.94
    battery_discharge_efficiency: float = 0.94
    battery_min_soc_pct: float = 15.0
    battery_max_soc_pct: float = 95.0
    initial_soc_pct: float = 60.0
    grid_max_import_kw: float = 450.0
    grid_max_export_kw: float = 250.0
    distribution_loss_pct: float = 1.9
    tariff_per_kwh: Optional[float] = None
    carbon_intensity_g_per_kwh: Optional[float] = None


class SystemInfoResponse(BaseModel):
    service_name: str
    version: str
    supported_formats: List[str]
    max_upload_mb: float
    available_models: List[str]
    optimization_solver: str
    default_system_config: SystemComponentSpec
    active_datasets_count: int
