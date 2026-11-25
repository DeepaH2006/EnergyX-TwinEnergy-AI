import json
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy.optimize import Bounds, LinearConstraint, milp

from app.schemas.common import SystemComponentSpec
from app.schemas.datasets import ColumnMappingConfig
from app.schemas.optimization import (
    ConstraintCheck,
    OptimizationMetricsSummary,
    OptimizationRunRequest,
    OptimizationRunResponse,
    OptimizationSchedulePoint,
)
from app.services.data_loader import (
    get_dataset_dir,
    load_dataset_dataframe,
    load_dataset_metadata,
)
from app.services.feature_engineering import estimate_steps_per_day, resolve_target_series


def compute_uncoordinated_baseline(
    timestamps: List[str],
    solar_kw: List[float],
    wind_kw: List[float],
    demand_kw: List[float],
    dt_hours: float,
    cfg: SystemComponentSpec,
    tariffs: Optional[List[float]] = None,
    carbons: Optional[List[float]] = None,
) -> OptimizationMetricsSummary:
    """
    Uncoordinated baseline over the exact same horizon and system limits (no predictive battery scheduling):
    Direct renewable serves load; excess exports up to grid export limit (rest curtailed);
    deficit imports up to grid import limit (rest unserved shortage).
    """
    loss_frac = max(0.0, min(0.25, cfg.distribution_loss_pct / 100.0))
    tot_ren_kwh = 0.0
    tot_dem_kwh = 0.0
    tot_used_kwh = 0.0
    tot_imp_kwh = 0.0
    tot_exp_kwh = 0.0
    tot_short_kwh = 0.0
    tot_curt_kwh = 0.0
    peak_imp = 0.0
    tot_cost = 0.0 if tariffs is not None else None
    tot_emiss = 0.0 if carbons is not None else None

    for i in range(len(timestamps)):
        ren = max(0.0, solar_kw[i] + wind_kw[i])
        dem = max(0.0, demand_kw[i])
        losses = (ren + dem) * 0.5 * loss_frac
        net = ren - (dem + losses)
        if net >= 0:
            exp = min(cfg.grid_max_export_kw, net)
            curt = max(0.0, net - exp)
            imp = 0.0
            short = 0.0
        else:
            defic = abs(net)
            imp = min(cfg.grid_max_import_kw, defic)
            short = max(0.0, defic - imp)
            exp = 0.0
            curt = 0.0

        used = max(0.0, ren - curt)
        tot_ren_kwh += ren * dt_hours
        tot_dem_kwh += dem * dt_hours
        tot_used_kwh += used * dt_hours
        tot_imp_kwh += imp * dt_hours
        tot_exp_kwh += exp * dt_hours
        tot_short_kwh += short * dt_hours
        tot_curt_kwh += curt * dt_hours
        peak_imp = max(peak_imp, imp)

        if tot_cost is not None and tariffs is not None:
            feed_in = tariffs[i] * 0.5
            tot_cost += (imp * tariffs[i] - exp * feed_in) * dt_hours
        if tot_emiss is not None and carbons is not None:
            tot_emiss += (imp * (carbons[i] / 1000.0)) * dt_hours

    ren_util = round((tot_used_kwh / tot_ren_kwh) * 100.0, 2) if tot_ren_kwh > 1e-6 else 100.0
    grid_dep = round(min(100.0, (tot_imp_kwh / tot_dem_kwh) * 100.0), 2) if tot_dem_kwh > 1e-6 else 0.0

    return OptimizationMetricsSummary(
        total_renewable_kwh=round(tot_ren_kwh, 2),
        total_demand_kwh=round(tot_dem_kwh, 2),
        renewable_used_kwh=round(tot_used_kwh, 2),
        renewable_utilization_pct=ren_util,
        grid_import_kwh=round(tot_imp_kwh, 2),
        grid_export_kwh=round(tot_exp_kwh, 2),
        grid_dependency_pct=grid_dep,
        energy_shortage_kwh=round(tot_short_kwh, 2),
        energy_curtailed_kwh=round(tot_curt_kwh, 2),
        battery_throughput_kwh=0.0,
        peak_grid_import_kw=round(peak_imp, 2),
        total_cost=round(tot_cost, 2) if tot_cost is not None else None,
        total_emissions_kg=round(tot_emiss, 2) if tot_emiss is not None else None,
        tariff_available=tariffs is not None,
        carbon_data_available=carbons is not None,
    )


