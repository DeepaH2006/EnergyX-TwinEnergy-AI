from datetime import datetime, timezone
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

from app.core.config import settings
from app.schemas.datasets import ColumnMappingConfig
from app.schemas.optimization import OptimizationRunRequest
from app.schemas.simulation import (
    ExplainAIRequest,
    ExplainAIResponse,
    RecommendationGenerateRequest,
    RecommendationGenerateResponse,
    RecommendationItem,
)
from app.services.data_loader import load_dataset_dataframe, load_dataset_metadata
from app.services.feature_engineering import resolve_target_series
from app.services.optimization import run_optimization


def generate_data_driven_recommendations(request: RecommendationGenerateRequest) -> RecommendationGenerateResponse:
    metadata = load_dataset_metadata(request.dataset_id)
    df = load_dataset_dataframe(request.dataset_id, cleaned=True)
    mapping = ColumnMappingConfig(**metadata["mapping"])

    opt_res = run_optimization(
        OptimizationRunRequest(
            dataset_id=request.dataset_id,
            horizon=request.horizon,
            use_source="predicted",
            system_config=request.system_config,
        )
    )

    recommendations: List[RecommendationItem] = []
    warnings: List[str] = list(opt_res.warnings)

    schedule = opt_res.schedule
    opt_sum = opt_res.optimized_summary
    base_sum = opt_res.baseline_summary

    # 1. Check historical anomalies (unusual generation drops in dataset)
    if mapping.solar_col and mapping.solar_col in df.columns:
        s_vals = pd.to_numeric(df[mapping.solar_col], errors="coerce").dropna()
        if len(s_vals) >= 12:
            daytime = s_vals[s_vals > 0.05 * max(1.0, float(s_vals.max()))]
            if len(daytime) >= 8:
                med_day = float(daytime.median())
                low_day_drops = int((daytime < 0.25 * med_day).sum())
                if low_day_drops >= 3:
                    recommendations.append(
                        RecommendationItem(
                            id="rec-anomaly-solar",
                            title="Investigate Unusual Daytime Solar Generation Drops",
                            category="anomaly_investigation",
                            priority="medium",
                            reason=f"Detected {low_day_drops} daytime intervals in '{mapping.solar_col}' below 25% of median daytime output ({round(med_day, 1)} kW).",
                            supporting_data=f"Historical median daytime solar={round(med_day, 1)} kW; {low_day_drops} low-output anomalies flagged.",
                            expected_operational_benefit="Prevents unexpected afternoon deficits via earlier inverter/shading inspection or conservative reserve sizing.",
                            relevant_time_period="Historical dataset diagnostics",
                            rejected_alternatives=["Ignoring intermittent drops risks unexpected battery depletion during cloudy periods."],
                        )
                    )

    if schedule and opt_sum and base_sum:
        # 2. Surplus charging window recommendation
        chg_steps = [pt for pt in schedule if pt.battery_charge_kw > 1.0]
        if chg_steps:
            total_chg_kw_peak = max(pt.battery_charge_kw for pt in chg_steps)
            start_t = chg_steps[0].timestamp
            end_t = chg_steps[-1].timestamp
            recommendations.append(
                RecommendationItem(
                    id="rec-battery-charge",
                    title="Charge Battery During Renewable Surplus Window",
                    category="battery_charging",
                    priority="high",
                    reason=f"Forecasted renewable generation exceeds demand across {len(chg_steps)} interval(s), enabling excess clean power capture up to {round(total_chg_kw_peak, 1)} kW.",
                    supporting_data=f"Optimal MILP schedule charges battery across {len(chg_steps)} intervals (peak SOC reaches {max(pt.battery_soc_pct for pt in chg_steps)}%).",
                    expected_operational_benefit=f"Raises renewable utilization to {opt_sum.renewable_utilization_pct}% vs {base_sum.renewable_utilization_pct}% uncoordinated baseline.",
                    relevant_time_period=f"{start_t} to {end_t}",
                    rejected_alternatives=["Exporting all surplus immediately misses peak-shaving reserve later in the horizon."],
                )
            )

        # 3. Peak discharge recommendation
        dis_steps = [pt for pt in schedule if pt.battery_discharge_kw > 1.0]
        if dis_steps:
            peak_dis = max(pt.battery_discharge_kw for pt in dis_steps)
            peak_dem_pt = max(schedule, key=lambda p: p.demand_kw)
            benefit_txt = (
                f"Reduces peak grid import from {base_sum.peak_grid_import_kw} kW to {opt_sum.peak_grid_import_kw} kW."
            )
            if opt_sum.tariff_available and opt_sum.total_cost is not None and base_sum.total_cost is not None:
                savings = round(base_sum.total_cost - opt_sum.total_cost, 2)
                benefit_txt += f" Calculated tariff cost difference: {savings} (based on configured/dataset tariff)."
            recommendations.append(
                RecommendationItem(
                    id="rec-peak-discharge",
                    title="Discharge Battery During Predicted Demand & Deficit Windows",
                    category="peak_discharge",
                    priority="high",
                    reason=f"Demand peaks at {peak_dem_pt.demand_kw} kW around {peak_dem_pt.timestamp}; discharging up to {round(peak_dis, 1)} kW buffers feeder load.",
                    supporting_data=f"{len(dis_steps)} discharge interval(s) scheduled; grid import reduced by {round(base_sum.grid_import_kwh - opt_sum.grid_import_kwh, 2)} kWh.",
                    expected_operational_benefit=benefit_txt,
                    relevant_time_period=f"{dis_steps[0].timestamp} to {dis_steps[-1].timestamp}",
                    rejected_alternatives=["Importing full deficit directly from grid increases peak feeder stress and dependency."],
                )
            )

        # 4. Curtailment / renewable wastage recommendation
        if opt_sum.energy_curtailed_kwh > 1.0:
            curt_steps = [pt for pt in schedule if pt.curtailment_kw > 0.5]
            recommendations.append(
                RecommendationItem(
                    id="rec-curtailment",
                    title="Increase Renewable Utilization or Expand Storage/Export Headroom",
                    category="renewable_utilization",
                    priority="high",
                    reason=f"{opt_sum.energy_curtailed_kwh} kWh of renewable generation is curtailed across {len(curt_steps)} interval(s) because battery reaches {request.system_config.battery_max_soc_pct}% SOC and export cap ({request.system_config.grid_max_export_kw} kW) is saturated.",
                    supporting_data=f"Curtailed energy: {opt_sum.energy_curtailed_kwh} kWh ({round((opt_sum.energy_curtailed_kwh / max(1.0, opt_sum.total_renewable_kwh)) * 100, 1)}% of forecast generation).",
                    expected_operational_benefit="Shifting flexible loads (e.g., EV charging or HVAC pre-cooling) into surplus windows recovers curtailed energy.",
                    relevant_time_period=f"{curt_steps[0].timestamp} to {curt_steps[-1].timestamp}" if curt_steps else request.horizon,
                    rejected_alternatives=["Leaving loads unshifted causes avoidable zero-emission energy wastage."],
                )
            )

        # 5. Predicted energy shortage / deficit warning
        if opt_sum.energy_shortage_kwh > 0.1:
            short_steps = [pt for pt in schedule if pt.shortage_kw > 0.1]
            recommendations.append(
                RecommendationItem(
                    id="rec-deficit",
                    title="Prepare for Predicted Energy Deficit / Grid Capacity Constraint",
                    category="deficit_preparation",
                    priority="high",
                    reason=f"Forecasted demand exceeds combined renewable, battery, and grid import cap ({request.system_config.grid_max_import_kw} kW) by {opt_sum.energy_shortage_kwh} kWh.",
                    supporting_data=f"{len(short_steps)} interval(s) show unserved load; max shortage {round(max(pt.shortage_kw for pt in short_steps), 2)} kW.",
                    expected_operational_benefit="Enables proactive load shedding of non-critical loads or raising grid import allowance before under-voltage occurs.",
                    relevant_time_period=f"{short_steps[0].timestamp} to {short_steps[-1].timestamp}" if short_steps else request.horizon,
                    rejected_alternatives=["Unplanned shortage risks critical facility disruption."],
                )
            )

        # 6. Grid dependency reduction status
        if base_sum.grid_import_kwh > 1e-6 and opt_sum.grid_import_kwh < base_sum.grid_import_kwh:
            red_kwh = round(base_sum.grid_import_kwh - opt_sum.grid_import_kwh, 2)
            red_pct = opt_res.comparison_deltas.get("grid_import_reduction_pct") or 0.0
            recommendations.append(
                RecommendationItem(
                    id="rec-grid-reduce",
                    title="Reduce Unnecessary Grid Imports via Coordinated Dispatch",
                    category="grid_reduction",
                    priority="medium",
                    reason=f"Coordinated battery scheduling displaces {red_kwh} kWh ({red_pct}%) of baseline grid import over the {request.horizon} horizon.",
                    supporting_data=f"Baseline grid import: {base_sum.grid_import_kwh} kWh → Optimized: {opt_sum.grid_import_kwh} kWh.",
                    expected_operational_benefit=f"Lowers grid dependency to {opt_sum.grid_dependency_pct}% of total demand.",
                    relevant_time_period=f"Next {request.horizon}",
                    rejected_alternatives=["Uncoordinated dispatch relies on grid during evening ramps despite daytime solar surplus."],
                )
            )

        # 7. Battery operating limits review
        min_soc_hits = sum(1 for pt in schedule if pt.battery_soc_pct <= request.system_config.battery_min_soc_pct + 0.5)
        max_soc_hits = sum(1 for pt in schedule if pt.battery_soc_pct >= request.system_config.battery_max_soc_pct - 0.5)
        if min_soc_hits > 3 or max_soc_hits > 3:
            recommendations.append(
                RecommendationItem(
                    id="rec-battery-limits",
                    title="Review Battery Capacity & SOC Operating Limits",
                    category="battery_limits",
                    priority="low",
                    reason=f"Battery hits configured SOC bounds ({min_soc_hits} min-SOC intervals, {max_soc_hits} max-SOC intervals) across the {request.horizon} horizon.",
                    supporting_data=f"Configured capacity={request.system_config.battery_capacity_kwh} kWh, SOC range=[{request.system_config.battery_min_soc_pct}%, {request.system_config.battery_max_soc_pct}%].",
                    expected_operational_benefit="Indicates whether battery capacity sizing is a bottleneck for renewable capture or peak buffering.",
                    relevant_time_period=f"Next {request.horizon}",
                    rejected_alternatives=["Deep-cycling beyond manufacturer SOC limits accelerates lithium-ion degradation."],
                )
            )

    if not recommendations:
        recommendations.append(
            RecommendationItem(
                id="rec-balanced",
                title="System Operating Within Configured Bounds",
                category="renewable_utilization",
                priority="low",
                reason="Forecasted generation, demand, and storage limits are balanced without shortages or significant curtailment.",
                supporting_data="MILP optimization confirmed feasibility with zero constraint violations.",
                expected_operational_benefit="Maintain current operating schedule and continue periodic retraining as new records arrive.",
                relevant_time_period=f"Next {request.horizon}",
                rejected_alternatives=[],
            )
        )

    context_summary: Dict[str, Optional[float]] = {}
    if opt_sum:
        context_summary = {
            "total_renewable_kwh": opt_sum.total_renewable_kwh,
            "total_demand_kwh": opt_sum.total_demand_kwh,
            "renewable_utilization_pct": opt_sum.renewable_utilization_pct,
            "grid_import_kwh": opt_sum.grid_import_kwh,
            "grid_export_kwh": opt_sum.grid_export_kwh,
            "curtailment_kwh": opt_sum.energy_curtailed_kwh,
            "shortage_kwh": opt_sum.energy_shortage_kwh,
            "peak_grid_import_kw": opt_sum.peak_grid_import_kw,
            "total_cost": opt_sum.total_cost,
        }

    return RecommendationGenerateResponse(
        dataset_id=request.dataset_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        recommendations=recommendations,
        system_context_summary=context_summary,
        warnings=warnings,
    )


