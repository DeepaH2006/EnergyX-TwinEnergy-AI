import json
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from app.schemas.common import SystemComponentSpec
from app.schemas.datasets import ColumnMappingConfig
from app.schemas.digital_twin import (
    DigitalTwinAlert,
    DigitalTwinSimulateRequest,
    DigitalTwinSimulateResponse,
    DigitalTwinStep,
)
from app.services.data_loader import (
    get_dataset_dir,
    load_dataset_dataframe,
    load_dataset_metadata,
)
from app.services.feature_engineering import estimate_steps_per_day, resolve_target_series


def _wind_power_curve_kw(
    wind_speed_ms: float,
    rated_kw: float,
    cut_in: float = 3.0,
    rated_ms: float = 12.0,
    cut_out: float = 25.0,
) -> float:
    if wind_speed_ms < cut_in or wind_speed_ms >= cut_out:
        return 0.0
    if wind_speed_ms >= rated_ms:
        return rated_kw
    ratio = (wind_speed_ms ** 3 - cut_in ** 3) / max(1e-6, (rated_ms ** 3 - cut_in ** 3))
    return max(0.0, min(rated_kw, rated_kw * ratio))


def simulate_step_energy_balance(
    timestamp: str,
    data_origin: str,
    solar_kw: float,
    wind_kw: float,
    demand_kw: float,
    soc_pct: float,
    dt_hours: float,
    cfg: SystemComponentSpec,
    measured_batt_chg_kw: Optional[float] = None,
    measured_batt_dis_kw: Optional[float] = None,
    measured_grid_imp_kw: Optional[float] = None,
    measured_grid_exp_kw: Optional[float] = None,
) -> Tuple[DigitalTwinStep, float, List[DigitalTwinAlert]]:
    alerts: List[DigitalTwinAlert] = []

    solar_kw = max(0.0, float(solar_kw))
    wind_kw = max(0.0, float(wind_kw))
    demand_kw = max(0.0, float(demand_kw))
    total_ren = solar_kw + wind_kw

    cap_kwh = max(1e-6, cfg.battery_capacity_kwh) if cfg.battery_capacity_kwh > 0 else 0.0
    min_soc = max(0.0, min(100.0, cfg.battery_min_soc_pct))
    max_soc = max(min_soc, min(100.0, cfg.battery_max_soc_pct))
    soc_pct = max(0.0, min(100.0, float(soc_pct)))

    eta_c = max(0.1, min(1.0, cfg.battery_charge_efficiency))
    eta_d = max(0.1, min(1.0, cfg.battery_discharge_efficiency))

    # Ohmic / inverter distribution loss proportional to active throughput
    loss_frac = max(0.0, min(0.25, cfg.distribution_loss_pct / 100.0))
    losses_kw = round((total_ren + demand_kw) * 0.5 * loss_frac, 3)

    effective_demand = demand_kw + losses_kw
    net_kw = total_ren - effective_demand

    batt_chg_kw = 0.0
    batt_dis_kw = 0.0
    grid_imp_kw = 0.0
    grid_exp_kw = 0.0
    curtailment_kw = 0.0
    shortage_kw = 0.0

    # If dataset already contains historical battery & grid telemetry, inspect consistency while enforcing balance
    if (
        data_origin == "historical_dataset"
        and measured_grid_imp_kw is not None
        and measured_batt_chg_kw is not None
        and measured_batt_dis_kw is not None
    ):
        batt_chg_kw = max(0.0, float(measured_batt_chg_kw))
        batt_dis_kw = max(0.0, float(measured_batt_dis_kw))
        grid_imp_kw = max(0.0, float(measured_grid_imp_kw))
        grid_exp_kw = max(0.0, float(measured_grid_exp_kw or 0.0))
    else:
        # Energy-conservation-aware physical bus simulation
        if net_kw >= 0:
            # Surplus: charge battery within SOC & power limits, then export to grid, else curtail
            if cap_kwh > 0 and soc_pct < max_soc:
                headroom_kwh = ((max_soc - soc_pct) / 100.0) * cap_kwh
                max_chg_power = min(cfg.battery_max_charge_kw, headroom_kwh / max(1e-6, dt_hours * eta_c))
                batt_chg_kw = min(net_kw, max(0.0, max_chg_power))
            rem = max(0.0, net_kw - batt_chg_kw)
            grid_exp_kw = min(cfg.grid_max_export_kw, rem)
            curtailment_kw = max(0.0, rem - grid_exp_kw)
        else:
            deficit = abs(net_kw)
            if cap_kwh > 0 and soc_pct > min_soc:
                avail_kwh = ((soc_pct - min_soc) / 100.0) * cap_kwh
                max_dis_power = min(cfg.battery_max_discharge_kw, (avail_kwh * eta_d) / max(1e-6, dt_hours))
                batt_dis_kw = min(deficit, max(0.0, max_dis_power))
            rem_def = max(0.0, deficit - batt_dis_kw)
            grid_imp_kw = min(cfg.grid_max_import_kw, rem_def)
            shortage_kw = max(0.0, rem_def - grid_imp_kw)

    # Update SOC via energy conservation
    if cap_kwh > 0:
        delta_kwh = dt_hours * (eta_c * batt_chg_kw - (batt_dis_kw / eta_d))
        current_kwh = (soc_pct / 100.0) * cap_kwh
        next_kwh = max((min_soc / 100.0) * cap_kwh, min((max_soc / 100.0) * cap_kwh, current_kwh + delta_kwh))
        next_soc = round((next_kwh / cap_kwh) * 100.0, 2)
    else:
        next_kwh = 0.0
        next_soc = 0.0

    # Exact Kirchhoff power balance check:
    # Supply = Renewable + Grid Import + Battery Discharge + Shortage (unserved)
    # Consumption = Demand + Battery Charge + Grid Export + Curtailment + Losses
    supply = total_ren + grid_imp_kw + batt_dis_kw + shortage_kw
    sink = demand_kw + batt_chg_kw + grid_exp_kw + curtailment_kw + losses_kw
    residual = round(supply - sink, 3)

    ren_used = max(0.0, total_ren - curtailment_kw)
    ren_util_pct = round((ren_used / total_ren) * 100.0, 1) if total_ren > 1e-6 else 100.0
    grid_dep_pct = round(min(100.0, (grid_imp_kw / demand_kw) * 100.0), 1) if demand_kw > 1e-6 else 0.0

    if shortage_kw > 0.5:
        alerts.append(
            DigitalTwinAlert(
                severity="critical",
                component="Grid / Load Balance",
                timestamp=timestamp,
                message=f"Energy shortage of {round(shortage_kw, 2)} kW: demand exceeds renewable + battery + grid limit ({cfg.grid_max_import_kw} kW).",
            )
        )
    if curtailment_kw > 1.0:
        alerts.append(
            DigitalTwinAlert(
                severity="warning",
                component="Renewable Curtailment",
                timestamp=timestamp,
                message=f"{round(curtailment_kw, 2)} kW renewable generation curtailed (battery full or grid export capped).",
            )
        )
    if cap_kwh > 0 and next_soc <= min_soc + 1.0:
        alerts.append(
            DigitalTwinAlert(
                severity="warning",
                component="Battery Storage",
                timestamp=timestamp,
                message=f"Battery SOC reached minimum reserve threshold ({next_soc}% <= {min_soc}%).",
            )
        )

    step = DigitalTwinStep(
        timestamp=timestamp,
        data_origin=data_origin,  # type: ignore
        solar_kw=round(solar_kw, 3),
        wind_kw=round(wind_kw, 3),
        total_renewable_kw=round(total_ren, 3),
        demand_kw=round(demand_kw, 3),
        battery_power_kw=round(batt_chg_kw - batt_dis_kw, 3),
        battery_soc_pct=next_soc,
        battery_energy_kwh=round(next_kwh, 2),
        grid_import_kw=round(grid_imp_kw, 3),
        grid_export_kw=round(grid_exp_kw, 3),
        curtailment_kw=round(curtailment_kw, 3),
        shortage_kw=round(shortage_kw, 3),
        losses_kw=losses_kw,
        energy_balance_residual_kw=residual,
        renewable_utilization_pct=ren_util_pct,
        grid_dependency_pct=grid_dep_pct,
    )
    return step, next_soc, alerts


