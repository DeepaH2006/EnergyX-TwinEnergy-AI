import React from 'react';
import {
  Sun,
  Wind,
  Battery,
  Building2,
  Zap,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  Cpu,
  Layers,
  HelpCircle,
  Database,
  UploadCloud,
  CheckCircle2,
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
import { TelemetryPoint, EnergyBusTwinState, OptimizationResult, Recommendation } from '../types/energy';
import {
  DatasetSummaryResponse,
  DigitalTwinSimulateResponse,
  OptimizationRunResponse,
  PredictResponse,
  TrainResponse,
} from '../types/backend';
import { DataMode } from './Header';
import { EnergyBusVisualizer } from './EnergyBusVisualizer';

interface OverviewDashboardProps {
  dataMode: DataMode;
  backendOnline: boolean;
  datasetSummary: DatasetSummaryResponse | null;
  trainResult: TrainResponse | null;
  predictResult: PredictResponse | null;
  twinBackendResult: DigitalTwinSimulateResponse | null;
  optBackendResult: OptimizationRunResponse | null;
  onSwitchToDemo: () => void;
  // Demo mode props
  currentTelemetry: TelemetryPoint;
  allTelemetry: TelemetryPoint[];
  twinState: EnergyBusTwinState;
  optResult: OptimizationResult;
  recommendation: Recommendation;
  onNavigateToTab: (tab: string) => void;
  onRunDemo: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  dataMode,
  backendOnline,
  datasetSummary,
  trainResult,
  predictResult,
  twinBackendResult,
  optBackendResult,
  onSwitchToDemo,
  currentTelemetry,
  allTelemetry,
  twinState,
  optResult,
  recommendation,
  onNavigateToTab,
  onRunDemo,
}) => {
  // ===========================================================================
  // MODE A: DATASET MODE OVERVIEW
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!datasetSummary) {
      return (
        <div className="space-y-6">
          <div className="bg-slate-900 text-white rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-semibold mb-2 border border-emerald-500/30">
                <Database className="w-3.5 h-3.5" />
                <span>DATA SOURCE: USER-UPLOADED DATASET (MODE A)</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                EnergyX 2.0 Dataset-Driven Microgrid Platform
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl mt-1">
                Upload a CSV or Excel dataset to train chronological time-series models, simulate an energy-conserving Digital Twin, solve MILP dispatch optimization, and run counterfactual scenarios.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => onNavigateToTab('dataset')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload Dataset &amp; Train Models</span>
              </button>
              <button
                onClick={onSwitchToDemo}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold text-xs cursor-pointer"
              >
                <span>Explore Synthetic Demo</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="font-bold text-slate-900 text-sm mb-1">1. Upload &amp; Causal Preprocessing</div>
              <p className="text-slate-600">Auto-detect columns across arbitrary schemas, inspect missing/duplicate records, and apply zero-leakage past-only imputation.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="font-bold text-slate-900 text-sm mb-1">2. Chronological ML &amp; Digital Twin</div>
              <p className="text-slate-600">Benchmark Ridge, Random Forest, and Gradient Boosting against Persistence &amp; Seasonal Naive baselines over an 80/20 time split.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="font-bold text-slate-900 text-sm mb-1">3. SciPy MILP &amp; Scenario Sandbox</div>
              <p className="text-slate-600">Solve exact battery/grid dispatch schedules, detect infeasibility conflicts, and benchmark counterfactual shocks fairly.</p>
            </div>
          </div>
        </div>
      );
    }

    const q = datasetSummary.cleaned_quality || datasetSummary.raw_quality;
    const latestStep = twinBackendResult?.latest_predicted_state || twinBackendResult?.latest_historical_state || null;
    const trainedTargets = Object.values(trainResult?.results || {}).filter((r) => r.status === 'trained');
    const forecastChart = (predictResult?.combined_series || []).slice(-72).map((p) => ({
      ts: p.timestamp.slice(5, 16),
      renewable: p.total_renewable_predicted ?? ((p.solar_actual ?? 0) + (p.wind_actual ?? 0)),
      demand: p.demand_predicted ?? p.demand_actual ?? 0,
    }));

    return (
      <div className="space-y-6">
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono text-emerald-300 font-semibold uppercase mb-1">
              Active Dataset: {datasetSummary.filename} · Backend: {backendOnline ? 'Connected' : 'Offline'}
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              Dataset Pipeline Overview &amp; Verified Outcomes
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              {q.record_count} intervals ({q.detected_frequency}) · {q.date_range_start?.slice(0, 16)} → {q.date_range_end?.slice(0, 16)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigateToTab('dataset')}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700 cursor-pointer"
            >
              Manage Dataset &amp; Train
            </button>
            <button
              onClick={() => onNavigateToTab('optimization')}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Open MILP Optimizer
            </button>
          </div>
        </div>

        {/* Dataset Mode KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Dataset Quality</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1 uppercase">{q.data_quality_status}</div>
            <span className="text-[11px] text-slate-500">{datasetSummary.is_preprocessed ? 'Preprocessed & causal' : 'Raw upload (preprocess needed)'}</span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Trained ML Targets</span>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {trainedTargets.length} / {datasetSummary.available_targets.length}
            </div>
            <span className="text-[11px] text-slate-500">
              {trainedTargets.length > 0 ? trainedTargets.map((t) => t.target).join(', ') : 'Train models to generate forecasts'}
            </span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Latest Twin Step</span>
            <div className="text-xl font-bold font-mono tabular-nums text-teal-700 mt-1">
              {latestStep ? `${latestStep.battery_soc_pct.toFixed(1)}% SOC` : 'Not Run'}
            </div>
            <span className="text-[11px] text-slate-500">
              {latestStep ? `Gen ${latestStep.total_renewable_kw.toFixed(1)} kW / Load ${latestStep.demand_kw.toFixed(1)} kW` : 'Run Digital Twin tab'}
            </span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">MILP Optimizer</span>
            <div className="text-xl font-bold font-mono text-purple-800 mt-1">
              {optBackendResult?.optimized_summary
                ? `${optBackendResult.optimized_summary.renewable_utilization_pct.toFixed(1)}% Util`
                : 'Not Run'}
            </div>
            <span className="text-[11px] text-slate-500">
              {optBackendResult?.optimized_summary
                ? `Grid import: ${optBackendResult.optimized_summary.grid_import_kwh.toFixed(1)} kWh`
                : 'Run Optimization tab'}
            </span>
          </div>
        </div>

        {/* Checklist + Quick Preview Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900">Workflow Checklist</h3>
            {[
              { done: true, label: 'Dataset Uploaded & Schema Profiled', tab: 'dataset' },
              { done: datasetSummary.is_preprocessed, label: 'Causal Preprocessing Applied', tab: 'dataset' },
              { done: trainedTargets.length > 0, label: 'Chronological ML Models Trained', tab: 'dataset' },
              { done: Boolean(predictResult), label: 'Future Forecast Horizon Generated', tab: 'forecasting' },
              { done: Boolean(twinBackendResult), label: 'Digital Twin Conservation Simulated', tab: 'digital-twin' },
              { done: Boolean(optBackendResult), label: 'SciPy MILP Dispatch Solved', tab: 'optimization' },
            ].map((step, i) => (
              <button
                key={i}
                onClick={() => onNavigateToTab(step.tab)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <CheckCircle2 className={`w-4 h-4 ${step.done ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <span>{step.label}</span>
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Forecast &amp; Recent History Trajectory</h3>
              <button
                onClick={() => onNavigateToTab('forecasting')}
                className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open AI Forecasting</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {forecastChart.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastChart} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="ts" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} unit=" kW" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="renewable" name="Total Renewable (kW)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="demand" name="Demand (kW)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg p-6">
                <Cpu className="w-8 h-8 text-slate-300 mb-2" />
                <p>Train ML models in <strong>Dataset &amp; Training</strong> to populate actual-vs-forecast charts here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original Overview Dashboard)
  // ===========================================================================
  const chartData = allTelemetry
    .filter((_, idx) => idx % 4 === 0)
    .map((p) => ({
      time: p.timeLabel,
      solar: p.solarKw,
      wind: p.windKw,
      renewableTotal: p.totalRenewableKw,
      building: p.buildingDemandKw,
      ev: p.evDemandKw,
      totalDemand: p.totalDemandKw,
      batterySoc: p.batterySocPct,
    }));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Core Innovation Paradigm (Synthetic Demo)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              From Reactive Monitoring → To Proactive Future Simulation &amp; Optimization
            </h2>
            <p className="text-sm text-slate-300 max-w-3xl mt-1">
              “Instead of only monitoring what is happening now, our system creates a virtual future, tests multiple possible decisions, and recommends an optimized action before the real energy system is affected.”
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={onRunDemo}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center space-x-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Watch 60s Demo</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-700/60">
          <div
            onClick={() => onNavigateToTab('forecasting')}
            className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-sky-400 mb-1">
              <Cpu className="w-3.5 h-3.5" />
              <span>1. PREDICT</span>
            </div>
            <div className="text-xs text-slate-300">
              AI forecasts solar, wind, and EV demand profiles hours ahead.
            </div>
          </div>

          <div
            onClick={() => onNavigateToTab('digital-twin')}
            className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-teal-400 mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>2. DIGITAL TWIN</span>
            </div>
            <div className="text-xs text-slate-300">
              Virtual physics replica models energy bus, battery, and EV bays.
            </div>
          </div>

          <div
            onClick={() => onNavigateToTab('what-if')}
            className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span>3. SIMULATE</span>
            </div>
            <div className="text-xs text-slate-300">
              Test what-if weather drops, EV surges, and low SOC scenarios.
            </div>
          </div>

          <div
            onClick={() => onNavigateToTab('optimization')}
            className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>4. OPTIMIZE</span>
            </div>
            <div className="text-xs text-slate-300">
              Multi-objective LP allocates power &amp; generates explainable actions.
            </div>
          </div>
        </div>
      </div>

      {/* Real-time KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Solar Power</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sun className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {currentTelemetry.solarKw} <span className="text-xs font-normal text-slate-500">kW</span>
            </div>
            <div className="text-[11px] text-amber-600 font-medium mt-1 flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              <span>Peak: 335 kW @ 12:45</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Wind Power</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Wind className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {currentTelemetry.windKw} <span className="text-xs font-normal text-slate-500">kW</span>
            </div>
            <div className="text-[11px] text-sky-600 font-medium mt-1">Wind Velocity: 6.8 m/s</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Demand</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {currentTelemetry.totalDemandKw} <span className="text-xs font-normal text-slate-500">kW</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-1">
              Bldg: {currentTelemetry.buildingDemandKw} | EV: {currentTelemetry.evDemandKw} kW
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Battery SOC</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Battery className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {currentTelemetry.batterySocPct}%
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-1">
              {Math.round((currentTelemetry.batterySocPct / 100) * 500)} / 500 kWh
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Grid Flow</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-900 tracking-tight">
              {Math.abs(currentTelemetry.gridPowerKw)} <span className="text-xs font-normal text-slate-500">kW</span>
            </div>
            <div className="text-[11px] font-semibold mt-1">
              {currentTelemetry.gridPowerKw > 0 ? (
                <span className="text-purple-600">Importing (₹{currentTelemetry.gridTariffINR_kWh}/u)</span>
              ) : currentTelemetry.gridPowerKw < 0 ? (
                <span className="text-emerald-600">Exporting Green</span>
              ) : (
                <span className="text-slate-400">Zero Grid Draw</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Renewable Util.</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-teal-700 tracking-tight">
              {currentTelemetry.renewableUtilizationPct}%
            </div>
            <div className="text-[11px] text-teal-600 font-medium mt-1">
              +{optResult.improvements.renewableUtilizationGainPct}% vs Uncoordinated
            </div>
          </div>
        </div>
      </div>

      <EnergyBusVisualizer twinState={twinState} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                24-Hour Diurnal Profile: Generation vs Campus Demand
              </h3>
              <p className="text-xs text-slate-500">
                Visualizing the natural generation-demand mismatch that requires proactive optimization
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('forecasting')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 cursor-pointer"
            >
              <span>View AI Forecasts</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRenewable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradDemand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} unit=" kW" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="renewableTotal" name="Total Renewable Gen (Solar + Wind)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#gradRenewable)" />
                <Area type="monotone" dataKey="totalDemand" name="Total Demand (Building + EV)" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#gradDemand)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Active Optimization Action
              </span>
              <span className="text-xs text-slate-400">{recommendation.timestamp}</span>
            </div>

            <h4 className="text-base font-bold text-slate-900 leading-snug">
              {recommendation.title}
            </h4>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {recommendation.summary}
            </p>

            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 mb-2">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Explainable Decision Rationale:</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {recommendation.whyThisDecision.slice(0, 2).map((item, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-slate-800">{item.factor}: </strong>
                      <span>{item.observedValue} → {item.impactOnDecision}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Simulated Decision Support Engine
            </span>
            <button
              onClick={() => onNavigateToTab('recommendations')}
              className="text-xs font-bold text-slate-900 hover:text-emerald-600 flex items-center space-x-1 cursor-pointer"
            >
              <span>Explore Full Rationale</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
