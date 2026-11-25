from fastapi import APIRouter, HTTPException, Query

from app.schemas.forecasting import (
    PredictRequest,
    PredictResponse,
    TrainRequest,
    TrainResponse,
)
from app.services.forecasting import generate_future_forecast
from app.services.model_training import (
    get_saved_training_metrics,
    train_forecasting_models,
)

router = APIRouter(prefix="/forecast", tags=["Forecasting"])


@router.post("/train", response_model=TrainResponse)
def train_models(request: TrainRequest) -> TrainResponse:
    try:
        return train_forecasting_models(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Training failed: {exc}") from exc


@router.post("/predict", response_model=PredictResponse)
def predict_future(request: PredictRequest) -> PredictResponse:
    try:
        return generate_future_forecast(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Forecast prediction failed: {exc}") from exc


@router.get("/metrics", response_model=TrainResponse)
def get_metrics(dataset_id: str = Query(..., description="Dataset ID")) -> TrainResponse:
    try:
        return get_saved_training_metrics(dataset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
