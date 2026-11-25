import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sliders,
  RotateCcw,
  Sparkles,
  Sun,
  Wind,
  Battery,
  Car,
  Building2,
  CheckCircle,
  ArrowRight,
  Database,
  Play,
  RefreshCw,
  AlertTriangle,
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
import { WhatIfScenarioInput, OptimizationResult, EnergyBusTwinState } from '../types/energy';
import {
  DatasetSummaryResponse,
  ScenarioAssumptions,
  ScenarioSimulateResponse,
  SystemComponentSpec,
} from '../types/backend';
import { PREDEFINED_SCENARIOS } from '../services/scenarioPresets';
import { optimizeFromScenario } from '../services/optimizationEngine';
import { simulateDigitalTwinState } from '../services/digitalTwin';
import { generateRecommendation } from '../services/recommendationEngine';
import { scenarioApi } from '../services/api';
import { DataMode } from './Header';
import { EnergyBusVisualizer } from './EnergyBusVisualizer';

interface WhatIfSimulationModuleProps {
  onApplyScenarioToLive: (scenario: WhatIfScenarioInput) => void;
  dataMode: DataMode;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  systemConfig: SystemComponentSpec;
  onNavigateToDataset: () => void;
}

const BACKEND_WHATIF_PRESETS: ScenarioAssumptions[] = [
  {
    name: 'Normal Baseline',
    description: '100% forecast solar, wind, and demand with standard storage and feeder limits.',
    solar_pct: 100,
    wind_pct: 100,
    demand_pct: 100,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 500,
    initial_soc_pct: 60,
    grid_import_limit_kw: 450,
    grid_export_limit_kw: 250,
  },
  {
    name: 'Low Solar (Cloud Shock)',
    description: 'Solar drops to 35% of baseline forecast while demand increases 15%.',
    solar_pct: 35,
    wind_pct: 100,
    demand_pct: 115,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 500,
    initial_soc_pct: 55,
    grid_import_limit_kw: 450,
    grid_export_limit_kw: 250,
  },
  {
    name: 'Low Wind Lull',
    description: 'Wind generation drops to 20% across the entire forecast horizon.',
    solar_pct: 100,
    wind_pct: 20,
    demand_pct: 100,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 500,
    initial_soc_pct: 60,
    grid_import_limit_kw: 450,
    grid_export_limit_kw: 250,
  },
  {
    name: 'High Demand / EV Surge',
    description: 'Facility + EV charging load spikes to 145% above forecast.',
    solar_pct: 100,
    wind_pct: 100,
    demand_pct: 145,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 500,
    initial_soc_pct: 65,
    grid_import_limit_kw: 450,
    grid_export_limit_kw: 250,
  },
  {
    name: 'Reduced Battery Capacity',
    description: 'Storage derated to 200 kWh with low 25% initial SOC.',
    solar_pct: 100,
    wind_pct: 100,
    demand_pct: 100,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 200,
    initial_soc_pct: 25,
    grid_import_limit_kw: 450,
    grid_export_limit_kw: 250,
  },
  {
    name: 'Tight Grid Import Limit',
    description: 'Feeder import capped at 120 kW under peak demand stress.',
    solar_pct: 80,
    wind_pct: 80,
    demand_pct: 110,
    renewable_availability_pct: 100,
    battery_capacity_kwh: 500,
    initial_soc_pct: 60,
    grid_import_limit_kw: 120,
    grid_export_limit_kw: 250,
  },
];

