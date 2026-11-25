from fastapi import APIRouter, HTTPException
from app.schemas.digital_twin import (
    DigitalTwinSimulateRequest,
    DigitalTwinSimulateResponse,
)
from app.services.digital_twin import simulate_digital_twin

router = APIRouter(prefix="/digital-twin", tags=["Digital Twin"])


@router.post("/simulate", response_model=DigitalTwinSimulateResponse)
def simulate_twin(request: DigitalTwinSimulateRequest) -> DigitalTwinSimulateResponse:
    try:
        return simulate_digital_twin(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Digital Twin simulation failed: {exc}") from exc
