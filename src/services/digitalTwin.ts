/**
 * Physics-informed Digital Twin simulation model for the Renewable Energy Ecosystem.
 * Models the central Energy Bus, bidirectional battery dynamics, EV charging stations,
 * building loads, distribution losses, and electrical grid coupling.
 */

import { EnergyBusTwinState, BatteryTwinState, EVStationTwinState, GridTwinState } from '../types/energy';
import { SYSTEM_CAPACITIES } from './syntheticData';

export interface TwinSimulationParams {
  solarKw: number;
  windKw: number;
  buildingKw: number;
  evKw: number;
  batterySocPct: number;
  batteryDesiredKw: number; // + charge, - discharge
  gridAvailable: boolean;
  gridMaxImportKw?: number;
  gridTariffINR?: number;
}

export function simulateDigitalTwinState(params: TwinSimulationParams): EnergyBusTwinState {
  const {
    solarKw,
    windKw,
    buildingKw,
    evKw,
    batterySocPct,
    batteryDesiredKw,
    gridAvailable,
    gridMaxImportKw = SYSTEM_CAPACITIES.gridMaxImportKw,
    gridTariffINR = 6.8,
  } = params;

  // 1. Battery physics constraints & state update
  const boundedSoc = Math.max(SYSTEM_CAPACITIES.batteryMinSoc, Math.min(SYSTEM_CAPACITIES.batteryMaxSoc, batterySocPct));
  let actualBatteryKw = batteryDesiredKw;

  // Enforce power and SOC limits
  if (batteryDesiredKw > 0) {
    // Charging
    const headroomKwh = ((SYSTEM_CAPACITIES.batteryMaxSoc - boundedSoc) / 100) * SYSTEM_CAPACITIES.batteryCapacityKwh;
    const maxAllowedKw = Math.min(SYSTEM_CAPACITIES.batteryMaxChargeKw, headroomKwh / 0.25); // 15-min interval
    actualBatteryKw = Math.min(batteryDesiredKw, Math.max(0, maxAllowedKw));
  } else if (batteryDesiredKw < 0) {
    // Discharging
    const energyAvailableKwh = ((boundedSoc - SYSTEM_CAPACITIES.batteryMinSoc) / 100) * SYSTEM_CAPACITIES.batteryCapacityKwh;
    const maxAllowedKw = Math.min(SYSTEM_CAPACITIES.batteryMaxDischargeKw, energyAvailableKwh / 0.25);
    actualBatteryKw = -Math.min(Math.abs(batteryDesiredKw), Math.max(0, maxAllowedKw));
  }

  const cRate = Math.abs(actualBatteryKw) / SYSTEM_CAPACITIES.batteryCapacityKwh;
  const cellTempC = Math.round((28.5 + cRate * 12.0) * 10) / 10;
  const operatingMode = actualBatteryKw > 2 ? 'charging' : actualBatteryKw < -2 ? 'discharging' : 'idle';

  const batteryState: BatteryTwinState = {
    capacityKwh: SYSTEM_CAPACITIES.batteryCapacityKwh,
    currentKwh: Math.round(((boundedSoc / 100) * SYSTEM_CAPACITIES.batteryCapacityKwh) * 10) / 10,
    socPct: boundedSoc,
    sohPct: 98.4,
    nominalVoltageV: 400,
    currentAmps: Math.round((actualBatteryKw * 1000) / 400),
    cellTempC,
    maxChargeRateKw: SYSTEM_CAPACITIES.batteryMaxChargeKw,
    maxDischargeRateKw: SYSTEM_CAPACITIES.batteryMaxDischargeKw,
    efficiencyRoundTripPct: 92.5,
    currentCycleCount: 418,
    degradationRatePerDayPct: 0.008,
    operatingMode,
  };

  // 2. EV Charging Station Twin
  const activeVehicles = Math.min(20, Math.max(2, Math.round(evKw / 11)));
  const evState: EVStationTwinState = {
    totalBays: 20,
    activeVehicles,
    queueLength: evKw > 140 ? 4 : evKw > 100 ? 2 : 0,
    avgVehicleSocPct: Math.round(48 + Math.random() * 10),
    totalDrawKw: evKw,
    peakCapacityKw: SYSTEM_CAPACITIES.evMaxCapacityKw,
    criticalVehiclesCount: evKw > 120 ? 3 : 1,
  };

  // 3. Energy Balance on Central Bus
  // Sources: Solar + Wind + (Battery if discharging)
  // Sinks: Building + EV + (Battery if charging)
  const totalGenKw = solarKw + windKw;
  const totalLoadKw = buildingKw + evKw;

  // Calculate ohmic line & distribution loss (approx 2% of throughput)
  const totalThroughput = totalGenKw + Math.abs(actualBatteryKw);
  const distributionLossKw = Math.round((totalThroughput * 0.019) * 10) / 10;

  // Net unserved power after battery action
  // If actualBatteryKw > 0, battery is charging (acting as load)
  // If actualBatteryKw < 0, battery is discharging (acting as source)
  const netDeficitOrSurplus = (totalLoadKw + distributionLossKw + actualBatteryKw) - totalGenKw;

  let gridFlowKw = 0;
  let gridStatus: GridTwinState['status'] = gridAvailable ? 'connected' : 'islanded';

  if (gridAvailable) {
    if (netDeficitOrSurplus > 0) {
      // Need import
      gridFlowKw = Math.min(gridMaxImportKw, netDeficitOrSurplus);
      if (gridFlowKw < netDeficitOrSurplus) {
        gridStatus = 'constrained';
      }
    } else {
      // Surplus export
      gridFlowKw = Math.max(-SYSTEM_CAPACITIES.gridMaxExportKw, netDeficitOrSurplus);
    }
  } else {
    gridFlowKw = 0;
  }

  const gridState: GridTwinState = {
    status: gridStatus,
    voltageKv: 11.0,
    frequencyHz: 50.0 + (gridAvailable ? (Math.random() * 0.04 - 0.02) : -0.15),
    maxImportCapacityKw: gridMaxImportKw,
    maxExportCapacityKw: SYSTEM_CAPACITIES.gridMaxExportKw,
    currentFlowKw: Math.round(gridFlowKw * 10) / 10,
    carbonIntensityGPerKwh: 820,
    tariffPerKwh: gridTariffINR,
  };

  // Bus voltage stability check
  const busVoltageV = gridAvailable ? 415.0 : Math.round((408.0 + Math.random() * 3) * 10) / 10;
  const busFrequencyHz = gridState.frequencyHz;

  // Power balance residual on the bus
  const powerBalanceDeltaKw = Math.round((totalGenKw + (actualBatteryKw < 0 ? -actualBatteryKw : 0) + (gridFlowKw > 0 ? gridFlowKw : 0)
    - (totalLoadKw + distributionLossKw + (actualBatteryKw > 0 ? actualBatteryKw : 0) + (gridFlowKw < 0 ? -gridFlowKw : 0))) * 10) / 10;

  return {
    busVoltageV,
    busFrequencyHz: Math.round(busFrequencyHz * 100) / 100,
    powerBalanceDeltaKw,
    totalGenerationKw: Math.round(totalGenKw * 10) / 10,
    totalLoadKw: Math.round(totalLoadKw * 10) / 10,
    distributionLossKw,
    powerFactor: 0.98,
    battery: batteryState,
    evStation: evState,
    grid: gridState,
    solarKw: Math.round(solarKw * 10) / 10,
    windKw: Math.round(windKw * 10) / 10,
    buildingKw: Math.round(buildingKw * 10) / 10,
  };
}
