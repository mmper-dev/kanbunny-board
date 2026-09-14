from fastapi import APIRouter

from ..models import HealthResponse

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse, summary="Liveness probe", operation_id="getHealth")
def get_health() -> HealthResponse:
    """Public: the only endpoint that needs no token."""
    return HealthResponse(status="ok")
