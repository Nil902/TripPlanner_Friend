# Build the SPA once and serve it from the API's HTTPS origin.
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY packages/shared /build/packages/shared
COPY frontend/ ./
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
WORKDIR /app

COPY backend/requirements-prod.txt ./requirements-prod.txt
RUN pip install --no-cache-dir -r requirements-prod.txt \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app

COPY --chown=app:app backend/app ./app
COPY --chown=app:app backend/alembic.ini ./alembic.ini
COPY --chown=app:app backend/alembic ./alembic
COPY --chown=app:app backend/start.sh ./start.sh
COPY --from=frontend-build --chown=app:app /build/frontend/dist ./static
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/healthz', timeout=4)"
CMD ["sh", "/app/start.sh"]
