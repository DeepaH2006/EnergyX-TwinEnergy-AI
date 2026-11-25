# EnergyX 2.0 — TwinEnergy AI

**AI-Powered Renewable Energy Forecasting, Physics-Informed Digital Twin & MILP Optimization Platform**

Built for **KPIT Sparkle 2026–27** (Category: Energy — AI Systems + Simulation / Digital Twin), **EnergyX 2.0** upgrades the original TwinEnergy AI frontend prototype with a full **Python FastAPI** backend providing causal time-series preprocessing, chronological ML benchmarking, energy-conserving Digital Twin simulation, SciPy HiGHS Mixed-Integer Linear Programming (MILP) optimization, counterfactual What-If testing, and auditable decision support.

---

## Architecture & Strict Data-Mode Separation

The platform enforces complete separation between real uploaded data and synthetic demonstration data:

1. **Mode A — Dataset Mode (`DATA SOURCE: USER-UPLOADED DATASET`)**
   - Upload real `.csv`, `.xlsx`, or `.xls` time-series files (up to 25 MB).
   - Auto-detect column roles (timestamp, solar, wind, demand, building/EV loads, battery SOC, grid flows, tariff, carbon intensity, weather) with full manual mapping overrides.
   - Apply **strictly causal preprocessing** (chronological sorting, duplicate resolution, negative generation clamping, past-only `ffill` / causal rolling mean — zero future leakage).
   - Train & compare chronological ML models (`Persistence Baseline`, `Seasonal Naive (24h)`, `Ridge Regression`, `Random Forest`, `HistGradientBoosting`, optional `XGBoost`) with `TimeSeriesSplit` CV and held-out test metrics (`MAE`, `RMSE`, safe `MAPE`, `R²`).
   - Run recursive multi-step forecasting (`24h`, `48h`, `7d`) with empirical residual uncertainty intervals.
   - Simulate a physics-conserving Digital Twin, solve MILP optimal dispatch via **SciPy HiGHS**, run What-If counterfactual scenarios, compare strategies over identical windows, and generate data-driven recommendations (with optional opt-in Gemini natural-language summary).

2. **Mode B — Demonstration Mode (`DATA SOURCE: SYNTHETIC DEMONSTRATION DATA`)**
   - Preserves the original 24-hour interactive KPIT Sparkle synthetic microgrid simulator, 4-pillar overview, guided demo tour, and 60-second time scrubber so the UI can always be explored offline without uploading a file.

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/routes/          # FastAPI endpoints (/api/v1/*)
│   │   ├── core/config.py       # Settings (upload limits, CORS, optional GEMINI_API_KEY)
│   │   ├── schemas/             # Pydantic request/response contracts
│   │   ├── services/            # data_loader, preprocessing, feature_engineering,
│   │   │                        # model_training, forecasting, digital_twin,
│   │   │                        # optimization (SciPy MILP), scenario_engine, recommendation_engine
│   │   └── main.py              # FastAPI application entrypoint
│   ├── tests/
│   │   └── test_end_to_end.py   # End-to-end pytest suite covering all 9 dataset scenarios
│   └── requirements.txt
├── public/
│   └── sample_microgrid_synthetic.csv   # 168-hour synthetic sample dataset for testing Dataset Mode
├── src/
│   ├── components/              # React/TypeScript dual-mode modules
│   ├── services/
│   │   ├── api.ts               # Central FastAPI HTTP client
│   │   └── ...                  # Preserved Demo Mode simulation engines
│   ├── types/
│   │   ├── backend.ts           # TypeScript contracts matching FastAPI schemas
│   │   └── energy.ts            # Demo Mode types
│   └── App.tsx
├── .env.example
└── package.json
```

---

## Installation & Running Locally

### 1. Install Python Backend & Node Frontend Dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
npm install
```

### 2. Start Unified Dev Environment (FastAPI + Vite on Port 3000)

```bash
npm run dev
```

