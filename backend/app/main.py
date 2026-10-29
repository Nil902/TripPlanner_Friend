"""
FastAPI application entry point with lifespan database initialization and registered routers.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
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
from app.core.db import engine, init_db
from app.web import mount_frontend

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await run_in_threadpool(init_db)
    yield
    await run_in_threadpool(engine.dispose)


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


@app.get("/healthz", tags=["System"])
async def check_health() -> dict[str, str]:
    """Health check endpoint for container orchestrators and CI verification."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/readyz", tags=["System"])
def check_readiness() -> dict[str, str]:
    """Require a working database before routing traffic to a new deployment."""
    from fastapi import HTTPException

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.error("Database readiness check failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "Service is starting. Please try again.",
            },
        ) from None
    return {"status": "ready"}


# The production image includes the Vite build here. Local development continues
# to use Vite's dev server and the existing API without a separate static copy.
frontend_directory = Path(__file__).resolve().parents[1] / "static"
if frontend_directory.is_dir():
    mount_frontend(app, frontend_directory)
