---
name: add-api-endpoint
description: Use when the user asks to add, implement, or expose a new REST API endpoint in the FastAPI backend or update the backend API contract.
---

# Workflow: Add an API Endpoint

Follow this procedure whenever adding a new HTTP endpoint to the FastAPI backend.

## Step-by-Step Procedure

1. **Update the Shared Contract:**
   - Open `packages/shared/openapi.yaml`.
   - Add the path, HTTP method, request body schema, and response schemas.
   - Update `packages/shared/types.ts` with any new TypeScript request/response interfaces.

2. **Define Pydantic Request & Response Schemas:**
   - In `backend/app/models/`, add or update the Pydantic / SQLModel schema representing the input and output payloads.
   - Ensure all fields have type annotations and descriptions for automatic OpenAPI documentation.

3. **Implement Service Logic (if applicable):**
   - Place business logic in `backend/app/services/` (e.g. `agent_planner.py`, `places_service.py`, `expense_service.py`).
   - Keep route handlers thin by delegating complex calculations or external API calls to service methods.

4. **Register the Route Handler:**
   - Locate the relevant router in `backend/app/api/v1/` (e.g., `trips.py`, `plans.py`, `expenses.py`), or create a new router file and include it in `backend/app/api/v1/router.py`.
   - Define the endpoint using FastAPI decorators (`@router.get`, `@router.post`, etc.) with explicit `response_model`, status codes, and dependency injections (`get_session`).

5. **Write an Automated Integration Test:**
   - Add an async test function in `backend/tests/test_api.py` (or a dedicated test file under `backend/tests/`).
   - Use `httpx.AsyncClient` with `app` to make a request to the new endpoint and assert:
     - Expected HTTP status code.
     - Correct response body schema.
     - Validation error handling for invalid input payloads (e.g., 422 Unprocessable Entity).

6. **Verify Locally:**
   - Run:
     ```bash
     cd backend && source .venv/bin/activate
     pytest tests/ -v
     ruff check .
     mypy app
     ```