This launches Python FastAPI (`127.0.0.1:8001`) alongside Vite (`0.0.0.0:3000`) with `/api/v1` reverse-proxying enabled so dataset uploads and health checks work out of the box without CORS or localhost mismatch.

If you prefer running FastAPI separately on port `8000`:

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Then set `VITE_API_BASE_URL=http://127.0.0.1:8000` in `.env` (or enter it in the **Dataset & Training** connection panel) and run `npm run dev:frontend`.

---

## Testing

### Backend End-to-End Test Suite (Pytest)

Covers health/system info plus 9 dataset scenarios: valid CSV full pipeline, valid `.xlsx` upload, missing-value causal imputation, duplicate timestamps, irregular intervals, insufficient rows (`< 20`), arbitrary renamed columns with manual mapping, solar-only datasets, multivariable datasets without tariff/carbon, and MILP infeasibility diagnostics:

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest -v tests/test_end_to_end.py
```

### Frontend Typecheck & Production Build

```bash
npm run lint
npm run build
```

---

## REST API Endpoints (`/api/v1`)

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health, SciPy solver & scikit-learn availability |
| `GET` | `/api/v1/system` | Supported formats, models, default system specs, active datasets |
| `POST` | `/api/v1/datasets/upload` | Multipart `.csv`/`.xlsx`/`.xls` upload, profiling & column auto-detection |
| `GET` | `/api/v1/datasets/{id}/summary` | Dataset quality snapshots, target availability & unavailability reasons |
| `GET` | `/api/v1/datasets/{id}/preview` | Paginated raw or cleaned dataset table preview |
| `POST` | `/api/v1/datasets/{id}/preprocess` | Causal preprocessing, deduplication & bounds validation |
| `POST` | `/api/v1/forecast/train` | Chronological 80/20 ML training, CV, model selection & test metrics |
| `POST` | `/api/v1/forecast/predict` | Recursive `24h` / `48h` / `7d` multi-step forecast + uncertainty bands |
| `GET` | `/api/v1/forecast/metrics` | Retrieve saved training metrics and feature importances |
| `POST` | `/api/v1/digital-twin/simulate` | Physics-conserving nodal simulation over history and/or forecast |
| `POST` | `/api/v1/optimization/run` | SciPy HiGHS MILP dispatch optimization + baseline benchmark |
| `POST` | `/api/v1/scenarios/simulate` | Counterfactual What-If simulation and MILP re-optimization |
| `POST` | `/api/v1/scenarios/compare` | Identical-window comparison of Baseline, Reactive, Optimized & What-If |
| `POST` | `/api/v1/recommendations/generate` | Data-driven actionable recommendations with supporting evidence |
| `POST` | `/api/v1/recommendations/explain-ai` | Optional opt-in Gemini natural-language summary (aggregated KPIs only) |

---

## Sample Synthetic Dataset

A 168-row (7-day hourly) synthetic sample file is included at `/public/sample_microgrid_synthetic.csv` (accessible via the **Download Sample CSV** button in **Dataset & Training**) containing:
`timestamp`, `solar_kw`, `wind_kw`, `demand_kw`, `building_load_kw`, `ev_load_kw`, `battery_soc_pct`, `irradiance_wm2`, `wind_speed_ms`, `temperature_c`, and `tariff_inr_kwh`.

---

## Engineering Safeguards & Limitations

- **Zero Fabrication**: Tariff costs and CO₂ emissions return `null` (`N/A` in UI) when not supplied in the dataset or explicitly configured by the user. Model accuracy metrics are never computed or invented when records are below minimum chronological sample thresholds (`< 20` rows).
- **Zero Future Leakage**: Preprocessing and lag/rolling feature engineering strictly operate on past intervals (`shift(1)` / forward fill only).
- **Local Persistence**: Uploaded datasets and trained model artifacts are stored per `dataset_id` under `backend/uploads/`.
