from fastapi import APIRouter, File, HTTPException, Query, UploadFile
import numpy as np

from app.schemas.datasets import (
    ColumnMappingConfig,
    ColumnProfile,
    DataQualitySnapshot,
    DatasetPreviewResponse,
    DatasetSummaryResponse,
    DatasetUploadResponse,
    PreprocessRequest,
    PreprocessResponse,
)
from app.services.data_loader import (
    load_dataset_dataframe,
    load_dataset_metadata,
    save_uploaded_dataset,
)
from app.services.data_validator import determine_available_targets
from app.services.preprocessing import preprocess_dataset

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/upload", response_model=DatasetUploadResponse)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    try:
        content = await file.read()
        return save_uploaded_dataset(file.filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse uploaded file: {exc}") from exc


@router.get("/{dataset_id}/summary", response_model=DatasetSummaryResponse)
def get_dataset_summary(dataset_id: str) -> DatasetSummaryResponse:
    try:
        meta = load_dataset_metadata(dataset_id)
        df = load_dataset_dataframe(dataset_id, cleaned=meta.get("is_preprocessed", False))
        mapping = ColumnMappingConfig(**meta["mapping"])
        avail, unavail = determine_available_targets(df, mapping)
        return DatasetSummaryResponse(
            dataset_id=meta["dataset_id"],
            filename=meta["filename"],
            file_size_bytes=meta["file_size_bytes"],
            is_preprocessed=meta.get("is_preprocessed", False),
            mapping=mapping,
            raw_quality=DataQualitySnapshot(**meta["raw_quality"]),
            cleaned_quality=DataQualitySnapshot(**meta["cleaned_quality"]) if meta.get("cleaned_quality") else None,
            columns=[ColumnProfile(**c) for c in meta["columns"]],
            preprocessing_actions=meta.get("preprocessing_actions", []),
            available_targets=avail,
            unavailable_targets_reasons=unavail,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def get_dataset_preview(
    dataset_id: str,
    source: str = Query(default="cleaned", pattern="^(raw|cleaned)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
) -> DatasetPreviewResponse:
    try:
        df = load_dataset_dataframe(dataset_id, cleaned=(source == "cleaned"))
        total_rows = int(len(df))
        sliced = df.iloc[offset : offset + limit].replace({np.nan: None})
        return DatasetPreviewResponse(
            dataset_id=dataset_id,
            source="cleaned" if (source == "cleaned") else "raw",
            total_rows=total_rows,
            offset=offset,
            limit=limit,
            columns=[str(c) for c in df.columns],
            rows=sliced.to_dict(orient="records"),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/{dataset_id}/preprocess", response_model=PreprocessResponse)
def preprocess_uploaded_dataset(dataset_id: str, request: PreprocessRequest) -> PreprocessResponse:
    try:
        return preprocess_dataset(dataset_id, request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {exc}") from exc
