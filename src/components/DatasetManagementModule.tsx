import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Sliders,
  Play,
  RefreshCw,
  Download,
  Cpu,
  Table as TableIcon,
  ShieldCheck,
  Server,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  ColumnMappingConfig,
  DataQualitySnapshot,
  DatasetSummaryResponse,
  DatasetUploadResponse,
  PreprocessRequest,
  PreprocessResponse,
  TargetTrainingResult,
  TrainResponse,
} from '../types/backend';
import { datasetApi, forecastApi, getApiBaseUrl, setApiBaseUrl } from '../services/api';

interface DatasetManagementModuleProps {
  backendOnline: boolean;
  backendError: string | null;
  onRetryConnection: () => void;
  activeDatasetId: string | null;
  datasetSummary: DatasetSummaryResponse | null;
  trainResult: TrainResponse | null;
  onDatasetUploaded: (upload: DatasetUploadResponse, summary: DatasetSummaryResponse) => void;
  onDatasetPreprocessed: (res: PreprocessResponse, summary: DatasetSummaryResponse) => void;
  onModelsTrained: (res: TrainResponse) => void;
  onSwitchToDemo: () => void;
  onNavigateToTab: (tab: string) => void;
}

const ROLE_LABELS: { key: keyof ColumnMappingConfig; label: string; category: 'core' | 'storage_grid' | 'env' }[] = [
  { key: 'timestamp_col', label: 'Timestamp / Date-Time', category: 'core' },
  { key: 'solar_col', label: 'Solar Generation (kW)', category: 'core' },
  { key: 'wind_col', label: 'Wind Generation (kW)', category: 'core' },
  { key: 'demand_col', label: 'Total Energy Demand / Load (kW)', category: 'core' },
  { key: 'building_load_col', label: 'Building / Facility Load (kW)', category: 'core' },
  { key: 'ev_load_col', label: 'EV Charging Load (kW)', category: 'core' },
  { key: 'battery_soc_col', label: 'Battery SOC (%)', category: 'storage_grid' },
  { key: 'battery_charge_col', label: 'Battery Charge Power (kW)', category: 'storage_grid' },
  { key: 'battery_discharge_col', label: 'Battery Discharge Power (kW)', category: 'storage_grid' },
  { key: 'grid_import_col', label: 'Grid Import (kW)', category: 'storage_grid' },
  { key: 'grid_export_col', label: 'Grid Export (kW)', category: 'storage_grid' },
  { key: 'tariff_col', label: 'Electricity Tariff (Optional)', category: 'storage_grid' },
  { key: 'carbon_intensity_col', label: 'Carbon Intensity gCO2/kWh (Optional)', category: 'storage_grid' },
  { key: 'irradiance_col', label: 'Solar Irradiance (W/m2)', category: 'env' },
  { key: 'wind_speed_col', label: 'Wind Speed (m/s)', category: 'env' },
  { key: 'temperature_col', label: 'Ambient Temperature (C)', category: 'env' },
  { key: 'humidity_col', label: 'Humidity (%)', category: 'env' },
  { key: 'voltage_col', label: 'Bus Voltage (V)', category: 'env' },
  { key: 'current_col', label: 'Bus Current (A)', category: 'env' },
];

const TARGET_OPTIONS = [
  { id: 'solar', label: 'Solar Power Generation' },
  { id: 'wind', label: 'Wind Power Generation' },
  { id: 'total_renewable', label: 'Total Renewable Generation' },
  { id: 'demand', label: 'Energy Demand / Consumption' },
  { id: 'grid_import', label: 'Grid Import Demand' },
];

