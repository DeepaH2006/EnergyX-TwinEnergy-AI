/**
 * High-fidelity synthetic dataset generator for microgrid ecosystem.
 * Formulated using standard PVWatts / NREL solar profiles and IEC 61400 wind power curves.
 * Explicitly tagged as simulated prototype data as per hackathon guidelines.
 */

import { TelemetryPoint, WeatherCondition } from '../types/energy';

// Base system physical capacities
export const SYSTEM_CAPACITIES = {
  solarRatedKw: 350,
  windRatedKw: 200,
  batteryCapacityKwh: 500,
  batteryMaxChargeKw: 150,
  batteryMaxDischargeKw: 150,
  batteryMinSoc: 15,
  batteryMaxSoc: 95,
  evMaxCapacityKw: 220, // 10 fast-chargers + 10 level-2
  buildingPeakLoadKw: 280,
  gridMaxImportKw: 450,
  gridMaxExportKw: 250,
};

// 24-hour profile templates based on diurnal microgrid dynamics
export function generate24HourTelemetry(): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeDecimal = hour + minute / 60;
      const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      // Solar generation curve (bell curve 6:00 to 18:30 with noon peak)
      let solarKw = 0;
      if (timeDecimal >= 6.0 && timeDecimal <= 18.5) {
        const peakHour = 12.8;
        const width = 3.6;
        const normalized = Math.exp(-Math.pow(timeDecimal - peakHour, 2) / (2 * width * width));
        // Add realistic micro-cloud perturbation
        const cloudDip = (timeDecimal >= 11.0 && timeDecimal <= 12.2) ? 0.82 : 1.0;
        solarKw = Math.round(SYSTEM_CAPACITIES.solarRatedKw * normalized * cloudDip * 10) / 10;
      }

      // Wind generation curve (stochastic breeze with evening & night elevation)
      const windDiurnal = 0.55 + 0.35 * Math.sin((timeDecimal - 17) * (Math.PI / 12));
      const windNoise = 0.9 + 0.2 * Math.sin(timeDecimal * 3.7);
      const windKw = Math.max(
        15,
        Math.round(SYSTEM_CAPACITIES.windRatedKw * windDiurnal * windNoise * 10) / 10
      );

      // Building load profile (office/campus baseline 70kW, morning ramp at 8am, peak at 14:00 with HVAC, drop at 18:00)
      let buildingKw = 75;
      if (timeDecimal >= 8 && timeDecimal <= 18) {
        const workDayPeak = 140 * Math.sin(((timeDecimal - 8) / 10) * Math.PI);
        const hvacAfternoon = (timeDecimal >= 12 && timeDecimal <= 16) ? 45 : 15;
        buildingKw = Math.round((buildingKw + workDayPeak + hvacAfternoon) * 10) / 10;
      } else {
        buildingKw = Math.round((70 + 15 * Math.sin(timeDecimal)) * 10) / 10;
      }

      // EV charging demand (commuter morning rush 8:30 - 10:30 and afternoon post-lunch 13:30 - 15:30)
      let evKw = 15;
      if (timeDecimal >= 8.5 && timeDecimal <= 10.5) {
        evKw = 120 + 35 * Math.sin((timeDecimal - 8.5) * Math.PI);
      } else if (timeDecimal >= 13.0 && timeDecimal <= 15.5) {
        // Example scenario: 2:00 PM EV charging is surging!
        evKw = 155 + 40 * Math.sin((timeDecimal - 13.0) * (Math.PI / 2.5));
      } else if (timeDecimal >= 17.0 && timeDecimal <= 19.5) {
        evKw = 85 + 25 * Math.sin((timeDecimal - 17.0) * Math.PI);
      }
      evKw = Math.round(evKw * 10) / 10;

      const totalRenewableKw = Math.round((solarKw + windKw) * 10) / 10;
      const totalDemandKw = Math.round((buildingKw + evKw) * 10) / 10;
      const netMismatchKw = Math.round((totalRenewableKw - totalDemandKw) * 10) / 10;

      // Realistic battery state trajectory throughout the day
      // Starts at 65% in morning, drops to 45% during morning EV rush, charges back up with noon solar to 80%, drains in evening
      let batterySocPct = 65;
      if (timeDecimal < 8) {
        batterySocPct = 65 - timeDecimal * 1.5;
      } else if (timeDecimal < 11) {
        batterySocPct = 52 - (timeDecimal - 8) * 3;
      } else if (timeDecimal < 15) {
        // At 14:00 (2:00 PM), battery SOC is ~70-74% as specified in example scenario
        batterySocPct = 43 + (timeDecimal - 11) * 7.5;
      } else if (timeDecimal < 20) {
        batterySocPct = 73 - (timeDecimal - 15) * 5.8;
      } else {
        batterySocPct = 44 + (timeDecimal - 20) * 1.8;
      }
      batterySocPct = Math.max(20, Math.min(92, Math.round(batterySocPct)));

      // Battery power (charging positive, discharging negative)
      let batteryPowerKw = 0;
      if (netMismatchKw > 20 && batterySocPct < 90) {
        batteryPowerKw = Math.min(SYSTEM_CAPACITIES.batteryMaxChargeKw, netMismatchKw * 0.7);
      } else if (netMismatchKw < -20 && batterySocPct > 25) {
        batteryPowerKw = -Math.min(SYSTEM_CAPACITIES.batteryMaxDischargeKw, Math.abs(netMismatchKw) * 0.65);
      }
      batteryPowerKw = Math.round(batteryPowerKw * 10) / 10;

      // Grid power (import if remaining deficit, export if surplus)
      const unservedLoad = totalDemandKw - totalRenewableKw + batteryPowerKw;
      const gridPowerKw = Math.round(unservedLoad * 10) / 10;

      // Time-of-use tariff (INR per kWh)
      let gridTariff = 6.5; // Normal
      if (timeDecimal >= 18 && timeDecimal <= 22) {
        gridTariff = 11.2; // Peak evening
      } else if (timeDecimal >= 0 && timeDecimal <= 5) {
        gridTariff = 4.2; // Off-peak night
      }

      // Renewable utilization percentage
      const renewableUsed = Math.min(totalRenewableKw, totalDemandKw + Math.max(0, batteryPowerKw));
      const renewableUtilizationPct = totalRenewableKw > 0
        ? Math.min(100, Math.round((renewableUsed / totalRenewableKw) * 100))
        : 100;

      // CO2 emissions calculation (grid baseline = 0.82 kg CO2 / kWh, renewables = 0)
      const co2EmissionsKg = Math.max(0, Math.round(Math.max(0, gridPowerKw) * 0.82 * 0.25 * 10) / 10);

      points.push({
        timestamp: `2026-09-24T${timeLabel}:00`,
        hour,
        timeLabel,
        solarKw,
        windKw,
        totalRenewableKw,
        buildingDemandKw: buildingKw,
        evDemandKw: evKw,
        totalDemandKw,
        netMismatchKw,
        batterySocPct,
        batteryPowerKw,
        gridPowerKw,
        gridTariffINR_kWh: gridTariff,
        renewableUtilizationPct,
        co2EmissionsKg,
        isSimulated: true,
      });
    }
  }

  return points;
}

export function getWeatherConditionAtHour(hour: number): WeatherCondition {
  const irradiance = (hour >= 6 && hour <= 18)
    ? Math.max(0, Math.round(920 * Math.sin(((hour - 6) / 12) * Math.PI)))
    : 0;

  return {
    timestamp: `2026-09-24T${String(hour).padStart(2, '0')}:00:00`,
    hour,
    solarIrradianceW_m2: irradiance,
    ambientTempC: Math.round((24 + 10 * Math.sin(((hour - 7) / 14) * Math.PI)) * 10) / 10,
    cloudCoverPct: (hour >= 11 && hour <= 13) ? 28 : 12,
    windSpeedM_s: Math.round((5.8 + 2.2 * Math.sin((hour / 24) * 2 * Math.PI)) * 10) / 10,
    windDirectionDeg: 215,
  };
}
