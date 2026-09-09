---
name: run-agent-evals
description: Use when the user asks to run, benchmark, or add evaluation scenarios for the agent's propose-validate-rebalance itinerary planning loop.
---

# Workflow: Run & Benchmark Agent Evals

Follow this procedure whenever benchmarking the autonomous planning engine against deterministic scenario fixtures.

## Step-by-Step Procedure

1. **Locate Scenario Fixtures:**
   - Fixtures reside in `backend/tests/eval/fixtures/` as JSON files (e.g. `lisbon_budget_conflict.json`, `lisbon_venue_disruption.json`).
   - Each fixture defines:
     - Input trip parameters and participant constraints.
     - Optional disruption trigger event.
     - Array of `expected_properties` (e.g., maximum budget delta, vegetarian option presence, transit threshold).

2. **Execute the Evaluation Runner:**
   - Run the benchmark harness:
     ```bash
     cd backend && source .venv/bin/activate
     python -m tests.eval.run_evals
     ```
   - Optional flags:
     - `--fixture <name>` to run a single test fixture.
     - `--baseline` to execute against single-shot LLM baseline for comparison.
     - `--verbose` to print detailed iteration-by-iteration validation traces.

3. **Inspect Pass/Fail Property Breakdown:**
   - Review the output table:
     - Overall pass rate across fixtures.
     - Pass rate per deterministic property (budget adherence, transit time feasibility, venue opening hours).
     - Number of propose-validate iterations required per fixture.
     - Relaxation notes triggered if fallback was invoked.

4. **Adding a New Eval Scenario:**
   - Create a new fixture file in `backend/tests/eval/fixtures/<scenario_name>.json`.
   - Define realistic constraints (e.g. multi-day trip with conflicting dietary needs or tight transit bounds).
   - Add deterministic property checkers in `backend/tests/eval/checkers.py`.
   - Run the evaluation runner to establish a baseline score.

5. **Record Results for Documentation:**
   - If evaluating a major change to prompts, tools, or rebalancer heuristics, record the before/after pass rates in `ARCHITECTURE.md` or a feature spec under `docs/specs/`.
