"""
FastAPI application entry point with lifespan database initialization and registered routers.
"""

import logging
import traceback
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

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
from app.core.logging import install_secret_redaction
from app.core.request_guards import RequestGuards
from app.models.schema import SystemHealthResponse
from app.web import mount_frontend

logger = logging.getLogger(__name__)
install_secret_redaction()


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
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    request_id = uuid.uuid4().hex
    locations = " -> ".join(
        f"{frame.filename}:{frame.lineno} in {frame.name}"
        for frame in traceback.extract_tb(exc.__traceback__)
    )
    logger.error(
        "Unhandled %s; request_id=%s; frames=%s",
        type(exc).__name__,
        request_id,
        locations,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "INTERNAL_ERROR",
                "message": "The request could not be completed. Please try again.",
                "request_id": request_id,
            }
        },
        headers={"X-Request-ID": request_id, "Cache-Control": "no-store"},
    )


# Configure CORS — SECURITY.md prohibits wildcard origins in production.
# Same-origin deployment intentionally uses an empty cross-origin allowlist.
cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    RequestGuards,
    enabled=settings.RATE_LIMIT_ENABLED,
    production=settings.ENVIRONMENT == "production",
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
    return {"status": "ready", "version": "1.0.0"}


# The production image includes the Vite build here. Local development continues
# to use Vite's dev server and the existing API without a separate static copy.
frontend_directory = Path(__file__).resolve().parents[1] / "static"
if frontend_directory.is_dir():
    mount_frontend(app, frontend_directory)
