/**
 * TypeScript contracts matching the EnergyX 2.0 Python FastAPI backend schemas.
 */

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  solver_available: boolean;
  ml_engine_available: boolean;
  timestamp: string;
}

export interface SystemComponentSpec {
  solar_rated_kw?: number | null;
  wind_rated_kw?: number | null;
  battery_capacity_kwh: number;
  battery_max_charge_kw: number;
  battery_max_discharge_kw: number;
  battery_charge_efficiency: number;
  battery_discharge_efficiency: number;
  battery_min_soc_pct: number;
  battery_max_soc_pct: number;
  initial_soc_pct: number;
  grid_max_import_kw: number;
  grid_max_export_kw: number;
  distribution_loss_pct: number;
  tariff_per_kwh?: number | null;
  carbon_intensity_g_per_kwh?: number | null;
}

export interface BackendSystemInfo {
  service_name: string;
  version: string;
  supported_formats: string[];
  max_upload_mb: number;
  available_models: string[];
  optimization_solver: string;
  default_system_config: SystemComponentSpec;
  active_datasets_count: number;
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  missing_count: number;
  missing_pct: number;
  numeric_parseable_pct: number;
  min_val: number | null;
  max_val: number | null;
  mean_val: number | null;
  detected_role: string | null;
  confidence: number;
  sample_values: unknown[];
}

export interface ColumnMappingConfig {
  timestamp_col?: string | null;
  solar_col?: string | null;
  wind_col?: string | null;
  demand_col?: string | null;
  building_load_col?: string | null;
  ev_load_col?: string | null;
  battery_soc_col?: string | null;
  battery_charge_col?: string | null;
  battery_discharge_col?: string | null;
  grid_import_col?: string | null;
  grid_export_col?: string | null;
  tariff_col?: string | null;
  carbon_intensity_col?: string | null;
  irradiance_col?: string | null;
  wind_speed_col?: string | null;
  temperature_col?: string | null;
  humidity_col?: string | null;
  voltage_col?: string | null;
  current_col?: string | null;
  feature_cols: string[];
}

export interface DataQualitySnapshot {
  record_count: number;
  column_count: number;
  date_range_start: string | null;
  date_range_end: string | null;
  detected_frequency: string;
  detected_interval_minutes: number | null;
  is_regular_interval: boolean;
  irregular_interval_count: number;
  missing_value_count: number;
  duplicate_timestamp_count: number;
  invalid_numeric_count: number;
  suspicious_outlier_count: number;
  negative_generation_count: number;
  data_quality_status: 'good' | 'warning' | 'critical';
  warnings: string[];
}

export interface DatasetUploadResponse {
  dataset_id: string;
  filename: string;
  file_size_bytes: number;
  record_count: number;
  column_count: number;
  date_range_start: string | null;
  date_range_end: string | null;
  detected_frequency: string;
  detected_interval_minutes: number | null;
  missing_value_count: number;
  duplicate_record_count: number;
  data_quality_status: 'good' | 'warning' | 'critical';
  suggested_mapping: ColumnMappingConfig;
  columns: ColumnProfile[];
  preview_rows: Record<string, unknown>[];
  warnings: string[];
}

export interface DatasetSummaryResponse {
  dataset_id: string;
  filename: string;
  file_size_bytes: number;
  is_preprocessed: boolean;
  mapping: ColumnMappingConfig;
  raw_quality: DataQualitySnapshot;
  cleaned_quality: DataQualitySnapshot | null;
  columns: ColumnProfile[];
  preprocessing_actions: string[];
  available_targets: string[];
  unavailable_targets_reasons: Record<string, string>;
}

