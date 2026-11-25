import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Database,
  Play,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { generateScenarioComparisonMatrix } from '../services/scenarioPresets';
import { ScenarioComparisonItem } from '../types/energy';
import {
  DatasetSummaryResponse,
  ScenarioCompareResponse,
  SystemComponentSpec,
} from '../types/backend';
import { scenarioApi } from '../services/api';
import { DataMode } from './Header';

interface ScenarioComparisonModuleProps {
  dataMode: DataMode;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  systemConfig: SystemComponentSpec;
  onNavigateToDataset: () => void;
}

export const ScenarioComparisonModule: React.FC<ScenarioComparisonModuleProps> = ({
  dataMode,
  activeDatasetId,
  datasetSummary,
  systemConfig,
  onNavigateToDataset,
}) => {
  const [horizon, setHorizon] = useState<'24h' | '48h' | '7d'>('24h');
  const [compareResult, setCompareResult] = useState<ScenarioCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await scenarioApi.compare({
        dataset_id: activeDatasetId,
        horizon,
        base_system_config: systemConfig,
      });
      setCompareResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario comparison failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && datasetSummary?.is_preprocessed && !compareResult) {
      void runComparison();
    }
  }, [dataMode, activeDatasetId, datasetSummary?.is_preprocessed]);

  // Demo Mode State (Preserved)
  const [scenarios] = useState<ScenarioComparisonItem[]>(generateScenarioComparisonMatrix());
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('sc-a');

  // ===========================================================================
  // MODE A: DATASET MODE (Fair Same-Horizon Scenario Comparison Matrix)
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !datasetSummary) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No Dataset Loaded for Scenario Comparison</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-4">
            Upload and preprocess a dataset first to benchmark Baseline, Forecast-Based, MILP Optimized, and What-If shock strategies over the identical time period.
          </p>
          <button
            onClick={onNavigateToDataset}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Go to Dataset &amp; Training
          </button>
        </div>
      );
    }

    const backendChartData = (compareResult?.rows || []).map((r) => ({
      name: r.scenario_name.length > 22 ? `${r.scenario_name.slice(0, 20)}…` : r.scenario_name,
      renewableUtil: r.renewable_utilization_pct,
      gridImport: r.grid_import_kwh,
      peakImport: r.peak_grid_import_kw,
    }));

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-mono font-semibold mb-2 border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5" />
              <span>IDENTICAL TIME WINDOW BENCHMARK · SOURCE: USER-UPLOADED DATASET</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Multi-Strategy &amp; What-If Scenario Comparison Matrix
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Evaluates Uncoordinated Baseline, Forecast-Reactive, MILP Optimized, and Stress-Test scenarios using consistent system parameters.
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
              onClick={runComparison}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{loading ? 'Comparing...' : 'Run Comparison'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {compareResult && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-900">Benchmark Comparison Table</span>
                <span className="font-mono text-slate-500">
                  Window: {compareResult.time_period_start.slice(0, 16)} → {compareResult.time_period_end.slice(0, 16)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Scenario Strategy</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Renew. Util</th>
                      <th className="py-3 px-4">Grid Import</th>
                      <th className="py-3 px-4">Peak Import</th>
                      <th className="py-3 px-4">Batt Throughput</th>
                      <th className="py-3 px-4">Curtail / Short</th>
                      <th className="py-3 px-4">Operating Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {compareResult.rows.map((row) => (
                      <tr key={row.scenario_id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-bold text-slate-900">{row.scenario_name}</div>
                          <div className="text-[11px] text-slate-500">{row.assumptions_summary}</div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold uppercase">
                            {row.category.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-emerald-700 font-bold">
                          {row.renewable_utilization_pct.toFixed(1)}%
                          {row.delta_renewable_util_pct_vs_baseline != null && row.category !== 'baseline' && (
                            <span className="block text-[10px] text-slate-500">
                              ({row.delta_renewable_util_pct_vs_baseline >= 0 ? `+${row.delta_renewable_util_pct_vs_baseline.toFixed(1)}` : row.delta_renewable_util_pct_vs_baseline.toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-purple-800 font-bold">
                          {row.grid_import_kwh.toFixed(1)} kWh
                          {row.delta_grid_import_pct_vs_baseline != null && row.category !== 'baseline' && (
                            <span className="block text-[10px] text-slate-500">
                              ({row.delta_grid_import_pct_vs_baseline > 0 ? '-' : '+'}{Math.abs(row.delta_grid_import_pct_vs_baseline).toFixed(1)}% vs base)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">{row.peak_grid_import_kw.toFixed(1)} kW</td>
                        <td className="py-3 px-4">{row.battery_utilization_kwh.toFixed(1)} kWh</td>
                        <td className="py-3 px-4">
                          <span>{row.energy_wastage_kwh.toFixed(1)} / </span>
                          <span className={row.energy_shortage_kwh > 0 ? 'text-rose-600 font-bold' : ''}>
                            {row.energy_shortage_kwh.toFixed(1)} kWh
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {compareResult.tariff_available && row.operating_cost != null ? `₹${row.operating_cost.toFixed(1)}` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {compareResult.notes.length > 0 && (
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 space-y-0.5">
                  {compareResult.notes.map((n, i) => (
                    <div key={i}>• {n}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Renewable Utilization Across Strategies (%)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={backendChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                      <Bar dataKey="renewableUtil" name="Renewable Util %" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Grid Import (kWh) vs Peak Import (kW)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={backendChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="gridImport" name="Grid Import (kWh)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="peakImport" name="Peak Import (kW)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original Scenario Comparison UI)
  // ===========================================================================
  const chartData = scenarios.map((s) => ({
    name: s.name.split('–')[0].trim(),
    fullName: s.name,
    renewableUtil: s.renewableUtilizationPct,
    gridImport: s.gridUsageKw,
    peakDemand: s.peakDemandKw,
    batteryUsage: Math.abs(s.batteryUsageKw),
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-2 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Key Hackathon Differentiator</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Multi-Scenario Comparative Evaluation Matrix
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Directly benchmarks prototype optimization outcomes across Normal, Low Solar, High EV Demand, and Islanded Grid scenarios using calculated prototype values.
          </p>
        </div>

        <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 font-semibold text-slate-700 border border-slate-200">
          Synthetic Demonstration Mode
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Comparative Benchmark Table
          </h3>
          <span className="text-xs text-slate-500">Click any row to highlight scenario</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Scenario</th>
                <th className="py-3.5 px-4">Total Gen / Demand</th>
                <th className="py-3.5 px-4">Renewable Used</th>
                <th className="py-3.5 px-4">Battery Usage</th>
                <th className="py-3.5 px-4">Grid Usage</th>
                <th className="py-3.5 px-4">Peak Demand</th>
                <th className="py-3.5 px-4 min-w-[220px]">Recommended Strategy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scenarios.map((sc) => {
                const isSelected = sc.id === selectedScenarioId;
                return (
                  <tr
                    key={sc.id}
                    onClick={() => setSelectedScenarioId(sc.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/70 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900">{sc.name}</div>
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {sc.badge}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800">Gen: {sc.totalGenKw} kW</div>
                      <div className="text-[11px] text-slate-500">Demand: {sc.totalDemandKw} kW</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-bold text-teal-700">{sc.renewableUsedKw} kW</div>
                      <div className="text-[11px] text-teal-600 font-semibold">{sc.renewableUtilizationPct}% Utilized</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className={`font-bold ${
                        sc.batteryUsageKw > 0 ? 'text-emerald-700' : sc.batteryUsageKw < 0 ? 'text-amber-700' : 'text-slate-500'
                      }`}>
                        {sc.batteryUsageKw > 0
                          ? `+${sc.batteryUsageKw} kW (Chg)`
                          : sc.batteryUsageKw < 0
                          ? `${sc.batteryUsageKw} kW (Dis)`
                          : '0 kW (Idle)'}
                      </div>
                      <div className="text-[11px] text-slate-500">SOC: {sc.batterySocPct}%</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className={`font-bold ${sc.gridUsageKw > 0 ? 'text-purple-900' : 'text-emerald-700'}`}>
                        {sc.gridUsageKw > 0 ? `${sc.gridUsageKw} kW Import` : '0 kW (Net-Zero)'}
                      </div>
                      <div className="text-[11px] text-slate-500">Est Cost: ₹{sc.costINR}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold text-slate-900">{sc.peakDemandKw} kW</span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-[11px] text-slate-700 leading-snug">{sc.recommendationSnippet}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Renewable Utilization Across Scenarios (%)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                <Bar dataKey="renewableUtil" name="Renewable Utilization %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Grid Import vs Peak Demand Shaving (kW)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} unit=" kW" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                <Bar dataKey="gridImport" name="Grid Import (kW)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="peakDemand" name="Peak Demand (kW)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
