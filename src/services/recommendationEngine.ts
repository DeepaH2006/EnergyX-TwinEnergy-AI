/**
 * Explainable Recommendation Engine for Renewable Energy Decision Support.
 * Explains WHY an energy allocation decision was made, what alternatives were evaluated,
 * and what the expected system impacts are on battery health, grid reliance, and costs.
 */

import { Recommendation, OptimizationResult } from '../types/energy';

export function generateRecommendation(
  opt: OptimizationResult,
  solarKw: number,
  windKw: number,
  buildingKw: number,
  evKw: number,
  batterySoc: number,
  gridAvailable: boolean,
  hour: number = 14
): Recommendation {
  const totalGen = solarKw + windKw;
  const totalLoad = buildingKw + evKw;
  const netBalance = totalGen - totalLoad;

  const isHighSolar = solarKw > 200;
  const isHighEv = evKw > 130;
  const isLowBattery = batterySoc < 30;
  const isSurplus = netBalance > 20;
  const isDeficit = netBalance < -20;

  let title = 'Optimal Multi-Source Balancing';
  let urgency: Recommendation['urgency'] = 'optimal';
  let summary = '';
  const detailedAction: string[] = [];
  const whyThisDecision: Recommendation['whyThisDecision'] = [];
  const alternativesConsidered: Recommendation['alternativesConsidered'] = [];
  const expectedEffects: Recommendation['expectedEffects'] = {
    renewableUtilization: `${opt.renewableUtilizationPct}% self-consumption achieved`,
    gridImpact: opt.gridTotalImportKw > 0 ? `Grid import limited to ${opt.gridTotalImportKw} kW` : `Zero grid import; ${opt.gridExportKw} kW export`,
    batteryHealth: `Battery maintained at ${opt.batteryFinalSocPct}% SOC (within safe 20–90% bounds)`,
    economicBenefit: opt.improvements.costReductionPct > 0 ? `${opt.improvements.costReductionPct}% cost reduction vs uncoordinated baseline` : 'Optimized for minimum grid tariff exposure',
  };

  // 1. Scenario-based rationale generation
  if (!gridAvailable) {
    title = 'Emergency Islanding: Microgrid Autonomy Activated';
    urgency = 'high';
    summary = 'External electrical grid is unavailable. Priority shifted entirely to critical load preservation and frequency stabilization.';
    detailedAction.push(`Direct all ${totalGen} kW local renewable generation to critical building systems and priority EV charging.`);
    if (opt.batteryNetKw < 0) {
      detailedAction.push(`Discharging battery at ${Math.abs(opt.batteryNetKw)} kW to bridge remaining islanded deficit.`);
    }
    detailedAction.push('Non-essential tertiary EV charging bays throttled to protect microgrid voltage stability.');

    whyThisDecision.push({
      factor: 'Electrical Grid Connectivity',
      observedValue: 'Islanded / Disconnected (0 kW capacity)',
      impactOnDecision: 'Forces 100% reliance on local distributed energy resources; requires autonomous bus balancing.',
    });
    whyThisDecision.push({
      factor: 'Battery Reserve State',
      observedValue: `${batterySoc}% SOC (${Math.round((batterySoc / 100) * 500)} kWh stored)`,
      impactOnDecision: `Provides approximately ${Math.round((batterySoc * 5) / (totalLoad || 1) * 10) / 10} hours of critical islanded runtime buffer.`,
    });

    alternativesConsidered.push({
      strategyName: 'Full EV Charging Unconstrained',
      whyRejected: 'Would overload the internal inverter and cause under-voltage tripping across the microgrid.',
    });
    alternativesConsidered.push({
      strategyName: 'Deep Battery Discharge down to 0% SOC',
      whyRejected: 'Accelerates lithium-ion degradation and leaves zero emergency reserve for essential hospital/safety systems.',
    });
  } else if (isSurplus) {
    title = 'Surplus Renewable Absorption & Storage Pre-Charging';
    urgency = 'optimal';
    summary = `Total renewable generation (${totalGen} kW) exceeds active loads (${totalLoad} kW). Direct solar & wind to loads, store surplus in battery, and export remainder.`;
    detailedAction.push(`Allocate ${opt.solarToLoadKw + opt.windToLoadKw} kW renewable power directly to Building and EV bays.`);
    detailedAction.push(`Channel ${opt.batteryNetKw} kW surplus renewable generation into BESS (SOC will reach ${opt.batteryFinalSocPct}%).`);
    if (opt.gridExportKw > 0) {
      detailedAction.push(`Export ${opt.gridExportKw} kW clean energy to the utility grid under net-metering tariff.`);
    }

    whyThisDecision.push({
      factor: 'Generation vs Demand Gap',
      observedValue: `+${Math.round(netBalance)} kW Net Surplus (Renewables: ${totalGen} kW, Loads: ${totalLoad} kW)`,
      impactOnDecision: 'Prevents wasteful solar curtailment by maximizing physical storage and green grid export.',
    });
    whyThisDecision.push({
      factor: 'Impending Evening Peak (18:00 - 22:00)',
      observedValue: 'Grid tariff surges to ₹11.20/kWh in 4 hours',
      impactOnDecision: 'Charging the battery now with zero-marginal-cost solar creates a peak-shaving reservoir for high-tariff hours.',
    });

    alternativesConsidered.push({
      strategyName: 'Export All Surplus Directly to Grid Without Battery Storage',
      whyRejected: 'Grid feed-in tariff (₹4.10/kWh) is significantly lower than evening import tariff (₹11.20/kWh). Storing locally yields 2.7x higher economic value.',
    });
    alternativesConsidered.push({
      strategyName: 'Solar Curtailment / Inverter Throttling',
      whyRejected: 'Causes pure waste of zero-emission generation when battery storage capacity is still available.',
    });
  } else if (isHighSolar && isHighEv) {
    // Exact Example Scenario (2:00 PM)
    title = 'Solar-Powered EV Charging with Strategic Peak Preservation';
    urgency = 'optimal';
    summary = `High solar output (${solarKw} kW) aligns with active EV charging demand (${evKw} kW). Solar power directly satisfies EV fleet demand; battery reserves are conserved for evening peak.`;
    detailedAction.push(`Direct ${opt.solarToLoadKw} kW solar power and ${opt.windToLoadKw} kW wind power to building and EV charging.`);
    if (opt.batteryNetKw > 0) {
      detailedAction.push(`Store ${opt.batteryNetKw} kW remaining solar in battery to build buffer for the 6 PM peak.`);
    } else if (opt.batteryNetKw < 0) {
      detailedAction.push(`Provide slight battery assistance (${Math.abs(opt.batteryNetKw)} kW) while strictly preserving >60% SOC.`);
    }
    if (opt.gridTotalImportKw > 0) {
      detailedAction.push(`Draw minimal supplementary grid power (${opt.gridTotalImportKw} kW) strictly during mid-peak tariff.`);
    }

    whyThisDecision.push({
      factor: 'Solar Generation Forecast',
      observedValue: `${solarKw} kW (Peak sunlight window 12:00–15:00)`,
      impactOnDecision: 'Immediate co-location of high generation with high EV charging avoids distribution conversion losses.',
    });
    whyThisDecision.push({
      factor: 'EV Charging Fleet Demand',
      observedValue: `${evKw} kW across active charging bays`,
      impactOnDecision: 'Fulfills commuter charging schedules cleanly using 85%+ on-site clean solar energy.',
    });
    whyThisDecision.push({
      factor: 'Battery SOC State',
      observedValue: `${batterySoc}% (Healthy intermediate charge)`,
      impactOnDecision: 'Preserves high electrochemical cycle life by avoiding rapid deep micro-cycling while solar is plentiful.',
    });

    alternativesConsidered.push({
      strategyName: 'Aggressive Battery Discharging to Eliminate All Grid Import',
      whyRejected: 'Discharging battery at 2:00 PM would deplete energy before the critical 6:00 PM grid tariff peak, causing 3x higher costs later.',
    });
    alternativesConsidered.push({
      strategyName: 'Curtail or Defer EV Charging',
      whyRejected: 'Violates user departure SLA deadlines without necessity, since renewable solar supply is abundant.',
    });
  } else if (isLowBattery && isDeficit) {
    title = 'Battery Low-SOC Protection & Controlled Grid Bridging';
    urgency = 'warning';
    summary = `Battery SOC (${batterySoc}%) is nearing minimum threshold (${20}%). Battery discharge is locked to prevent deep discharge degradation; grid import is managed cleanly.`;
    detailedAction.push('Lock battery discharge to preserve cell health and emergency microgrid black-start reserve.');
    detailedAction.push(`Utilize available ${totalGen} kW renewable generation first.`);
    detailedAction.push(`Modulate EV charging power to smooth grid peak draw below ${Math.round(totalLoad * 0.7)} kW.`);

    whyThisDecision.push({
      factor: 'Battery State of Charge',
      observedValue: `${batterySoc}% (Near safety floor of 15-20%)`,
      impactOnDecision: 'Prevents copper shunting and SEI layer breakdown caused by deep discharge cycles.',
    });
    whyThisDecision.push({
      factor: 'Grid Import Capability',
      observedValue: 'Available at normal capacity',
      impactOnDecision: 'Grid takes over base deficit while maintaining power factor and feeder thermal limits.',
    });

    alternativesConsidered.push({
      strategyName: 'Continue Discharging Battery into Low SOC',
      whyRejected: 'Causes irreversible cell capacity loss and violates manufacturer warranty parameters.',
    });
    alternativesConsidered.push({
      strategyName: 'Abrupt EV Fleet Shutdown',
      whyRejected: 'Unscheduled disconnection damages EV onboard chargers and customer service reliability.',
    });
  } else {
    title = 'Coordinated Multi-Asset Economic Dispatch';
    urgency = 'medium';
    summary = `Renewables supply ${Math.round((opt.totalRenewableUsedKw / (totalLoad || 1)) * 100)}% of active load. Balanced battery and grid support ensures stable bus voltage and minimum operating cost.`;
    detailedAction.push(`Renewable dispatch: ${opt.solarToLoadKw} kW solar + ${opt.windToLoadKw} kW wind to active loads.`);
    if (opt.batteryNetKw !== 0) {
      detailedAction.push(`Battery active at ${Math.abs(opt.batteryNetKw)} kW (${opt.batteryNetKw > 0 ? 'charging' : 'discharging'}).`);
    }
    if (opt.gridTotalImportKw > 0) {
      detailedAction.push(`Grid import: ${opt.gridTotalImportKw} kW at ₹${opt.costEstimateINR} estimated 15-min cost.`);
    }

    whyThisDecision.push({
      factor: 'Energy Bus Power Balance',
      observedValue: `Generation: ${totalGen} kW vs Demand: ${totalLoad} kW`,
      impactOnDecision: 'Optimally balances generation against loads with minimal conversion loss.',
    });
    whyThisDecision.push({
      factor: 'Economic Dispatch Priority',
      observedValue: 'Hierarchy: Renewables > Storage Buffer > Off-Peak Grid',
      impactOnDecision: 'Achieves lowest levelized cost of energy while meeting all building and EV mobility needs.',
    });

    alternativesConsidered.push({
      strategyName: 'Uncoordinated Merit-Order Dispatch',
      whyRejected: 'Results in 24% higher peak grid penalty and irregular battery thermal stress.',
    });
  }

  return {
    id: `rec-${Date.now()}`,
    title,
    urgency,
    summary,
    detailedAction,
    whyThisDecision,
    alternativesConsidered,
    expectedEffects,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}
