# AGENTS.md — Global Agent Instructions & System Contract

This document provides mandatory operational instructions for AI agents operating on this repository. Every agent must read and adhere to these directives before inspecting or modifying code.

---

## Setup

Use these exact commands to install dependencies, run development servers, execute tests, and perform linting:

### Backend (`FastAPI + Python 3.11+`)
- **Install dependencies:**
  ```bash
  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
  ```
- **Run dev server:**
  ```bash
  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
  ```
- **Run tests:**
  ```bash
  cd backend && source .venv/bin/activate && pytest -v
  ```
- **Lint & format check:**
  ```bash
  cd backend && source .venv/bin/activate && ruff check . && ruff format --check .
  ```
- **Type check:**
  ```bash
  cd backend && source .venv/bin/activate && mypy app
  ```

### Frontend (`React + Vite + TypeScript`)
- **Install dependencies:**
  ```bash
  cd frontend && npm install
  ```
- **Run dev server:**
  ```bash
  cd frontend && npm run dev
  ```
- **Run tests:**
  ```bash
  cd frontend && npm run test
  ```
- **Lint:**
  ```bash
  cd frontend && npm run lint
  ```
- **Type check:**
  ```bash
  cd frontend && npm run typecheck
  ```

---

## Structure

The repository is organized as a monorepo containing distinct functional domains:

```
├── ARCHITECTURE.md          # Complete architectural blueprint and ADRs
├── README.md                # Human-facing onboarding and setup instructions
├── CONTRIBUTING.md          # Branching, commits, and PR standards
├── SECURITY.md              # Sensitive code zones and security mandates
├── AGENTS.md                # Root agent rules and guidelines (this file)
├── .env.example             # Documented template for environment variables
├── .antigravity/            # Subagent roles, skills, and permission settings
│   ├── agents/              # Markdown definitions for subagent roles
│   ├── skills/              # Reusable agent workflows (add-endpoint, add-component, etc.)
│   └── settings.json        # Tool permission matrix for subagents
├── docs/                    # Architectural decision records and feature specifications
│   ├── specs/               # Feature specification docs (see TEMPLATE.md)
│   └── decisions/           # Architecture Decision Records (see TEMPLATE.md)
├── packages/
│   └── shared/              # Shared data contracts (OpenAPI schema & TypeScript interfaces)
│       ├── openapi.yaml     # Canonical OpenAPI 3.1 API contract
│       ├── types.ts         # Shared TypeScript interfaces
│       ├── package.json     # Node package definition
│       └── AGENTS.md        # Nested agent rules for shared contract
├── backend/                 # Python FastAPI backend & Agent Planning Engine
│   ├── app/                 # FastAPI routes, models, validators, and core loop
│   │   ├── api/             # REST endpoints (trips, constraints, plan, expenses)
│   │   ├── core/            # Config, database engine, security helpers
│   │   ├── models/          # SQLModel database and API schemas
│   │   ├── services/        # Agent loop, places client, settle-up service
│   │   └── validators/      # Deterministic budget, travel, and open-hours validators
│   ├── tests/               # Unit, integration, and agent eval fixtures
│   ├── pyproject.toml       # Python package configuration and tool settings
│   ├── requirements.txt     # Locked production and development dependencies
│   └── AGENTS.md            # Nested agent rules for backend
└── frontend/                # React + Vite + Tailwind CSS Single Page App
    ├── src/                 # Client source code
    │   ├── api/             # Typed API client fetching from backend
    │   ├── components/      # UI components (map, timeline, forms, cards)
    │   ├── hooks/           # Custom React hooks (useTrip, usePlan, useRebalance)
    │   ├── pages/           # Route views (TripView, NewTrip, SettleUpView)
    │   ├── types/           # Client-specific UI state types
    │   ├── App.tsx          # App root component & routing
    │   └── main.tsx         # React DOM mount point
    ├── package.json         # NPM package dependencies and scripts
    ├── vite.config.ts       # Vite bundler configuration
    ├── vitest.config.ts     # Vitest unit test configuration
    ├── tsconfig.json        # TypeScript compiler options
    └── AGENTS.md            # Nested agent rules for frontend
```

---

## Conventions

### 1. Language & Style Rules
- **Backend (Python):** PEP 8 compliant, strictly enforced via Ruff. 88-character line limit. Type annotations are mandatory on every function signature and module export.
- **Frontend (TypeScript):** Strict mode enabled (`noImplicitAny: true`). Functional components with React hooks. Utility classes via Tailwind CSS; do not create separate ad-hoc CSS files.
- **Naming Conventions:**
  - Python files, functions, variables: `snake_case`
  - Python classes, models, exceptions: `PascalCase`
  - TypeScript components, types, interfaces: `PascalCase`
  - TypeScript functions, variables, hooks: `camelCase`
  - TypeScript file names: `PascalCase.tsx` for components, `camelCase.ts` for utilities/hooks.

### 2. Error Handling Pattern
- **Backend:**
  - Never swallow exceptions or return bare 500 errors without structured details.
  - Raise `fastapi.HTTPException` with explicit `status_code` and standard `detail` object:
    `{"detail": {"code": "VALIDATION_FAILED", "message": "Alice exceeds budget by $30", "fields": [...]}}`.
  - External API calls (Google Places, LLM) must be wrapped in try/except blocks with retries and fallback handling (see `ARCHITECTURE.md` Section 9.3).
- **Frontend:**
  - Handle asynchronous API errors with user-friendly error banners or toast notifications.
  - Wrap key feature modules in React Error Boundaries to prevent full-screen crashes.

### 3. State Management Pattern
- **Backend:**
  - Database sessions are dependency-injected per request using FastAPI `Depends(get_session)`.
  - Deterministic validators (`check_budget`, `check_travel_time`, `check_open_hours`) must be pure functions that take inputs and return validation result objects without internal database mutations.
- **Frontend:**
  - Server state is managed via lightweight typed fetch hooks (or TanStack React Query).
  - Client-side UI state (active day selection, filter toggles) is managed via React hooks (`useState`, `useReducer`).
  - Do not introduce complex Redux boilerplate unless required by explicit spec.

---

## Hard Rules

All agents must strictly comply with these inviolable rules:

1. **Never commit directly to `main`:** All work must be done on a branch and validated before merging.
2. **Never touch production secrets or live credentials:** Never hardcode API keys, read production databases without authorization, or commit `.env` files.
3. **Never add a dependency without checking for an existing equivalent:** Before running `pip install` or `npm install <pkg>`, inspect `requirements.txt` and `package.json` to verify whether an existing utility library (e.g. `pydantic`, `httpx`, `lucide-react`) already solves the problem.
4. **Never modify sensitive security zones without human review:** Files listed in `SECURITY.md` (auth, sessions, settle-up math, permissions) require explicit user sign-off.
5. **Always preserve plan history on rebalance:** When regenerating or rebalancing an itinerary, bump `Plan.version` and insert a new record instead of overwriting existing plan data.
6. **Always write corresponding tests for code changes:** Any new endpoint requires a `pytest` test in `backend/tests/`; any new component requires a `vitest` test in `frontend/src/`.
7. **Always verify before reporting complete:** Run lint, typecheck, and tests before concluding any implementation task.