export interface DatasetPreviewResponse {
  dataset_id: string;
  source: 'raw' | 'cleaned';
  total_rows: number;
  offset: number;
  limit: number;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface PreprocessRequest {
  mapping: ColumnMappingConfig;
  missing_strategy: 'past_ffill' | 'rolling_past_mean' | 'zero_fill_gen_past_ffill_load' | 'drop_rows';
  duplicate_strategy: 'keep_first' | 'keep_last' | 'mean_aggregate';
  clamp_negative_generation: boolean;
  max_ffill_steps: number;
  selected_targets: string[];
}

export interface PreprocessResponse {
  dataset_id: string;
  status: string;
  before_quality: DataQualitySnapshot;
  after_quality: DataQualitySnapshot;
  actions_taken: string[];
  warnings: string[];
  available_targets: string[];
  unavailable_targets_reasons: Record<string, string>;
  mapping: ColumnMappingConfig;
  preview_rows: Record<string, unknown>[];
}

export interface ModelEvaluationResult {
  model_name: string;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  mape_note: string | null;
  r2_score: number | null;
  r2_note: string | null;
  cv_rmse_mean: number | null;
  is_selected: boolean;
}

export interface TestPredictionPoint {
  timestamp: string;
  actual: number;
  predicted: number;
  residual: number;
}

export interface TargetTrainingResult {
  target: string;
  status: 'trained' | 'insufficient_data' | 'unavailable' | 'failed';
  reason: string | null;
  total_samples: number;
  training_samples: number;
  testing_samples: number;
  split_ratio: number;
  selected_model: string | null;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  mape_note: string | null;
  r2_score: number | null;
  r2_note: string | null;
  residual_std: number | null;
  models_compared: ModelEvaluationResult[];
  feature_importances: { feature: string; importance: number }[];
  features_used: string[];
  test_predictions: TestPredictionPoint[];
  warnings: string[];
}

export interface TrainResponse {
  dataset_id: string;
  trained_at: string;
  overall_status: string;
  sampling_frequency: string;
  interval_minutes: number;
  results: Record<string, TargetTrainingResult>;
}

export interface CombinedForecastPoint {
  timestamp: string;
  is_future: boolean;
  solar_actual?: number | null;
  solar_predicted?: number | null;
  solar_low?: number | null;
  solar_high?: number | null;
  wind_actual?: number | null;
  wind_predicted?: number | null;
  wind_low?: number | null;
  wind_high?: number | null;
  demand_actual?: number | null;
  demand_predicted?: number | null;
  demand_low?: number | null;
  demand_high?: number | null;
  total_renewable_predicted?: number | null;
  expected_net_balance_kw?: number | null;
}

export interface PredictResponse {
  dataset_id: string;
  generated_at: string;
  horizon: '24h' | '48h' | '7d';
  interval_minutes: number;
  models_used: Record<string, string>;
  uncertainty_method: string;
  combined_series: CombinedForecastPoint[];
  summary: Record<string, number>;
  warnings: string[];
}

export interface DigitalTwinStep {
  timestamp: string;
  data_origin: 'historical_dataset' | 'ml_prediction';
  solar_kw: number;
  wind_kw: number;
  total_renewable_kw: number;
  demand_kw: number;
  battery_power_kw: number;
  battery_soc_pct: number;
  battery_energy_kwh: number;
  grid_import_kw: number;
  grid_export_kw: number;
  curtailment_kw: number;
  shortage_kw: number;
  losses_kw: number;
  energy_balance_residual_kw: number;
  renewable_utilization_pct: number;
  grid_dependency_pct: number;
}

export interface DigitalTwinAlert {
  severity: 'info' | 'warning' | 'critical';
  component: string;
  timestamp: string;
  message: string;
}

export interface DigitalTwinSimulateResponse {
  dataset_id: string;
  data_source_label: string;
  interval_minutes: number;
  latest_historical_state: DigitalTwinStep | null;
  latest_predicted_state: DigitalTwinStep | null;
  timeline: DigitalTwinStep[];
  summary: Record<string, number>;
  alerts: DigitalTwinAlert[];
  assumptions_used: string[];
}

export interface OptimizationSchedulePoint {
  timestamp: string;
  solar_kw: number;
  wind_kw: number;
  total_renewable_kw: number;
  demand_kw: number;
  solar_to_load_kw: number;
  wind_to_load_kw: number;
  battery_charge_kw: number;
  battery_discharge_kw: number;
  battery_net_kw: number;
  battery_soc_pct: number;
  grid_import_kw: number;
  grid_export_kw: number;
  curtailment_kw: number;
  shortage_kw: number;
  losses_kw: number;
  interval_cost: number | null;
  interval_emissions_kg: number | null;
}

export interface OptimizationMetricsSummary {
  total_renewable_kwh: number;
  total_demand_kwh: number;
  renewable_used_kwh: number;
  renewable_utilization_pct: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  grid_dependency_pct: number;
  energy_shortage_kwh: number;
  energy_curtailed_kwh: number;
  battery_throughput_kwh: number;
  peak_grid_import_kw: number;
  total_cost: number | null;
  total_emissions_kg: number | null;
  tariff_available: boolean;
  carbon_data_available: boolean;
}

export interface OptimizationRunResponse {
  dataset_id: string;
  solver_status: 'optimal' | 'infeasible' | 'error' | 'unavailable';
  solver_name: string;
  objective_value: number | null;
  infeasibility_reasons: string[];
  interval_minutes: number;
  schedule: OptimizationSchedulePoint[];
  optimized_summary: OptimizationMetricsSummary | null;
  baseline_summary: OptimizationMetricsSummary | null;
  comparison_deltas: Record<string, number | null>;
  constraints_validation: { name: string; satisfied: boolean; detail: string }[];
  warnings: string[];
}

export interface ScenarioAssumptions {
  name: string;
  description: string;
  solar_pct: number;
  wind_pct: number;
  demand_pct: number;
  renewable_availability_pct: number;
  battery_capacity_kwh: number;
  initial_soc_pct: number;
  grid_import_limit_kw: number;
  grid_export_limit_kw: number;
}

export interface ScenarioSimulateResponse {
  dataset_id: string;
  scenario_name: string;
  assumptions: ScenarioAssumptions;
  solver_status: string;
  infeasibility_reasons: string[];
  summary: OptimizationMetricsSummary | null;
  baseline_reference: OptimizationMetricsSummary | null;
  schedule: OptimizationSchedulePoint[];
  deltas_vs_baseline: Record<string, number | null>;
}

export interface ScenarioComparisonRow {
  scenario_id: string;
  scenario_name: string;
  category: 'baseline' | 'forecast_based' | 'optimized' | 'what_if';
  assumptions_summary: string;
  solver_status: string;
  renewable_utilization_pct: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  energy_shortage_kwh: number;
  battery_utilization_kwh: number;
  energy_wastage_kwh: number;
  peak_grid_import_kw: number;
  operating_cost: number | null;
  delta_grid_import_pct_vs_baseline: number | null;
  delta_renewable_util_pct_vs_baseline: number | null;
}

export interface ScenarioCompareResponse {
  dataset_id: string;
  horizon: string;
  time_period_start: string;
  time_period_end: string;
  tariff_available: boolean;
  rows: ScenarioComparisonRow[];
  notes: string[];
}

export interface BackendRecommendationItem {
  id: string;
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  supporting_data: string;
  expected_operational_benefit: string;
  relevant_time_period: string;
  rejected_alternatives: string[];
}

export interface RecommendationGenerateResponse {
  dataset_id: string;
  generated_at: string;
  recommendations: BackendRecommendationItem[];
  system_context_summary: Record<string, number | null>;
  warnings: string[];
}

export interface ExplainAIResponse {
  status: 'success' | 'disabled' | 'unavailable' | 'error';
  explanation: string;
  grounded_metrics_used: Record<string, unknown>;
}