def solve_milp_dispatch(
    timestamps: List[str],
    solar_kw: List[float],
    wind_kw: List[float],
    demand_kw: List[float],
    dt_hours: float,
    cfg: SystemComponentSpec,
    tariffs: Optional[List[float]] = None,
    carbons: Optional[List[float]] = None,
    prioritize_cost: bool = True,
    prioritize_emissions: bool = False,
    peak_shaving_weight: float = 0.15,
    strict_demand: bool = False,
) -> Tuple[str, Optional[float], List[OptimizationSchedulePoint], Optional[OptimizationMetricsSummary], List[ConstraintCheck], List[str]]:
    """
    Solves a genuine Mixed-Integer Linear Program (MILP) using SciPy HiGHS solver.
    Variables per time step t (T steps):
      0: p_chg[t]   (battery charge power, kW)
      1: p_dis[t]   (battery discharge power, kW)
      2: p_imp[t]   (grid import power, kW)
      3: p_exp[t]   (grid export power, kW)
      4: p_curt[t]  (renewable curtailment power, kW)
      5: p_short[t] (unserved load shortage, kW)
      6: soc[t]     (battery stored energy, kWh)
      7: u_bat[t]   (binary: 1=charging allowed, 0=discharging allowed)
      8: u_grid[t]  (binary: 1=import allowed, 0=export allowed)
    Plus 1 global variable:
      9*T: z_peak   (maximum grid import power across horizon, kW)
    """
    T = len(timestamps)
    if T == 0:
        return "error", None, [], None, [], ["No time steps available to optimize."]

    n_vars = 9 * T + 1
    z_idx = 9 * T

    cap_kwh = max(0.0, cfg.battery_capacity_kwh)
    min_kwh = (max(0.0, min(100.0, cfg.battery_min_soc_pct)) / 100.0) * cap_kwh
    max_kwh = (max(0.0, min(100.0, cfg.battery_max_soc_pct)) / 100.0) * cap_kwh
    init_kwh = max(min_kwh, min(max_kwh, (cfg.initial_soc_pct / 100.0) * cap_kwh))

    max_chg = cfg.battery_max_charge_kw if cap_kwh > 0 else 0.0
    max_dis = cfg.battery_max_discharge_kw if cap_kwh > 0 else 0.0
    eta_c = max(0.1, min(1.0, cfg.battery_charge_efficiency))
    eta_d = max(0.1, min(1.0, cfg.battery_discharge_efficiency))
    max_imp = max(0.0, cfg.grid_max_import_kw)
    max_exp = max(0.0, cfg.grid_max_export_kw)
    loss_frac = max(0.0, min(0.25, cfg.distribution_loss_pct / 100.0))

    # Build objective vector c
    c = np.zeros(n_vars, dtype=float)
    integrality = np.zeros(n_vars, dtype=int)
    lb = np.zeros(n_vars, dtype=float)
    ub = np.full(n_vars, np.inf, dtype=float)

    for t in range(T):
        base = 9 * t
        ub[base + 0] = max_chg
        ub[base + 1] = max_dis
        ub[base + 2] = max_imp
        ub[base + 3] = max_exp
        ub[base + 4] = max(0.0, solar_kw[t] + wind_kw[t])
        ub[base + 5] = 0.0 if strict_demand else max(0.0, demand_kw[t] + 1000.0)

        lb[base + 6] = min_kwh
        ub[base + 6] = max_kwh

        # Binary controls for complementarity
        integrality[base + 7] = 1
        lb[base + 7] = 0
        ub[base + 7] = 1

        integrality[base + 8] = 1
        lb[base + 8] = 0
        ub[base + 8] = 1

        # Objective weights
        tariff_t = tariffs[t] if (tariffs is not None and prioritize_cost) else 1.0
        feed_in_t = tariff_t * 0.45 if (tariffs is not None and prioritize_cost) else 0.25
        carbon_t = (carbons[t] / 1000.0) * 2.0 if (carbons is not None and prioritize_emissions) else 0.0

        c[base + 0] = 0.02 * dt_hours  # small battery cycling cost
        c[base + 1] = 0.02 * dt_hours
        c[base + 2] = (tariff_t + carbon_t + 0.5) * dt_hours
        c[base + 3] = -feed_in_t * dt_hours
        c[base + 4] = 5.0 * dt_hours  # penalize renewable curtailment/wastage
        c[base + 5] = 1000.0 * dt_hours  # highest penalty on unserved demand

    lb[z_idx] = 0.0
    ub[z_idx] = max_imp
    c[z_idx] = peak_shaving_weight * max(1.0, T * 0.1)

    rows = []
    cols = []
    vals = []
    con_lb = []
    con_ub = []
    row_idx = 0

    def add_entry(r: int, col: int, v: float):
        rows.append(r)
        cols.append(col)
        vals.append(v)

    losses_list = []
    for t in range(T):
        base = 9 * t
        ren_t = max(0.0, solar_kw[t] + wind_kw[t])
        dem_t = max(0.0, demand_kw[t])
        losses_t = round((ren_t + dem_t) * 0.5 * loss_frac, 4)
        losses_list.append(losses_t)

        # 1. Power balance: p_dis - p_chg + p_imp - p_exp - p_curt + p_short == dem_t + losses_t - ren_t
        rhs_bal = (dem_t + losses_t) - ren_t
        add_entry(row_idx, base + 0, -1.0)
        add_entry(row_idx, base + 1, 1.0)
        add_entry(row_idx, base + 2, 1.0)
        add_entry(row_idx, base + 3, -1.0)
        add_entry(row_idx, base + 4, -1.0)
        add_entry(row_idx, base + 5, 1.0)
        con_lb.append(rhs_bal)
        con_ub.append(rhs_bal)
        row_idx += 1

        # 2. Battery SOC energy conservation:
        # soc[t] - dt*eta_c*p_chg[t] + (dt/eta_d)*p_dis[t] - soc[t-1] == 0
        add_entry(row_idx, base + 6, 1.0)
        add_entry(row_idx, base + 0, -dt_hours * eta_c)
        add_entry(row_idx, base + 1, dt_hours / eta_d)
        if t == 0:
            con_lb.append(init_kwh)
            con_ub.append(init_kwh)
        else:
            prev_base = 9 * (t - 1)
            add_entry(row_idx, prev_base + 6, -1.0)
            con_lb.append(0.0)
            con_ub.append(0.0)
        row_idx += 1

        # 3. Battery charge/discharge exclusivity: p_chg <= max_chg * u_bat ; p_dis <= max_dis * (1 - u_bat)
        if max_chg > 0:
            add_entry(row_idx, base + 0, 1.0)
            add_entry(row_idx, base + 7, -max_chg)
            con_lb.append(-np.inf)
            con_ub.append(0.0)
            row_idx += 1
        if max_dis > 0:
            add_entry(row_idx, base + 1, 1.0)
            add_entry(row_idx, base + 7, max_dis)
            con_lb.append(-np.inf)
            con_ub.append(max_dis)
            row_idx += 1

        # 4. Grid import/export exclusivity: p_imp <= max_imp * u_grid ; p_exp <= max_exp * (1 - u_grid)
        if max_imp > 0:
            add_entry(row_idx, base + 2, 1.0)
            add_entry(row_idx, base + 8, -max_imp)
            con_lb.append(-np.inf)
            con_ub.append(0.0)
            row_idx += 1
        if max_exp > 0:
            add_entry(row_idx, base + 3, 1.0)
            add_entry(row_idx, base + 8, max_exp)
            con_lb.append(-np.inf)
            con_ub.append(max_exp)
            row_idx += 1

        # 5. Peak grid import definition: p_imp[t] - z_peak <= 0
        add_entry(row_idx, base + 2, 1.0)
        add_entry(row_idx, z_idx, -1.0)
        con_lb.append(-np.inf)
        con_ub.append(0.0)
        row_idx += 1

    from scipy.sparse import csc_matrix
    A = csc_matrix((vals, (rows, cols)), shape=(row_idx, n_vars))
    constraints = LinearConstraint(A, lb=np.array(con_lb), ub=np.array(con_ub))
    bounds = Bounds(lb=lb, ub=ub)

    res = milp(c=c, integrality=integrality, bounds=bounds, constraints=constraints)

    if not res.success or res.x is None:
        reasons = [f"MILP solver reported status {res.status}: {res.message}"]
        if max_imp == 0 and any((demand_kw[t] + losses_list[t]) > (solar_kw[t] + wind_kw[t] + max_dis) for t in range(T)):
            reasons.append("Grid import limit is 0 kW and local generation + max battery discharge cannot cover peak demand.")
        return "infeasible", None, [], None, [], reasons

    x = res.x
    schedule: List[OptimizationSchedulePoint] = []
    tot_ren_kwh = 0.0
    tot_dem_kwh = 0.0
    tot_used_kwh = 0.0
    tot_imp_kwh = 0.0
    tot_exp_kwh = 0.0
    tot_short_kwh = 0.0
    tot_curt_kwh = 0.0
    tot_batt_kwh = 0.0
    peak_imp = 0.0
    tot_cost = 0.0 if tariffs is not None else None
    tot_emiss = 0.0 if carbons is not None else None

    max_residual = 0.0
    soc_violations = 0
    grid_violations = 0

    for t in range(T):
        base = 9 * t
        p_chg = max(0.0, float(x[base + 0]))
        p_dis = max(0.0, float(x[base + 1]))
        p_imp = max(0.0, float(x[base + 2]))
        p_exp = max(0.0, float(x[base + 3]))
        p_curt = max(0.0, float(x[base + 4]))
        p_short = max(0.0, float(x[base + 5]))
        soc_kwh = float(x[base + 6])
        soc_pct = round((soc_kwh / cap_kwh) * 100.0, 2) if cap_kwh > 0 else 0.0

        s_t = max(0.0, solar_kw[t])
        w_t = max(0.0, wind_kw[t])
        ren_t = s_t + w_t
        dem_t = max(0.0, demand_kw[t])
        losses_t = losses_list[t]

        # Allocate solar and wind proportionally to load
        ren_used_t = max(0.0, ren_t - p_curt)
        ren_to_load = min(ren_used_t, dem_t)
        s_share = s_t / ren_t if ren_t > 1e-6 else 0.0
        w_share = w_t / ren_t if ren_t > 1e-6 else 0.0

        bal_res = abs((ren_t + p_imp + p_dis + p_short) - (dem_t + losses_t + p_chg + p_exp + p_curt))
        max_residual = max(max_residual, bal_res)
        if cap_kwh > 0 and (soc_pct < cfg.battery_min_soc_pct - 0.1 or soc_pct > cfg.battery_max_soc_pct + 0.1):
            soc_violations += 1
        if p_imp > max_imp + 0.1 or p_exp > max_exp + 0.1:
            grid_violations += 1

        int_cost = None
        if tariffs is not None:
            int_cost = round((p_imp * tariffs[t] - p_exp * tariffs[t] * 0.45) * dt_hours, 2)
            tot_cost = (tot_cost or 0.0) + int_cost
        int_emiss = None
        if carbons is not None:
            int_emiss = round((p_imp * (carbons[t] / 1000.0)) * dt_hours, 2)
            tot_emiss = (tot_emiss or 0.0) + int_emiss

        tot_ren_kwh += ren_t * dt_hours
        tot_dem_kwh += dem_t * dt_hours
        tot_used_kwh += ren_used_t * dt_hours
        tot_imp_kwh += p_imp * dt_hours
        tot_exp_kwh += p_exp * dt_hours
        tot_short_kwh += p_short * dt_hours
        tot_curt_kwh += p_curt * dt_hours
        tot_batt_kwh += (p_chg + p_dis) * dt_hours
        peak_imp = max(peak_imp, p_imp)

        schedule.append(
            OptimizationSchedulePoint(
                timestamp=timestamps[t],
                solar_kw=round(s_t, 3),
                wind_kw=round(w_t, 3),
                total_renewable_kw=round(ren_t, 3),
                demand_kw=round(dem_t, 3),
                solar_to_load_kw=round(ren_to_load * s_share, 3),
                wind_to_load_kw=round(ren_to_load * w_share, 3),
                battery_charge_kw=round(p_chg, 3),
                battery_discharge_kw=round(p_dis, 3),
                battery_net_kw=round(p_chg - p_dis, 3),
                battery_soc_pct=soc_pct,
                grid_import_kw=round(p_imp, 3),
                grid_export_kw=round(p_exp, 3),
                curtailment_kw=round(p_curt, 3),
                shortage_kw=round(p_short, 3),
                losses_kw=round(losses_t, 3),
                interval_cost=int_cost,
                interval_emissions_kg=int_emiss,
            )
        )

    infeas_notes: List[str] = []
    if tot_short_kwh > 0.1:
        infeas_notes.append(
            f"Warning: {round(tot_short_kwh, 2)} kWh of demand could not be served within configured grid import ({max_imp} kW) and battery limits."
        )

    ren_util = round((tot_used_kwh / tot_ren_kwh) * 100.0, 2) if tot_ren_kwh > 1e-6 else 100.0
    grid_dep = round(min(100.0, (tot_imp_kwh / tot_dem_kwh) * 100.0), 2) if tot_dem_kwh > 1e-6 else 0.0

    summary = OptimizationMetricsSummary(
        total_renewable_kwh=round(tot_ren_kwh, 2),
        total_demand_kwh=round(tot_dem_kwh, 2),
        renewable_used_kwh=round(tot_used_kwh, 2),
        renewable_utilization_pct=ren_util,
        grid_import_kwh=round(tot_imp_kwh, 2),
        grid_export_kwh=round(tot_exp_kwh, 2),
        grid_dependency_pct=grid_dep,
        energy_shortage_kwh=round(tot_short_kwh, 2),
        energy_curtailed_kwh=round(tot_curt_kwh, 2),
        battery_throughput_kwh=round(tot_batt_kwh, 2),
        peak_grid_import_kw=round(peak_imp, 2),
        total_cost=round(tot_cost, 2) if tot_cost is not None else None,
        total_emissions_kg=round(tot_emiss, 2) if tot_emiss is not None else None,
        tariff_available=tariffs is not None,
        carbon_data_available=carbons is not None,
    )

    checks = [
        ConstraintCheck(
            name="Power Balance Equality",
            satisfied=max_residual < 1e-3,
            detail=f"Max nodal balance residual across {T} intervals: {round(max_residual, 6)} kW",
        ),
        ConstraintCheck(
            name="Battery SOC Bounds",
            satisfied=soc_violations == 0,
            detail=f"SOC kept within [{cfg.battery_min_soc_pct}%, {cfg.battery_max_soc_pct}%] across all steps",
        ),
        ConstraintCheck(
            name="Grid Import/Export Limits",
            satisfied=grid_violations == 0,
            detail=f"Grid flows bounded by import <= {max_imp} kW, export <= {max_exp} kW",
        ),
        ConstraintCheck(
            name="Demand Satisfaction",
            satisfied=tot_short_kwh < 0.1,
            detail="All demand served" if tot_short_kwh < 0.1 else f"Unserved energy shortage: {round(tot_short_kwh, 2)} kWh",
        ),
    ]

    return "optimal", round(float(res.fun), 3), schedule, summary, checks, infeas_notes


