from fastapi import APIRouter

from app.api.v1 import airports, fares, health, lounges, positions

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(positions.router)
api_router.include_router(airports.router)
api_router.include_router(lounges.router)
api_router.include_router(fares.router)
