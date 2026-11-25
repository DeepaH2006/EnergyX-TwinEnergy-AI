import React from 'react';
import {
  Activity,
  Play,
  RotateCcw,
  Info,
  Clock,
  Zap,
  Cpu,
  Layers,
  Sparkles,
  Database,
  Server,
} from 'lucide-react';

export type DataMode = 'dataset' | 'demo';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  backendOnline: boolean;
  activeDatasetName: string | null;
  currentHour: number;
  setCurrentHour: (hour: number) => void;
  isSimulatingLive: boolean;
  setIsSimulatingLive: (val: boolean | ((prev: boolean) => boolean)) => void;
  onRunDemo: () => void;
  onOpenJudgeInfo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  dataMode,
  setDataMode,
  backendOnline,
  activeDatasetName,
  currentHour,
  setCurrentHour,
  isSimulatingLive,
  setIsSimulatingLive,
  onRunDemo,
  onOpenJudgeInfo,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Overview', icon: Activity },
    { id: 'dataset', label: 'Dataset & Training', icon: Database },
    { id: 'forecasting', label: 'AI Forecasting', icon: Cpu },
    { id: 'digital-twin', label: 'Digital Twin', icon: Layers },
    { id: 'what-if', label: 'What-If Simulation', icon: Zap },
    { id: 'optimization', label: 'Optimization', icon: Sparkles },
    { id: 'recommendations', label: 'Recommendations', icon: Info },
    { id: 'comparison', label: 'Scenario Comparison', icon: Clock },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      {/* Top Bar: Brand, Data Mode & Primary Action */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-600 flex items-center justify-center text-white shadow-sm">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight whitespace-nowrap">
                  EnergyX 2.0 · TwinEnergy <span className="text-emerald-600">AI</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 hidden lg:block">
                Dataset-Driven Renewable Forecasting, Digital Twin & MILP Optimization
              </p>
            </div>
          </div>

          {/* Right Controls: Mode Switcher, Time Scrubber (Demo), Demo Tour */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Segmented Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setDataMode('dataset')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  dataMode === 'dataset'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dataset Mode
              </button>
              <button
                onClick={() => setDataMode('demo')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  dataMode === 'demo'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demo Mode
              </button>
            </div>

            {dataMode === 'demo' && (
              <div className="hidden md:flex items-center space-x-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold font-mono tabular-nums text-slate-700 min-w-[54px]">
                  {String(currentHour).padStart(2, '0')}:00
                </span>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={currentHour}
                  onChange={(e) => setCurrentHour(Number(e.target.value))}
                  className="w-20 accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  title="Scrub 24-hour synthetic demonstration timeline"
                />
                <button
                  onClick={() => setIsSimulatingLive((prev) => !prev)}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    isSimulatingLive ? 'text-emerald-600 bg-emerald-100' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title={isSimulatingLive ? 'Pause Auto Clock' : 'Play Auto Clock'}
                >
                  {isSimulatingLive ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <button
              onClick={onRunDemo}
              className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Guided Tour</span>
            </button>

            <button
              onClick={onOpenJudgeInfo}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="System Architecture & Methodology"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Data Source & Backend Status Strip (Strict Mode Separation - Section 13) */}
      <div className={`border-t border-slate-100 text-[11px] py-1.5 px-4 sm:px-6 lg:px-8 ${
        dataMode === 'dataset' ? 'bg-slate-900 text-slate-100' : 'bg-amber-50 text-amber-950 border-b border-amber-200/70'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 font-mono">
            <span className="font-bold tracking-wide">
              {dataMode === 'dataset'
                ? 'DATA SOURCE: USER-UPLOADED DATASET'
                : 'DATA SOURCE: SYNTHETIC DEMONSTRATION DATA'}
            </span>
            {dataMode === 'dataset' && activeDatasetName && (
              <span className="text-emerald-300">· File: {activeDatasetName}</span>
            )}
            {dataMode === 'dataset' && !activeDatasetName && (
              <span className="text-amber-300">· No dataset loaded yet</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-3 h-3" />
            <span>
              FastAPI Backend: {backendOnline ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-100">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm font-medium">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
