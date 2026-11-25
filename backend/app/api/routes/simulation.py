from fastapi import APIRouter, HTTPException
from app.schemas.simulation import (
    ScenarioCompareRequest,
    ScenarioCompareResponse,
    ScenarioSimulateRequest,
    ScenarioSimulateResponse,
)
from app.services.scenario_engine import compare_scenarios, simulate_what_if_scenario

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.post("/simulate", response_model=ScenarioSimulateResponse)
def simulate_scenario(request: ScenarioSimulateRequest) -> ScenarioSimulateResponse:
    try:
        return simulate_what_if_scenario(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scenario simulation failed: {exc}") from exc


@router.post("/compare", response_model=ScenarioCompareResponse)
def compare_all_scenarios(request: ScenarioCompareRequest) -> ScenarioCompareResponse:
    try:
        return compare_scenarios(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scenario comparison failed: {exc}") from exc
