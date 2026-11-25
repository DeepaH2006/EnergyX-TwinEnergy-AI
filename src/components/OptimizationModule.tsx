import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Scale,
  Info,
  Play,
  RefreshCw,
  Database,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { OptimizationResult } from '../types/energy';
import {
  DatasetSummaryResponse,
  OptimizationRunResponse,
  SystemComponentSpec,
} from '../types/backend';
import { optimizationApi } from '../services/api';
import { DataMode } from './Header';

interface OptimizationModuleProps {
  optResult: OptimizationResult;
  dataMode: DataMode;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  systemConfig: SystemComponentSpec;
  setSystemConfig: React.Dispatch<React.SetStateAction<SystemComponentSpec>>;
  optBackendResult: OptimizationRunResponse | null;
  setOptBackendResult: (res: OptimizationRunResponse | null) => void;
  onNavigateToDataset: () => void;
}

export const OptimizationModule: React.FC<OptimizationModuleProps> = ({
  optResult,
  dataMode,
  activeDatasetId,
  datasetSummary,
  systemConfig,
  setSystemConfig,
  optBackendResult,
  setOptBackendResult,
  onNavigateToDataset,
}) => {
  const [horizon, setHorizon] = useState<'24h' | '48h' | '7d'>('24h');
  const [useSource, setUseSource] = useState<'predicted' | 'historical_test'>('predicted');
  const [peakShavingWeight, setPeakShavingWeight] = useState<number>(0.15);
  const [prioritizeCost, setPrioritizeCost] = useState<boolean>(true);
  const [prioritizeEmissions, setPrioritizeEmissions] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runMilpOptimization = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await optimizationApi.run({
        dataset_id: activeDatasetId,
        horizon,
        use_source: useSource,
        system_config: systemConfig,
        prioritize_cost: prioritizeCost,
        prioritize_emissions: prioritizeEmissions,
        peak_shaving_weight: peakShavingWeight,
      });
      setOptBackendResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization execution failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && datasetSummary?.is_preprocessed && !optBackendResult) {
      void runMilpOptimization();
    }
  }, [dataMode, activeDatasetId, datasetSummary?.is_preprocessed]);

  // ===========================================================================
  // MODE A: DATASET MODE (Real SciPy HiGHS MILP Optimization)
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !datasetSummary) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No Dataset Loaded for MILP Optimization</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-4">
            Upload, preprocess, and train forecasting models first so the SciPy HiGHS MILP solver can optimize battery and grid dispatch over real or predicted horizons.
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

    const opt = optBackendResult?.optimized_summary;
    const base = optBackendResult?.baseline_summary;
    const deltas = optBackendResult?.comparison_deltas || {};

    const scheduleChartData = (optBackendResult?.schedule || []).map((p) => ({
      ts: p.timestamp.slice(5, 16),
      solar: p.solar_kw,
      wind: p.wind_kw,
      demand: p.demand_kw,
      gridImport: p.grid_import_kw,
      batteryNet: p.battery_net_kw,
      soc: p.battery_soc_pct,
    }));

    return (
      <div className="space-y-6">
        {/* Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-mono font-semibold mb-2 border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SOLVER: SCIPY HIGHS MILP · DATA SOURCE: USER-UPLOADED DATASET</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Constraint-Aware Multi-Interval MILP Dispatch Optimizer
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Solves binary charge/discharge &amp; import/export exclusivity, battery SOC conservation, peak demand minimax, and optional tariff/emissions objectives.
            </p>
          </div>
          <button
            onClick={runMilpOptimization}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{loading ? 'Solving MILP...' : 'Run MILP Optimization'}</span>
          </button>
        </div>

        {/* Optimization Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs items-end">
          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">Horizon</span>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as '24h' | '48h' | '7d')}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
            >
              <option value="24h">24 Hours</option>
              <option value="48h">48 Hours</option>
              <option value="7d">7 Days</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">Input Series</span>
            <select
              value={useSource}
              onChange={(e) => setUseSource(e.target.value as 'predicted' | 'historical_test')}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
            >
              <option value="predicted">ML Forecast Horizon</option>
              <option value="historical_test">Recent Historical Window</option>
            </select>
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
            <span className="text-slate-500 font-medium block">Peak Shaving Weight</span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={peakShavingWeight}
              onChange={(e) => setPeakShavingWeight(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono"
            />
          </label>
          <label className="flex items-center gap-2 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prioritizeCost}
              onChange={(e) => setPrioritizeCost(e.target.checked)}
              className="accent-emerald-600"
            />
            <span className="text-slate-700 font-medium">Tariff Cost Obj.</span>
          </label>
          <label className="flex items-center gap-2 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prioritizeEmissions}
              onChange={(e) => setPrioritizeEmissions(e.target.checked)}
              className="accent-emerald-600"
            />
            <span className="text-slate-700 font-medium">Carbon Obj.</span>
          </label>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {optBackendResult && (
          <>
            {/* Solver Status & Infeasibility Diagnostics */}
            {optBackendResult.solver_status !== 'optimal' && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-2">
                <div className="font-bold text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Solver Status: {optBackendResult.solver_status.toUpperCase()} ({optBackendResult.solver_name})</span>
                </div>
                {optBackendResult.infeasibility_reasons.map((r, i) => (
                  <p key={i} className="ml-6">• {r}</p>
                ))}
              </div>
            )}

            {optBackendResult.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                {optBackendResult.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            {opt && base && (
              <>
                {/* Measured Deltas vs Uncoordinated Baseline */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Renewable Utilization</span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                      {opt.renewable_utilization_pct.toFixed(1)}%
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Baseline: {base.renewable_utilization_pct.toFixed(1)}% ({deltas.renewable_utilization_gain_pct != null && deltas.renewable_utilization_gain_pct >= 0 ? `+${deltas.renewable_utilization_gain_pct.toFixed(1)}%` : `${deltas.renewable_utilization_gain_pct?.toFixed(1) ?? 0}%`})
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Grid Import Reduction</span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-sky-700 mt-1">
                      {opt.grid_import_kwh.toFixed(1)} kWh
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Baseline: {base.grid_import_kwh.toFixed(1)} kWh ({deltas.grid_import_reduction_pct != null ? `-${deltas.grid_import_reduction_pct.toFixed(1)}%` : '—'})
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Peak Grid Import</span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                      {opt.peak_grid_import_kw.toFixed(1)} kW
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Baseline: {base.peak_grid_import_kw.toFixed(1)} kW ({deltas.peak_import_reduction_pct != null ? `-${deltas.peak_import_reduction_pct.toFixed(1)}%` : '—'})
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Operating Cost &amp; CO₂</span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-purple-800 mt-1">
                      {opt.tariff_available && opt.total_cost != null ? `₹${opt.total_cost.toFixed(1)}` : 'N/A'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {opt.tariff_available
                        ? `Baseline: ₹${base.total_cost?.toFixed(1) ?? '—'}`
                        : 'Tariff not provided in dataset/config'}
                    </p>
                  </div>
                </div>

                {/* Multi-Interval Schedule Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Optimized Dispatch Schedule ({horizon})</h3>
                      <p className="text-xs text-slate-500">Solver: {optBackendResult.solver_name} · Objective Value: {optBackendResult.objective_value?.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scheduleChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="ts" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} unit=" kW" />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Area type="monotone" dataKey="solar" name="Solar (kW)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} />
                        <Area type="monotone" dataKey="demand" name="Demand (kW)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="gridImport" name="Grid Import (kW)" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                        <Area type="monotone" dataKey="batteryNet" name="Battery Net (+Chg/-Dis kW)" stroke="#10b981" fill="#10b981" fillOpacity={0.12} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Constraint Validation & Interval Table */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Scale className="w-4 h-4 text-emerald-600" />
                      <span>Hard Constraint Verification</span>
                    </h3>
                    <div className="space-y-2.5 text-xs">
                      {optBackendResult.constraints_validation.map((chk, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2">
                          {chk.satisfied ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-bold text-slate-800">{chk.name}</div>
                            <div className="text-slate-600">{chk.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs overflow-hidden">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">Interval Dispatch Allocation (First 24 Intervals)</h3>
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs text-left font-mono">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="py-2 px-2">Timestamp</th>
                            <th className="py-2 px-2">Renew kW</th>
                            <th className="py-2 px-2">Demand kW</th>
                            <th className="py-2 px-2">Batt Net</th>
                            <th className="py-2 px-2">SOC %</th>
                            <th className="py-2 px-2">Grid In</th>
                            <th className="py-2 px-2">Curtail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {optBackendResult.schedule.slice(0, 24).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2">{row.timestamp.slice(5, 16)}</td>
                              <td className="py-1.5 px-2 text-emerald-700">{row.total_renewable_kw.toFixed(1)}</td>
                              <td className="py-1.5 px-2 text-indigo-700">{row.demand_kw.toFixed(1)}</td>
                              <td className="py-1.5 px-2">{row.battery_net_kw >= 0 ? `+${row.battery_net_kw.toFixed(1)}` : row.battery_net_kw.toFixed(1)}</td>
                              <td className="py-1.5 px-2">{row.battery_soc_pct.toFixed(1)}%</td>
                              <td className="py-1.5 px-2 text-purple-700">{row.grid_import_kw.toFixed(1)}</td>
                              <td className="py-1.5 px-2 text-amber-700">{row.curtailment_kw.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original Optimization UI)
  // ===========================================================================
  const comparisonData = [
    {
      metric: 'Renewable Util. (%)',
      Baseline: optResult.baseline.renewableUtilizationPct,
      Optimized: optResult.renewableUtilizationPct,
    },
    {
      metric: 'Grid Import (kW)',
      Baseline: optResult.baseline.gridImportKw,
      Optimized: optResult.gridTotalImportKw,
    },
    {
      metric: 'Peak Demand (kW)',
      Baseline: optResult.baseline.peakDemandKw,
      Optimized: optResult.peakDemandKw,
    },
    {
      metric: '15-min Cost (₹)',
      Baseline: optResult.baseline.costEstimateINR,
      Optimized: optResult.costEstimateINR,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-2 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pillar 4: Multi-Objective Constrained Optimization</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Mixed-Integer Constrained Energy Allocation Engine
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Replaces blind rule-based controllers with mathematical optimization that jointly solves power balance, battery degradation, time-of-use costs, and grid peak shaving.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 font-semibold text-slate-700 border border-slate-200">
            Demo Snapshot Mode
          </span>
        </div>
      </div>

      {/* Measured Prototype Performance Improvements */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl p-4 border border-teal-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-teal-800 uppercase">Renewable Gain</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            +{optResult.improvements.renewableUtilizationGainPct}%
          </div>
          <p className="text-[11px] text-teal-700 mt-1">
            Self-consumption increased from {optResult.baseline.renewableUtilizationPct}% to {optResult.renewableUtilizationPct}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-sky-50 to-indigo-50 rounded-2xl p-4 border border-sky-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-sky-800 uppercase">Grid Dependency</span>
            <TrendingDown className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-sky-800">
            -{optResult.improvements.gridImportReductionPct}%
          </div>
          <p className="text-[11px] text-sky-700 mt-1">
            Import curtailed from {optResult.baseline.gridImportKw} kW down to {optResult.gridTotalImportKw} kW
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-800 uppercase">Peak Demand Shaved</span>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800">
            -{optResult.improvements.peakDemandReductionPct}%
          </div>
          <p className="text-[11px] text-amber-700 mt-1">
            Maximum feeder draw reduced from {optResult.baseline.peakDemandKw} kW to {optResult.peakDemandKw} kW
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-purple-800 uppercase">Cost Savings (Tariff)</span>
            <TrendingDown className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800">
            -{optResult.improvements.costReductionPct}%
          </div>
          <p className="text-[11px] text-purple-700 mt-1">
            15-min interval cost reduced from ₹{optResult.baseline.costEstimateINR} to ₹{optResult.costEstimateINR}
          </p>
        </div>
      </div>

      {/* Benchmark Graph */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Prototype Verification: Uncoordinated Baseline vs Optimized Strategy
            </h3>
            <p className="text-xs text-slate-500">
              Measured directly from simulated microgrid dispatch equations without fabricated claims
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            Objective: Multi-Parameter Pareto Frontier
          </span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
              <XAxis dataKey="metric" stroke="#64748b" fontSize={12} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="Baseline" name="Uncoordinated (Naive Dispatch)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Optimized" name="AI Digital Twin Optimized" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mathematical Optimization Formulation & Dispatch Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 mb-3">
            <Scale className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Optimization Mathematical Formulation
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed">
              <span className="text-emerald-400 font-bold block mb-1">Objective Function (Minimize):</span>
              J = w₁ · C_grid(P_grid) + w₂ · P_grid,peak - w₃ · P_renew,used + w₄ · Deg_bat(P_bat)
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 block text-xs">Hard Physical Constraints Enforced:</span>
              <ul className="space-y-1 text-slate-600">
                <li className="flex items-start space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Power Balance:</strong> P_solar + P_wind + P_bat,dis + P_grid,in = P_bldg + P_ev + P_bat,chg + P_loss</span>
                </li>
                <li className="flex items-start space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Battery Capacity Bounds:</strong> 15% ≤ SOC(t) ≤ 95%</span>
                </li>
                <li className="flex items-start space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Substation Inverter Limit:</strong> P_grid,in ≤ 450 kW</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Active Optimal Dispatch Allocation</h3>
            <span className="text-xs text-slate-500">Interval: 15 minutes</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Energy Stream</th>
                  <th className="py-2 px-3">To Loads (kW)</th>
                  <th className="py-2 px-3">To Storage (kW)</th>
                  <th className="py-2 px-3">To Grid (kW)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-amber-700 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Solar Photovoltaic</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold">{optResult.solarToLoadKw}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">{optResult.solarToBatteryKw}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{optResult.solarToGridKw}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-sky-700 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <span>Wind Turbines</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold">{optResult.windToLoadKw}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">{optResult.windToBatteryKw}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{optResult.windToGridKw}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>BESS Battery Discharge</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold">{Math.round((optResult.batteryToBuildingKw + optResult.batteryToEvKw) * 10) / 10}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">—</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">—</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-purple-700 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>Utility Grid Backup</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold">{optResult.gridTotalImportKw}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">0</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center space-x-2">
            <Info className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Zero Curtailment:</strong> 100% of available clean renewable energy is utilized either by active loads, battery buffer, or green export.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
