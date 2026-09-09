# Autonomous Travel & Group Itinerary Coordinator

An AI agent that plans multi-person trip itineraries by actively balancing group constraints, querying real-world map/transit APIs, and dynamically re-planning on the fly when plans break (flight delays, closed venues, weather).

Unlike simple prompt-to-text itinerary apps, this system uses an **iterative propose-validate-rebalance loop**:
1. **Proposes** a draft plan with an LLM based on group constraints and candidate locations.
2. **Validates** the plan with deterministic tools: budget checks, transit time checks, and opening hours checks.
3. **Self-corrects** by feeding exact validation errors back into the generator until constraints are satisfied or gracefully relaxed.
4. **Rebalances** dynamically during disruptions by isolating the affected time window and minimizing ripple effects on the rest of the schedule.

---

## Repository Structure

```
├── ARCHITECTURE.md          # System architecture, data flow, and ADRs
├── README.md                # This setup and run guide
├── CONTRIBUTING.md          # Branching, commits, PR workflows
├── SECURITY.md              # Security policies and sensitive code zones
├── AGENTS.md                # Root agent rules and conventions
├── .env.example             # Template environment variables
├── .antigravity/            # Agent skills, subagents, and permissions
│   ├── agents/              # Subagent definitions (planner, executors, verifier, debugger)
│   ├── skills/              # Workflow guides (add-endpoint, add-component, etc.)
│   └── settings.json        # Tool permission matrix
├── docs/
│   ├── specs/               # Feature specifications (TEMPLATE.md)
│   └── decisions/           # Architecture decision records (TEMPLATE.md)
├── packages/
│   └── shared/              # Shared types (types.ts) and OpenAPI spec (openapi.yaml)
├── backend/                 # FastAPI service + agent planning core
│   ├── app/                 # FastAPI routes, models, validators, and agent loop
│   ├── tests/               # Pytest test suite
│   ├── pyproject.toml       # Python package and tool config
│   └── requirements.txt     # Python dependencies
└── frontend/                # React + Vite + Tailwind CSS client
    ├── src/                 # React components, pages, state hooks
    ├── package.json         # NPM scripts and dependencies
    └── vite.config.ts       # Vite build & dev server configuration
```

---

## Prerequisites

- **Python:** `3.11` or higher
- **Node.js:** `18.0` or higher
- **npm:** `9.0` or higher
- **API Keys:**
  - Google Maps Platform API Key (Places API New, Distance Matrix API)
  - LLM Provider API Key (Claude / Anthropic or Gemini / OpenAI)

---

## Quick Start (Local Development)

### 1. Clone & Configure Environment Variables

```bash
# Clone the repository
git clone <repo-url>
cd PersonalProject2

# Create your local environment configuration
cp .env.example .env
```
Open `.env` and configure your API keys (e.g., `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`).

---

### 2. Backend Setup (`FastAPI`)

```bash
# Navigate to backend directory
cd backend

# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Run the development server with auto-reload
uvicorn app.main:app --reload --port 8000
```
Backend API will be accessible at:
- **API Root:** [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Healthcheck:** [http://localhost:8000/healthz](http://localhost:8000/healthz)

---

### 3. Frontend Setup (`React + Vite`)

Open a new terminal window:

```bash
# Navigate to frontend directory
cd frontend

# Install node dependencies
npm install

# Start Vite development server
npm run dev
```
Frontend web application will be accessible at:
- **Web App:** [http://localhost:5173](http://localhost:5173)

---

## Running Tests & Verification

### Backend Tests (pytest)
```bash
cd backend
source .venv/bin/activate
pytest -v
```

### Backend Lint & Typecheck
```bash
cd backend
source .venv/bin/activate
ruff check .
mypy app
```

### Frontend Tests (Vitest)
```bash
cd frontend
npm run test
```

### Frontend Lint & Typecheck
```bash
cd frontend
npm run lint
npm run typecheck
```

---

## Agent Evaluation Harness

To score the agent's propose-validate loop against predefined trip test fixtures:

```bash
cd backend
source .venv/bin/activate
python -m tests.eval.run_evals
```
This runs 6 deterministic scenario fixtures (budget conflicts, transit constraints, venue closures, dietary restrictions, and flight delays) and outputs pass/fail metrics along with comparison data against a single-shot baseline.

### Benchmark Evaluation Results

| Scenario / Evaluated Constraint Property | Iterative Agent Loop | Naive Single-Shot Baseline |
|---|:---:|:---:|
| **Budget Conflict (Lisbon)**: Budget Cap within Tolerance | **PASS [✓]** | FAIL [✗] |
| **Budget Conflict (Lisbon)**: Daily Food Option Scheduled | **PASS [✓]** | **PASS [✓]** |
| **Budget Conflict (Lisbon)**: No Transit > 35 min | **PASS [✓]** | **PASS [✓]** |
| **Forced Disruption (Lisbon)**: Only Affected Day Modified | **PASS [✓]** | **PASS [✓]** |
| **Forced Disruption (Lisbon)**: Unaffected Days Identical | **PASS [✓]** | **PASS [✓]** |
| **Forced Disruption (Lisbon)**: Replacement Venue Found | **PASS [✓]** | **PASS [✓]** |
| **Forced Disruption (Lisbon)**: Tradeoff Notes Explain Change | **PASS [✓]** | **PASS [✓]** |
| **Transit Backtracking (Tokyo)**: No Transit > 35 min | **PASS [✓]** | **PASS [✓]** |
| **Transit Backtracking (Tokyo)**: Transit Gap Buffer Sufficient | **PASS [✓]** | FAIL [✗] |
| **Strict Dietary (Paris)**: Food Option Scheduled | **PASS [✓]** | FAIL [✗] |
| **Strict Dietary (Paris)**: Must-Avoid Terms Respected | **PASS [✓]** | **PASS [✓]** |
| **Strict Dietary (Paris)**: Budget Cap within Tolerance | **PASS [✓]** | FAIL [✗] |
| **Pace Balancing (Lisbon)**: No Transit > 35 min | **PASS [✓]** | **PASS [✓]** |
| **Pace Balancing (Lisbon)**: Transit Gap Buffer Sufficient | **PASS [✓]** | FAIL [✗] |
| **Pace Balancing (Lisbon)**: Must-See Attraction Included | **PASS [✓]** | **PASS [✓]** |
| **Flight Delay Disruption (Tokyo)**: Only Affected Day Modified | **PASS [✓]** | **PASS [✓]** |
| **Flight Delay Disruption (Tokyo)**: Unaffected Days Identical | **PASS [✓]** | **PASS [✓]** |
| **Flight Delay Disruption (Tokyo)**: Tradeoff Notes Explain Change | **PASS [✓]** | **PASS [✓]** |
| **Overall Property Benchmark Pass Rate** | **18/18 (100.0%)** | **13/18 (72.2%)** |
| **Agent Performance Advantage** | **+27.8% vs. Baseline** | — |

---

## Documentation

- [Architecture & Design Decisions](file:///Users/nil/Documents/PersonalProject2/ARCHITECTURE.md)
- [Agent & Subagent Rules](file:///Users/nil/Documents/PersonalProject2/AGENTS.md)
- [Contributing Guidelines](file:///Users/nil/Documents/PersonalProject2/CONTRIBUTING.md)
- [Security Policy](file:///Users/nil/Documents/PersonalProject2/SECURITY.md)
