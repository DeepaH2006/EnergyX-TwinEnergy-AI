import React from 'react';
import {
  X,
  BookOpen,
  Award,
  Cpu,
  Layers,
  Zap,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface JudgeInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JudgeInfoModal: React.FC<JudgeInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 sm:p-8 relative my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                KPIT Sparkle 2026–27 Submission Dossier
              </span>
              <h2 className="text-lg font-black text-slate-900">
                AI-Powered Digital Twin for Intelligent Renewable Energy Management
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 text-xs text-slate-700 leading-relaxed">
          {/* Executive Summary */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center space-x-1.5">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>Project Overview & Core Differentiator</span>
            </h3>
            <p>
              Traditional Energy Management Systems (EMS) are fundamentally <em>reactive</em>—they merely monitor what has already occurred and analyze historical graphs. In contrast, our platform implements a <strong>predictive, proactive Digital Twin</strong> that simulates multiple future counterfactual scenarios, evaluates trade-offs mathematically, and recommends optimal dispatch actions <em>before</em> the physical grid is affected.
            </p>
          </div>

          {/* Core Workflow Architecture */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">
              System Pipeline: DATA → PREDICT → DIGITAL TWIN → SIMULATE → OPTIMIZE → RECOMMEND
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-sky-700 block mb-0.5">1. AI Forecasting</strong>
                <span>Physics-Informed Gradient Boosting & LSTM for Solar, Wind, Building & EV loads.</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-teal-700 block mb-0.5">2. Digital Twin</strong>
                <span>Nodal power balance equations, battery C-rate, degradation, and line losses.</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-amber-700 block mb-0.5">3. What-If Engine</strong>
                <span>Sandbox testing cloud shocks, EV surges, battery depletion, and grid islanding.</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-emerald-700 block mb-0.5">4. Multi-Objective LP</strong>
                <span>Jointly optimizes renewable self-consumption, grid peak shaving, and battery life.</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-purple-700 block mb-0.5">5. Explainable AI</strong>
                <span>Transparent decision audit trail detailing factors, observations, and rejected alternatives.</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <strong className="text-indigo-700 block mb-0.5">6. Scenario Matrix</strong>
                <span>Side-by-side benchmark of 4 core scenarios with true prototype measurements.</span>
              </div>
            </div>
          </div>

          {/* Mathematical Formulation */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[11px]">
            <span className="text-emerald-400 font-bold block mb-1">Mathematical Formulation (Mixed-Integer Linear Programming):</span>
            <div className="text-slate-300">
              min J = w₁ · C_grid(P_grid) + w₂ · (P_grid,peak)² - w₃ · P_renew,used + w₄ · Deg_bat(P_bat)<br />
              Subject to:<br />
              &nbsp;&nbsp;1. P_solar + P_wind + P_bat,dis + P_grid,in = P_bldg + P_ev + P_bat,chg + P_losses<br />
              &nbsp;&nbsp;2. 15% ≤ SOC(t) ≤ 95% (Safe battery operational envelope)<br />
              &nbsp;&nbsp;3. 0 ≤ P_bat,chg ≤ 150 kW, 0 ≤ P_bat,dis ≤ 150 kW (Inverter rating)<br />
              &nbsp;&nbsp;4. P_grid,in ≤ 450 kW (Feeder thermal limit)
            </div>
          </div>

          {/* Hackathon Compliance Checklist */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">
              KPIT Sparkle Evaluation Criteria & Student Team Feasibility
            </h4>
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>No Physical Hardware Required:</strong> Runs completely as a software-based Digital Twin simulation.</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>Truth in Advertising:</strong> Metrics reflect real calculations computed by the prototype algorithms.</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>Safety and Realism:</strong> Positioned as a human-in-the-loop Decision Support System (DSS).</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>Explainable AI:</strong> Answers "Why this decision?" and "What alternatives were rejected?".</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
