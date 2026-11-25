from typing import List, Optional
from app.schemas.common import SystemComponentSpec
from app.schemas.simulation import (
    ScenarioAssumptions,
    ScenarioCompareRequest,
    ScenarioCompareResponse,
    ScenarioComparisonRow,
    ScenarioSimulateRequest,
    ScenarioSimulateResponse,
)
from app.services.optimization import (
    compute_uncoordinated_baseline,
    load_optimization_horizon_series,
    solve_milp_dispatch,
)


def _apply_scenario_factors(
    solar: List[float],
    wind: List[float],
    demand: List[float],
    assumptions: ScenarioAssumptions,
    base_cfg: SystemComponentSpec,
) -> tuple[List[float], List[float], List[float], SystemComponentSpec]:
    ren_scale = assumptions.renewable_availability_pct / 100.0
    s_scaled = [round(v * (assumptions.solar_pct / 100.0) * ren_scale, 3) for v in solar]
    w_scaled = [round(v * (assumptions.wind_pct / 100.0) * ren_scale, 3) for v in wind]
    d_scaled = [round(v * (assumptions.demand_pct / 100.0), 3) for v in demand]

    cfg = base_cfg.model_copy(deep=True)
    cfg.battery_capacity_kwh = assumptions.battery_capacity_kwh
    cfg.initial_soc_pct = assumptions.initial_soc_pct
    cfg.grid_max_import_kw = assumptions.grid_import_limit_kw
    cfg.grid_max_export_kw = assumptions.grid_export_limit_kw
    return s_scaled, w_scaled, d_scaled, cfg


def simulate_what_if_scenario(request: ScenarioSimulateRequest) -> ScenarioSimulateResponse:
    timestamps, solar, wind, demand, dt_hours, tariffs, carbons, _ = load_optimization_horizon_series(
        request.dataset_id, request.horizon, "predicted", request.base_system_config
    )

    baseline_ref = compute_uncoordinated_baseline(
        timestamps, solar, wind, demand, dt_hours, request.base_system_config, tariffs, carbons
    )

    s_mod, w_mod, d_mod, cfg_mod = _apply_scenario_factors(
        solar, wind, demand, request.assumptions, request.base_system_config
    )

    status, _, schedule, summary, _, notes = solve_milp_dispatch(
        timestamps=timestamps,
        solar_kw=s_mod,
        wind_kw=w_mod,
        demand_kw=d_mod,
        dt_hours=dt_hours,
        cfg=cfg_mod,
        tariffs=tariffs,
        carbons=carbons,
    )

    deltas = {}
    if summary is not None:
        deltas["renewable_utilization_delta_pct"] = round(
            summary.renewable_utilization_pct - baseline_ref.renewable_utilization_pct, 2
        )
        deltas["grid_import_delta_kwh"] = round(
            summary.grid_import_kwh - baseline_ref.grid_import_kwh, 2
        )
        deltas["peak_import_delta_kw"] = round(
            summary.peak_grid_import_kw - baseline_ref.peak_grid_import_kw, 2
        )
        if summary.total_cost is not None and baseline_ref.total_cost is not None:
            deltas["cost_delta"] = round(summary.total_cost - baseline_ref.total_cost, 2)
        else:
            deltas["cost_delta"] = None

    return ScenarioSimulateResponse(
        dataset_id=request.dataset_id,
        scenario_name=request.assumptions.name,
        assumptions=request.assumptions,
        solver_status=status,
        infeasibility_reasons=notes if status != "optimal" else [],
        summary=summary,
        baseline_reference=baseline_ref,
        schedule=schedule,
        deltas_vs_baseline=deltas,
    )


