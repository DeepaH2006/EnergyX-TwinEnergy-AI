/**
 * Central API service connecting TwinEnergy AI (React) to EnergyX 2.0 Python FastAPI backend.
 */

import {
  BackendHealthResponse,
  BackendSystemInfo,
  DatasetPreviewResponse,
  DatasetSummaryResponse,
  DatasetUploadResponse,
  DigitalTwinSimulateResponse,
  ExplainAIResponse,
  OptimizationRunResponse,
  PredictResponse,
  PreprocessRequest,
  PreprocessResponse,
  RecommendationGenerateResponse,
  ScenarioAssumptions,
  ScenarioCompareResponse,
  ScenarioSimulateResponse,
  SystemComponentSpec,
  TrainResponse,
} from '../types/backend';

const DEFAULT_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '').trim().replace(/\/+$/, '');
const STORAGE_KEY = 'energyx_api_base_url';

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const cleaned = saved.trim().replace(/\/+$/, '');
      // Guard against stale localhost overrides when running on a remote HTTPS origin
      if (
        typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        (cleaned.startsWith('http://127.0.0.1') || cleaned.startsWith('http://localhost'))
      ) {
        localStorage.removeItem(STORAGE_KEY);
        return DEFAULT_BASE_URL;
      }
      return cleaned;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem(STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1${path}`;
  const displayTarget = baseUrl || `${typeof window !== 'undefined' ? window.location.origin : ''} (via /api/v1 proxy)`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(
      `FastAPI backend unreachable at ${displayTarget}. Ensure the Python server is running (${err instanceof Error ? err.message : 'network error'}).`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

export const systemApi = {
  async checkHealth(): Promise<BackendHealthResponse> {
    const res = await apiRequest<BackendHealthResponse>('/health');
    if (
  res?.status !== 'ok' ||
  !res?.service?.toLowerCase().includes('energyx')
) {
  throw new Error('Port responded, but it is not the EnergyX 2.0 FastAPI backend.');
}
    return res;
  },
  getSystemInfo(): Promise<BackendSystemInfo> {
    return apiRequest<BackendSystemInfo>('/system');
  },
};

export const datasetApi = {
  uploadDataset(file: File, onProgress?: (pct: number) => void): Promise<DatasetUploadResponse> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/v1/datasets/upload`;
    const displayTarget =
      baseUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 502 || xhr.status === 503 || xhr.status === 504) {
          reject(
            new Error(
              `FastAPI backend unreachable via ${displayTarget} (HTTP ${xhr.status}). Ensure the Python server is running.`
            )
          );
          return;
        }
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed as DatasetUploadResponse);
          } else {
            reject(new Error(parsed?.detail || `Upload failed (HTTP ${xhr.status})`));
          }
        } catch {
          reject(
            new Error(
              `Upload failed with HTTP ${xhr.status} from ${displayTarget}. Ensure the FastAPI backend is running.`
            )
          );
        }
      };
      xhr.onerror = () => {
        reject(new Error(`FastAPI backend unreachable at ${displayTarget} during file upload.`));
      };
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  },

  getSummary(datasetId: string): Promise<DatasetSummaryResponse> {
    return apiRequest<DatasetSummaryResponse>(`/datasets/${encodeURIComponent(datasetId)}/summary`);
  },

  getPreview(
    datasetId: string,
    source: 'raw' | 'cleaned' = 'cleaned',
    offset = 0,
    limit = 25
  ): Promise<DatasetPreviewResponse> {
    return apiRequest<DatasetPreviewResponse>(
      `/datasets/${encodeURIComponent(datasetId)}/preview?source=${source}&offset=${offset}&limit=${limit}`
    );
  },

  preprocess(datasetId: string, body: PreprocessRequest): Promise<PreprocessResponse> {
    return apiRequest<PreprocessResponse>(`/datasets/${encodeURIComponent(datasetId)}/preprocess`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

export const forecastApi = {
  train(params: {
    dataset_id: string;
    targets: string[];
    test_ratio?: number;
    include_environmental_features?: boolean;
  }): Promise<TrainResponse> {
    return apiRequest<TrainResponse>('/forecast/train', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  predict(params: {
    dataset_id: string;
    horizon: '24h' | '48h' | '7d';
    targets?: string[];
    model_override?: string;
  }): Promise<PredictResponse> {
    return apiRequest<PredictResponse>('/forecast/predict', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  getMetrics(datasetId: string): Promise<TrainResponse> {
    return apiRequest<TrainResponse>(`/forecast/metrics?dataset_id=${encodeURIComponent(datasetId)}`);
  },
};

export const digitalTwinApi = {
  simulate(params: {
    dataset_id: string;
    mode: 'historical' | 'predicted' | 'combined';
    system_config: SystemComponentSpec;
    wind_turbine_rated_kw?: number | null;
  }): Promise<DigitalTwinSimulateResponse> {
    return apiRequest<DigitalTwinSimulateResponse>('/digital-twin/simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

export const optimizationApi = {
  run(params: {
    dataset_id: string;
    horizon: '24h' | '48h' | '7d';
    use_source?: 'predicted' | 'historical_test';
    system_config: SystemComponentSpec;
    prioritize_cost?: boolean;
    prioritize_emissions?: boolean;
    peak_shaving_weight?: number;
  }): Promise<OptimizationRunResponse> {
    return apiRequest<OptimizationRunResponse>('/optimization/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

export const scenarioApi = {
  simulate(params: {
    dataset_id: string;
    horizon: '24h' | '48h' | '7d';
    assumptions: ScenarioAssumptions;
    base_system_config: SystemComponentSpec;
  }): Promise<ScenarioSimulateResponse> {
    return apiRequest<ScenarioSimulateResponse>('/scenarios/simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  compare(params: {
    dataset_id: string;
    horizon: '24h' | '48h' | '7d';
    base_system_config: SystemComponentSpec;
    custom_scenarios?: ScenarioAssumptions[];
  }): Promise<ScenarioCompareResponse> {
    return apiRequest<ScenarioCompareResponse>('/scenarios/compare', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

export const recommendationApi = {
  generate(params: {
    dataset_id: string;
    horizon: '24h' | '48h' | '7d';
    system_config: SystemComponentSpec;
  }): Promise<RecommendationGenerateResponse> {
    return apiRequest<RecommendationGenerateResponse>('/recommendations/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  explainAI(params: {
    question?: string;
    summary_context: Record<string, unknown>;
    user_consent: boolean;
  }): Promise<ExplainAIResponse> {
    return apiRequest<ExplainAIResponse>('/recommendations/explain-ai', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};