export const WhatIfSimulationModule: React.FC<WhatIfSimulationModuleProps> = ({
  onApplyScenarioToLive,
  dataMode,
  activeDatasetId,
  datasetSummary,
  systemConfig,
  onNavigateToDataset,
}) => {
  // Backend What-If State (Dataset Mode)
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>({
    ...BACKEND_WHATIF_PRESETS[1],
    battery_capacity_kwh: systemConfig.battery_capacity_kwh,
    initial_soc_pct: systemConfig.initial_soc_pct,
    grid_import_limit_kw: systemConfig.grid_max_import_kw,
    grid_export_limit_kw: systemConfig.grid_max_export_kw,
  });
  const [horizon, setHorizon] = useState<'24h' | '48h' | '7d'>('24h');
  const [simResult, setSimResult] = useState<ScenarioSimulateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runBackendScenario = async (targetAssumptions = assumptions) => {
    if (!activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await scenarioApi.simulate({
        dataset_id: activeDatasetId,
        horizon,
        assumptions: targetAssumptions,
        base_system_config: systemConfig,
      });
      setSimResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario simulation failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && datasetSummary?.is_preprocessed && !simResult) {
      void runBackendScenario();
    }
  }, [dataMode, activeDatasetId, datasetSummary?.is_preprocessed]);

  // Demo Mode State (Preserved)
  const [activeScenario, setActiveScenario] = useState<WhatIfScenarioInput>(PREDEFINED_SCENARIOS[0]);
  const [customMode, setCustomMode] = useState(false);

  // ===========================================================================
  // MODE A: DATASET MODE (Backend Counterfactual Simulation + Re-Optimization)
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !datasetSummary) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No Dataset Loaded for What-If Simulation</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-4">
            Upload and preprocess a dataset first to stress-test solar drops, wind lulls, demand surges, and grid feeder caps via the FastAPI MILP engine.
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

    const chartData = (simResult?.schedule || []).map((p) => ({
      ts: p.timestamp.slice(5, 16),
      renewable: p.total_renewable_kw,
      demand: p.demand_kw,
      gridImport: p.grid_import_kw,
      shortage: p.shortage_kw,
    }));

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-mono font-semibold mb-2 border border-amber-200">
              <Zap className="w-3.5 h-3.5" />
              <span>SIMULATED SCENARIO OUTCOME · DATA SOURCE: USER-UPLOADED DATASET</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Counterfactual Stress Testing &amp; Re-Optimization Sandbox
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Modifies dataset-derived renewable/demand series and constraints, re-solves MILP dispatch, and compares against the unperturbed baseline.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as '24h' | '48h' | '7d')}
              className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
            >
              <option value="24h">24h Horizon</option>
              <option value="48h">48h Horizon</option>
              <option value="7d">7d Horizon</option>
            </select>
            <button
              onClick={() => runBackendScenario()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{loading ? 'Simulating...' : 'Run Scenario'}</span>
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Counterfactual Scenario Presets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BACKEND_WHATIF_PRESETS.map((preset) => {
              const selected = assumptions.name === preset.name;
              return (
                <button
                  key={preset.name}
                  onClick={() => {
                    setAssumptions(preset);
                    void runBackendScenario(preset);
                  }}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    selected ? 'border-emerald-600 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                    <span>{preset.name}</span>
                    {selected && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{preset.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Scenario Parameter Controls</span>
            </h3>
            <span className="text-xs font-mono text-slate-500">Active: {assumptions.name}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Solar Scaling</span>
                <span className="font-mono text-amber-700">{assumptions.solar_pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={assumptions.solar_pct}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', solar_pct: Number(e.target.value) }))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Wind Scaling</span>
                <span className="font-mono text-sky-700">{assumptions.wind_pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={assumptions.wind_pct}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', wind_pct: Number(e.target.value) }))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Demand Scaling</span>
                <span className="font-mono text-indigo-700">{assumptions.demand_pct}%</span>
              </div>
              <input
                type="range"
                min={30}
                max={200}
                step={5}
                value={assumptions.demand_pct}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', demand_pct: Number(e.target.value) }))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Renewable Availability</span>
                <span className="font-mono text-teal-700">{assumptions.renewable_availability_pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={assumptions.renewable_availability_pct}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', renewable_availability_pct: Number(e.target.value) }))}
                className="w-full accent-teal-600 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Battery Capacity (kWh)</span>
                <span className="font-mono text-emerald-700">{assumptions.battery_capacity_kwh} kWh</span>
              </div>
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={assumptions.battery_capacity_kwh}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', battery_capacity_kwh: Number(e.target.value) }))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Initial SOC</span>
                <span className="font-mono text-emerald-700">{assumptions.initial_soc_pct}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={95}
                step={5}
                value={assumptions.initial_soc_pct}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', initial_soc_pct: Number(e.target.value) }))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span>Grid Import Limit (kW)</span>
                <span className="font-mono text-purple-700">{assumptions.grid_import_limit_kw} kW</span>
              </div>
              <input
                type="range"
                min={0}
                max={1500}
                step={25}
                value={assumptions.grid_import_limit_kw}
                onChange={(e) => setAssumptions((a) => ({ ...a, name: 'Custom Scenario', grid_import_limit_kw: Number(e.target.value) }))}
                className="w-full accent-purple-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {simResult && (
          <>
            {simResult.infeasibility_reasons.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                <div className="font-bold">Solver Infeasibility Warning ({simResult.solver_status})</div>
                {simResult.infeasibility_reasons.map((r, i) => (
                  <div key={i}>• {r}</div>
                ))}
              </div>
            )}

            {simResult.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Renewable Gen</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">{simResult.summary.total_renewable_kwh.toFixed(1)} kWh</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Demand</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">{simResult.summary.total_demand_kwh.toFixed(1)} kWh</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Renew. Util</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">{simResult.summary.renewable_utilization_pct.toFixed(1)}%</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Grid Import</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-purple-800 mt-1">{simResult.summary.grid_import_kwh.toFixed(1)} kWh</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Peak Import</span>
                  <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">{simResult.summary.peak_grid_import_kw.toFixed(1)} kW</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Shortage</span>
                  <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${simResult.summary.energy_shortage_kwh > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {simResult.summary.energy_shortage_kwh.toFixed(1)} kWh
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Counterfactual Dispatch Trajectory ({simResult.scenario_name})</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="ts" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} unit=" kW" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="renewable" name="Scenario Renewable (kW)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="demand" name="Scenario Demand (kW)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="gridImport" name="Grid Import (kW)" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="shortage" name="Shortage (kW)" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original What-If UI)
  // ===========================================================================
  const optResult: OptimizationResult = optimizeFromScenario(activeScenario);

  const baseSolarAt2pm = 285;
  const baseWindAt2pm = 75;
  const baseBuildingAt2pm = 175;
  const baseEvAt2pm = 160;

  const currentSolarKw = Math.round(baseSolarAt2pm * activeScenario.solarFactor);
  const currentWindKw = Math.round(baseWindAt2pm * activeScenario.windFactor);
  const currentBuildingKw = Math.round(baseBuildingAt2pm * activeScenario.buildingDemandFactor);
  const currentEvKw = Math.round(baseEvAt2pm * activeScenario.evDemandFactor);

  const scenarioTwinState: EnergyBusTwinState = simulateDigitalTwinState({
    solarKw: currentSolarKw,
    windKw: currentWindKw,
    buildingKw: currentBuildingKw,
    evKw: currentEvKw,
    batterySocPct: activeScenario.batteryInitialSocPct,
    batteryDesiredKw: optResult.batteryNetKw,
    gridAvailable: activeScenario.gridAvailable,
    gridMaxImportKw: activeScenario.gridMaxImportKw,
  });

  const scenarioRec = generateRecommendation(
    optResult,
    currentSolarKw,
    currentWindKw,
    currentBuildingKw,
    currentEvKw,
    activeScenario.batteryInitialSocPct,
    activeScenario.gridAvailable,
    activeScenario.timeOfSimulationHour
  );

  const handleSelectPreset = (preset: WhatIfScenarioInput) => {
    setActiveScenario(preset);
    setCustomMode(false);
  };

  const handleSliderChange = (field: keyof WhatIfScenarioInput, val: number | boolean) => {
    setCustomMode(true);
    setActiveScenario((prev) => ({
      ...prev,
      id: 'custom-scenario',
      name: 'Custom Parameter Sandbox',
      description: 'User-tuned counterfactual parameters testing non-linear microgrid dynamics.',
      [field]: val,
    }));
  };

  const handleResetToBaseline = () => {
    setActiveScenario(PREDEFINED_SCENARIOS[0]);
    setCustomMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold mb-2 border border-amber-200">
            <Zap className="w-3.5 h-3.5" />
            <span>Pillar 3: What-If Simulation Engine</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Counterfactual Scenario Testing & Stress Sandbox
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Test extreme weather drops, sudden EV charging surges, battery depletion, or grid islanding in software before committing dispatch actions to physical systems.
          </p>
        </div>

        <button
          onClick={handleResetToBaseline}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors self-start md:self-auto cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset to 2:00 PM Baseline</span>
        </button>
      </div>

      {/* Predefined Scenario Selector Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Select Predefined What-If Scenarios
          </h3>
          {customMode && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              Custom Parameters Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PREDEFINED_SCENARIOS.map((scenario) => {
            const isSelected = !customMode && activeScenario.id === scenario.id;
            return (
              <button
                key={scenario.id}
                onClick={() => handleSelectPreset(scenario)}
                className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{scenario.name}</span>
                    {isSelected && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{scenario.description}</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-200/60 text-[10px] text-slate-600">
                  <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    Solar: {Math.round(scenario.solarFactor * 100)}%
                  </span>
                  <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    EV: {Math.round(scenario.evDemandFactor * 100)}%
                  </span>
                  <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    SOC: {scenario.batteryInitialSocPct}%
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border ${scenario.gridAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    {scenario.gridAvailable ? 'Grid ON' : 'Grid OFF'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Parameter Control Sliders */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center space-x-2 mb-4">
          <Sliders className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Interactive Parameter Playground (Tune What-If Sliders)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center">
                <Sun className="w-3.5 h-3.5 text-amber-500 mr-1" />
                Solar Generation:
              </span>
              <span className="text-amber-600 font-bold">{currentSolarKw} kW ({Math.round(activeScenario.solarFactor * 100)}%)</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.8"
              step="0.05"
              value={activeScenario.solarFactor}
              onChange={(e) => handleSliderChange('solarFactor', parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center">
                <Wind className="w-3.5 h-3.5 text-sky-500 mr-1" />
                Wind Generation:
              </span>
              <span className="text-sky-600 font-bold">{currentWindKw} kW ({Math.round(activeScenario.windFactor * 100)}%)</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.05"
              value={activeScenario.windFactor}
              onChange={(e) => handleSliderChange('windFactor', parseFloat(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center">
                <Car className="w-3.5 h-3.5 text-teal-600 mr-1" />
                EV Charging Demand:
              </span>
              <span className="text-teal-700 font-bold">{currentEvKw} kW ({Math.round(activeScenario.evDemandFactor * 100)}%)</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.2"
              step="0.05"
              value={activeScenario.evDemandFactor}
              onChange={(e) => handleSliderChange('evDemandFactor', parseFloat(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 mr-1" />
                Building Demand:
              </span>
              <span className="text-indigo-700 font-bold">{currentBuildingKw} kW ({Math.round(activeScenario.buildingDemandFactor * 100)}%)</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.6"
              step="0.05"
              value={activeScenario.buildingDemandFactor}
              onChange={(e) => handleSliderChange('buildingDemandFactor', parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center">
                <Battery className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                Initial Battery SOC:
              </span>
              <span className="text-emerald-700 font-bold">{activeScenario.batteryInitialSocPct}%</span>
            </div>
            <input
              type="range"
              min="15"
              max="95"
              step="1"
              value={activeScenario.batteryInitialSocPct}
              onChange={(e) => handleSliderChange('batteryInitialSocPct', parseInt(e.target.value, 10))}
              className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700 mb-2">Utility Grid Interconnection:</div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleSliderChange('gridAvailable', true)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeScenario.gridAvailable ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Connected (Online)
              </button>
              <button
                onClick={() => handleSliderChange('gridAvailable', false)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !activeScenario.gridAvailable ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Islanded (Outage)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Simulation Calculated Outcomes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Simulated Gen</span>
          <div className="text-xl font-black text-slate-900 mt-1">{optResult.totalRenewableGenKw} <span className="text-xs font-normal">kW</span></div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Simulated Load</span>
          <div className="text-xl font-black text-slate-900 mt-1">{currentBuildingKw + currentEvKw} <span className="text-xs font-normal">kW</span></div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Renewable Util.</span>
          <div className="text-xl font-black text-teal-700 mt-1">{optResult.renewableUtilizationPct}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Battery Flow</span>
          <div className="text-xl font-black text-emerald-700 mt-1">
            {optResult.batteryNetKw > 0 ? `+${optResult.batteryNetKw} kW` : `${optResult.batteryNetKw} kW`}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Grid Dependency</span>
          <div className="text-xl font-black text-purple-900 mt-1">{optResult.gridDependencyPct}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Peak Demand</span>
          <div className="text-xl font-black text-slate-800 mt-1">{optResult.peakDemandKw} <span className="text-xs font-normal">kW</span></div>
        </div>
      </div>

      <EnergyBusVisualizer twinState={scenarioTwinState} />

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Optimization Recommendation for Scenario: <span className="text-emerald-700">{activeScenario.name}</span>
            </h3>
          </div>
          <button
            onClick={() => onApplyScenarioToLive(activeScenario)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-1 cursor-pointer"
          >
            <span>Apply to Live Dispatch</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
          <h4 className="text-sm font-bold text-slate-900 mb-1">{scenarioRec.title}</h4>
          <p className="text-xs text-slate-700 leading-relaxed mb-3">{scenarioRec.summary}</p>
        </div>
      </div>
    </div>
  );
};
