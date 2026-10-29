"""Serve the built React application alongside the API on a single origin."""

from pathlib import Path, PurePosixPath

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class SPAStaticFiles(StaticFiles):
    """Use the SPA entry point for browser routes, preserving real asset/API 404s."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        reserved = {"api", "docs", "redoc", "openapi.json", "healthz", "readyz"}
        first_segment = path.split("/", maxsplit=1)[0]
        if first_segment in reserved:
            raise HTTPException(status_code=404)

        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if (
                exc.status_code != 404
                or PurePosixPath(path).suffix
                or scope["method"] not in {"GET", "HEAD"}
                or ".." in PurePosixPath(path).parts
                or path.startswith("assets/")
            ):
                raise
            response = await super().get_response("index.html", scope)

        if path.startswith("assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        return response


def mount_frontend(app: FastAPI, directory: Path) -> None:
    """Mount an existing production bundle after API routes have been registered."""
    if not (directory / "index.html").is_file():
        raise RuntimeError("The frontend production bundle is missing.")
    app.mount("/", SPAStaticFiles(directory=directory, html=True), name="frontend")
