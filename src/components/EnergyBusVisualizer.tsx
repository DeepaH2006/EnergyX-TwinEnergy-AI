import React from 'react';
import { Sun, Wind, Battery, Car, Building2, Zap, ArrowDown, ArrowUp, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { EnergyBusTwinState } from '../types/energy';

interface EnergyBusVisualizerProps {
  twinState: EnergyBusTwinState;
  compact?: boolean;
}

export const EnergyBusVisualizer: React.FC<EnergyBusVisualizerProps> = ({ twinState, compact = false }) => {
  const {
    solarKw,
    windKw,
    buildingKw,
    battery,
    evStation,
    grid,
    busVoltageV,
    busFrequencyHz,
    powerBalanceDeltaKw,
    distributionLossKw,
  } = twinState;

  const isBatteryCharging = battery.operatingMode === 'charging';
  const isBatteryDischarging = battery.operatingMode === 'discharging';
  const isGridImporting = grid.currentFlowKw > 0;
  const isGridExporting = grid.currentFlowKw < 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-hidden">
      {/* Visualizer Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Virtual Energy Bus & Dynamic Power Routing
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
              Digital Twin Model
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Physics-informed nodal power balance: Generation + Storage + Grid = Demand + Losses
          </p>
        </div>

        {/* Bus Telemetry Badges */}
        <div className="flex items-center space-x-2 text-xs">
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Bus Voltage: </span>
            <span className="font-semibold text-slate-800">{busVoltageV} V</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Frequency: </span>
            <span className="font-semibold text-slate-800">{busFrequencyHz} Hz</span>
          </div>
          <div className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center space-x-1 ${
            Math.abs(powerBalanceDeltaKw) < 2
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {Math.abs(powerBalanceDeltaKw) < 2 ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            <span>Net Bus Residual: {powerBalanceDeltaKw} kW</span>
          </div>
        </div>
      </div>

      {/* Interactive Schematic Diagram */}
      <div className="relative bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-xl p-4 sm:p-8 border border-slate-200/80">
        {/* Central Energy Bus Bar (Horizontal Spine) */}
        <div className="relative my-12 sm:my-16">
          {/* Main Bus Line */}
          <div className="h-4 sm:h-5 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 rounded-full shadow-inner relative flex items-center justify-center">
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
            <span className="text-[10px] sm:text-xs font-extrabold text-white tracking-widest uppercase drop-shadow-xs px-3">
              CENTRAL 415V 3-PHASE AC ENERGY BUS (Active Loss: {distributionLossKw} kW)
            </span>
          </div>
        </div>

        {/* Top Tier: Generation Sources (Solar & Wind) */}
        <div className="grid grid-cols-2 gap-4 sm:gap-12 -mt-16 sm:-mt-20 mb-8 sm:mb-10">
          {/* Solar Node */}
          <div className="bg-white rounded-xl p-3 sm:p-4 border-2 border-amber-200 shadow-sm hover:border-amber-400 transition-all flex flex-col items-center text-center relative group">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
              <Sun className="w-6 h-6 animate-spin-slow" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Solar Photovoltaic</span>
            <span className="text-lg sm:text-2xl font-black text-amber-600">{solarKw} <span className="text-xs font-normal text-slate-500">kW</span></span>
            <span className="text-[11px] text-slate-400 mt-0.5">350 kWp Monocrystalline Array</span>

            {/* Connecting Pipe to Bus */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className={`w-1.5 h-8 bg-amber-400/80 rounded-full relative overflow-hidden ${solarKw > 0 ? 'shadow-xs' : 'opacity-40'}`}>
                {solarKw > 0 && (
                  <div className="w-full h-3 bg-white rounded-full animate-bounce" />
                )}
              </div>
              <ArrowDown className="w-3.5 h-3.5 text-amber-500 -mt-1" />
            </div>
          </div>

          {/* Wind Node */}
          <div className="bg-white rounded-xl p-3 sm:p-4 border-2 border-sky-200 shadow-sm hover:border-sky-400 transition-all flex flex-col items-center text-center relative group">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform">
              <Wind className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wind Turbines</span>
            <span className="text-lg sm:text-2xl font-black text-sky-600">{windKw} <span className="text-xs font-normal text-slate-500">kW</span></span>
            <span className="text-[11px] text-slate-400 mt-0.5">200 kW Variable-Pitch Cluster</span>

            {/* Connecting Pipe to Bus */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className={`w-1.5 h-8 bg-sky-400/80 rounded-full relative overflow-hidden ${windKw > 0 ? 'shadow-xs' : 'opacity-40'}`}>
                {windKw > 0 && (
                  <div className="w-full h-3 bg-white rounded-full animate-bounce" />
                )}
              </div>
              <ArrowDown className="w-3.5 h-3.5 text-sky-500 -mt-1" />
            </div>
          </div>
        </div>

        {/* Bottom Tier: Storage, Loads & Grid Interconnection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">
          {/* Battery Storage Node (Bidirectional) */}
          <div className={`bg-white rounded-xl p-3 sm:p-4 border-2 shadow-sm transition-all relative flex flex-col items-center text-center ${
            isBatteryCharging ? 'border-emerald-400 ring-2 ring-emerald-100' : isBatteryDischarging ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'
          }`}>
            {/* Top Connector Pipe */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {isBatteryDischarging ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5 text-amber-500 -mb-1" />
                  <div className="w-1.5 h-5 bg-amber-400 rounded-full" />
                </>
              ) : isBatteryCharging ? (
                <>
                  <div className="w-1.5 h-5 bg-emerald-400 rounded-full" />
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-500 -mt-1" />
                </>
              ) : (
                <div className="w-1.5 h-5 bg-slate-300 rounded-full" />
              )}
            </div>

            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
              isBatteryCharging ? 'bg-emerald-100 text-emerald-600' : isBatteryDischarging ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
            }`}>
              <Battery className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">BESS Storage</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-base sm:text-xl font-bold text-slate-900">{battery.socPct}%</span>
              <span className="text-xs text-slate-500 font-medium">SOC</span>
            </div>
            <div className="mt-1 text-xs font-semibold">
              {isBatteryCharging && <span className="text-emerald-600">+{Math.round((battery.currentAmps * 400) / 1000)} kW (Chg)</span>}
              {isBatteryDischarging && <span className="text-amber-600">-{Math.abs(Math.round((battery.currentAmps * 400) / 1000))} kW (Dis)</span>}
              {!isBatteryCharging && !isBatteryDischarging && <span className="text-slate-400">0 kW (Standby)</span>}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {battery.currentKwh} / {battery.capacityKwh} kWh • {battery.cellTempC}°C
            </div>
          </div>

          {/* EV Charging Station Node (Load) */}
          <div className="bg-white rounded-xl p-3 sm:p-4 border-2 border-teal-200 shadow-sm relative flex flex-col items-center text-center">
            {/* Top Connector Pipe */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className="w-1.5 h-5 bg-teal-400 rounded-full" />
              <ArrowDown className="w-3.5 h-3.5 text-teal-500 -mt-1" />
            </div>

            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center mb-2">
              <Car className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">EV Charging</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-base sm:text-xl font-bold text-teal-700">{evStation.totalDrawKw}</span>
              <span className="text-xs text-slate-500 font-medium">kW</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1">
              {evStation.activeVehicles} / {evStation.totalBays} Bays Active
            </span>
            <div className="text-[10px] text-slate-400 mt-1">
              {evStation.queueLength > 0 ? `${evStation.queueLength} in Queue` : 'Queue Clear'}
            </div>
          </div>

          {/* Building & Industrial Load Node */}
          <div className="bg-white rounded-xl p-3 sm:p-4 border-2 border-indigo-200 shadow-sm relative flex flex-col items-center text-center">
            {/* Top Connector Pipe */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className="w-1.5 h-5 bg-indigo-400 rounded-full" />
              <ArrowDown className="w-3.5 h-3.5 text-indigo-500 -mt-1" />
            </div>

            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Building Load</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-base sm:text-xl font-bold text-indigo-700">{buildingKw}</span>
              <span className="text-xs text-slate-500 font-medium">kW</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1">
              HVAC + Industrial Base
            </span>
            <div className="text-[10px] text-slate-400 mt-1">
              Power Factor: 0.98
            </div>
          </div>

          {/* Utility Electrical Grid Node (Bidirectional) */}
          <div className={`bg-white rounded-xl p-3 sm:p-4 border-2 shadow-sm relative flex flex-col items-center text-center ${
            grid.status === 'islanded'
              ? 'border-rose-300 bg-rose-50/30'
              : isGridImporting
              ? 'border-purple-300 ring-2 ring-purple-100'
              : isGridExporting
              ? 'border-emerald-300 ring-2 ring-emerald-100'
              : 'border-slate-200'
          }`}>
            {/* Top Connector Pipe */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {grid.status === 'islanded' ? (
                <div className="w-1.5 h-5 bg-rose-400 rounded-full" />
              ) : isGridImporting ? (
                <>
                  <div className="w-1.5 h-5 bg-purple-400 rounded-full" />
                  <ArrowDown className="w-3.5 h-3.5 text-purple-500 -mt-1" />
                </>
              ) : isGridExporting ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5 text-emerald-500 -mb-1" />
                  <div className="w-1.5 h-5 bg-emerald-400 rounded-full" />
                </>
              ) : (
                <div className="w-1.5 h-5 bg-slate-300 rounded-full" />
              )}
            </div>

            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
              grid.status === 'islanded'
                ? 'bg-rose-100 text-rose-600'
                : isGridImporting
                ? 'bg-purple-100 text-purple-600'
                : 'bg-emerald-100 text-emerald-600'
            }`}>
              <Zap className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Utility Grid</span>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className={`text-base sm:text-xl font-bold ${
                grid.status === 'islanded' ? 'text-rose-600' : isGridImporting ? 'text-purple-700' : 'text-emerald-700'
              }`}>
                {grid.status === 'islanded' ? 'ISLANDED' : `${Math.abs(grid.currentFlowKw)} kW`}
              </span>
            </div>
            <span className="text-[11px] font-semibold mt-1">
              {grid.status === 'islanded' ? (
                <span className="text-rose-600">Grid Disconnected</span>
              ) : isGridImporting ? (
                <span className="text-purple-600">Importing Power</span>
              ) : isGridExporting ? (
                <span className="text-emerald-600">Exporting Green Power</span>
              ) : (
                <span className="text-slate-400">Idle / Net-Zero</span>
              )}
            </span>
            <div className="text-[10px] text-slate-400 mt-1">
              Tariff: ₹{grid.tariffPerKwh}/kWh • {grid.carbonIntensityGPerKwh}g CO₂/kWh
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