def load_optimization_horizon_series(
    dataset_id: str,
    horizon: str,
    use_source: str,
    cfg: SystemComponentSpec,
) -> Tuple[List[str], List[float], List[float], List[float], float, Optional[List[float]], Optional[List[float]], List[str]]:
    metadata = load_dataset_metadata(dataset_id)
    df = load_dataset_dataframe(dataset_id, cleaned=True)
    mapping = ColumnMappingConfig(**metadata["mapping"])
    ts_col = mapping.timestamp_col
    if not ts_col or ts_col not in df.columns:
        raise ValueError("Dataset must have a mapped timestamp column.")

    warnings: List[str] = []
    ds_dir = get_dataset_dir(dataset_id)
    forecast_path = ds_dir / "latest_forecast.json"

    timestamps: List[str] = []
    solar: List[float] = []
    wind: List[float] = []
    demand: List[float] = []

    if use_source == "predicted" and forecast_path.exists():
        f_data = json.loads(forecast_path.read_text(encoding="utf-8"))
        horizon_hours = {"24h": 24, "48h": 48, "7d": 168}.get(horizon, 24)
        interval_min = float(f_data.get("interval_minutes", 60.0))
        dt_hours = interval_min / 60.0
        max_steps = max(1, int(round(horizon_hours / max(0.01, dt_hours))))
        future_pts = [p for p in f_data.get("combined_series", []) if p.get("is_future")][:max_steps]
        if future_pts:
            for pt in future_pts:
                timestamps.append(pt["timestamp"])
                solar.append(float(pt.get("solar_predicted") or 0.0))
                wind.append(float(pt.get("wind_predicted") or 0.0))
                demand.append(float(pt.get("demand_predicted") or 0.0))
    if not timestamps:
        if use_source == "predicted":
            warnings.append("No trained ML forecast found; optimizing over latest historical window instead.")
        interval_min, _ = estimate_steps_per_day(df[ts_col])
        dt_hours = interval_min / 60.0
        horizon_hours = {"24h": 24, "48h": 48, "7d": 168}.get(horizon, 24)
        n_steps = min(len(df), max(4, int(round(horizon_hours / max(0.01, dt_hours)))))
        df_sub = df.tail(n_steps).reset_index(drop=True)
        s_s, _ = resolve_target_series(df_sub, mapping, "solar")
        w_s, _ = resolve_target_series(df_sub, mapping, "wind")
        d_s, _ = resolve_target_series(df_sub, mapping, "demand")
        for idx, row in df_sub.iterrows():
            timestamps.append(pd.to_datetime(row[ts_col]).isoformat())
            solar.append(float(s_s.iloc[idx]) if s_s is not None and pd.notna(s_s.iloc[idx]) else 0.0)
            wind.append(float(w_s.iloc[idx]) if w_s is not None and pd.notna(w_s.iloc[idx]) else 0.0)
            demand.append(float(d_s.iloc[idx]) if d_s is not None and pd.notna(d_s.iloc[idx]) else 0.0)
    else:
        dt_hours = float(json.loads(forecast_path.read_text(encoding="utf-8")).get("interval_minutes", 60.0)) / 60.0

    # Tariff & carbon only if explicitly present in dataset or configured by user! Never invented!
    tariffs: Optional[List[float]] = None
    if mapping.tariff_col and mapping.tariff_col in df.columns:
        t_vals = pd.to_numeric(df[mapping.tariff_col], errors="coerce").dropna()
        if not t_vals.empty:
            tail_t = t_vals.tail(len(timestamps)).tolist()
            tariffs = [tail_t[i % len(tail_t)] for i in range(len(timestamps))]
    elif cfg.tariff_per_kwh is not None:
        tariffs = [float(cfg.tariff_per_kwh)] * len(timestamps)

    carbons: Optional[List[float]] = None
    if mapping.carbon_intensity_col and mapping.carbon_intensity_col in df.columns:
        c_vals = pd.to_numeric(df[mapping.carbon_intensity_col], errors="coerce").dropna()
        if not c_vals.empty:
            tail_c = c_vals.tail(len(timestamps)).tolist()
            carbons = [tail_c[i % len(tail_c)] for i in range(len(timestamps))]
    elif cfg.carbon_intensity_g_per_kwh is not None:
        carbons = [float(cfg.carbon_intensity_g_per_kwh)] * len(timestamps)

    return timestamps, solar, wind, demand, dt_hours, tariffs, carbons, warnings


