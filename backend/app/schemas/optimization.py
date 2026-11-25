from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field
from app.schemas.common import SystemComponentSpec


class OptimizationRunRequest(BaseModel):
    dataset_id: str
    horizon: Literal["24h", "48h", "7d"] = "24h"
    use_source: Literal["predicted", "historical_test"] = "predicted"
    system_config: SystemComponentSpec = Field(default_factory=SystemComponentSpec)
    prioritize_cost: bool = True
    prioritize_emissions: bool = False
    peak_shaving_weight: float = Field(default=0.15, ge=0.0, le=2.0)
    strict_demand: bool = False


class OptimizationSchedulePoint(BaseModel):
    timestamp: str
    solar_kw: float
    wind_kw: float
    total_renewable_kw: float
    demand_kw: float
    solar_to_load_kw: float
    wind_to_load_kw: float
    battery_charge_kw: float
    battery_discharge_kw: float
    battery_net_kw: float
    battery_soc_pct: float
    grid_import_kw: float
    grid_export_kw: float
    curtailment_kw: float
    shortage_kw: float
    losses_kw: float
    interval_cost: Optional[float] = None
    interval_emissions_kg: Optional[float] = None


class ConstraintCheck(BaseModel):
    name: str
    satisfied: bool
    detail: str


class OptimizationMetricsSummary(BaseModel):
    total_renewable_kwh: float
    total_demand_kwh: float
    renewable_used_kwh: float
    renewable_utilization_pct: float
    grid_import_kwh: float
    grid_export_kwh: float
    grid_dependency_pct: float
    energy_shortage_kwh: float
    energy_curtailed_kwh: float
    battery_throughput_kwh: float
    peak_grid_import_kw: float
    total_cost: Optional[float] = None
    total_emissions_kg: Optional[float] = None
    tariff_available: bool = False
    carbon_data_available: bool = False


class OptimizationRunResponse(BaseModel):
    dataset_id: str
    solver_status: Literal["optimal", "infeasible", "error", "unavailable"]
    solver_name: str
    objective_value: Optional[float] = None
    infeasibility_reasons: List[str] = []
    interval_minutes: float
    schedule: List[OptimizationSchedulePoint]
    optimized_summary: Optional[OptimizationMetricsSummary] = None
    baseline_summary: Optional[OptimizationMetricsSummary] = None
    comparison_deltas: Dict[str, Optional[float]] = {}
    constraints_validation: List[ConstraintCheck] = []
    warnings: List[str] = []
