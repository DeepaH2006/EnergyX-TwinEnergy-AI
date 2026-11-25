/**
 * Predefined What-If Scenarios and Scenario Comparison Engine.
 * Evaluates scenarios using actual prototype simulation logic without fabricated numbers.
 */

import { WhatIfScenarioInput, ScenarioComparisonItem } from '../types/energy';
import { optimizeFromScenario } from './optimizationEngine';

export const PREDEFINED_SCENARIOS: WhatIfScenarioInput[] = [
  {
    id: 'scenario-1-high-solar-ev',
    name: '1. High Solar + High EV Demand (2:00 PM Baseline)',
    description: 'Realistic noon-afternoon condition: solar is strong, EV commuters are fast-charging, building load is steady.',
    solarFactor: 1.15,
    windFactor: 0.9,
    evDemandFactor: 1.25,
    buildingDemandFactor: 1.0,
    batteryInitialSocPct: 70,
    gridAvailable: true,
    gridMaxImportKw: 450,
    timeOfSimulationHour: 14,
  },
  {
    id: 'scenario-2-low-solar-high-demand',
    name: '2. Low Solar + High Demand (Cloud Cover Shock)',
    description: 'Sudden convective storm causes solar output to drop by 65% while building HVAC and EV loads remain high.',
    solarFactor: 0.35,
    windFactor: 1.1,
    evDemandFactor: 1.2,
    buildingDemandFactor: 1.15,
    batteryInitialSocPct: 65,
    gridAvailable: true,
    gridMaxImportKw: 450,
    timeOfSimulationHour: 14,
  },
  {
    id: 'scenario-3-low-battery-soc',
    name: '3. Low Battery SOC Reserve Stress',
    description: 'Storage system is depleted at 20% SOC following an overnight cycle; tests low-SOC protection algorithms.',
    solarFactor: 0.95,
    windFactor: 0.8,
    evDemandFactor: 1.1,
    buildingDemandFactor: 1.0,
    batteryInitialSocPct: 20,
    gridAvailable: true,
    gridMaxImportKw: 450,
    timeOfSimulationHour: 14,
  },
  {
    id: 'scenario-4-renewable-surplus',
    name: '4. High Renewable Surplus (Solar + Wind Peak)',
    description: 'Brisk wind and maximum irradiance yield massive green surplus; tests battery absorption and net-metering export.',
    solarFactor: 1.3,
    windFactor: 1.45,
    evDemandFactor: 0.65,
    buildingDemandFactor: 0.75,
    batteryInitialSocPct: 55,
    gridAvailable: true,
    gridMaxImportKw: 450,
    timeOfSimulationHour: 13,
  },
  {
    id: 'scenario-5-grid-constraint',
    name: '5. Grid Islanding / Outage Constraint',
    description: 'Utility substation trips or islanding command initiated; local microgrid must balance independently with zero grid.',
    solarFactor: 1.0,
    windFactor: 1.0,
    evDemandFactor: 0.95,
    buildingDemandFactor: 1.0,
    batteryInitialSocPct: 75,
    gridAvailable: false,
    gridMaxImportKw: 0,
    timeOfSimulationHour: 14,
  },
  {
    id: 'scenario-6-peak-demand-event',
    name: '6. Peak Demand Event (Simultaneous Super-Peak)',
    description: 'Afternoon heatwave triggers full HVAC cooling alongside simultaneous EV delivery van fleet arrival.',
    solarFactor: 0.9,
    windFactor: 0.7,
    evDemandFactor: 1.5,
    buildingDemandFactor: 1.35,
    batteryInitialSocPct: 68,
    gridAvailable: true,
    gridMaxImportKw: 450,
    timeOfSimulationHour: 15,
  },
];

/**
 * Computes comparative benchmark matrix for the 4 core comparison scenarios:
 * Scenario A - Normal Operation
 * Scenario B - Low Solar
 * Scenario C - High EV Demand
 * Scenario D - Grid Constraint
 */
