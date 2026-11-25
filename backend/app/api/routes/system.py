from fastapi import APIRouter
from app.core.config import settings
from app.schemas.common import SystemComponentSpec, SystemInfoResponse

router = APIRouter(tags=["System"])


@router.get("/system", response_model=SystemInfoResponse)
def get_system_info() -> SystemInfoResponse:
    active_count = 0
    if settings.UPLOAD_DIR.exists():
        active_count = sum(1 for p in settings.UPLOAD_DIR.iterdir() if p.is_dir() and (p / "metadata.json").exists())

    models = [
        "Persistence Baseline",
        "Seasonal Naive (24h)",
        "Linear Regression (Ridge)",
        "Random Forest Regressor",
        "HistGradientBoosting Regressor",
    ]
    try:
        import xgboost  # noqa: F401
        models.append("XGBoost Regressor")
    except Exception:
        pass

    return SystemInfoResponse(
        service_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        supported_formats=settings.ALLOWED_EXTENSIONS,
        max_upload_mb=round(settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024), 1),
        available_models=models,
        optimization_solver="SciPy HiGHS Mixed-Integer Linear Programming (MILP)",
        default_system_config=SystemComponentSpec(),
        active_datasets_count=active_count,
    )
