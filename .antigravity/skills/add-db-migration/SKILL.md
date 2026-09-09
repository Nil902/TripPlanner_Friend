---
name: add-db-migration
description: Use when the user asks to modify the database schema, add a new table or column, or create and apply an Alembic migration.
---

# Workflow: Add a Database Migration

Follow this procedure whenever updating the SQLModel database schema in the backend.

## Step-by-Step Procedure

1. **Update the SQLModel Definition:**
   - Locate the target model in `backend/app/models/` (e.g. `schema.py`, `trip.py`, `plan.py`, `constraint.py`, `expense.py`).
   - Add, rename, or modify the required fields with `Field(...)` annotations and types.
   - If adding a foreign key relationship, verify relationship cascading rules and indices.

2. **Generate Migration Script:**
   - Run Alembic autogenerate inside the backend environment:
     ```bash
     cd backend && source .venv/bin/activate
     alembic revision --autogenerate -m "describe_change_in_snake_case"
     ```
   - Inspect the generated migration file in `backend/alembic/versions/`.
   - **Crucial:** Verify that the `upgrade()` and `downgrade()` functions only alter the intended columns/tables and do not accidentally drop unrelated tables.

3. **Apply the Migration Locally:**
   - Run:
     ```bash
     alembic upgrade head
     ```
   - Verify that the local database schema updates cleanly without integrity errors.

4. **Update Shared Contracts:**
   - If the schema change impacts client-facing API responses or intake payloads, update `packages/shared/types.ts` and `packages/shared/openapi.yaml`.

5. **Test Migration Rollback:**
   - Test the downgrade path to ensure reversibility:
     ```bash
     alembic downgrade -1
     alembic upgrade head
     ```

6. **Run Backend Tests:**
   - Run:
     ```bash
     pytest tests/ -v
     ```
