# AGENTS.md — Backend Module Guidelines

This document governs agent operations within the `backend/` directory.

---

## Scope & Purpose
The backend module hosts the FastAPI application, database models (SQLModel), the core agent propose-validate-rebalance planning loop, deterministic validators, and integration clients for external services (Google Places, Distance Matrix, LLM providers).

---

## Local Setup & Commands
Ensure you are in the `backend/` directory with the virtual environment activated:
- **Activate venv:** `source .venv/bin/activate`
- **Install dependencies:** `pip install -r requirements.txt`
- **Run dev server:** `uvicorn app.main:app --reload --port 8000`
- **Run test suite:** `pytest -v`
- **Run single test:** `pytest tests/test_health.py -v`
- **Lint code:** `ruff check .`
- **Format check:** `ruff format --check .`
- **Format code:** `ruff format .`
- **Type check:** `mypy app`
- **Run evaluation harness:** `python -m tests.eval.run_evals`

---

## Architecture & Module Boundaries
- `app/api/`: Route handlers only. Validate input request schemas, delegate business logic to services, return typed Pydantic models.
- `app/core/`: Configuration (`config.py`), database engine initialization (`db.py`), error definitions.
- `app/models/`: SQLModel schemas representing database tables and domain entities (`trip.py`, `plan.py`, `constraint.py`, `expense.py`).
- `app/services/`:
  - `agent_planner.py`: Propose-validate-rebalance iteration loop.
  - `places_service.py`: Google Places client with local caching.
  - `transit_service.py`: Distance Matrix queries and backtracking calculation.
  - `expense_service.py`: Settle-up greedy debt reduction math.
- `app/validators/`: Pure deterministic validation functions:
  - `budget_validator.py`: Mathematical per-person constraint checking.
  - `travel_validator.py`: Transit duration / unrealistic transition checking.
  - `open_hours_validator.py`: Checks venue opening hours against visit timestamps.
- `tests/`:
  - `unit/`: Unit tests for validators and services.
  - `integration/`: API endpoint tests using `httpx.AsyncClient`.
  - `eval/`: Scenarios with known ground truth fixtures.

---

## Backend Hard Rules & Conventions
1. **Never perform blocking I/O in async endpoints:** Use `httpx.AsyncClient` for HTTP calls and async database sessions.
2. **Deterministic validators must be testable without external APIs:** Always accept pre-fetched candidate data and mock external services in unit tests.
3. **No circular imports:** Models must not import services. Routers import services; services import models and core utils.
4. **Always validate schema migrations:** When updating models in `app/models/`, ensure Alembic migration scripts are created and tested.
5. **Always test edge cases in agent termination:** Ensure the loop halts at `max_iterations = 5` and triggers constraint relaxation rather than looping indefinitely.
