import React, { useState, useEffect } from 'react';
import {
  Layers,
  Battery,
  Car,
  Zap,
  Sun,
  Wind,
  Thermometer,
  AlertTriangle,
  Play,
  Database,
  RefreshCw,
  ShieldCheck,
  Info,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { EnergyBusTwinState } from '../types/energy';
import {
  DatasetSummaryResponse,
  DigitalTwinSimulateResponse,
  DigitalTwinStep,
  SystemComponentSpec,
} from '../types/backend';
import { digitalTwinApi } from '../services/api';
import { DataMode } from './Header';
import { EnergyBusVisualizer } from './EnergyBusVisualizer';

interface DigitalTwinModuleProps {
  twinState: EnergyBusTwinState;
  dataMode: DataMode;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  systemConfig: SystemComponentSpec;
  setSystemConfig: React.Dispatch<React.SetStateAction<SystemComponentSpec>>;
  twinResult: DigitalTwinSimulateResponse | null;
  setTwinResult: (res: DigitalTwinSimulateResponse | null) => void;
  onNavigateToDataset: () => void;
}

export const DigitalTwinModule: React.FC<DigitalTwinModuleProps> = ({
  twinState,
  dataMode,
  activeDatasetId,
  datasetSummary,
  systemConfig,
  setSystemConfig,
  twinResult,
  setTwinResult,
  onNavigateToDataset,
}) => {
  const [simMode, setSimMode] = useState<'combined' | 'historical' | 'predicted'>('combined');
  const [snapshotView, setSnapshotView] = useState<'historical' | 'predicted'>('predicted');
  const [windTurbineRatedKw, setWindTurbineRatedKw] = useState<string>(
    systemConfig.wind_rated_kw != null ? String(systemConfig.wind_rated_kw) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const parsedWindRated = windTurbineRatedKw.trim() ? Number(windTurbineRatedKw) : null;
      const res = await digitalTwinApi.simulate({
        dataset_id: activeDatasetId,
        mode: simMode,
        system_config: systemConfig,
        wind_turbine_rated_kw: Number.isFinite(parsedWindRated as number) ? parsedWindRated : null,
      });
      setTwinResult(res);
      if (res.latest_predicted_state) {
        setSnapshotView('predicted');
      } else if (res.latest_historical_state) {
        setSnapshotView('historical');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Digital Twin simulation failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && datasetSummary?.is_preprocessed && !twinResult) {
      void runSimulation();
    }
  }, [dataMode, activeDatasetId, datasetSummary?.is_preprocessed]);

  // ===========================================================================
  // MODE A: DATASET MODE (Python FastAPI Physics-Conserving Digital Twin)
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !datasetSummary) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No Dataset Loaded for Digital Twin</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-4">
            Upload and preprocess a renewable energy dataset first to simulate energy-conserving battery, grid, and renewable power flows.
          </p>
          <button
            onClick={onNavigateToDataset}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Go to Dataset & Training
          </button>
        </div>
      );
    }

    const activeStep: DigitalTwinStep | null =
      snapshotView === 'predicted'
        ? twinResult?.latest_predicted_state || twinResult?.latest_historical_state || null
        : twinResult?.latest_historical_state || twinResult?.latest_predicted_state || null;

    const chartData = (twinResult?.timeline || []).slice(-120).map((s) => ({
      ts: s.timestamp.slice(5, 16),
      origin: s.data_origin,
      renewable: s.total_renewable_kw,
      demand: s.demand_kw,
      gridImport: s.grid_import_kw,
      batterySoc: s.battery_soc_pct,
      curtailment: s.curtailment_kw,
      shortage: s.shortage_kw,
    }));

    return (
      <div className="space-y-6">
        {/* Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 text-[11px] font-mono font-semibold mb-2 border border-teal-200">
              <Layers className="w-3.5 h-3.5" />
              <span>HISTORICAL DATASET RECORDS &amp; ML FORECAST (NOT LIVE TELEMETRY)</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Physics-Conserving Microgrid Digital Twin
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Simulates nodal energy conservation (Generation + Grid Import + Battery Discharge = Demand + Battery Charge + Grid Export + Losses + Curtailment - Shortage) over {datasetSummary.filename}.
            </p>
          </div>
          <button
            onClick={runSimulation}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{loading ? 'Simulating...' : 'Run Digital Twin Simulation'}</span>
          </button>
        </div>

        {/* System Component Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">System Component Specifications &amp; Simulation Window</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Timeline Mode:</span>
              {(['combined', 'historical', 'predicted'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSimMode(m)}
                  className={`px-2.5 py-1 rounded border text-xs font-semibold capitalize cursor-pointer ${
                    simMode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">Battery Capacity (kWh)</span>
              <input
                type="number"
                min={0}
                value={systemConfig.battery_capacity_kwh}
                onChange={(e) => setSystemConfig((c) => ({ ...c, battery_capacity_kwh: Number(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">Max Charge/Dis (kW)</span>
              <input
                type="number"
                min={0}
                value={systemConfig.battery_max_charge_kw}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setSystemConfig((c) => ({ ...c, battery_max_charge_kw: val, battery_max_discharge_kw: val }));
                }}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">Initial SOC (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={systemConfig.initial_soc_pct}
                onChange={(e) => setSystemConfig((c) => ({ ...c, initial_soc_pct: Number(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">SOC Bounds Min / Max (%)</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={systemConfig.battery_min_soc_pct}
                  onChange={(e) => setSystemConfig((c) => ({ ...c, battery_min_soc_pct: Number(e.target.value) || 0 }))}
                  className="w-1/2 px-2 py-1.5 rounded border border-slate-300 font-mono"
                />
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={systemConfig.battery_max_soc_pct}
                  onChange={(e) => setSystemConfig((c) => ({ ...c, battery_max_soc_pct: Number(e.target.value) || 100 }))}
                  className="w-1/2 px-2 py-1.5 rounded border border-slate-300 font-mono"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">Grid Import Limit (kW)</span>
              <input
                type="number"
                min={0}
                value={systemConfig.grid_max_import_kw}
                onChange={(e) => setSystemConfig((c) => ({ ...c, grid_max_import_kw: Number(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 font-medium block">Wind Curve Rated (kW, opt.)</span>
              <input
                type="number"
                placeholder="Unused if wind mapped"
                value={windTurbineRatedKw}
                onChange={(e) => setWindTurbineRatedKw(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {twinResult && (
          <>
            {/* Snapshot Selector & Summary Cards */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Inspect Nodal Snapshot:</span>
                {twinResult.latest_historical_state && (
                  <button
                    onClick={() => setSnapshotView('historical')}
                    className={`px-3 py-1 rounded border font-semibold cursor-pointer ${
                      snapshotView === 'historical' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Last Historical Record
                  </button>
                )}
                {twinResult.latest_predicted_state && (
                  <button
                    onClick={() => setSnapshotView('predicted')}
                    className={`px-3 py-1 rounded border font-semibold cursor-pointer ${
                      snapshotView === 'predicted' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Latest ML Predicted Step
                  </button>
                )}
              </div>
              <div className="text-xs font-mono text-slate-500">
                Origin: <strong className="text-slate-800">{activeStep?.data_origin}</strong> · Timestamp: <strong className="text-slate-800">{activeStep?.timestamp}</strong>
              </div>
            </div>

            {activeStep && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-500" /> Solar</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">{activeStep.solar_kw.toFixed(1)} kW</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Wind className="w-3.5 h-3.5 text-sky-500" /> Wind</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">{activeStep.wind_kw.toFixed(1)} kW</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Demand</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">{activeStep.demand_kw.toFixed(1)} kW</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Battery className="w-3.5 h-3.5 text-emerald-600" /> BESS SOC</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">{activeStep.battery_soc_pct.toFixed(1)}%</div>
                  <span className="text-[11px] font-mono text-slate-500">{activeStep.battery_power_kw >= 0 ? `+${activeStep.battery_power_kw.toFixed(1)}` : activeStep.battery_power_kw.toFixed(1)} kW</span>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-purple-600" /> Grid Net</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-purple-800 mt-1">
                    {activeStep.grid_import_kw > 0 ? `+${activeStep.grid_import_kw.toFixed(1)}` : activeStep.grid_export_kw > 0 ? `-${activeStep.grid_export_kw.toFixed(1)}` : '0.0'} kW
                  </div>
                  <span className="text-[11px] text-slate-500">{activeStep.grid_import_kw > 0 ? 'Importing' : activeStep.grid_export_kw > 0 ? 'Exporting' : 'Balanced'}</span>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> Conservation Err</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-teal-700 mt-1">{activeStep.energy_balance_residual_kw.toFixed(3)} kW</div>
                  <span className="text-[11px] text-slate-500">Losses: {activeStep.losses_kw.toFixed(2)} kW</span>
                </div>
              </div>
            )}

            {/* Energy Conservation & Twin Timeline Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Digital Twin Power Flow &amp; Storage Trajectory</h3>
                    <p className="text-xs text-slate-500">Showing up to 120 most recent simulated intervals ({twinResult.interval_minutes} min cadence)</p>
                  </div>
                  <span className="text-xs font-mono text-slate-600">
                    Renew. Util: {twinResult.summary.renewable_utilization_pct?.toFixed(1) ?? '—'}%
                  </span>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="ts" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} unit=" kW" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Area type="monotone" dataKey="renewable" name="Total Renewable (kW)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="demand" name="Demand (kW)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="gridImport" name="Grid Import (kW)" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Alerts & Assumptions */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-3">Physics Alerts &amp; Operating Diagnostics</h3>
                  {twinResult.alerts.length === 0 ? (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                      No curtailment, shortage, or SOC limit violations detected across the simulated timeline.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {twinResult.alerts.slice(0, 10).map((al, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-lg border text-xs ${
                            al.severity === 'critical'
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : al.severity === 'warning'
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="font-bold flex justify-between">
                            <span>{al.component}</span>
                            <span className="font-mono text-[10px]">{al.timestamp.slice(5, 16)}</span>
                          </div>
                          <p className="mt-0.5">{al.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Modeling Assumptions</div>
                  {twinResult.assumptions_used.map((a, i) => (
                    <div key={i}>• {a}</div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original Digital Twin UI)
  // ===========================================================================
  const { battery, evStation, grid, busFrequencyHz } = twinState;

  return (
    <div className="space-y-6">
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold mb-2 border border-teal-200">
            <Layers className="w-3.5 h-3.5" />
            <span>Pillar 2: Virtual Digital Twin</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            High-Fidelity Virtual Twin of Microgrid Ecosystem
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Replicates real-time electrochemical battery dynamics, inverter losses, power bus stability, EV charging queues, and thermal impedances in software.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Model Fidelity</span>
            <span className="font-bold text-slate-800">Physics-Informed (PINN)</span>
          </div>
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-emerald-600 block text-[10px] uppercase font-semibold">Twin State Sync</span>
            <span className="font-bold text-emerald-800">Demo Simulation</span>
          </div>
        </div>
      </div>

      {/* Main Energy Bus Visualizer */}
      <EnergyBusVisualizer twinState={twinState} />

      {/* Subsystem Digital Twin Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 1. BESS Electrochemical Twin */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Battery className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">BESS Battery Twin</h4>
                <span className="text-[11px] text-slate-500">LiFePO4 500 kWh Pack</span>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
              battery.operatingMode === 'charging' ? 'bg-emerald-100 text-emerald-700' : battery.operatingMode === 'discharging' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {battery.operatingMode}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">State of Charge (SOC):</span>
              <span className="font-bold text-slate-900 text-sm">{battery.socPct}% ({battery.currentKwh} kWh)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">State of Health (SOH):</span>
              <span className="font-semibold text-emerald-600">{battery.sohPct}% (Degradation: {battery.degradationRatePerDayPct}%/day)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Cell Operating Temp:</span>
              <span className="font-semibold text-slate-800 flex items-center">
                <Thermometer className="w-3.5 h-3.5 text-amber-500 mr-1" />
                {battery.cellTempC} °C (Max 45°C)
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Round-Trip Efficiency:</span>
              <span className="font-semibold text-slate-800">{battery.efficiencyRoundTripPct}%</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Cycle Count to Date:</span>
              <span className="font-semibold text-slate-800">{battery.currentCycleCount} Equivalent Cycles</span>
            </div>
          </div>
        </div>

        {/* 2. EV Charging Fleet Twin */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                <Car className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">EV Fleet Twin</h4>
                <span className="text-[11px] text-slate-500">20-Bay Smart Station</span>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-bold border border-teal-200">
              {evStation.activeVehicles} Active
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Station Active Draw:</span>
              <span className="font-bold text-teal-700 text-sm">{evStation.totalDrawKw} kW / {evStation.peakCapacityKw} kW</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Bay Occupancy:</span>
              <span className="font-semibold text-slate-800">{Math.round((evStation.activeVehicles / evStation.totalBays) * 100)}% ({evStation.activeVehicles}/{evStation.totalBays} Bays)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Waiting Queue:</span>
              <span className={`font-semibold ${evStation.queueLength > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                {evStation.queueLength} Vehicles in Waiting Bay
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Critical Priority Vehicles:</span>
              <span className="font-semibold text-rose-600">{evStation.criticalVehiclesCount} Expedited</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Average Battery Arrival SOC:</span>
              <span className="font-semibold text-slate-800">{evStation.avgVehicleSocPct}%</span>
            </div>
          </div>
        </div>

        {/* 3. Utility Grid & Substation Twin */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Grid Substation Twin</h4>
                <span className="text-[11px] text-slate-500">11 kV Distribution Feeder</span>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
              grid.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {grid.status}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Substation Flow:</span>
              <span className="font-bold text-purple-800 text-sm">
                {grid.currentFlowKw > 0 ? `+${grid.currentFlowKw} kW Import` : grid.currentFlowKw < 0 ? `${grid.currentFlowKw} kW Export` : '0 kW (Balanced)'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Substation Import Limit:</span>
              <span className="font-semibold text-slate-800">{grid.maxImportCapacityKw} kW Max</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Grid Frequency Stability:</span>
              <span className="font-semibold text-slate-800">{busFrequencyHz} Hz (50.0 Hz Nominal)</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Time-of-Use Grid Tariff:</span>
              <span className="font-semibold text-slate-800">₹{grid.tariffPerKwh} / kWh</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Marginal Carbon Intensity:</span>
              <span className="font-semibold text-slate-800">{grid.carbonIntensityGPerKwh} g CO₂ / kWh</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
