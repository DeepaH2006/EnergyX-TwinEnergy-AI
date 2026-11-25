from fastapi import APIRouter, HTTPException
from app.schemas.simulation import (
    ExplainAIRequest,
    ExplainAIResponse,
    RecommendationGenerateRequest,
    RecommendationGenerateResponse,
)
from app.services.recommendation_engine import (
    explain_results_with_gemini,
    generate_data_driven_recommendations,
)

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.post("/generate", response_model=RecommendationGenerateResponse)
def generate_recommendations(request: RecommendationGenerateRequest) -> RecommendationGenerateResponse:
    try:
        return generate_data_driven_recommendations(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Recommendation generation failed: {exc}") from exc


@router.post("/explain-ai", response_model=ExplainAIResponse)
def explain_with_ai(request: ExplainAIRequest) -> ExplainAIResponse:
    return explain_results_with_gemini(request)
