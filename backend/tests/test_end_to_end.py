import io
import math
from datetime import datetime, timedelta
from typing import Dict, List

import openpyxl
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_synthetic_rows(
    n_rows: int = 120,
    start_str: str = "2026-01-01 00:00:00",
    freq_minutes: int = 60,
    solar_col: str = "solar_kw",
    wind_col: str = "wind_kw",
    demand_col: str = "demand_kw",
    ts_col: str = "timestamp",
    include_wind: bool = True,
    include_demand: bool = True,
    include_tariff: bool = True,
    include_carbon: bool = True,
    inject_missing: bool = False,
    inject_duplicates: bool = False,
    irregular_gaps: bool = False,
) -> pd.DataFrame:
    start = datetime.strptime(start_str, "%Y-%m-%d %H:%M:%S")
    records: List[Dict[str, object]] = []
    for i in range(n_rows):
        offset_min = i * freq_minutes
        if irregular_gaps and i in (15, 40, 75):
            offset_min += 37  # break regular interval cadence
        ts = start + timedelta(minutes=offset_min)
        hr = ts.hour
        solar = round(max(0.0, 300.0 * math.sin(math.pi * (hr - 6) / 12.0)), 2) if 6 <= hr <= 18 else 0.0
        wind = round(65.0 + 30.0 * math.sin(i / 6.0), 2)
        demand = round(180.0 + 70.0 * math.sin((hr - 8) / 4.0) + 15.0 * math.cos(i / 5.0), 2)
        row: Dict[str, object] = {
            ts_col: ts.strftime("%Y-%m-%d %H:%M:%S"),
            solar_col: solar,
            "irradiance_wm2": round(solar * 2.8, 1),
            "temperature_c": round(24.0 + 6.0 * math.sin(hr / 4.0), 1),
        }
        if include_wind:
            row[wind_col] = wind
            row["wind_speed_ms"] = round(3.0 + wind / 20.0, 2)
        if include_demand:
            row[demand_col] = demand
        if include_tariff:
            row["tariff_inr_kwh"] = 9.2 if 17 <= hr <= 22 else 6.4
        if include_carbon:
            row["carbon_g_kwh"] = 680.0 if 18 <= hr <= 22 else 520.0

        if inject_missing and i in (5, 6, 22, 48, 80):
            row[solar_col] = None
            if include_demand:
                row[demand_col] = None

        records.append(row)
        if inject_duplicates and i in (10, 30):
            dup = dict(row)
            dup[solar_col] = (solar or 0.0) + 10.0
            records.append(dup)

    return pd.DataFrame(records)


def df_to_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False).encode("utf-8")


def df_to_xlsx_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Telemetry")
    return buf.getvalue()


def test_health_and_system():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "EnergyX" in body["service"]
    assert body["solver_available"] is True
    assert body["ml_engine_available"] is True

    s = client.get("/api/v1/system")
    assert s.status_code == 200
    assert "SciPy HiGHS" in s.json()["optimization_solver"]


