#!/bin/sh
set -eu

# Free Render services do not support a pre-deploy command. Run additive
# migrations here and fail the deployment if a migration fails.
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