def simulate_digital_twin(request: DigitalTwinSimulateRequest) -> DigitalTwinSimulateResponse:
    metadata = load_dataset_metadata(request.dataset_id)
    df = load_dataset_dataframe(request.dataset_id, cleaned=True)
    mapping = ColumnMappingConfig(**metadata["mapping"])
    cfg = request.system_config

    ts_col = mapping.timestamp_col
    if not ts_col or ts_col not in df.columns:
        raise ValueError("Dataset must have a mapped timestamp column.")

    interval_minutes, _ = estimate_steps_per_day(df[ts_col])
    dt_hours = interval_minutes / 60.0

    assumptions_used: List[str] = [
        f"Battery capacity={cfg.battery_capacity_kwh} kWh, SOC bounds=[{cfg.battery_min_soc_pct}%, {cfg.battery_max_soc_pct}%], eta_chg={cfg.battery_charge_efficiency}, eta_dis={cfg.battery_discharge_efficiency}.",
        f"Grid limits: max import={cfg.grid_max_import_kw} kW, max export={cfg.grid_max_export_kw} kW; distribution loss={cfg.distribution_loss_pct}%.",
    ]

    timeline: List[DigitalTwinStep] = []
    all_alerts: List[DigitalTwinAlert] = []
    soc = cfg.initial_soc_pct

    # Historical slice (last 48 records)
    latest_hist: Optional[DigitalTwinStep] = None
    latest_pred: Optional[DigitalTwinStep] = None

    if request.mode in ("historical", "combined"):
        df_hist = df.tail(48).reset_index(drop=True)
        solar_s, _ = resolve_target_series(df_hist, mapping, "solar")
        wind_s, _ = resolve_target_series(df_hist, mapping, "wind")
        demand_s, _ = resolve_target_series(df_hist, mapping, "demand")

        # Optional wind speed power curve ONLY if user explicitly configured wind_turbine_rated_kw and no measured wind column
        use_wind_curve = (
            wind_s is None
            and mapping.wind_speed_col
            and mapping.wind_speed_col in df_hist.columns
            and request.wind_turbine_rated_kw is not None
            and request.wind_turbine_rated_kw > 0
        )
        if use_wind_curve:
            assumptions_used.append(
                f"Wind power estimated from '{mapping.wind_speed_col}' using user-configured turbine rating {request.wind_turbine_rated_kw} kW."
            )

        soc_col = mapping.battery_soc_col if (mapping.battery_soc_col and mapping.battery_soc_col in df_hist.columns) else None
        if soc_col and pd.notna(df_hist[soc_col].iloc[0]):
            soc = float(pd.to_numeric(df_hist[soc_col].iloc[0], errors="coerce") or soc)

        for idx, row in df_hist.iterrows():
            ts_iso = pd.to_datetime(row[ts_col]).isoformat()
            s_val = float(solar_s.iloc[idx]) if solar_s is not None and pd.notna(solar_s.iloc[idx]) else 0.0
            if wind_s is not None and pd.notna(wind_s.iloc[idx]):
                w_val = float(wind_s.iloc[idx])
            elif use_wind_curve:
                ws = float(pd.to_numeric(row[mapping.wind_speed_col], errors="coerce") or 0.0)
                w_val = _wind_power_curve_kw(
                    ws,
                    rated_kw=float(request.wind_turbine_rated_kw or 0.0),
                    cut_in=request.wind_cut_in_ms,
                    rated_ms=request.wind_rated_ms,
                    cut_out=request.wind_cut_out_ms,
                )
            else:
                w_val = 0.0

            d_val = float(demand_s.iloc[idx]) if demand_s is not None and pd.notna(demand_s.iloc[idx]) else 0.0
            row_soc = float(pd.to_numeric(row[soc_col], errors="coerce")) if soc_col and pd.notna(row[soc_col]) else soc

            m_chg = float(pd.to_numeric(row[mapping.battery_charge_col], errors="coerce")) if (mapping.battery_charge_col and mapping.battery_charge_col in df_hist.columns and pd.notna(row[mapping.battery_charge_col])) else None
            m_dis = float(pd.to_numeric(row[mapping.battery_discharge_col], errors="coerce")) if (mapping.battery_discharge_col and mapping.battery_discharge_col in df_hist.columns and pd.notna(row[mapping.battery_discharge_col])) else None
            m_imp = float(pd.to_numeric(row[mapping.grid_import_col], errors="coerce")) if (mapping.grid_import_col and mapping.grid_import_col in df_hist.columns and pd.notna(row[mapping.grid_import_col])) else None
            m_exp = float(pd.to_numeric(row[mapping.grid_export_col], errors="coerce")) if (mapping.grid_export_col and mapping.grid_export_col in df_hist.columns and pd.notna(row[mapping.grid_export_col])) else None

            step, soc, step_alerts = simulate_step_energy_balance(
                timestamp=ts_iso,
                data_origin="historical_dataset",
                solar_kw=s_val,
                wind_kw=w_val,
                demand_kw=d_val,
                soc_pct=row_soc,
                dt_hours=dt_hours,
                cfg=cfg,
                measured_batt_chg_kw=m_chg,
                measured_batt_dis_kw=m_dis,
                measured_grid_imp_kw=m_imp,
                measured_grid_exp_kw=m_exp,
            )
            timeline.append(step)
            latest_hist = step
            all_alerts.extend(step_alerts)

    # Predicted future slice (from latest_forecast.json if available)
    ds_dir = get_dataset_dir(request.dataset_id)
    forecast_path = ds_dir / "latest_forecast.json"
    if request.mode in ("predicted", "combined") and forecast_path.exists():
        f_data = json.loads(forecast_path.read_text(encoding="utf-8"))
        f_dt = float(f_data.get("interval_minutes", interval_minutes)) / 60.0
        future_pts = [p for p in f_data.get("combined_series", []) if p.get("is_future")][:48]
        for pt in future_pts:
            s_val = float(pt.get("solar_predicted") or 0.0)
            w_val = float(pt.get("wind_predicted") or 0.0)
            d_val = float(pt.get("demand_predicted") or 0.0)
            step, soc, step_alerts = simulate_step_energy_balance(
                timestamp=pt["timestamp"],
                data_origin="ml_prediction",
                solar_kw=s_val,
                wind_kw=w_val,
                demand_kw=d_val,
                soc_pct=soc,
                dt_hours=f_dt,
                cfg=cfg,
            )
            timeline.append(step)
            latest_pred = step
            all_alerts.extend(step_alerts)
    elif request.mode == "predicted" and not forecast_path.exists():
        raise FileNotFoundError("No ML forecast available yet. Train models and generate a forecast first.")

    if not timeline:
        raise ValueError("No records available to simulate in Digital Twin.")

    tot_ren_kwh = sum(s.total_renewable_kw * dt_hours for s in timeline)
    tot_dem_kwh = sum(s.demand_kw * dt_hours for s in timeline)
    tot_imp_kwh = sum(s.grid_import_kw * dt_hours for s in timeline)
    tot_exp_kwh = sum(s.grid_export_kw * dt_hours for s in timeline)
    tot_curt_kwh = sum(s.curtailment_kw * dt_hours for s in timeline)
    tot_short_kwh = sum(s.shortage_kw * dt_hours for s in timeline)
    tot_loss_kwh = sum(s.losses_kw * dt_hours for s in timeline)
    max_residual = max(abs(s.energy_balance_residual_kw) for s in timeline)

    ren_util = round(((tot_ren_kwh - tot_curt_kwh) / tot_ren_kwh) * 100.0, 2) if tot_ren_kwh > 1e-6 else 100.0
    grid_dep = round(min(100.0, (tot_imp_kwh / tot_dem_kwh) * 100.0), 2) if tot_dem_kwh > 1e-6 else 0.0

    return DigitalTwinSimulateResponse(
        dataset_id=request.dataset_id,
        data_source_label="HISTORICAL DATASET RECORDS & ML FORECAST (NOT LIVE TELEMETRY)",
        interval_minutes=interval_minutes,
        latest_historical_state=latest_hist,
        latest_predicted_state=latest_pred,
        timeline=timeline,
        summary={
            "total_renewable_kwh": round(tot_ren_kwh, 2),
            "total_demand_kwh": round(tot_dem_kwh, 2),
            "grid_import_kwh": round(tot_imp_kwh, 2),
            "grid_export_kwh": round(tot_exp_kwh, 2),
            "curtailment_kwh": round(tot_curt_kwh, 2),
            "shortage_kwh": round(tot_short_kwh, 2),
            "losses_kwh": round(tot_loss_kwh, 2),
            "renewable_utilization_pct": ren_util,
            "grid_dependency_pct": grid_dep,
            "max_energy_balance_residual_kw": round(max_residual, 4),
        },
        alerts=all_alerts[:25],
        assumptions_used=assumptions_used,
    )
