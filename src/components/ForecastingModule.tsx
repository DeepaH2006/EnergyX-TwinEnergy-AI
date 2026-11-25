import React, { useState, useEffect } from 'react';
import {
  Sun,
  Wind,
  Building2,
  Car,
  Cpu,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
} from 'lucide-react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { ForecastPoint } from '../types/energy';
import { FORECAST_METRICS } from '../services/aiForecaster';
import { DataMode } from './Header';
import { PredictResponse, TrainResponse } from '../types/backend';
import { forecastApi } from '../services/api';

interface ForecastingModuleProps {
  dataMode: DataMode;
  activeDatasetId: string | null;
  trainResult: TrainResponse | null;
  predictResult: PredictResponse | null;
  onPredictUpdated: (res: PredictResponse) => void;
  onNavigateToTab: (tab: string) => void;
  // Demo mode props
  forecasts: ForecastPoint[];
  currentHour: number;
}

export const ForecastingModule: React.FC<ForecastingModuleProps> = ({
  dataMode,
  activeDatasetId,
  trainResult,
  predictResult,
  onPredictUpdated,
  onNavigateToTab,
  forecasts,
  currentHour,
}) => {
  // Demo state
  const [selectedDemoStream, setSelectedDemoStream] = useState<'solar' | 'wind' | 'building' | 'ev'>('solar');

  // Dataset Mode state
  const [selectedTarget, setSelectedTarget] = useState<'solar' | 'wind' | 'demand' | 'total_renewable'>('solar');
  const [horizon, setHorizon] = useState<'24h' | '48h' | '7d'>('24h');
  const [modelOverride, setModelOverride] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'future_only' | 'recent_history'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync default selected target to an available trained target
  useEffect(() => {
    if (dataMode === 'dataset' && trainResult) {
      const trainedKeys = Object.entries(trainResult.results)
        .filter(([, r]) => r.status === 'trained')
        .map(([k]) => k);
      if (trainedKeys.length > 0 && !trainedKeys.includes(selectedTarget)) {
        const first = trainedKeys[0] as 'solar' | 'wind' | 'demand' | 'total_renewable';
        setSelectedTarget(first);
      }
    }
  }, [dataMode, trainResult]);

  const handleGenerateForecast = async (
    targetHorizon: '24h' | '48h' | '7d' = horizon,
    overrideModel: string = modelOverride
  ) => {
    if (!activeDatasetId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await forecastApi.predict({
        dataset_id: activeDatasetId,
        horizon: targetHorizon,
        model_override: overrideModel || undefined,
      });
      onPredictUpdated(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate forecast.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate forecast once models are trained and no predictResult yet
  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && trainResult && !predictResult && !isLoading) {
      const hasTrained = Object.values(trainResult.results).some((r) => r.status === 'trained');
      if (hasTrained) {
        handleGenerateForecast('24h', '');
      }
    }
  }, [dataMode, activeDatasetId, trainResult]);

  // =========================================================================
  // MODE A: DATASET MODE (Real ML Training & Predictions from FastAPI)
  // =========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !trainResult) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
          <Database className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Trained ML Models for Dataset Mode</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Upload a renewable-energy dataset, map columns, preprocess, and run chronological ML model training first. No synthetic or fabricated metrics are shown in Dataset Mode.
          </p>
          <button
            onClick={() => onNavigateToTab('dataset')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            Go to Dataset & Training
          </button>
        </div>
      );
    }

    const trainedTargets = Object.values(trainResult.results).filter((r) => r.status === 'trained');
    const currentEval = trainResult.results[selectedTarget] || trainedTargets[0] || null;

    // Build chart series from predictResult
    const rawSeries = predictResult?.combined_series || [];
    const filteredSeries = rawSeries.filter((pt) => {
      if (dateFilter === 'future_only') return pt.is_future;
      if (dateFilter === 'recent_history') return !pt.is_future;
      return true;
    });

    const splitTimestamp = rawSeries.find((pt) => pt.is_future)?.timestamp;

    const datasetChartData = filteredSeries.map((pt) => {
      let actual: number | null | undefined = null;
      let predicted: number | null | undefined = null;
      let low: number | null | undefined = null;
      let high: number | null | undefined = null;

      if (selectedTarget === 'solar') {
        actual = pt.solar_actual;
        predicted = pt.solar_predicted;
        low = pt.solar_low;
        high = pt.solar_high;
      } else if (selectedTarget === 'wind') {
        actual = pt.wind_actual;
        predicted = pt.wind_predicted;
        low = pt.wind_low;
        high = pt.wind_high;
      } else if (selectedTarget === 'demand') {
        actual = pt.demand_actual;
        predicted = pt.demand_predicted;
        low = pt.demand_low;
        high = pt.demand_high;
      } else {
        actual =
          pt.solar_actual !== undefined || pt.wind_actual !== undefined
            ? (pt.solar_actual || 0) + (pt.wind_actual || 0)
            : null;
        predicted = pt.total_renewable_predicted;
      }

      return {
        timestamp: pt.timestamp,
        label: pt.timestamp.slice(5, 16).replace('T', ' '),
        isFuture: pt.is_future,
        actual: actual ?? null,
        predicted: predicted ?? null,
        confLow: low ?? null,
        confHigh: high ?? null,
      };
    });

    return (
      <div className="space-y-6">
        {/* Header & Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-sky-700 mb-1">
                Dataset-Trained Machine Learning Forecasting · Chronological Validation
              </p>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                AI Forecasting Dashboard (User Dataset)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {predictResult
                  ? `Forecast generated ${new Date(predictResult.generated_at).toLocaleString()} · Interval: ${predictResult.interval_minutes} min · Uncertainty: ${predictResult.uncertainty_method}`
                  : 'Select horizon and generate multi-step predictions from trained scikit-learn models.'}
              </p>
            </div>

            <button
              onClick={() => handleGenerateForecast(horizon, modelOverride)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white cursor-pointer self-start md:self-auto whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Generating Forecast...' : 'Run Forecast Prediction'}</span>
            </button>
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Forecast Variable</label>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value as typeof selectedTarget)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                {Object.values(trainResult.results).map((r) => (
                  <option key={r.target} value={r.target}>
                    {r.target.replace('_', ' ').toUpperCase()} ({r.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Forecast Horizon</label>
              <select
                value={horizon}
                onChange={(e) => {
                  const h = e.target.value as '24h' | '48h' | '7d';
                  setHorizon(h);
                  handleGenerateForecast(h, modelOverride);
                }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                <option value="24h">Next 24 Hours</option>
                <option value="48h">Next 48 Hours</option>
                <option value="7d">Next 7 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Model Selection</label>
              <select
                value={modelOverride}
                onChange={(e) => {
                  setModelOverride(e.target.value);
                  handleGenerateForecast(horizon, e.target.value);
                }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                <option value="">Auto-Selected Best ({currentEval?.selected_model || 'N/A'})</option>
                {currentEval?.models_compared.map((m) => (
                  <option key={m.model_name} value={m.model_name}>
                    {m.model_name} (RMSE: {m.rmse})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Date / Window Filter</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                <option value="all">Historical + Future Horizon</option>
                <option value="future_only">Future Predictions Only</option>
                <option value="recent_history">Historical + Test Set Only</option>
              </select>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
            {errorMsg}
          </div>
        )}

        {/* Unavailable / Insufficient Data Warning */}
        {currentEval && currentEval.status !== 'trained' && (
          <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <strong>Target '{currentEval.target}' ({currentEval.status}): </strong>
            {currentEval.reason}
          </div>
        )}

        {/* Forecast Summary KPIs */}
        {predictResult && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Forecasted Solar</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
                {predictResult.summary.predicted_solar_kwh ?? 0} <span className="text-xs font-normal text-slate-500">kWh</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Forecasted Wind</div>
              <div className="text-xl font-bold font-mono tabular-nums text-sky-600 mt-0.5">
                {predictResult.summary.predicted_wind_kwh ?? 0} <span className="text-xs font-normal text-slate-500">kWh</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Total Renewable</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                {predictResult.summary.predicted_renewable_kwh ?? 0} <span className="text-xs font-normal text-slate-500">kWh</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Forecasted Demand</div>
              <div className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-0.5">
                {predictResult.summary.predicted_demand_kwh ?? 0} <span className="text-xs font-normal text-slate-500">kWh</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Expected Net Balance</div>
              <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
                (predictResult.summary.expected_net_kwh ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {(predictResult.summary.expected_net_kwh ?? 0) >= 0 ? '+' : ''}
                {predictResult.summary.expected_net_kwh ?? 0} <span className="text-xs font-normal text-slate-500">kWh</span>
              </div>
            </div>
          </div>
        )}

        {/* Historical vs Predicted vs Future Chart */}
        {datasetChartData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedTarget.replace('_', ' ').toUpperCase()}: Historical Actuals vs Held-Out Test & Future ML Forecast
                </h3>
                <p className="text-xs text-slate-500">
                  Model Used: {predictResult?.models_used?.[selectedTarget] || currentEval?.selected_model || 'N/A'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span>Dashed vertical line marks forecast origin</span>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={datasetChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} minTickGap={24} />
                  <YAxis stroke="#94a3b8" fontSize={11} unit=" kW" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  {splitTimestamp && (
                    <ReferenceLine
                      x={splitTimestamp.slice(5, 16).replace('T', ' ')}
                      stroke="#0f172a"
                      strokeDasharray="4 4"
                      label={{ value: 'Forecast Origin', position: 'top', fontSize: 10, fill: '#0f172a' }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="confHigh"
                    stroke="transparent"
                    fill="#10b981"
                    fillOpacity={0.15}
                    name="Upper Bound (95%)"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Historical Actual"
                    stroke="#64748b"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="ML Predicted"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Genuine Evaluation & Feature Importance */}
        {currentEval && currentEval.status === 'trained' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Test Error & Metrics */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                Held-Out Test Metrics ({currentEval.selected_model})
              </h4>
              <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] font-sans text-slate-500">MAE</div>
                  <div className="text-lg font-bold text-slate-900">{currentEval.mae} kW</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] font-sans text-slate-500">RMSE</div>
                  <div className="text-lg font-bold text-slate-900">{currentEval.rmse} kW</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] font-sans text-slate-500">Safe MAPE</div>
                  <div className="text-lg font-bold text-slate-900">
                    {currentEval.mape !== null ? `${currentEval.mape}%` : 'N/A'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] font-sans text-slate-500">Test R²</div>
                  <div className="text-lg font-bold text-slate-900">
                    {currentEval.r2_score !== null ? currentEval.r2_score : 'N/A'}
                  </div>
                </div>
              </div>
              {currentEval.mape_note && (
                <p className="text-[11px] text-slate-500 mt-3">{currentEval.mape_note}</p>
              )}
              {currentEval.r2_note && (
                <p className="text-[11px] text-amber-700 mt-1">{currentEval.r2_note}</p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-800 mb-2">Permutation Feature Importance</div>
                <div className="space-y-2">
                  {currentEval.feature_importances.map((feat) => (
                    <div key={feat.feature}>
                      <div className="flex justify-between text-[11px] text-slate-700 mb-0.5">
                        <span className="truncate pr-2">{feat.feature}</span>
                        <span className="font-mono tabular-nums font-semibold">{Math.round(feat.importance * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${feat.importance * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Residual Visualization & Model Comparison */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h4 className="text-sm font-bold text-slate-900">
                Chronological Test Residuals & Model Comparison
              </h4>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={currentEval.test_predictions} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(v) => String(v).slice(5, 16).replace('T', ' ')}
                      stroke="#94a3b8"
                      fontSize={10}
                    />
                    <YAxis stroke="#94a3b8" fontSize={10} unit=" kW" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                    />
                    <ReferenceLine y={0} stroke="#64748b" />
                    <Bar dataKey="residual" name="Test Error (Actual - Predicted)" fill="#0284c7" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Model</th>
                      <th className="py-2 px-3 text-right">MAE</th>
                      <th className="py-2 px-3 text-right">RMSE</th>
                      <th className="py-2 px-3 text-right">MAPE</th>
                      <th className="py-2 px-3 text-right">R²</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {currentEval.models_compared.map((m) => (
                      <tr key={m.model_name} className={m.is_selected ? 'bg-emerald-50/70' : ''}>
                        <td className="py-1.5 px-3 font-sans font-semibold text-slate-900">
                          {m.model_name} {m.is_selected ? '(Selected)' : ''}
                        </td>
                        <td className="py-1.5 px-3 text-right">{m.mae ?? '—'}</td>
                        <td className="py-1.5 px-3 text-right font-bold">{m.rmse ?? '—'}</td>
                        <td className="py-1.5 px-3 text-right">{m.mape !== null ? `${m.mape}%` : 'N/A'}</td>
                        <td className="py-1.5 px-3 text-right">{m.r2_score ?? 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MODE B: DEMONSTRATION MODE (Existing Synthetic Prototype Preserved)
  // =========================================================================
  const currentMetric = FORECAST_METRICS[selectedDemoStream];
  const chartData = forecasts.map((f) => {
    let actual = 0;
    let predicted = 0;
    let confLow = 0;
    let confHigh = 0;

    if (selectedDemoStream === 'solar') {
      actual = f.actualSolarKw || 0;
      predicted = f.predictedSolarKw;
      confLow = f.solarConfidenceLow;
      confHigh = f.solarConfidenceHigh;
    } else if (selectedDemoStream === 'wind') {
      actual = f.actualWindKw || 0;
      predicted = f.predictedWindKw;
      confLow = f.windConfidenceLow;
      confHigh = f.windConfidenceHigh;
    } else if (selectedDemoStream === 'building') {
      actual = f.actualBuildingKw || 0;
      predicted = f.predictedBuildingKw;
      confLow = Math.max(0, predicted - 8);
      confHigh = predicted + 8;
    } else {
      actual = f.actualEvKw || 0;
      predicted = f.predictedEvKw;
      confLow = Math.max(0, predicted - 10);
      confHigh = predicted + 10;
    }

    return {
      time: f.timeLabel,
      hour: f.hour,
      actual,
      predicted,
      confLow,
      confHigh,
      isCurrent: f.hour === currentHour,
    };
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-amber-700 mb-1">
            Synthetic Demonstration Data · Reference Architecture Preview
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            AI-Driven Multi-Horizon Generation & Demand Forecasting
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Displaying synthetic 24-hour demonstration curves. Switch to Dataset Mode to train real scikit-learn models on your uploaded CSV/Excel file.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedDemoStream('solar')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDemoStream === 'solar'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>Solar PV</span>
          </button>

          <button
            onClick={() => setSelectedDemoStream('wind')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDemoStream === 'wind'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Wind className="w-4 h-4" />
            <span>Wind Turbines</span>
          </button>

          <button
            onClick={() => setSelectedDemoStream('building')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDemoStream === 'building'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Building / HVAC</span>
          </button>

          <button
            onClick={() => setSelectedDemoStream('ev')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedDemoStream === 'ev'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>EV Charging</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <span>{currentMetric.name}</span>
              <span className="text-xs text-slate-500 font-normal">· {currentMetric.modelType}</span>
            </h3>
            <p className="text-xs text-slate-500">
              Synthetic Reference Stream vs Demonstration Forecast
            </p>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} unit=" kW" />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
              />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Area dataKey="confHigh" stroke="transparent" fill="url(#confidenceGrad)" name="Confidence Upper" legendType="none" />
              <Line type="monotone" dataKey="actual" name="Synthetic Ground Truth" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2, fill: '#64748b' }} />
              <Line type="monotone" dataKey="predicted" name="Demo Prediction" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-900">Demo Reference Accuracy</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-sans text-slate-500 block">MAPE</span>
              <span className="text-xl font-black text-emerald-700">{currentMetric.mape}%</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-sans text-slate-500 block">R² Score</span>
              <span className="text-xl font-black text-sky-700">{currentMetric.r2Score}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-sans text-slate-500 block">RMSE</span>
              <span className="text-xl font-black text-slate-800">{currentMetric.rmse} kW</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-sans text-slate-500 block">MAE</span>
              <span className="text-xl font-black text-slate-800">{currentMetric.mae} kW</span>
            </div>
          </div>
          <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <strong>Demo Mode Notice:</strong> These metrics illustrate the reference microgrid. Upload a CSV/Excel file in Dataset Mode for genuine held-out validation metrics.
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-900">Reference Feature Weights</h4>
            </div>
          </div>
          <div className="space-y-3.5">
            {currentMetric.featureImportance.map((feat, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>{feat.feature}</span>
                  <span className="text-emerald-700 font-mono tabular-nums font-bold">{Math.round(feat.weight * 100)}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${feat.weight * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-2 text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Switch to Dataset Mode to compute permutation feature importance from your own data.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