def run_optimization(request: OptimizationRunRequest) -> OptimizationRunResponse:
    cfg = request.system_config
    timestamps, solar, wind, demand, dt_hours, tariffs, carbons, warnings = load_optimization_horizon_series(
        request.dataset_id, request.horizon, request.use_source, cfg
    )

    if sum(solar) + sum(wind) == 0 and sum(demand) == 0:
        return OptimizationRunResponse(
            dataset_id=request.dataset_id,
            solver_status="unavailable",
            solver_name="SciPy HiGHS MILP",
            interval_minutes=round(dt_hours * 60.0, 2),
            schedule=[],
            warnings=["Both renewable generation and demand are zero/unmapped for this dataset."],
        )

    baseline = compute_uncoordinated_baseline(timestamps, solar, wind, demand, dt_hours, cfg, tariffs, carbons)

    status, obj_val, schedule, opt_summary, checks, notes = solve_milp_dispatch(
        timestamps=timestamps,
        solar_kw=solar,
        wind_kw=wind,
        demand_kw=demand,
        dt_hours=dt_hours,
        cfg=cfg,
        tariffs=tariffs,
        carbons=carbons,
        prioritize_cost=request.prioritize_cost,
        prioritize_emissions=request.prioritize_emissions,
        peak_shaving_weight=request.peak_shaving_weight,
        strict_demand=request.strict_demand,
    )
    warnings.extend(notes)

    deltas: Dict[str, Optional[float]] = {}
    if opt_summary is not None:
        deltas["renewable_utilization_gain_pct"] = round(
            opt_summary.renewable_utilization_pct - baseline.renewable_utilization_pct, 2
        )
        if baseline.grid_import_kwh > 1e-6:
            deltas["grid_import_reduction_pct"] = round(
                ((baseline.grid_import_kwh - opt_summary.grid_import_kwh) / baseline.grid_import_kwh) * 100.0, 2
            )
        else:
            deltas["grid_import_reduction_pct"] = 0.0
        if baseline.peak_grid_import_kw > 1e-6:
            deltas["peak_demand_reduction_pct"] = round(
                ((baseline.peak_grid_import_kw - opt_summary.peak_grid_import_kw) / baseline.peak_grid_import_kw) * 100.0, 2
            )
        else:
            deltas["peak_demand_reduction_pct"] = 0.0
        if baseline.total_cost is not None and opt_summary.total_cost is not None and abs(baseline.total_cost) > 1e-6:
            deltas["cost_reduction_pct"] = round(
                ((baseline.total_cost - opt_summary.total_cost) / abs(baseline.total_cost)) * 100.0, 2
            )
        else:
            deltas["cost_reduction_pct"] = None

    return OptimizationRunResponse(
        dataset_id=request.dataset_id,
        solver_status=status,  # type: ignore
        solver_name="SciPy HiGHS MILP",
        objective_value=obj_val,
        infeasibility_reasons=notes if status != "optimal" else [],
        interval_minutes=round(dt_hours * 60.0, 2),
        schedule=schedule,
        optimized_summary=opt_summary,
        baseline_summary=baseline,
        comparison_deltas=deltas,
        constraints_validation=checks,
        warnings=warnings,
    )
