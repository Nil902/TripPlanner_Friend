# AGENTS.md — Shared Contracts Module Guidelines

This document governs agent operations within the `packages/shared/` directory.

---

## Scope & Purpose
The `packages/shared/` module is the single source of truth for domain data contracts across the entire monorepo. It contains the OpenAPI 3.1 contract specification (`openapi.yaml`) and the TypeScript type definitions (`types.ts`) exported to the frontend client.

---

## Files in this Directory
- `openapi.yaml`: Canonical REST API contract definition describing all endpoints, request bodies, and response schemas.
- `types.ts`: TypeScript interfaces representing domain entities (`Trip`, `Constraint`, `Place`, `PlanItem`, `Plan`, `Expense`, `DisruptionEvent`).
- `package.json`: NPM package metadata allowing `frontend/` to import types cleanly.

---

## Hard Rules for Shared Contracts
1. **Never make unilateral contract changes:** If you alter a property in `types.ts` or `openapi.yaml`, you MUST verify and update both:
   - The backend Pydantic / SQLModel models in `backend/app/models/`
   - The frontend consumers and API client in `frontend/src/`
2. **Backward Compatibility:** When evolving contracts, prefer optional properties with sensible defaults rather than removing or renaming existing fields.
3. **No Framework Dependencies:** `types.ts` must remain pure TypeScript; do not import React, DOM types, or external heavy libraries.
