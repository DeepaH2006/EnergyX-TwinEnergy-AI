from typing import Dict, List, Tuple
import pandas as pd

from app.schemas.datasets import ColumnMappingConfig


def determine_available_targets(
    df: pd.DataFrame, mapping: ColumnMappingConfig
) -> Tuple[List[str], Dict[str, str]]:
    available: List[str] = []
    unavailable_reasons: Dict[str, str] = {}

    if not mapping.timestamp_col or mapping.timestamp_col not in df.columns:
        msg = "Timestamp column is not mapped or missing from dataset."
        return [], {
            "solar": msg,
            "wind": msg,
            "total_renewable": msg,
            "demand": msg,
            "grid_import": msg,
        }

    # Check Solar
    if mapping.solar_col and mapping.solar_col in df.columns:
        valid_count = int(pd.to_numeric(df[mapping.solar_col], errors="coerce").notna().sum())
        if valid_count >= 12:
            available.append("solar")
        else:
            unavailable_reasons["solar"] = f"Mapped solar column '{mapping.solar_col}' has only {valid_count} valid numeric points (need >= 12)."
    else:
        unavailable_reasons["solar"] = "No solar generation column mapped in this dataset."

    # Check Wind
    if mapping.wind_col and mapping.wind_col in df.columns:
        valid_count = int(pd.to_numeric(df[mapping.wind_col], errors="coerce").notna().sum())
        if valid_count >= 12:
            available.append("wind")
        else:
            unavailable_reasons["wind"] = f"Mapped wind column '{mapping.wind_col}' has only {valid_count} valid numeric points (need >= 12)."
    else:
        unavailable_reasons["wind"] = "No wind generation column mapped in this dataset."

    # Check Total Renewable
    if "solar" in available or "wind" in available:
        available.append("total_renewable")
    else:
        unavailable_reasons["total_renewable"] = "Neither solar nor wind generation is available to compute total renewable generation."

    # Check Demand (either demand_col OR building + ev)
    has_direct_demand = mapping.demand_col and mapping.demand_col in df.columns
    has_bldg = mapping.building_load_col and mapping.building_load_col in df.columns
    has_ev = mapping.ev_load_col and mapping.ev_load_col in df.columns

    if has_direct_demand:
        valid_count = int(pd.to_numeric(df[mapping.demand_col], errors="coerce").notna().sum())
        if valid_count >= 12:
            available.append("demand")
        else:
            unavailable_reasons["demand"] = f"Mapped demand column '{mapping.demand_col}' has only {valid_count} valid numeric points."
    elif has_bldg or has_ev:
        available.append("demand")
    else:
        unavailable_reasons["demand"] = "No energy demand / load column mapped in this dataset."

    # Check Grid Import
    if mapping.grid_import_col and mapping.grid_import_col in df.columns:
        valid_count = int(pd.to_numeric(df[mapping.grid_import_col], errors="coerce").notna().sum())
        if valid_count >= 12:
            available.append("grid_import")
        else:
            unavailable_reasons["grid_import"] = f"Mapped grid import column '{mapping.grid_import_col}' has insufficient valid points."
    else:
        unavailable_reasons["grid_import"] = "No grid import column mapped in this dataset."

    return available, unavailable_reasons
