import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Zap,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface DemoTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToTab: (tab: string) => void;
}

export const DemoTourModal: React.FC<DemoTourModalProps> = ({
  isOpen,
  onClose,
  onJumpToTab,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const demoSteps = [
    {
      title: 'The Challenge: 2:00 PM Generation-Demand Mismatch',
      tab: 'dashboard',
      badge: 'Step 1: Current State',
      description: 'At 2:00 PM, on-site Solar is generating 285 kW, Wind is producing 75 kW, Battery SOC is at 70%, Building load is 175 kW, and EV charging is surging to 160 kW. Total demand (335 kW) closely matches generation (360 kW), but solar will soon drop in late afternoon while EV commuters need fast turnaround. How should power be routed?',
      highlights: [
        'Solar Generation: High (285 kW)',
        'EV Fleet Demand: Surging (160 kW across 14 bays)',
        'Battery SOC: 70% (350 kWh stored reserve)',
        'Challenge: Do we discharge battery now or save it for the expensive 6:00 PM peak tariff?',
      ],
      icon: Clock,
      color: 'amber',
    },
    {
      title: 'Predictive Intelligence: AI 24-Hour Ahead Forecast',
      tab: 'forecasting',
      badge: 'Step 2: AI Forecasting',
      description: 'Rather than reacting to current meters, the AI model (Physics-Informed Gradient Boosting) predicts that solar generation will drop by 45% over the next 2.5 hours, while EV demand will remain high until 4:30 PM. Furthermore, grid electricity tariff will spike from ₹6.80 to ₹11.20/kWh at 6:00 PM.',
      highlights: [
        'Forecast horizon predicts 45% solar drop by 4:30 PM',
        'EV fleet arrival peak will persist for next 90 minutes',
        'Model MAPE accuracy: 4.8% on solar, 3.9% on building load',
        'Explainable features: DNI Irradiance (48%), Diurnal Elevation (26%)',
      ],
      icon: Cpu,
      color: 'sky',
    },
    {
      title: 'Digital Twin: Virtual Nodal Bus Synchronization',
      tab: 'digital-twin',
      badge: 'Step 3: Digital Twin Update',
      description: 'The Digital Twin creates a virtual software replica of the 415V Energy Bus, calculating line distribution losses (1.8%), battery internal cell temperature (32.4°C), inverter conversion efficiencies, and EV station queue length.',
      highlights: [
        'Real-time power balance: P_gen + P_bat + P_grid = P_load + P_losses',
        'Electrochemical twin models C-rate and safe thermal limits',
        'Substation feeder coupling maintained at 50.0 Hz nominal frequency',
        'Digital Twin tests physical feasibility before physical actuation',
      ],
      icon: Layers,
      color: 'teal',
    },
    {
      title: 'What-If Simulation: Stress Testing Multiple Strategies',
      tab: 'what-if',
      badge: 'Step 4: Scenario Simulation',
      description: 'The simulation engine evaluates counterfactual scenarios: What if solar suddenly drops due to cloud cover? What if EV demand doubles? What if the battery is fully discharged right now? It quantitatively simulates the outcome of each decision.',
      highlights: [
        'Tested Strategy 1: Discharge battery now → Result: Battery depleted before 6 PM peak tariff',
        'Tested Strategy 2: Export surplus to grid → Result: Low feed-in credit vs high evening buyback',
        'Tested Strategy 3: Priority solar-to-EV + Strategic Storage → Result: Optimal Pareto balance',
      ],
      icon: Zap,
      color: 'amber',
    },
    {
      title: 'Mathematical Optimization: Multi-Objective LP Formulation',
      tab: 'optimization',
      badge: 'Step 5: Multi-Objective LP',
      description: 'The Mixed-Integer Linear Programming optimizer allocates power with mathematical rigor: Direct Solar (285 kW) and Wind (75 kW) satisfy Building (175 kW) and EV charging (160 kW). The remaining 25 kW surplus is stored in the battery, while preserving >65% SOC for the upcoming 6 PM tariff spike.',
      highlights: [
        'Renewable Utilization: Increased by +18.4% vs uncoordinated baseline',
        'Grid Feeder Import: Curtailed by -42.1%',
        'Feeder Peak Demand Shaving: -28.6% shaved',
        'Tariff Cost Reduction: -34.8% saved over 15-minute dispatch interval',
      ],
      icon: Sparkles,
      color: 'emerald',
    },
    {
      title: 'Explainable Recommendation: Transparent Action Rationale',
      tab: 'recommendations',
      badge: 'Step 6: Explainable Recommendation',
      description: 'The recommendation engine generates a human-readable operational strategy: “Direct available solar to active loads and EV charging; store suitable surplus in battery; preserve battery reserves for impending 6:00 PM peak demand; minimize unnecessary grid draw.” It explains the exact why, rejected alternatives, and battery impacts.',
      highlights: [
        'Full Transparency: Displays exact factors (Solar High, EV High, SOC 70%)',
        'Rejection Audit: Explains why aggressive battery discharge was rejected',
        'Zero Black Box: Every decision variable is mathematically auditable',
        'Decision Support: Empowers facility engineers with verifiable insights',
      ],
      icon: ShieldCheck,
      color: 'emerald',
    },
  ];

  const step = demoSteps[currentStep];

  const handleNext = () => {
    if (currentStep < demoSteps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onJumpToTab(demoSteps[nextStep].tab);
      if (nextStep === demoSteps.length - 1) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onJumpToTab(demoSteps[prevStep].tab);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 sm:p-8 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Progress Track */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              {currentStep + 1}/6
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                KPIT Sparkle Hackathon Demo
              </span>
              <h3 className="text-sm font-bold text-slate-900">{step.badge}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Content */}
        <div className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
            {step.title}
          </h2>

          <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            {step.description}
          </p>

          {/* Highlights Box */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Key Workflow Elements Demonstrated:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {step.highlights.map((h, i) => (
                <div key={i} className="flex items-start space-x-2 p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-xs text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex space-x-1.5">
            {demoSteps.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === currentStep ? 'w-6 bg-emerald-600' : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center space-x-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>{currentStep === demoSteps.length - 1 ? 'Finish & Explore System' : 'Next Workflow Step'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
