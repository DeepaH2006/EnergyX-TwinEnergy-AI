from fastapi import APIRouter, HTTPException
from app.schemas.optimization import OptimizationRunRequest, OptimizationRunResponse
from app.services.optimization import run_optimization

router = APIRouter(prefix="/optimization", tags=["Optimization"])


@router.post("/run", response_model=OptimizationRunResponse)
def run_energy_optimization(request: OptimizationRunRequest) -> OptimizationRunResponse:
    try:
        return run_optimization(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {exc}") from exc
