/**
 * EnergyX 2.0 — TwinEnergy AI
 * Dataset-Driven Renewable Energy Forecasting, Digital Twin & MILP Optimization Platform
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header, DataMode } from './components/Header';
import { OverviewDashboard } from './components/OverviewDashboard';
import { DatasetManagementModule } from './components/DatasetManagementModule';
import { ForecastingModule } from './components/ForecastingModule';
import { DigitalTwinModule } from './components/DigitalTwinModule';
import { WhatIfSimulationModule } from './components/WhatIfSimulationModule';
import { OptimizationModule } from './components/OptimizationModule';
import { RecommendationsModule } from './components/RecommendationsModule';
import { ScenarioComparisonModule } from './components/ScenarioComparisonModule';
import { DemoTourModal } from './components/DemoTourModal';
import { JudgeInfoModal } from './components/JudgeInfoModal';

import { generate24HourTelemetry } from './services/syntheticData';
import { generate24HourForecasts } from './services/aiForecaster';
import { runEnergyOptimization } from './services/optimizationEngine';
import { simulateDigitalTwinState } from './services/digitalTwin';
import { generateRecommendation } from './services/recommendationEngine';
import { systemApi } from './services/api';
import { WhatIfScenarioInput } from './types/energy';
import {
  DatasetSummaryResponse,
  DatasetUploadResponse,
  DigitalTwinSimulateResponse,
  OptimizationRunResponse,
  PredictResponse,
  PreprocessResponse,
  RecommendationGenerateResponse,
  SystemComponentSpec,
  TrainResponse,
} from './types/backend';

const DEFAULT_SYSTEM_CONFIG: SystemComponentSpec = {
  solar_rated_kw: 350,
  wind_rated_kw: 200,
  battery_capacity_kwh: 500,
  battery_max_charge_kw: 150,
  battery_max_discharge_kw: 150,
  battery_charge_efficiency: 0.95,
  battery_discharge_efficiency: 0.95,
  battery_min_soc_pct: 15,
  battery_max_soc_pct: 95,
  initial_soc_pct: 60,
  grid_max_import_kw: 450,
  grid_max_export_kw: 250,
  distribution_loss_pct: 2.0,
  tariff_per_kwh: null,
  carbon_intensity_g_per_kwh: null,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [dataMode, setDataMode] = useState<DataMode>('dataset');

  // FastAPI backend connectivity
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Mode A: Dataset Mode state (strictly isolated from synthetic demo data)
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [datasetSummary, setDatasetSummary] = useState<DatasetSummaryResponse | null>(null);
  const [trainResult, setTrainResult] = useState<TrainResponse | null>(null);
  const [predictResult, setPredictResult] = useState<PredictResponse | null>(null);
  const [twinBackendResult, setTwinBackendResult] = useState<DigitalTwinSimulateResponse | null>(null);
  const [optBackendResult, setOptBackendResult] = useState<OptimizationRunResponse | null>(null);
  const [recBackendResult, setRecBackendResult] = useState<RecommendationGenerateResponse | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemComponentSpec>(DEFAULT_SYSTEM_CONFIG);

  // Mode B: Synthetic Demonstration Mode state (preserved)
  const [currentHour, setCurrentHour] = useState<number>(14);
  const [isSimulatingLive, setIsSimulatingLive] = useState<boolean>(false);
  const [isDemoTourOpen, setIsDemoTourOpen] = useState<boolean>(false);
  const [isJudgeInfoOpen, setIsJudgeInfoOpen] = useState<boolean>(false);

  const checkBackendHealth = useCallback(async () => {
    try {
      await systemApi.checkHealth();
      setBackendOnline(true);
      setBackendError(null);
    } catch (err) {
      setBackendOnline(false);
      setBackendError(err instanceof Error ? err.message : 'Backend offline');
    }
  }, []);

  useEffect(() => {
    void checkBackendHealth();
    const timer = setInterval(() => {
      void checkBackendHealth();
    }, 15000);
    return () => clearInterval(timer);
  }, [checkBackendHealth]);

  // Mode B synthetic telemetry calculations (used ONLY when dataMode === 'demo')
  const allTelemetry = useMemo(() => generate24HourTelemetry(), []);
  const allForecasts = useMemo(() => generate24HourForecasts(), []);

  const currentTelemetry = useMemo(() => {
    const pt = allTelemetry.find((p) => p.hour === currentHour);
    return pt || allTelemetry[56];
  }, [allTelemetry, currentHour]);

  const liveOptResult = useMemo(() => {
    return runEnergyOptimization(
      {
        solarAvailKw: currentTelemetry.solarKw,
        windAvailKw: currentTelemetry.windKw,
        buildingDemandKw: currentTelemetry.buildingDemandKw,
        evDemandKw: currentTelemetry.evDemandKw,
        batterySocPct: currentTelemetry.batterySocPct,
        gridAvailable: true,
        hourOfDay: currentHour,
      },
      'live-stream'
    );
  }, [currentTelemetry, currentHour]);

  const liveTwinState = useMemo(() => {
    return simulateDigitalTwinState({
      solarKw: currentTelemetry.solarKw,
      windKw: currentTelemetry.windKw,
      buildingKw: currentTelemetry.buildingDemandKw,
      evKw: currentTelemetry.evDemandKw,
      batterySocPct: currentTelemetry.batterySocPct,
      batteryDesiredKw: liveOptResult.batteryNetKw,
      gridAvailable: true,
      gridTariffINR: currentTelemetry.gridTariffINR_kWh,
    });
  }, [currentTelemetry, liveOptResult]);

  const liveRecommendation = useMemo(() => {
    return generateRecommendation(
      liveOptResult,
      currentTelemetry.solarKw,
      currentTelemetry.windKw,
      currentTelemetry.buildingDemandKw,
      currentTelemetry.evDemandKw,
      currentTelemetry.batterySocPct,
      true,
      currentHour
    );
  }, [liveOptResult, currentTelemetry, currentHour]);

  useEffect(() => {
    if (!isSimulatingLive || dataMode !== 'demo') return;
    const interval = setInterval(() => {
      setCurrentHour((prev) => (prev + 1) % 24);
    }, 3000);
    return () => clearInterval(interval);
  }, [isSimulatingLive, dataMode]);

  const handleApplyScenarioToLive = (scenario: WhatIfScenarioInput) => {
    setCurrentHour(scenario.timeOfSimulationHour);
    setDataMode('demo');
    setActiveTab('dashboard');
  };

  const handleDatasetUploaded = (_upload: DatasetUploadResponse, summary: DatasetSummaryResponse) => {
    setActiveDatasetId(summary.dataset_id);
    setDatasetSummary(summary);
    setTrainResult(null);
    setPredictResult(null);
    setTwinBackendResult(null);
    setOptBackendResult(null);
    setRecBackendResult(null);
    setDataMode('dataset');
  };

  const handleDatasetPreprocessed = (_res: PreprocessResponse, summary: DatasetSummaryResponse) => {
    setDatasetSummary(summary);
    setTrainResult(null);
    setPredictResult(null);
    setTwinBackendResult(null);
    setOptBackendResult(null);
    setRecBackendResult(null);
  };

  const handleModelsTrained = (res: TrainResponse) => {
    setTrainResult(res);
    setPredictResult(null);
    setTwinBackendResult(null);
    setOptBackendResult(null);
    setRecBackendResult(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-emerald-500 selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dataMode={dataMode}
        setDataMode={setDataMode}
        backendOnline={backendOnline}
        activeDatasetName={datasetSummary?.filename || null}
        currentHour={currentHour}
        setCurrentHour={setCurrentHour}
        isSimulatingLive={isSimulatingLive}
        setIsSimulatingLive={setIsSimulatingLive}
        onRunDemo={() => setIsDemoTourOpen(true)}
        onOpenJudgeInfo={() => setIsJudgeInfoOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <OverviewDashboard
            dataMode={dataMode}
            backendOnline={backendOnline}
            datasetSummary={datasetSummary}
            trainResult={trainResult}
            predictResult={predictResult}
            twinBackendResult={twinBackendResult}
            optBackendResult={optBackendResult}
            onSwitchToDemo={() => setDataMode('demo')}
            currentTelemetry={currentTelemetry}
            allTelemetry={allTelemetry}
            twinState={liveTwinState}
            optResult={liveOptResult}
            recommendation={liveRecommendation}
            onNavigateToTab={setActiveTab}
            onRunDemo={() => setIsDemoTourOpen(true)}
          />
        )}

        {activeTab === 'dataset' && (
          <DatasetManagementModule
            backendOnline={backendOnline}
            backendError={backendError}
            onRetryConnection={checkBackendHealth}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            trainResult={trainResult}
            onDatasetUploaded={handleDatasetUploaded}
            onDatasetPreprocessed={handleDatasetPreprocessed}
            onModelsTrained={handleModelsTrained}
            onSwitchToDemo={() => {
              setDataMode('demo');
              setActiveTab('dashboard');
            }}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'forecasting' && (
          <ForecastingModule
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            trainResult={trainResult}
            predictResult={predictResult}
            onPredictUpdated={setPredictResult}
            onNavigateToTab={setActiveTab}
            forecasts={allForecasts}
            currentHour={currentHour}
          />
        )}

        {activeTab === 'digital-twin' && (
          <DigitalTwinModule
            twinState={liveTwinState}
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            systemConfig={systemConfig}
            setSystemConfig={setSystemConfig}
            twinResult={twinBackendResult}
            setTwinResult={setTwinBackendResult}
            onNavigateToDataset={() => setActiveTab('dataset')}
          />
        )}

        {activeTab === 'what-if' && (
          <WhatIfSimulationModule
            onApplyScenarioToLive={handleApplyScenarioToLive}
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            systemConfig={systemConfig}
            onNavigateToDataset={() => setActiveTab('dataset')}
          />
        )}

        {activeTab === 'optimization' && (
          <OptimizationModule
            optResult={liveOptResult}
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            systemConfig={systemConfig}
            setSystemConfig={setSystemConfig}
            optBackendResult={optBackendResult}
            setOptBackendResult={setOptBackendResult}
            onNavigateToDataset={() => setActiveTab('dataset')}
          />
        )}

        {activeTab === 'recommendations' && (
          <RecommendationsModule
            recommendation={liveRecommendation}
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            systemConfig={systemConfig}
            recBackendResult={recBackendResult}
            setRecBackendResult={setRecBackendResult}
            onNavigateToDataset={() => setActiveTab('dataset')}
          />
        )}

        {activeTab === 'comparison' && (
          <ScenarioComparisonModule
            dataMode={dataMode}
            activeDatasetId={activeDatasetId}
            datasetSummary={datasetSummary}
            systemConfig={systemConfig}
            onNavigateToDataset={() => setActiveTab('dataset')}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${dataMode === 'dataset' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-semibold text-slate-700">
              EnergyX 2.0 · TwinEnergy AI (KPIT Sparkle 2026–27)
            </span>
            <span>•</span>
            <span>
              {dataMode === 'dataset' ? 'Dataset Mode (Python FastAPI ML + SciPy MILP)' : 'Synthetic Demonstration Mode'}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsJudgeInfoOpen(true)}
              className="text-emerald-700 hover:text-emerald-800 font-semibold underline cursor-pointer"
            >
              Methodology &amp; Architecture Dossier
            </button>
          </div>
        </div>
      </footer>

      <DemoTourModal
        isOpen={isDemoTourOpen}
        onClose={() => setIsDemoTourOpen(false)}
        onJumpToTab={setActiveTab}
      />

      <JudgeInfoModal
        isOpen={isJudgeInfoOpen}
        onClose={() => setIsJudgeInfoOpen(false)}
      />
    </div>
  );
}
