"""
FastAPI application entry point with lifespan database initialization and registered routers.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.api import (
    admin,
    auth,
    constraints,
    expenses,
    plan,
    rebalance,
    trips,
)
from app.core.config import settings
from app.core.db import get_session, init_db
from app.models.schema import SystemHealthResponse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Initialize SQLModel SQLite database tables
    await run_in_threadpool(init_db)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Agentic planning, validation, dynamic rebalancing, and expense settle-up.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS — SECURITY.md prohibits wildcard origins in production.
# cors_origins_list must be non-empty; misconfiguration raises at startup.
cors_origins = settings.cors_origins_list
if not cors_origins:
    import logging as _logging

    _logging.getLogger(__name__).error(
        "CORS_ORIGINS is empty — rejecting all cross-origin requests. "
        "Set CORS_ORIGINS in .env (e.g. http://localhost:5173)."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(trips.router)
app.include_router(constraints.router)
app.include_router(plan.router)
app.include_router(rebalance.router)
app.include_router(expenses.router)


@app.get("/healthz", tags=["System"], response_model=SystemHealthResponse)
async def check_health() -> dict[str, str]:
    """Health check endpoint for container orchestrators and CI verification."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/readyz", tags=["System"], response_model=SystemHealthResponse)
def check_readiness(session: Session = Depends(get_session)) -> dict[str, str]:
    """Report whether requests can reach the database, without leaking details."""
    try:
        session.exec(select(1)).first()
    except Exception as exc:
        session.rollback()
        logger.error("Database readiness check failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "The service is temporarily unavailable. Please try again.",
            },
        ) from exc
    return {"status": "ready", "version": "1.0.0"}