def test_scenario_1_valid_csv_full_pipeline():
    df = make_synthetic_rows(n_rows=140)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("microgrid_valid.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    up_data = up.json()
    ds_id = up_data["dataset_id"]
    assert up_data["record_count"] == 140
    assert up_data["data_quality_status"] == "good"
    assert up_data["suggested_mapping"]["solar_col"] == "solar_kw"
    assert up_data["suggested_mapping"]["wind_col"] == "wind_kw"
    assert up_data["suggested_mapping"]["demand_col"] == "demand_kw"

    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={
            "mapping": up_data["suggested_mapping"],
            "missing_strategy": "past_ffill",
            "duplicate_strategy": "mean_aggregate",
            "clamp_negative_generation": True,
            "max_ffill_steps": 4,
            "selected_targets": ["solar", "wind", "demand"],
        },
    )
    assert prep.status_code == 200
    assert set(["solar", "wind", "demand", "total_renewable"]).issubset(set(prep.json()["available_targets"]))

    train = client.post(
        "/api/v1/forecast/train",
        json={"dataset_id": ds_id, "targets": ["solar", "wind", "demand"], "test_ratio": 0.2, "include_environmental_features": True},
    )
    assert train.status_code == 200
    tdata = train.json()
    assert tdata["overall_status"] == "trained"
    for t in ("solar", "wind", "demand"):
        res = tdata["results"][t]
        assert res["status"] == "trained"
        assert res["mae"] is not None
        assert res["rmse"] is not None
        assert len(res["models_compared"]) >= 5
        assert len(res["test_predictions"]) > 0

    pred = client.post(
        "/api/v1/forecast/predict",
        json={"dataset_id": ds_id, "horizon": "24h", "targets": ["solar", "wind", "demand"]},
    )
    assert pred.status_code == 200
    pdata = pred.json()
    future_pts = [p for p in pdata["combined_series"] if p["is_future"]]
    assert len(future_pts) == 24

    twin = client.post(
        "/api/v1/digital-twin/simulate",
        json={"dataset_id": ds_id, "mode": "combined", "system_config": {"battery_capacity_kwh": 500, "initial_soc_pct": 60}},
    )
    assert twin.status_code == 200
    twin_data = twin.json()
    assert twin_data["latest_historical_state"] is not None
    assert twin_data["latest_predicted_state"] is not None
    # Verify energy conservation balance residual is near zero on all steps
    max_res = max(abs(step["energy_balance_residual_kw"]) for step in twin_data["timeline"])
    assert max_res < 0.05

    opt = client.post(
        "/api/v1/optimization/run",
        json={"dataset_id": ds_id, "horizon": "24h", "use_source": "predicted", "system_config": {"battery_capacity_kwh": 500, "initial_soc_pct": 60, "grid_max_import_kw": 450}},
    )
    assert opt.status_code == 200
    odata = opt.json()
    assert odata["solver_status"] == "optimal"
    assert len(odata["schedule"]) == 24
    assert odata["optimized_summary"]["tariff_available"] is True
    assert odata["optimized_summary"]["carbon_data_available"] is True
    assert all(chk["satisfied"] for chk in odata["constraints_validation"])

    sim = client.post(
        "/api/v1/scenarios/simulate",
        json={
            "dataset_id": ds_id,
            "horizon": "24h",
            "assumptions": {
                "name": "Low Solar Cloud Event",
                "solar_pct": 40.0,
                "wind_pct": 100.0,
                "demand_pct": 120.0,
                "renewable_availability_pct": 100.0,
                "battery_capacity_kwh": 500.0,
                "initial_soc_pct": 50.0,
                "grid_import_limit_kw": 450.0,
                "grid_export_limit_kw": 250.0,
            },
            "base_system_config": {"battery_capacity_kwh": 500},
        },
    )
    assert sim.status_code == 200
    assert sim.json()["solver_status"] == "optimal"

    cmp_res = client.post(
        "/api/v1/scenarios/compare",
        json={"dataset_id": ds_id, "horizon": "24h", "base_system_config": {"battery_capacity_kwh": 500}},
    )
    assert cmp_res.status_code == 200
    assert len(cmp_res.json()["rows"]) >= 4

    rec = client.post(
        "/api/v1/recommendations/generate",
        json={"dataset_id": ds_id, "horizon": "24h", "system_config": {"battery_capacity_kwh": 500}},
    )
    assert rec.status_code == 200
    assert len(rec.json()["recommendations"]) >= 1

    # Opt-in consent disabled check
    ai_disabled = client.post(
        "/api/v1/recommendations/explain-ai",
        json={"summary_context": rec.json()["system_context_summary"], "user_consent": False},
    )
    assert ai_disabled.status_code == 200
    assert ai_disabled.json()["status"] == "disabled"