def explain_results_with_gemini(request: ExplainAIRequest) -> ExplainAIResponse:
    if not request.user_consent:
        return ExplainAIResponse(
            status="disabled",
            explanation="AI explanation requires explicit user opt-in consent before sending aggregated summary metrics to Gemini.",
            grounded_metrics_used={},
        )

    api_key = settings.GEMINI_API_KEY
    if not api_key or api_key == "MY_GEMINI_API_KEY":
        return ExplainAIResponse(
            status="unavailable",
            explanation="GEMINI_API_KEY is not configured in the backend environment. Deterministic backend explanations remain fully active.",
            grounded_metrics_used=request.summary_context,
        )

    try:
        from google import genai  # type: ignore

        client = genai.Client(api_key=api_key)
        question = request.question or "Explain the key drivers behind the optimization schedule, grid dependency, and battery behavior."
        prompt = (
            "You are a renewable-energy systems engineer explaining calculated backend results to an operator.\n"
            "STRICT RULES:\n"
            "1. Use ONLY the numerical metrics provided in JSON below.\n"
            "2. NEVER invent forecasts, savings, tariffs, or numbers not present in the JSON.\n"
            "3. Keep the explanation concise, technical, and clear (3-5 bullet points).\n\n"
            f"USER QUESTION: {question}\n\n"
            f"CALCULATED BACKEND METRICS (AGGREGATED SUMMARY ONLY): {request.summary_context}\n"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return ExplainAIResponse(
            status="success",
            explanation=response.text or "No explanation text returned.",
            grounded_metrics_used=request.summary_context,
        )
    except Exception as exc:
        return ExplainAIResponse(
            status="error",
            explanation=f"Gemini explanation failed: {exc}",
            grounded_metrics_used=request.summary_context,
        )
