from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    solver_ok = False
    ml_ok = False
    try:
        import scipy.optimize  # noqa: F401
        solver_ok = True
    except Exception:
        pass
    try:
        import sklearn  # noqa: F401
        ml_ok = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        solver_available=solver_ok,
        ml_engine_available=ml_ok,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