def test_scenario_2_valid_excel_dataset():
    df = make_synthetic_rows(n_rows=72)
    up = client.post(
        "/api/v1/datasets/upload",
        files={
            "file": (
                "microgrid.xlsx",
                df_to_xlsx_bytes(df),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    assert up.json()["record_count"] == 72

    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={"mapping": up.json()["suggested_mapping"], "missing_strategy": "past_ffill", "duplicate_strategy": "mean_aggregate"},
    )
    assert prep.status_code == 200
    train = client.post("/api/v1/forecast/train", json={"dataset_id": ds_id, "targets": ["solar"]})
    assert train.status_code == 200
    assert train.json()["results"]["solar"]["status"] == "trained"


def test_scenario_3_missing_values_causal_handling():
    df = make_synthetic_rows(n_rows=85, inject_missing=True)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("missing.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    assert up.json()["missing_value_count"] >= 10
    ds_id = up.json()["dataset_id"]

    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={
            "mapping": up.json()["suggested_mapping"],
            "missing_strategy": "past_ffill",
            "duplicate_strategy": "mean_aggregate",
            "max_ffill_steps": 4,
        },
    )
    assert prep.status_code == 200
    pdata = prep.json()
    assert pdata["before_quality"]["missing_value_count"] >= 10
    assert pdata["after_quality"]["missing_value_count"] == 0


def test_scenario_4_duplicate_timestamps():
    df = make_synthetic_rows(n_rows=60, inject_duplicates=True)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("dups.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    assert up.json()["duplicate_record_count"] == 2
    ds_id = up.json()["dataset_id"]

    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={"mapping": up.json()["suggested_mapping"], "duplicate_strategy": "mean_aggregate"},
    )
    assert prep.status_code == 200
    assert prep.json()["after_quality"]["duplicate_timestamp_count"] == 0
    assert prep.json()["after_quality"]["record_count"] == 60


def test_scenario_5_irregular_intervals():
    df = make_synthetic_rows(n_rows=72, irregular_gaps=True)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("irregular.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    summary = client.get(f"/api/v1/datasets/{ds_id}/summary").json()
    assert summary["raw_quality"]["is_regular_interval"] is False
    assert summary["raw_quality"]["irregular_interval_count"] >= 3
    assert any("irregular" in w.lower() for w in summary["raw_quality"]["warnings"])


def test_scenario_6_insufficient_records():
    df = make_synthetic_rows(n_rows=12)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("tiny.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    client.post(f"/api/v1/datasets/{ds_id}/preprocess", json={"mapping": up.json()["suggested_mapping"]})

    train = client.post("/api/v1/forecast/train", json={"dataset_id": ds_id, "targets": ["solar"]})
    assert train.status_code == 200
    res = train.json()["results"]["solar"]
    assert res["status"] == "insufficient_data"
    assert res["mae"] is None
    assert res["r2_score"] is None


def test_scenario_7_arbitrary_renamed_columns_manual_mapping():
    df = make_synthetic_rows(
        n_rows=80,
        ts_col="recorded_at_iso",
        solar_col="gen_col_alpha",
        wind_col="gen_col_beta",
        demand_col="facility_draw_x",
    )
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("custom_cols.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    # Explicitly supply manual mapping overrides
    manual_mapping = {
        "timestamp_col": "recorded_at_iso",
        "solar_col": "gen_col_alpha",
        "wind_col": "gen_col_beta",
        "demand_col": "facility_draw_x",
        "irradiance_col": "irradiance_wm2",
        "temperature_col": "temperature_c",
        "feature_cols": [],
    }
    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={"mapping": manual_mapping, "missing_strategy": "past_ffill", "duplicate_strategy": "mean_aggregate"},
    )
    assert prep.status_code == 200
    assert "solar" in prep.json()["available_targets"]
    assert "wind" in prep.json()["available_targets"]
    assert "demand" in prep.json()["available_targets"]

    train = client.post("/api/v1/forecast/train", json={"dataset_id": ds_id, "targets": ["solar", "demand"]})
    assert train.status_code == 200
    assert train.json()["results"]["solar"]["status"] == "trained"
    assert train.json()["results"]["demand"]["status"] == "trained"


def test_scenario_8_solar_only_dataset():
    df = make_synthetic_rows(n_rows=80, include_wind=False, include_demand=False, include_tariff=False, include_carbon=False)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("solar_only.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    prep = client.post(
        f"/api/v1/datasets/{ds_id}/preprocess",
        json={"mapping": up.json()["suggested_mapping"]},
    )
    assert prep.status_code == 200
    pdata = prep.json()
    assert "solar" in pdata["available_targets"]
    assert "wind" in pdata["unavailable_targets_reasons"]
    assert "demand" in pdata["unavailable_targets_reasons"]

    train = client.post("/api/v1/forecast/train", json={"dataset_id": ds_id, "targets": ["solar", "wind", "demand"]})
    assert train.status_code == 200
    assert train.json()["results"]["solar"]["status"] == "trained"
    assert train.json()["results"]["wind"]["status"] == "unavailable"
    assert train.json()["results"]["demand"]["status"] == "unavailable"


def test_scenario_9_multivariable_and_infeasibility_diagnostics():
    df = make_synthetic_rows(n_rows=100, include_tariff=False, include_carbon=False)
    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("multi_no_tariff.csv", df_to_csv_bytes(df), "text/csv")},
    )
    assert up.status_code == 200
    ds_id = up.json()["dataset_id"]
    client.post(f"/api/v1/datasets/{ds_id}/preprocess", json={"mapping": up.json()["suggested_mapping"]})
    client.post("/api/v1/forecast/train", json={"dataset_id": ds_id, "targets": ["solar", "wind", "demand"]})
    client.post("/api/v1/forecast/predict", json={"dataset_id": ds_id, "horizon": "24h"})

    # Check that without tariff/carbon columns and without configured defaults, cost & emissions stay null (never fabricated)
    opt_ok = client.post(
        "/api/v1/optimization/run",
        json={"dataset_id": ds_id, "horizon": "24h", "system_config": {"battery_capacity_kwh": 500, "grid_max_import_kw": 450}},
    )
    assert opt_ok.status_code == 200
    assert opt_ok.json()["solver_status"] == "optimal"
    assert opt_ok.json()["optimized_summary"]["tariff_available"] is False
    assert opt_ok.json()["optimized_summary"]["total_cost"] is None
    assert opt_ok.json()["optimized_summary"]["carbon_data_available"] is False
    assert opt_ok.json()["optimized_summary"]["total_emissions_kg"] is None

    # Force strict grid zero import & tiny battery with strict_demand -> infeasible diagnostics should fire cleanly
    opt_infeasible = client.post(
        "/api/v1/optimization/run",
        json={
            "dataset_id": ds_id,
            "horizon": "24h",
            "strict_demand": True,
            "system_config": {
                "battery_capacity_kwh": 10,
                "battery_max_discharge_kw": 0,
                "grid_max_import_kw": 0,
            },
        },
    )
    assert opt_infeasible.status_code == 200
    inf_body = opt_infeasible.json()
    assert inf_body["solver_status"] == "infeasible"
    assert len(inf_body["infeasibility_reasons"]) >= 1