export function generateScenarioComparisonMatrix(): ScenarioComparisonItem[] {
  const comparisonInputs: { id: string; name: string; badge: string; input: WhatIfScenarioInput }[] = [
    {
      id: 'sc-a',
      name: 'Scenario A – Normal Operation',
      badge: 'Balanced Baseline',
      input: {
        id: 'sc-a',
        name: 'Normal Operation',
        description: 'Standard 2:00 PM operating parameters with balanced renewable generation and typical campus load.',
        solarFactor: 1.0,
        windFactor: 1.0,
        evDemandFactor: 1.0,
        buildingDemandFactor: 1.0,
        batteryInitialSocPct: 70,
        gridAvailable: true,
        gridMaxImportKw: 450,
        timeOfSimulationHour: 14,
      },
    },
    {
      id: 'sc-b',
      name: 'Scenario B – Low Solar',
      badge: 'Cloud Shock',
      input: {
        id: 'sc-b',
        name: 'Low Solar',
        description: 'Sudden thick cloud layer cuts PV generation by 70%, testing battery buffer and grid stabilization.',
        solarFactor: 0.3,
        windFactor: 0.85,
        evDemandFactor: 1.0,
        buildingDemandFactor: 1.0,
        batteryInitialSocPct: 65,
        gridAvailable: true,
        gridMaxImportKw: 450,
        timeOfSimulationHour: 14,
      },
    },
    {
      id: 'sc-c',
      name: 'Scenario C – High EV Demand',
      badge: 'Mobility Surge',
      input: {
        id: 'sc-c',
        name: 'High EV Demand',
        description: 'Fleet arrival surge with 18 charging bays active, increasing demand by 60% above normal.',
        solarFactor: 1.0,
        windFactor: 1.0,
        evDemandFactor: 1.6,
        buildingDemandFactor: 1.0,
        batteryInitialSocPct: 72,
        gridAvailable: true,
        gridMaxImportKw: 450,
        timeOfSimulationHour: 14,
      },
    },
    {
      id: 'sc-d',
      name: 'Scenario D – Grid Constraint',
      badge: 'Islanded Mode',
      input: {
        id: 'sc-d',
        name: 'Grid Constraint',
        description: 'Grid capacity limited to 0 kW (islanding/outage). Autonomous microgrid frequency & power matching.',
        solarFactor: 1.0,
        windFactor: 1.0,
        evDemandFactor: 1.0,
        buildingDemandFactor: 1.0,
        batteryInitialSocPct: 75,
        gridAvailable: false,
        gridMaxImportKw: 0,
        timeOfSimulationHour: 14,
      },
    },
  ];

  return comparisonInputs.map(({ id, name, badge, input }) => {
    const opt = optimizeFromScenario(input);
    const baseSolar = 285 * input.solarFactor;
    const baseWind = 75 * input.windFactor;
    const baseBuilding = 175 * input.buildingDemandFactor;
    const baseEv = 160 * input.evDemandFactor;

    let recommendationSnippet = '';
    if (id === 'sc-a') {
      recommendationSnippet = 'Direct solar to EV & load; store surplus in battery for 6 PM peak.';
    } else if (id === 'sc-b') {
      recommendationSnippet = 'Discharge battery buffer smoothly; supplement with controlled off-peak grid.';
    } else if (id === 'sc-c') {
      recommendationSnippet = 'Prioritize 100% solar self-consumption for EV fleet; shave peak grid ramp.';
    } else {
      recommendationSnippet = 'Activate islanded microgrid balancing; throttle non-critical charging.';
    }

    return {
      id,
      name,
      badge,
      solarKw: Math.round(baseSolar * 10) / 10,
      windKw: Math.round(baseWind * 10) / 10,
      totalGenKw: Math.round((baseSolar + baseWind) * 10) / 10,
      buildingDemandKw: Math.round(baseBuilding * 10) / 10,
      evDemandKw: Math.round(baseEv * 10) / 10,
      totalDemandKw: Math.round((baseBuilding + baseEv) * 10) / 10,
      renewableUsedKw: opt.totalRenewableUsedKw,
      renewableUtilizationPct: opt.renewableUtilizationPct,
      batteryUsageKw: opt.batteryNetKw,
      batterySocPct: opt.batteryFinalSocPct,
      gridUsageKw: opt.gridTotalImportKw,
      peakDemandKw: opt.peakDemandKw,
      costINR: opt.costEstimateINR,
      co2SavedKg: opt.co2SavedKg,
      recommendationSnippet,
    };
  });
}