export const DatasetManagementModule: React.FC<DatasetManagementModuleProps> = ({
  backendOnline,
  backendError,
  onRetryConnection,
  activeDatasetId,
  datasetSummary,
  trainResult,
  onDatasetUploaded,
  onDatasetPreprocessed,
  onModelsTrained,
  onSwitchToDemo,
  onNavigateToTab,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewCols, setLocalPreviewCols] = useState<string[]>([]);
  const [localPreviewRows, setLocalPreviewRows] = useState<string[][]>([]);
  const [localPreviewNote, setLocalPreviewNote] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [apiUrlInput, setApiUrlInput] = useState<string>(getApiBaseUrl());

  // Local mapping & preprocessing state
  const [mapping, setMapping] = useState<ColumnMappingConfig>(
    datasetSummary?.mapping || { feature_cols: [] }
  );
  const [selectedTargets, setSelectedTargets] = useState<string[]>(['solar', 'wind', 'demand']);
  const [missingStrategy, setMissingStrategy] = useState<PreprocessRequest['missing_strategy']>('past_ffill');
  const [duplicateStrategy, setDuplicateStrategy] = useState<PreprocessRequest['duplicate_strategy']>('mean_aggregate');
  const [clampNegGen, setClampNegGen] = useState<boolean>(true);
  const [testRatio, setTestRatio] = useState<number>(0.2);
  const [includeEnv, setIncludeEnv] = useState<boolean>(true);

  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewSource, setPreviewSource] = useState<'raw' | 'cleaned'>('raw');
  const [selectedEvalTarget, setSelectedEvalTarget] = useState<string>('solar');

  const [beforeQuality, setBeforeQuality] = useState<DataQualitySnapshot | null>(
    datasetSummary?.raw_quality || null
  );
  const [afterQuality, setAfterQuality] = useState<DataQualitySnapshot | null>(
    datasetSummary?.cleaned_quality || null
  );

  // Sync local mapping when datasetSummary changes
  React.useEffect(() => {
    if (datasetSummary) {
      setMapping(datasetSummary.mapping);
      setBeforeQuality(datasetSummary.raw_quality);
      setAfterQuality(datasetSummary.cleaned_quality);
      if (datasetSummary.available_targets.length > 0) {
        setSelectedTargets(datasetSummary.available_targets.filter((t) => t !== 'total_renewable'));
      }
      loadPreview(datasetSummary.dataset_id, datasetSummary.is_preprocessed ? 'cleaned' : 'raw');
    }
  }, [datasetSummary?.dataset_id]);

  const loadPreview = async (dsId: string, src: 'raw' | 'cleaned') => {
    try {
      const prev = await datasetApi.getPreview(dsId, src, 0, 12);
      setPreviewRows(prev.rows);
      setPreviewCols(prev.columns);
      setPreviewSource(src);
    } catch {
      // ignore preview error
    }
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const handleSaveApiUrl = () => {
    setApiBaseUrl(apiUrlInput);
    onRetryConnection();
  };

  const handleResetApiProxy = () => {
    setApiUrlInput('');
    setApiBaseUrl('');
    onRetryConnection();
  };

  const handleFileSelect = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setStatusMessage({
        type: 'error',
        text: `Unsupported file format for '${file.name}'. Please select a .csv, .xlsx, or .xls file.`,
      });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStatusMessage({
        type: 'error',
        text: `File '${file.name}' exceeds the 25 MB upload limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      });
      return;
    }

    setSelectedFile(file);
    setUploadProgress(0);
    setStatusMessage(null);
    setLocalPreviewCols([]);
    setLocalPreviewRows([]);
    setLocalPreviewNote(null);

    if (lower.endsWith('.csv')) {
      try {
        const snippet = await file.slice(0, 128 * 1024).text();
        const lines = snippet
          .split(/\r?\n/)
          .map((l) => l.trimEnd())
          .filter((l) => l.length > 0);
        if (lines.length === 0) {
          setLocalPreviewNote('CSV file appears empty.');
        } else {
          const headers = parseCsvLine(lines[0]);
          const rows = lines.slice(1, 9).map((line) => parseCsvLine(line));
          setLocalPreviewCols(headers);
          setLocalPreviewRows(rows);
          setLocalPreviewNote(
            `Local CSV preview (${headers.length} columns detected, showing first ${rows.length} row${rows.length === 1 ? '' : 's'}). Click Upload to send to FastAPI.`
          );
        }
      } catch {
        setLocalPreviewNote('File selected locally. Could not render text snippet; click Upload to parse via FastAPI.');
      }
    } else {
      setLocalPreviewNote(
        `Excel workbook selected (${lower.endsWith('.xlsx') ? 'XLSX' : 'XLS'}). Click Upload to parse worksheets in Python FastAPI.`
      );
    }
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setLocalPreviewCols([]);
    setLocalPreviewRows([]);
    setLocalPreviewNote(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSelectedFile = async () => {
    if (!selectedFile) {
      setStatusMessage({
        type: 'error',
        text: 'Select a CSV or Excel file first before clicking Upload.',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setStatusMessage(null);

    try {
      const uploadRes = await datasetApi.uploadDataset(selectedFile, (pct) => setUploadProgress(pct));
      const summary = await datasetApi.getSummary(uploadRes.dataset_id);
      setMapping(uploadRes.suggested_mapping);
      setBeforeQuality(summary.raw_quality);
      setAfterQuality(null);
      setPreviewRows(uploadRes.preview_rows);
      setPreviewCols(uploadRes.columns.map((c) => c.name));
      setPreviewSource('raw');
      if (summary.available_targets.length > 0) {
        setSelectedTargets(summary.available_targets);
      }
      onDatasetUploaded(uploadRes, summary);
      onRetryConnection();
      setSelectedFile(null);
      setLocalPreviewCols([]);
      setLocalPreviewRows([]);
      setLocalPreviewNote(null);
      setStatusMessage({
        type: 'success',
        text: `Uploaded '${uploadRes.filename}' (${uploadRes.record_count} records, ${uploadRes.column_count} columns). Review detected column mapping and run preprocessing.`,
      });
    } catch (err) {
      onRetryConnection();
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload dataset to FastAPI backend.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreprocess = async () => {
    if (!activeDatasetId) return;
    setIsPreprocessing(true);
    setStatusMessage(null);
    try {
      const res = await datasetApi.preprocess(activeDatasetId, {
        mapping,
        missing_strategy: missingStrategy,
        duplicate_strategy: duplicateStrategy,
        clamp_negative_generation: clampNegGen,
        max_ffill_steps: 4,
        selected_targets: selectedTargets,
      });
      const summary = await datasetApi.getSummary(activeDatasetId);
      setBeforeQuality(res.before_quality);
      setAfterQuality(res.after_quality);
      onDatasetPreprocessed(res, summary);
      await loadPreview(activeDatasetId, 'cleaned');
      setStatusMessage({
        type: 'success',
        text: `Preprocessing complete: ${res.actions_taken.length} cleaning step(s) applied. Available targets: ${res.available_targets.join(', ') || 'None'}.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Preprocessing failed.',
      });
    } finally {
      setIsPreprocessing(false);
    }
  };

  const handleTrainModels = async () => {
    if (!activeDatasetId) return;
    if (selectedTargets.length === 0) {
      setStatusMessage({ type: 'error', text: 'Select at least one forecasting target before training.' });
      return;
    }
    setIsTraining(true);
    setStatusMessage(null);
    try {
      const res = await forecastApi.train({
        dataset_id: activeDatasetId,
        targets: selectedTargets,
        test_ratio: testRatio,
        include_environmental_features: includeEnv,
      });
      onModelsTrained(res);
      const firstTrained = Object.values(res.results).find((r) => r.status === 'trained');
      if (firstTrained) {
        setSelectedEvalTarget(firstTrained.target);
        setStatusMessage({
          type: 'success',
          text: `Chronological ML training complete. Best models selected on held-out test RMSE. Ready for forecasting & optimization.`,
        });
      } else {
        setStatusMessage({
          type: 'info',
          text: 'Training finished, but no targets had sufficient valid data for validation. Inspect target warnings below.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Model training failed.',
      });
    } finally {
      setIsTraining(false);
    }
  };

  const updateMappingField = (field: keyof ColumnMappingConfig, val: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: val || null,
    }));
  };

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFeatureCol = (colName: string) => {
    setMapping((prev) => {
      const exists = prev.feature_cols.includes(colName);
      return {
        ...prev,
        feature_cols: exists
          ? prev.feature_cols.filter((c) => c !== colName)
          : [...prev.feature_cols, colName],
      };
    });
  };

  const activeTargetEval: TargetTrainingResult | null =
    trainResult?.results?.[selectedEvalTarget] ||
    (trainResult ? Object.values(trainResult.results)[0] || null : null);

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-emerald-700 mb-1">
            Dataset Pipeline · Column Detection · Validation & ML Training
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Dataset Management & Model Training
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1">
            Upload your renewable-energy CSV or Excel dataset, verify automatic column mapping, run strictly causal preprocessing, and train chronological ML forecasting models.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/sample_microgrid_synthetic.csv"
            download="sample_microgrid_synthetic.csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Synthetic Sample CSV</span>
          </a>
          {!backendOnline && (
            <button
              onClick={onSwitchToDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Open Synthetic Demonstration Mode</span>
            </button>
          )}
        </div>
      </div>

      {/* FastAPI Backend Connection Bar */}
      <div className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        backendOnline ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/70 border-amber-300'
      }`}>
        <div className="flex items-start gap-3">
          <Server className={`w-5 h-5 shrink-0 mt-0.5 ${backendOnline ? 'text-emerald-700' : 'text-amber-700'}`} />
          <div className="text-xs">
            <div className="font-bold text-slate-900">
              {backendOnline ? 'Python FastAPI Backend Connected' : 'Python FastAPI Backend Offline / Unreachable'}
            </div>
            <div className="text-slate-600 mt-0.5">
              {backendOnline
                ? `Connected to ${getApiBaseUrl() || 'Same-origin proxy (/api/v1)'} · SciPy HiGHS MILP & scikit-learn pipelines ready.`
                : backendError || `Unable to reach EnergyX 2.0 backend at ${getApiBaseUrl() || 'Same-origin proxy (/api/v1)'}. Ensure uvicorn is running or update the API URL.`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="text"
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Same-origin proxy (/api/v1)"
          />
          <button
            type="button"
            onClick={handleSaveApiUrl}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Connect</span>
          </button>
          {apiUrlInput.trim() !== '' && (
            <button
              type="button"
              onClick={handleResetApiProxy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer whitespace-nowrap"
            >
              Use Proxy
            </button>
          )}
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`rounded-xl border p-4 text-xs flex items-start gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : statusMessage.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 1. Drag & Drop Dataset Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFileSelect(file);
        }}
        className={`bg-white rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
          isDragging ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          id="dataset-file-input"
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={isUploading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleFileSelect(file);
            }
            e.target.value = '';
          }}
        />
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          Upload Renewable Energy Dataset (.csv, .xlsx, .xls)
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
          Drag and drop your time-series dataset here, or browse local files to preview and upload. Maximum size: 25 MB.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Browse Files</span>
          </button>

          {selectedFile && (
            <>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleUploadSelectedFile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white transition-colors cursor-pointer"
              >
                {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span>{isUploading ? `Uploading (${uploadProgress}%)...` : 'Upload'}</span>
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleClearSelectedFile}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 transition-colors cursor-pointer"
              >
                <span>Clear</span>
              </button>
            </>
          )}
        </div>

        {isUploading && (
          <div className="mt-4 max-w-md mx-auto">
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Selected File & Local Preview Panel */}
        {selectedFile && (
          <div className="mt-6 text-left bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Selected File: {selectedFile.name}</span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Size: {(selectedFile.size / 1024).toFixed(1)} KB · Type: {selectedFile.type || 'spreadsheet/csv'} · Modified: {new Date(selectedFile.lastModified).toLocaleString()}
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                Local Preview (Not Yet Uploaded)
              </span>
            </div>

            {localPreviewNote && (
              <p className="text-xs text-slate-600">{localPreviewNote}</p>
            )}

            {localPreviewCols.length > 0 && localPreviewRows.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white max-h-56">
                <table className="w-full text-[11px] text-left font-mono">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0">
                    <tr>
                      {localPreviewCols.map((col, idx) => (
                        <th key={idx} className="py-1.5 px-2.5 whitespace-nowrap font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {localPreviewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {localPreviewCols.map((_, cIdx) => (
                          <td key={cIdx} className="py-1 px-2.5 whitespace-nowrap text-slate-700">
                            {row[cIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty State if no dataset uploaded yet */}
      {!datasetSummary && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-900">No User Dataset Loaded</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Upload a CSV or Excel file above to inspect automatic column detection, data quality diagnostics, preprocessing, and real scikit-learn model training.
          </p>
        </div>
      )}

      {/* 2. Dataset Summary & Data Quality Dashboard */}
      {datasetSummary && beforeQuality && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 col-span-2">
              <div className="text-[11px] font-medium text-slate-500">Dataset File</div>
              <div className="text-sm font-bold text-slate-900 truncate mt-0.5" title={datasetSummary.filename}>
                {datasetSummary.filename}
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {(datasetSummary.file_size_bytes / 1024).toFixed(1)} KB · ID {datasetSummary.dataset_id}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Records</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {(afterQuality || beforeQuality).record_count}
              </div>
              <div className="text-[11px] text-slate-500">
                {(afterQuality || beforeQuality).column_count} cols
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Frequency</div>
              <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5 truncate" title={(afterQuality || beforeQuality).detected_frequency}>
                {(afterQuality || beforeQuality).detected_frequency}
              </div>
              <div className="text-[11px] text-slate-500">
                {(afterQuality || beforeQuality).is_regular_interval ? 'Regular' : 'Irregular'}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Missing Cells</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {(afterQuality || beforeQuality).missing_value_count}
              </div>
              <div className="text-[11px] text-slate-500">
                Raw: {beforeQuality.missing_value_count}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500">Duplicates</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {(afterQuality || beforeQuality).duplicate_timestamp_count}
              </div>
              <div className="text-[11px] text-slate-500">
                Raw: {beforeQuality.duplicate_timestamp_count}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 col-span-2">
              <div className="text-[11px] font-medium text-slate-500">Data Quality Status</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-sm font-bold uppercase ${
                  (afterQuality || beforeQuality).data_quality_status === 'good'
                    ? 'text-emerald-700'
                    : (afterQuality || beforeQuality).data_quality_status === 'warning'
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}>
                  {(afterQuality || beforeQuality).data_quality_status}
                </span>
                <span className="text-xs text-slate-500">
                  {datasetSummary.is_preprocessed ? '· Preprocessed' : '· Raw Upload'}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate mt-0.5">
                {beforeQuality.date_range_start ? `${beforeQuality.date_range_start.slice(0, 10)} → ${beforeQuality.date_range_end?.slice(0, 10)}` : 'No timestamp range'}
              </div>
            </div>
          </div>

          {/* Data Quality Before-vs-After & Cleaning Warnings */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Data Quality Dashboard (Before vs After Cleaning)</h3>
              </div>
              <span className="text-xs text-slate-500">Causal cleaning only — zero future data leakage</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Quality Metric</th>
                    <th className="py-2 px-3 text-right">Raw Upload</th>
                    <th className="py-2 px-3 text-right">After Preprocessing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Record Count</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.record_count}</td>
                    <td className="py-2 px-3 text-right font-semibold">{afterQuality ? afterQuality.record_count : 'Pending'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Missing Values</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.missing_value_count}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">{afterQuality ? afterQuality.missing_value_count : 'Pending'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Duplicate Timestamps</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.duplicate_timestamp_count}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">{afterQuality ? afterQuality.duplicate_timestamp_count : 'Pending'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Invalid Non-Numeric Values</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.invalid_numeric_count}</td>
                    <td className="py-2 px-3 text-right font-semibold">{afterQuality ? afterQuality.invalid_numeric_count : 'Pending'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Negative Generation Values</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.negative_generation_count}</td>
                    <td className="py-2 px-3 text-right font-semibold">{afterQuality ? afterQuality.negative_generation_count : 'Pending'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Suspicious Outliers (3.5×IQR)</td>
                    <td className="py-2 px-3 text-right">{beforeQuality.suspicious_outlier_count}</td>
                    <td className="py-2 px-3 text-right font-semibold">{afterQuality ? afterQuality.suspicious_outlier_count : 'Pending'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {datasetSummary.preprocessing_actions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-800 mb-1.5">Preprocessing Actions Applied:</div>
                <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                  {datasetSummary.preprocessing_actions.map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            )}

            {(afterQuality || beforeQuality).warnings.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-semibold">Data Diagnostics Warnings:</div>
                {(afterQuality || beforeQuality).warnings.map((w, i) => (
                  <div key={i}>· {w}</div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Column Mapping & Preprocessing Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Automatic Column Detection & Manual Mapping</h3>
                </div>
                <span className="text-xs text-slate-500">Leave unmapped if not in file</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLE_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {label}
                    </label>
                    <select
                      value={(mapping[key] as string) || ''}
                      onChange={(e) => updateMappingField(key, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Not Mapped --</option>
                      {datasetSummary.columns.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name} ({col.dtype}, {col.missing_count} NaN)
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Additional Environmental / Input Features */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Additional Environmental / Input Features for ML Models:
                </div>
                <div className="flex flex-wrap gap-2">
                  {datasetSummary.columns
                    .filter((c) => c.name !== mapping.timestamp_col && c.numeric_parseable_pct > 50)
                    .map((col) => {
                      const active = mapping.feature_cols.includes(col.name);
                      return (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => toggleFeatureCol(col.name)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {col.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Preprocessing & Target Selection Panel */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Preprocessing & Target Selection</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Missing Value Strategy (Causal Only)</label>
                  <select
                    value={missingStrategy}
                    onChange={(e) => setMissingStrategy(e.target.value as PreprocessRequest['missing_strategy'])}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="past_ffill">Causal Forward-Fill (Past Only, Limit 4)</option>
                    <option value="rolling_past_mean">Trailing Past Rolling Mean (4 steps)</option>
                    <option value="zero_fill_gen_past_ffill_load">Zero-Fill Gen + Causal FFill Loads</option>
                    <option value="drop_rows">Drop Rows with Missing Values</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duplicate Timestamp Handling</label>
                  <select
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as PreprocessRequest['duplicate_strategy'])}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="mean_aggregate">Aggregate Duplicates (Mean)</option>
                    <option value="keep_first">Keep First Record</option>
                    <option value="keep_last">Keep Latest Record</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clampNegGen}
                    onChange={(e) => setClampNegGen(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span>Clamp negative solar/wind generation to 0 kW</span>
                </label>

                <div className="pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-800 mb-2">Forecasting Targets to Train:</div>
                  <div className="space-y-1.5">
                    {TARGET_OPTIONS.map((t) => {
                      const unavailReason = datasetSummary.unavailable_targets_reasons?.[t.id];
                      return (
                        <div key={t.id}>
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTargets.includes(t.id)}
                              onChange={() => toggleTarget(t.id)}
                              className="accent-emerald-600"
                            />
                            <span className="font-medium">{t.label}</span>
                          </label>
                          {selectedTargets.includes(t.id) && unavailReason && (
                            <p className="text-[11px] text-amber-700 ml-5 mt-0.5">{unavailReason}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
                <button
                  onClick={handlePreprocess}
                  disabled={isPreprocessing || !mapping.timestamp_col}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white transition-colors cursor-pointer"
                >
                  {isPreprocessing ? 'Validating & Preprocessing...' : '1. Apply Mapping & Preprocess Dataset'}
                </button>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500">Test Split Ratio</label>
                    <select
                      value={testRatio}
                      onChange={(e) => setTestRatio(Number(e.target.value))}
                      className="w-full px-2 py-1 border border-slate-200 rounded bg-slate-50"
                    >
                      <option value={0.15}>85% Train / 15% Test</option>
                      <option value={0.2}>80% Train / 20% Test</option>
                      <option value={0.25}>75% Train / 25% Test</option>
                      <option value={0.3}>70% Train / 30% Test</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeEnv}
                        onChange={(e) => setIncludeEnv(e.target.checked)}
                        className="accent-emerald-600"
                      />
                      <span>Use Env. Lags</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleTrainModels}
                  disabled={isTraining || !datasetSummary.is_preprocessed}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isTraining ? 'Training & Validating ML Models...' : '2. Train & Evaluate ML Models'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Dataset Preview Table */}
          {previewRows.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900">Dataset Preview (First 12 Rows)</h3>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                  <button
                    onClick={() => activeDatasetId && loadPreview(activeDatasetId, 'raw')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                      previewSource === 'raw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Raw
                  </button>
                  <button
                    disabled={!datasetSummary.is_preprocessed}
                    onClick={() => activeDatasetId && loadPreview(activeDatasetId, 'cleaned')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer disabled:opacity-40 ${
                      previewSource === 'cleaned' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Preprocessed
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      {previewCols.map((col) => (
                        <th key={col} className="py-2 px-3 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {previewCols.map((col) => (
                          <td key={col} className="py-1.5 px-3 whitespace-nowrap text-slate-700">
                            {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Genuine Model Training & Evaluation Results */}
          {trainResult && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-base font-bold text-slate-900">
                      Chronological Model Evaluation Results
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Trained {new Date(trainResult.trained_at).toLocaleString()} · Sampling: {trainResult.sampling_frequency} · Held-out chronological test evaluation
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {Object.keys(trainResult.results).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedEvalTarget(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer border ${
                        selectedEvalTarget === t
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t.replace('_', ' ')} ({trainResult.results[t].status})
                    </button>
                  ))}
                  <button
                    onClick={() => onNavigateToTab('forecasting')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    Open Forecasting Dashboard →
                  </button>
                </div>
              </div>

              {activeTargetEval && activeTargetEval.status !== 'trained' && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>{activeTargetEval.target.toUpperCase()} ({activeTargetEval.status}): </strong>
                  {activeTargetEval.reason}
                </div>
              )}

              {activeTargetEval && activeTargetEval.status === 'trained' && (
                <div className="space-y-5">
                  {/* Genuine Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 col-span-2">
                      <div className="text-[11px] text-slate-500">Selected Best Model</div>
                      <div className="text-sm font-bold text-emerald-700 mt-0.5">{activeTargetEval.selected_model}</div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                        Train: {activeTargetEval.training_samples} · Test: {activeTargetEval.testing_samples}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">Held-out MAE</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">{activeTargetEval.mae}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">Held-out RMSE</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">{activeTargetEval.rmse}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">Safe MAPE</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {activeTargetEval.mape !== null ? `${activeTargetEval.mape}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">Held-out R²</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {activeTargetEval.r2_score !== null ? activeTargetEval.r2_score : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Model Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Candidate Model</th>
                          <th className="py-2 px-3 text-right">Test MAE</th>
                          <th className="py-2 px-3 text-right">Test RMSE</th>
                          <th className="py-2 px-3 text-right">Safe MAPE</th>
                          <th className="py-2 px-3 text-right">Test R²</th>
                          <th className="py-2 px-3 text-right">TimeSeriesCV RMSE</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {activeTargetEval.models_compared.map((m) => (
                          <tr key={m.model_name} className={m.is_selected ? 'bg-emerald-50/70' : ''}>
                            <td className="py-2 px-3 font-sans font-semibold text-slate-900">{m.model_name}</td>
                            <td className="py-2 px-3 text-right">{m.mae ?? '—'}</td>
                            <td className="py-2 px-3 text-right font-bold">{m.rmse ?? '—'}</td>
                            <td className="py-2 px-3 text-right">{m.mape !== null ? `${m.mape}%` : 'N/A'}</td>
                            <td className="py-2 px-3 text-right">{m.r2_score ?? 'N/A'}</td>
                            <td className="py-2 px-3 text-right">{m.cv_rmse_mean ?? '—'}</td>
                            <td className="py-2 px-3 text-right font-sans">
                              {m.is_selected ? (
                                <span className="font-bold text-emerald-700">Selected</span>
                              ) : (
                                <span className="text-slate-500">Evaluated</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Held-out Actual vs Predicted & Residual Chart */}
                  {activeTargetEval.test_predictions.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-800 mb-2">
                        Held-out Chronological Test Set: Actual vs Predicted & Residuals
                      </div>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={activeTargetEval.test_predictions} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="timestamp"
                              tickFormatter={(v) => String(v).slice(5, 16).replace('T', ' ')}
                              stroke="#94a3b8"
                              fontSize={10}
                            />
                            <YAxis stroke="#94a3b8" fontSize={11} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar dataKey="residual" name="Residual (Actual - Pred)" fill="#cbd5e1" />
                            <Line type="monotone" dataKey="actual" name="Actual (Test)" stroke="#475569" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="predicted" name="Model Predicted" stroke="#10b981" strokeWidth={2.5} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
