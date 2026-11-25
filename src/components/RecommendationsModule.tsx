import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  TrendingUp,
  Battery,
  Zap,
  DollarSign,
  Sparkles,
  Database,
  Play,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { Recommendation } from '../types/energy';
import {
  DatasetSummaryResponse,
  ExplainAIResponse,
  RecommendationGenerateResponse,
  SystemComponentSpec,
} from '../types/backend';
import { recommendationApi } from '../services/api';
import { DataMode } from './Header';

interface RecommendationsModuleProps {
  recommendation: Recommendation;
  dataMode: DataMode;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  systemConfig: SystemComponentSpec;
  recBackendResult: RecommendationGenerateResponse | null;
  setRecBackendResult: (res: RecommendationGenerateResponse | null) => void;
  onNavigateToDataset: () => void;
}

export const RecommendationsModule: React.FC<RecommendationsModuleProps> = ({
  recommendation,
  dataMode,
  activeDatasetId,
  datasetSummary,
  systemConfig,
  recBackendResult,
  setRecBackendResult,
  onNavigateToDataset,
}) => {
  const [horizon, setHorizon] = useState<'24h' | '48h' | '7d'>('24h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional Opt-In Gemini AI Explainer
  const [aiConsent, setAiConsent] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<ExplainAIResponse | null>(null);

  const fetchRecommendations = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await recommendationApi.generate({
        dataset_id: activeDatasetId,
        horizon,
        system_config: systemConfig,
      });
      setRecBackendResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataMode === 'dataset' && activeDatasetId && datasetSummary?.is_preprocessed && !recBackendResult) {
      void fetchRecommendations();
    }
  }, [dataMode, activeDatasetId, datasetSummary?.is_preprocessed]);

  const handleExplainAI = async () => {
    if (!recBackendResult) return;
    setAiLoading(true);
    try {
      const res = await recommendationApi.explainAI({
        question: aiQuestion.trim() || undefined,
        summary_context: recBackendResult.system_context_summary,
        user_consent: aiConsent,
      });
      setAiResult(res);
    } catch (err) {
      setAiResult({
        status: 'error',
        explanation: err instanceof Error ? err.message : 'AI explanation call failed',
        grounded_metrics_used: {},
      });
    } finally {
      setAiLoading(false);
    }
  };

  // ===========================================================================
  // MODE A: DATASET MODE (Data-Driven Decision Support + Opt-In Gemini Summary)
  // ===========================================================================
  if (dataMode === 'dataset') {
    if (!activeDatasetId || !datasetSummary) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No Dataset Loaded for Decision Recommendations</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-4">
            Upload and preprocess a dataset so the backend recommendation engine can analyze forecast deficits, curtailment windows, peak imports, and battery limits.
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

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-mono font-semibold mb-2 border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5" />
              <span>DATA-DRIVEN DECISION SUPPORT · SOURCE: USER-UPLOADED DATASET</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Auditable Operational Recommendations &amp; Explainability
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Derived mathematically from MILP dispatch schedules, curtailment intervals, demand spikes, and battery utilization metrics.
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
              onClick={fetchRecommendations}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{loading ? 'Analyzing...' : 'Generate Recommendations'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {recBackendResult && (
          <>
            {recBackendResult.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                {recBackendResult.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {recBackendResult.recommendations.map((rec) => (
                <div key={rec.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border ${
                        rec.priority === 'high'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : rec.priority === 'medium'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {rec.priority} priority · {rec.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">{rec.relevant_time_period}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{rec.title}</h3>
                    <p className="text-xs text-slate-700 leading-relaxed">{rec.reason}</p>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
                      <div><strong className="text-slate-800">Supporting Data: </strong><span className="font-mono text-slate-700">{rec.supporting_data}</span></div>
                      <div><strong className="text-emerald-800">Expected Benefit: </strong><span className="text-slate-700">{rec.expected_operational_benefit}</span></div>
                    </div>

                    {rec.rejected_alternatives.length > 0 && (
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Rejected Alternatives:</span>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {rec.rejected_alternatives.map((alt, i) => (
                            <li key={i}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Optional Opt-In Gemini AI Natural-Language Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Optional AI Executive Summary (Opt-In Only)</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">Sends aggregated numeric KPIs only — never raw dataset rows</span>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-3 rounded-lg bg-slate-50 border border-slate-200">
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                  className="mt-0.5 accent-emerald-600"
                />
                <span>
                  I explicitly consent to sending aggregated optimization metrics (<span className="font-mono">grid_import_kwh</span>, <span className="font-mono">renewable_utilization_pct</span>, <span className="font-mono">peak_grid_import_kw</span>) to the server-side Gemini model to draft a plain-language operational briefing.
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Optional operator question (e.g., How should we prepare storage before evening peak?)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
                <button
                  onClick={handleExplainAI}
                  disabled={!aiConsent || aiLoading}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {aiLoading ? 'Generating Briefing...' : 'Generate AI Summary'}
                </button>
              </div>

              {aiResult && (
                <div className={`p-4 rounded-lg border text-xs leading-relaxed ${
                  aiResult.status === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-slate-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="font-bold uppercase text-[11px] mb-1">AI Briefing Status: {aiResult.status}</div>
                  <p className="whitespace-pre-line">{aiResult.explanation}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODE B: DEMONSTRATION MODE (Preserved Original Recommendations UI)
  // ===========================================================================
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-2 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explainable AI &amp; Decision Support</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Transparent Energy Allocation Advisory Engine
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Eliminates black-box decision making by detailing the exact physical and economic reasons behind every dispatch recommendation.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 font-semibold text-slate-700 border border-slate-200">
            Advisory Mode: Non-Autonomous Decision Support
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${
              recommendation.urgency === 'optimal'
                ? 'bg-emerald-500'
                : recommendation.urgency === 'warning'
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`} />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Strategic Advisory
            </span>
          </div>
          <span className="text-xs text-slate-400">Generated: {recommendation.timestamp}</span>
        </div>

        <h3 className="text-xl font-black text-slate-900 leading-tight">
          {recommendation.title}
        </h3>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
          {recommendation.summary}
        </p>

        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Recommended Actionable Dispatch Steps:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {recommendation.detailedAction.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start space-x-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-800"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-100">
            <HelpCircle className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              “Why this decision?” — Explainable Factors
            </h3>
          </div>

          <div className="space-y-3">
            {recommendation.whyThisDecision.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                  <span className="text-emerald-800">{item.factor}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    {item.observedValue}
                  </span>
                </div>
                <p className="text-slate-600 leading-normal mt-1">
                  <strong className="text-slate-700">System Impact: </strong>
                  {item.impactOnDecision}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-100">
            <XCircle className="w-4 h-4 text-rose-600" />
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Alternatives Evaluated &amp; Why Rejected
            </h3>
          </div>

          <div className="space-y-3">
            {recommendation.alternativesConsidered.map((alt, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-rose-50/40 border border-rose-100 text-xs">
                <div className="flex items-center space-x-1.5 font-bold text-rose-900 mb-1">
                  <span className="line-through">{alt.strategyName}</span>
                </div>
                <p className="text-rose-800/80 leading-normal">
                  <strong className="text-rose-900 font-semibold">Rejection Cause: </strong>
                  {alt.whyRejected}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
          Projected Impact on Microgrid Subsystems
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-teal-50 border border-teal-200/80">
            <div className="flex items-center space-x-2 text-teal-800 font-bold text-xs mb-1">
              <TrendingUp className="w-4 h-4" />
              <span>Renewable Self-Consumption</span>
            </div>
            <p className="text-xs text-teal-900 font-semibold mt-1">
              {recommendation.expectedEffects.renewableUtilization}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50 border border-purple-200/80">
            <div className="flex items-center space-x-2 text-purple-800 font-bold text-xs mb-1">
              <Zap className="w-4 h-4" />
              <span>Grid Feeder Exposure</span>
            </div>
            <p className="text-xs text-purple-900 font-semibold mt-1">
              {recommendation.expectedEffects.gridImpact}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80">
            <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs mb-1">
              <Battery className="w-4 h-4" />
              <span>Battery State &amp; Health</span>
            </div>
            <p className="text-xs text-emerald-900 font-semibold mt-1">
              {recommendation.expectedEffects.batteryHealth}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80">
            <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs mb-1">
              <DollarSign className="w-4 h-4" />
              <span>Economic / Tariff Impact</span>
            </div>
            <p className="text-xs text-amber-900 font-semibold mt-1">
              {recommendation.expectedEffects.economicBenefit}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-700">Safety &amp; Realism Notice: </strong>
          This software operates as an intelligent Decision Support System (DSS) utilizing simulated microgrid telemetry. It provides auditable operational recommendations and does not assert direct autonomous control over high-voltage electrical grid switchgear.
        </div>
      </div>
    </div>
  );
};
