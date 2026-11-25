/**
 * Data models and interfaces for the AI-Powered Digital Twin
 * Renewable Energy Management System (KPIT Sparkle 2026-27)
 */

export interface WeatherCondition {
  timestamp: string;
  hour: number;
  solarIrradianceW_m2: number;
  ambientTempC: number;
  cloudCoverPct: number;
  windSpeedM_s: number;
  windDirectionDeg: number;
}

export interface TelemetryPoint {
  timestamp: string;
  hour: number;
  timeLabel: string;
  solarKw: number;
  windKw: number;
  totalRenewableKw: number;
  buildingDemandKw: number;
  evDemandKw: number;
  totalDemandKw: number;
  netMismatchKw: number; // positive = surplus, negative = deficit
  batterySocPct: number;
  batteryPowerKw: number; // positive = charging, negative = discharging
  gridPowerKw: number; // positive = import, negative = export
  gridTariffINR_kWh: number; // Time-of-use pricing
  renewableUtilizationPct: number;
  co2EmissionsKg: number;
  isSimulated: boolean;
}

export interface ForecastPoint {
  hour: number;
  timeLabel: string;
  actualSolarKw?: number;
  predictedSolarKw: number;
  solarConfidenceLow: number;
  solarConfidenceHigh: number;

  actualWindKw?: number;
  predictedWindKw: number;
  windConfidenceLow: number;
  windConfidenceHigh: number;

  actualBuildingKw?: number;
  predictedBuildingKw: number;

  actualEvKw?: number;
  predictedEvKw: number;

  totalActualDemandKw?: number;
  totalPredictedDemandKw: number;
}

export interface ModelMetrics {
  name: string;
  modelType: string;
  mae: number;
  rmse: number;
  mape: number;
  r2Score: number;
  featureImportance: { feature: string; weight: number }[];
}

export interface BatteryTwinState {
  capacityKwh: number;
  currentKwh: number;
  socPct: number;
  sohPct: number; // State of Health
  nominalVoltageV: number;
  currentAmps: number;
  cellTempC: number;
  maxChargeRateKw: number;
  maxDischargeRateKw: number;
  efficiencyRoundTripPct: number;
  currentCycleCount: number;
  degradationRatePerDayPct: number;
  operatingMode: 'charging' | 'discharging' | 'idle' | 'standby';
}

export interface EVStationTwinState {
  totalBays: number;
  activeVehicles: number;
  queueLength: number;
  avgVehicleSocPct: number;
  totalDrawKw: number;
  peakCapacityKw: number;
  criticalVehiclesCount: number; // must charge immediately
}

export interface GridTwinState {
  status: 'connected' | 'constrained' | 'islanded' | 'fault';
  voltageKv: number;
  frequencyHz: number;
  maxImportCapacityKw: number;
  maxExportCapacityKw: number;
  currentFlowKw: number; // + import, - export
  carbonIntensityGPerKwh: number;
  tariffPerKwh: number;
}

export interface EnergyBusTwinState {
  busVoltageV: number;
  busFrequencyHz: number;
  powerBalanceDeltaKw: number; // close to 0 in steady state
  totalGenerationKw: number;
  totalLoadKw: number;
  distributionLossKw: number;
  powerFactor: number;
  battery: BatteryTwinState;
  evStation: EVStationTwinState;
  grid: GridTwinState;
  solarKw: number;
  windKw: number;
  buildingKw: number;
}

export interface WhatIfScenarioInput {
  id: string;
  name: string;
  description: string;
  solarFactor: number; // 0 to 2 (1 = baseline)
  windFactor: number; // 0 to 2
  evDemandFactor: number; // 0 to 3
  buildingDemandFactor: number; // 0.5 to 2
  batteryInitialSocPct: number; // 10 to 100
  gridAvailable: boolean;
  gridMaxImportKw: number; // 0 to 500
  timeOfSimulationHour: number;
}

export interface OptimizationResult {
  scenarioId: string;
  timestamp: string;
  // Allocation decision variables (kW)
  solarToLoadKw: number;
  solarToBatteryKw: number;
  solarToGridKw: number;
  solarCurtailedKw: number;

  windToLoadKw: number;
  windToBatteryKw: number;
  windToGridKw: number;
  windCurtailedKw: number;

  batteryToBuildingKw: number;
  batteryToEvKw: number;
  batteryNetKw: number; // + charging, - discharging
  batteryFinalSocPct: number;

  gridToBuildingKw: number;
  gridToEvKw: number;
  gridTotalImportKw: number;
  gridExportKw: number;

  // Key performance indicators
  totalRenewableGenKw: number;
  totalRenewableUsedKw: number;
  renewableUtilizationPct: number;
  gridDependencyPct: number;
  peakDemandKw: number;
  costEstimateINR: number;
  co2SavedKg: number;

  // Comparison with uncoordinated baseline
  baseline: {
    renewableUtilizationPct: number;
    gridImportKw: number;
    peakDemandKw: number;
    costEstimateINR: number;
  };
  improvements: {
    renewableUtilizationGainPct: number; // e.g. +18.4%
    gridImportReductionPct: number; // e.g. -42.1%
    peakDemandReductionPct: number; // e.g. -28.6%
    costReductionPct: number;
  };
}

export interface Recommendation {
  id: string;
  title: string;
  urgency: 'high' | 'medium' | 'optimal' | 'warning';
  summary: string;
  detailedAction: string[];
  whyThisDecision: {
    factor: string;
    observedValue: string;
    impactOnDecision: string;
  }[];
  alternativesConsidered: {
    strategyName: string;
    whyRejected: string;
  }[];
  expectedEffects: {
    renewableUtilization: string;
    gridImpact: string;
    batteryHealth: string;
    economicBenefit: string;
  };
  timestamp: string;
}

export interface ScenarioComparisonItem {
  id: string;
  name: string;
  badge: string;
  solarKw: number;
  windKw: number;
  totalGenKw: number;
  buildingDemandKw: number;
  evDemandKw: number;
  totalDemandKw: number;
  renewableUsedKw: number;
  renewableUtilizationPct: number;
  batteryUsageKw: number; // + charge, - discharge
  batterySocPct: number;
  gridUsageKw: number; // import
  peakDemandKw: number;
  costINR: number;
  co2SavedKg: number;
  recommendationSnippet: string;
}