def compare_scenarios(request: ScenarioCompareRequest) -> ScenarioCompareResponse:
    timestamps, solar, wind, demand, dt_hours, tariffs, carbons, notes = load_optimization_horizon_series(
        request.dataset_id, request.horizon, "predicted", request.base_system_config
    )
    base_cfg = request.base_system_config

    rows: List[ScenarioComparisonRow] = []

    # 1. Uncoordinated Baseline (no battery coordination)
    baseline = compute_uncoordinated_baseline(timestamps, solar, wind, demand, dt_hours, base_cfg, tariffs, carbons)
    rows.append(
        ScenarioComparisonRow(
            scenario_id="baseline-uncoordinated",
            scenario_name="Baseline System (Uncoordinated)",
            category="baseline",
            assumptions_summary="No predictive battery dispatch; direct renewable to load + grid backup",
            solver_status="baseline",
            renewable_utilization_pct=baseline.renewable_utilization_pct,
            grid_import_kwh=baseline.grid_import_kwh,
            grid_export_kwh=baseline.grid_export_kwh,
            energy_shortage_kwh=baseline.energy_shortage_kwh,
            battery_utilization_kwh=0.0,
            energy_wastage_kwh=baseline.energy_curtailed_kwh,
            peak_grid_import_kw=baseline.peak_grid_import_kw,
            operating_cost=baseline.total_cost,
            delta_grid_import_pct_vs_baseline=0.0,
            delta_renewable_util_pct_vs_baseline=0.0,
        )
    )

    # 2. Forecast-Based System (greedy forecast-driven battery rule: charge surplus, discharge deficit)
    # Computed via single-step greedy twin simulation over identical horizon
    from app.services.digital_twin import simulate_step_energy_balance
    soc = base_cfg.initial_soc_pct
    f_imp, f_exp, f_short, f_curt, f_batt, f_peak, f_cost = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, (0.0 if tariffs else None)
    f_ren_kwh = 0.0
    for i in range(len(timestamps)):
        step, soc, _ = simulate_step_energy_balance(
            timestamps[i], "ml_prediction", solar[i], wind[i], demand[i], soc, dt_hours, base_cfg
        )
        f_ren_kwh += step.total_renewable_kw * dt_hours
        f_imp += step.grid_import_kw * dt_hours
        f_exp += step.grid_export_kw * dt_hours
        f_short += step.shortage_kw * dt_hours
        f_curt += step.curtailment_kw * dt_hours
        f_batt += abs(step.battery_power_kw) * dt_hours
        f_peak = max(f_peak, step.grid_import_kw)
        if f_cost is not None and tariffs is not None:
            f_cost += (step.grid_import_kw * tariffs[i] - step.grid_export_kw * tariffs[i] * 0.45) * dt_hours

    f_ren_util = round(((f_ren_kwh - f_curt) / f_ren_kwh) * 100.0, 2) if f_ren_kwh > 1e-6 else 100.0
    rows.append(
        ScenarioComparisonRow(
            scenario_id="forecast-greedy",
            scenario_name="Forecast-Based System (Reactive Battery)",
            category="forecast_based",
            assumptions_summary=f"Uses ML forecast with reactive battery (Cap {base_cfg.battery_capacity_kwh} kWh, Init SOC {base_cfg.initial_soc_pct}%)",
            solver_status="simulated",
            renewable_utilization_pct=f_ren_util,
            grid_import_kwh=round(f_imp, 2),
            grid_export_kwh=round(f_exp, 2),
            energy_shortage_kwh=round(f_short, 2),
            battery_utilization_kwh=round(f_batt, 2),
            energy_wastage_kwh=round(f_curt, 2),
            peak_grid_import_kw=round(f_peak, 2),
            operating_cost=round(f_cost, 2) if f_cost is not None else None,
            delta_grid_import_pct_vs_baseline=round(((baseline.grid_import_kwh - f_imp) / baseline.grid_import_kwh) * 100.0, 2) if baseline.grid_import_kwh > 1e-6 else 0.0,
            delta_renewable_util_pct_vs_baseline=round(f_ren_util - baseline.renewable_utilization_pct, 2),
        )
    )

    # 3. Optimized System (MILP)
    status_opt, _, _, opt_sum, _, _ = solve_milp_dispatch(
        timestamps, solar, wind, demand, dt_hours, base_cfg, tariffs, carbons
    )
    if opt_sum is not None:
        rows.append(
            ScenarioComparisonRow(
                scenario_id="milp-optimized",
                scenario_name="Optimized System (MILP Global Horizon)",
                category="optimized",
                assumptions_summary="Constraint-aware HiGHS MILP optimization across full horizon",
                solver_status=status_opt,
                renewable_utilization_pct=opt_sum.renewable_utilization_pct,
                grid_import_kwh=opt_sum.grid_import_kwh,
                grid_export_kwh=opt_sum.grid_export_kwh,
                energy_shortage_kwh=opt_sum.energy_shortage_kwh,
                battery_utilization_kwh=opt_sum.battery_throughput_kwh,
                energy_wastage_kwh=opt_sum.energy_curtailed_kwh,
                peak_grid_import_kw=opt_sum.peak_grid_import_kw,
                operating_cost=opt_sum.total_cost,
                delta_grid_import_pct_vs_baseline=round(((baseline.grid_import_kwh - opt_sum.grid_import_kwh) / baseline.grid_import_kwh) * 100.0, 2) if baseline.grid_import_kwh > 1e-6 else 0.0,
                delta_renewable_util_pct_vs_baseline=round(opt_sum.renewable_utilization_pct - baseline.renewable_utilization_pct, 2),
            )
        )

    # 4. Standard & User-Defined What-If Scenarios
    default_what_ifs = [
        ScenarioAssumptions(
            name="What-If: Low Solar (-60%)",
            description="Cloud cover reduces solar generation to 40% of baseline",
            solar_pct=40.0,
            wind_pct=100.0,
            demand_pct=100.0,
            battery_capacity_kwh=base_cfg.battery_capacity_kwh,
            initial_soc_pct=base_cfg.initial_soc_pct,
            grid_import_limit_kw=base_cfg.grid_max_import_kw,
            grid_export_limit_kw=base_cfg.grid_max_export_kw,
        ),
        ScenarioAssumptions(
            name="What-If: High Demand (+35%)",
            description="Demand surge 135% across horizon",
            solar_pct=100.0,
            wind_pct=100.0,
            demand_pct=135.0,
            battery_capacity_kwh=base_cfg.battery_capacity_kwh,
            initial_soc_pct=base_cfg.initial_soc_pct,
            grid_import_limit_kw=base_cfg.grid_max_import_kw,
            grid_export_limit_kw=base_cfg.grid_max_export_kw,
        ),
        ScenarioAssumptions(
            name="What-If: Grid Limitation (50% Cap)",
            description="Substation import restricted to 50% capacity",
            solar_pct=100.0,
            wind_pct=100.0,
            demand_pct=100.0,
            battery_capacity_kwh=base_cfg.battery_capacity_kwh,
            initial_soc_pct=base_cfg.initial_soc_pct,
            grid_import_limit_kw=round(base_cfg.grid_max_import_kw * 0.5, 1),
            grid_export_limit_kw=base_cfg.grid_max_export_kw,
        ),
    ]

    all_what_ifs = request.custom_scenarios if request.custom_scenarios else default_what_ifs
    for idx, sc in enumerate(all_what_ifs):
        s_m, w_m, d_m, c_m = _apply_scenario_factors(solar, wind, demand, sc, base_cfg)
        st, _, _, sc_sum, _, _ = solve_milp_dispatch(
            timestamps, s_m, w_m, d_m, dt_hours, c_m, tariffs, carbons
        )
        if sc_sum is not None:
            rows.append(
                ScenarioComparisonRow(
                    scenario_id=f"whatif-{idx+1}",
                    scenario_name=sc.name,
                    category="what_if",
                    assumptions_summary=f"Solar {sc.solar_pct}%, Wind {sc.wind_pct}%, Demand {sc.demand_pct}%, Batt {sc.battery_capacity_kwh} kWh, Grid {sc.grid_import_limit_kw} kW",
                    solver_status=st,
                    renewable_utilization_pct=sc_sum.renewable_utilization_pct,
                    grid_import_kwh=sc_sum.grid_import_kwh,
                    grid_export_kwh=sc_sum.grid_export_kwh,
                    energy_shortage_kwh=sc_sum.energy_shortage_kwh,
                    battery_utilization_kwh=sc_sum.battery_throughput_kwh,
                    energy_wastage_kwh=sc_sum.energy_curtailed_kwh,
                    peak_grid_import_kw=sc_sum.peak_grid_import_kw,
                    operating_cost=sc_sum.total_cost,
                    delta_grid_import_pct_vs_baseline=round(((baseline.grid_import_kwh - sc_sum.grid_import_kwh) / baseline.grid_import_kwh) * 100.0, 2) if baseline.grid_import_kwh > 1e-6 else 0.0,
                    delta_renewable_util_pct_vs_baseline=round(sc_sum.renewable_utilization_pct - baseline.renewable_utilization_pct, 2),
                )
            )

    return ScenarioCompareResponse(
        dataset_id=request.dataset_id,
        horizon=request.horizon,
        time_period_start=timestamps[0] if timestamps else "",
        time_period_end=timestamps[-1] if timestamps else "",
        tariff_available=tariffs is not None,
        rows=rows,
        notes=notes,
    )
