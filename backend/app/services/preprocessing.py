from typing import List, Tuple
import numpy as np
import pandas as pd

from app.schemas.datasets import (
    ColumnMappingConfig,
    PreprocessRequest,
    PreprocessResponse,
)
from app.services.data_loader import (
    compute_quality_snapshot,
    get_dataset_dir,
    load_dataset_dataframe,
    load_dataset_metadata,
    save_dataset_metadata,
)
from app.services.data_validator import determine_available_targets


def preprocess_dataset(dataset_id: str, request: PreprocessRequest) -> PreprocessResponse:
    metadata = load_dataset_metadata(dataset_id)
    raw_df = load_dataset_dataframe(dataset_id, cleaned=False)
    mapping: ColumnMappingConfig = request.mapping

    before_quality = compute_quality_snapshot(raw_df, mapping)
    actions: List[str] = []
    warnings: List[str] = list(before_quality.warnings)

    df = raw_df.copy()

    # 1. Timestamp parsing & chronological sort
    ts_col = mapping.timestamp_col
    if not ts_col or ts_col not in df.columns:
        raise ValueError("A valid timestamp column must be mapped before preprocessing.")

    df[ts_col] = pd.to_datetime(df[ts_col], errors="coerce")
    invalid_ts_mask = df[ts_col].isna()
    invalid_ts_count = int(invalid_ts_mask.sum())
    if invalid_ts_count > 0:
        if invalid_ts_count > len(df) * 0.5:
            raise ValueError(
                f"Over 50% ({invalid_ts_count}/{len(df)}) of timestamps in '{ts_col}' could not be parsed. "
                "Please verify the selected timestamp column."
            )
        df = df[~invalid_ts_mask].copy()
        actions.append(f"Removed {invalid_ts_count} row(s) with unparseable timestamps in '{ts_col}'.")

    df = df.sort_values(by=ts_col, kind="mergesort").reset_index(drop=True)
    actions.append(f"Sorted {len(df)} records chronologically by '{ts_col}'.")

    # 2. Numeric coercion on all mapped numeric columns
    mapped_numeric_cols = [
        c for c in [
            mapping.solar_col,
            mapping.wind_col,
            mapping.demand_col,
            mapping.building_load_col,
            mapping.ev_load_col,
            mapping.battery_soc_col,
            mapping.battery_charge_col,
            mapping.battery_discharge_col,
            mapping.grid_import_col,
            mapping.grid_export_col,
            mapping.tariff_col,
            mapping.carbon_intensity_col,
            mapping.irradiance_col,
            mapping.wind_speed_col,
            mapping.temperature_col,
            mapping.humidity_col,
            mapping.voltage_col,
            mapping.current_col,
            *mapping.feature_cols,
        ]
        if c and c in df.columns
    ]
    mapped_numeric_cols = list(dict.fromkeys(mapped_numeric_cols))

    for col in mapped_numeric_cols:
        before_na = int(df[col].isna().sum())
        df[col] = pd.to_numeric(df[col], errors="coerce")
        after_na = int(df[col].isna().sum())
        coerced_invalid = max(0, after_na - before_na)
        if coerced_invalid > 0:
            actions.append(f"Converted {coerced_invalid} invalid non-numeric value(s) in '{col}' to NaN.")

    # 3. Handle duplicate timestamps
    dup_count = int(df[ts_col].duplicated().sum())
    if dup_count > 0:
        if request.duplicate_strategy == "keep_first":
            df = df.drop_duplicates(subset=[ts_col], keep="first").reset_index(drop=True)
            actions.append(f"Resolved {dup_count} duplicate timestamp(s) by keeping the first observation.")
        elif request.duplicate_strategy == "keep_last":
            df = df.drop_duplicates(subset=[ts_col], keep="last").reset_index(drop=True)
            actions.append(f"Resolved {dup_count} duplicate timestamp(s) by keeping the latest observation.")
        else:
            agg_dict = {}
            for col in df.columns:
                if col == ts_col:
                    continue
                if pd.api.types.is_numeric_dtype(df[col]):
                    agg_dict[col] = "mean"
                else:
                    agg_dict[col] = "first"
            df = df.groupby(ts_col, as_index=False, sort=True).agg(agg_dict)
            actions.append(f"Aggregated {dup_count} duplicate timestamp record(s) using chronological mean.")

    # 4. Clamp negative generation values if enabled (physical non-negativity)
    if request.clamp_negative_generation:
        for gen_col in [mapping.solar_col, mapping.wind_col]:
            if gen_col and gen_col in df.columns:
                neg_mask = df[gen_col] < 0
                neg_count = int(neg_mask.sum())
                if neg_count > 0:
                    df.loc[neg_mask, gen_col] = 0.0
                    actions.append(f"Clamped {neg_count} negative generation value(s) in '{gen_col}' to 0.0 kW.")

    # Clamp Battery SOC to [0, 100] if present
    if mapping.battery_soc_col and mapping.battery_soc_col in df.columns:
        soc_col = mapping.battery_soc_col
        oob = int(((df[soc_col] < 0) | (df[soc_col] > 100)).sum())
        if oob > 0:
            df[soc_col] = df[soc_col].clip(lower=0.0, upper=100.0)
            actions.append(f"Clipped {oob} out-of-bounds SOC value(s) in '{soc_col}' to [0%, 100%].")

    # 5. Strictly Causal Missing-Value Handling (NO future leakage / NO bfill / NO centered interpolation)
    cols_to_clean = [c for c in mapped_numeric_cols if c in df.columns]
    if cols_to_clean:
        missing_before_clean = int(df[cols_to_clean].isna().sum().sum())
        if missing_before_clean > 0:
            if request.missing_strategy == "drop_rows":
                rows_before = len(df)
                df = df.dropna(subset=cols_to_clean).reset_index(drop=True)
                dropped = rows_before - len(df)
                actions.append(f"Dropped {dropped} row(s) containing missing values in mapped columns.")
            elif request.missing_strategy == "rolling_past_mean":
                for col in cols_to_clean:
                    past_mean = df[col].shift(1).rolling(window=4, min_periods=1).mean()
                    df[col] = df[col].fillna(past_mean)
                # Drop leading rows that had no past history
                remaining_na = int(df[cols_to_clean].isna().sum().sum())
                if remaining_na > 0:
                    df = df.dropna(subset=cols_to_clean).reset_index(drop=True)
                actions.append(
                    "Filled missing values using strictly causal trailing rolling mean (past 4 steps only; zero future leakage)."
                )
            elif request.missing_strategy == "zero_fill_gen_past_ffill_load":
                for col in cols_to_clean:
                    if col in (mapping.solar_col, mapping.wind_col):
                        df[col] = df[col].fillna(0.0)
                    else:
                        df[col] = df[col].ffill(limit=request.max_ffill_steps)
                actions.append(
                    f"Filled missing renewable generation with 0.0 and loads via causal forward-fill (limit={request.max_ffill_steps})."
                )
            else:
                # Default: strictly causal forward-fill (past values only)
                for col in cols_to_clean:
                    df[col] = df[col].ffill(limit=request.max_ffill_steps)
                remaining_na = int(df[cols_to_clean].isna().sum().sum())
                if remaining_na > 0:
                    rows_before = len(df)
                    df = df.dropna(subset=cols_to_clean).reset_index(drop=True)
                    dropped = rows_before - len(df)
                    actions.append(
                        f"Applied causal forward-fill (limit={request.max_ffill_steps} steps, no future backfill) and removed {dropped} leading/unrecoverable row(s)."
                    )
                else:
                    actions.append(
                        f"Imputed {missing_before_clean} missing value(s) using causal forward-fill (limit={request.max_ffill_steps} steps, no future leakage)."
                    )

    if len(df) < 5:
        raise ValueError("Fewer than 5 valid records remain after preprocessing. Check column mapping or missing-value strategy.")

    # Format timestamp back cleanly to ISO string for deterministic storage
    df[ts_col] = df[ts_col].dt.strftime("%Y-%m-%dT%H:%M:%S")

    ds_dir = get_dataset_dir(dataset_id)
    df.to_csv(ds_dir / "cleaned.csv", index=False)

    after_quality = compute_quality_snapshot(df, mapping)
    available_targets, unavailable_reasons = determine_available_targets(df, mapping)

    # Validate user-requested targets against available targets
    for req_target in request.selected_targets:
        if req_target not in available_targets:
            reason = unavailable_reasons.get(req_target, f"Target '{req_target}' cannot be modeled with current mapping.")
            warnings.append(f"Target '{req_target}' unavailable: {reason}")

    metadata["is_preprocessed"] = True
    metadata["mapping"] = mapping.model_dump()
    metadata["raw_quality"] = before_quality.model_dump()
    metadata["cleaned_quality"] = after_quality.model_dump()
    metadata["preprocessing_actions"] = actions
    metadata["available_targets"] = available_targets
    metadata["unavailable_targets_reasons"] = unavailable_reasons
    save_dataset_metadata(dataset_id, metadata)

    preview = df.head(15).replace({np.nan: None}).to_dict(orient="records")

    return PreprocessResponse(
        dataset_id=dataset_id,
        status="preprocessed",
        before_quality=before_quality,
        after_quality=after_quality,
        actions_taken=actions,
        warnings=list(dict.fromkeys(warnings + after_quality.warnings)),
        available_targets=available_targets,
        unavailable_targets_reasons=unavailable_reasons,
        mapping=mapping,
        preview_rows=preview,
    )
