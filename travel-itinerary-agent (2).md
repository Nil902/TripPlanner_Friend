# Autonomous Travel & Group Itinerary Coordinator

An AI agent that plans multi-person trip itineraries by actively balancing
group constraints, calling real-world map/transit APIs, and re-planning on
the fly when something breaks (closed venue, delayed flight).

> **Scoping note:** The full version of this idea (real-time multi-user
> WebSocket sync, calendar export to Google *and* Apple, live transit data)
> is realistically a small-team, multi-month project. This spec is split
> into a **solo-buildable v1 (2–4 weeks)** and a **stretch/v2** section, so
> you can ship something complete rather than something impressive-sounding
> but half-finished. Cut items ruthlessly if you're short on time — the
> agent core (Constraint Solver + Rebalancer) is what actually
> differentiates this project, so protect that over everything else.

---

## 1. Problem Statement

Planning a group trip usually means:
- A messy group chat with conflicting dates, budgets, and preferences
- Someone manually building a spreadsheet itinerary that's stale by day 2
- No one accounting for travel time between activities (crossing town twice)
- Total replanning chaos when a flight is delayed or a place is closed

**Goal:** an agent that takes everyone's constraints, produces a workable
day-by-day itinerary, and automatically adapts it when reality changes.

---

## 2. User Experience

1. One person creates a "trip room" (shareable link/code).
2. Each friend joins and submits their constraints via a simple form:
   - Available dates
   - Budget per day (lodging + activities)
   - Dietary restrictions
   - Travel style tags (e.g. `relaxed`, `packed`, `foodie`, `outdoorsy`)
   - Must-see / must-avoid places (optional free text)
3. Once everyone has submitted (or a deadline passes), the user clicks
   **"Generate Itinerary."**
4. The agent produces a day-by-day plan with a map view, shows its
   reasoning ("Moved the museum to Day 2 morning because it's a 10 min
   walk from your Day 2 hotel, avoiding a 40 min backtrack"), and lets
   users request changes in plain language ("swap day 3 to be more
   relaxed", "I don't want to spend more than $40 on lunch").
5. If a mid-trip disruption is entered (flight delayed, place closed), the
   agent re-plans just the affected portion and explains the change.

---

## 3. What the Agent Actually Does (the important part)

This is the section to get right — it's what separates "agent" from
"app that calls an LLM once." The agent should run an **iterative
tool-calling loop**, not a single prompt-to-output call.

### Agent loop (conceptual)

```
1. Gather state: group constraints + candidate places (from Places API)
2. Propose a draft plan (LLM call, structured output)
3. Validate the plan with deterministic tools:
   - check_budget(plan) -> over/under per person
   - check_travel_time(plan) -> flags backtracking / unrealistic transitions
   - check_open_hours(plan) -> flags venues closed at the planned time
4. If validation fails: agent re-calls the planning step with the specific
   failure fed back in ("Day 2 exceeds Alice's budget by $30, revise")
5. Repeat until valid or max iterations reached
6. Output final plan + a natural-language explanation of key tradeoffs
```

This "propose → validate with real tools → self-correct" loop is the
core resume-worthy claim: *the agent doesn't just generate text, it
verifies its own output against ground truth and iterates.*

### Tools the agent can call

| Tool | Purpose |
|---|---|
| `search_places(location, category, budget)` | Query Google Places API for candidate venues |
| `get_travel_time(a, b, mode)` | Google Distance Matrix — used to penalize backtracking |
| `check_budget(plan, constraints)` | Deterministic function, not an LLM call |
| `check_open_hours(place, datetime)` | Validates against Places API opening hours |
| `find_alternative(place)` | Called during rebalancing when a venue is closed/unavailable |

### Dynamic Rebalancer (the hardest, most interesting part)

Triggered by an event: a flight delay entered by a user, or a venue
found closed. The agent:
1. Identifies which parts of the plan are actually affected (not the
   whole trip — this is a scoping/reasoning step worth highlighting)
2. Re-runs the propose→validate loop *only* on the affected window
3. Prefers minimal disruption (keeps as much of the original plan intact
   as possible) — this constraint is worth stating explicitly and testing
   for, since a naive rebalancer will happily regenerate the whole trip

---

## 4. Scope: v1 (solo, 2–4 weeks) vs Stretch

### v1 — buildable solo, keeps the agent as the star
- Single-user or async multi-user (form submissions, no live WebSocket sync)
- Constraint solver + propose/validate/rebalance agent loop
- Google Places + Distance Matrix API integration
- Simple map view (static Google Maps embed or Leaflet) showing the route
- Manual "simulate disruption" button (flight delayed / venue closed) to
  demonstrate the rebalancer live in a demo — this is a great interview
  demo moment
- Export as a shareable read-only itinerary page (skip calendar OAuth for v1)
- **Eval set:** 5–10 hand-crafted trip scenarios with known "correct"
  properties (e.g. "should not schedule two venues that are 45+ min apart
  back to back") and a script that scores the agent against them. This is
  the single highest-leverage addition for making the project look like
  real engineering rather than a demo.

### v2 / Stretch — only after v1 is solid and demoable
- Real-time multi-user trip rooms via WebSockets (Redis for session state)
- Live transit data instead of static Distance Matrix estimates
- Google Calendar export via OAuth (Apple Calendar export is low ROI —
  skip unless you have a specific reason)
- Richer constraint solver (e.g. actual optimization library like OR-Tools
  instead of iterative LLM refinement) — could be its own resume bullet

---

## 5. Suggested Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Tailwind | Map view + itinerary UI |
| Backend | FastAPI (Python) | Easiest to pair with LLM tool-calling + eval scripts |
| Agent/LLM | Claude or GPT-4 class model, function calling | Core loop lives here |
| Maps | Google Places API, Distance Matrix API | Requires billing setup — budget for API costs in advance |
| State (v1) | Postgres or even SQLite | No need for Redis until you add real-time sync |
| State (v2) | Redis + WebSockets | Only if you build live multi-user sync |
| Eval | Plain Python script + JSON test fixtures | Keep it simple, output a results table for the README |

---

## 6. What Goes in the README (this is what recruiters actually read)

- One clear GIF/screenshot of the agent handling a disruption live
- A short section titled **"How the agent works"** with the propose →
  validate → rebalance loop diagram
- An **eval results table**: e.g. "Correctly avoided budget overruns in
  9/10 scenarios; correctly minimized backtracking in 8/10 scenarios
  (baseline single-shot LLM: 5/10)" — concrete numbers beat adjectives
- Explicit list of what's v1 vs stretch, so it reads as intentional
  scoping rather than an unfinished project

---

## 7. Interview Talking Points This Project Buys You

- Why validate-and-retry beats a single LLM call for correctness
- How you scoped the rebalancer to only touch the affected part of the
  plan (a reasoning/systems-design point, not just an API integration one)
- How you evaluated a non-deterministic system (the eval harness)
- Tradeoffs between an LLM-driven "solver" vs a real constraint solver
  (OR-Tools) — even just discussing this tradeoff in the README shows
  maturity, whether or not you implement OR-Tools

---

## 8. Honest Risks to Watch For

- **API costs**: Places/Distance Matrix APIs aren't free past a quota —
  cache aggressively, and mention this constraint in the README rather
  than hiding it.
- **Scope creep**: it's tempting to build the real-time multi-user layer
  first because it "sounds impressive" — resist this. The agent loop is
  the differentiator; the real-time sync is generic CRUD/WebSocket work
  you could demonstrate with a much simpler project if you wanted to.
- **"Where's the AI really doing anything?"** — be ready for this
  question. Your answer should point specifically at the propose/validate/
  rebalance loop and the eval numbers, not at "it calls GPT-4 to write the
  itinerary."

---

## 9. Implementation Details (fill these in before writing code)

These are the gaps that don't show up until you're mid-build. Nail them
down now so you're not redesigning core pieces halfway through.

### 9.1 Data Model

Keep it minimal for v1 — you can always extend fields later, but a
messy early schema is painful to migrate.

```
Trip {
  id: string
  destination: string
  start_date: date
  end_date: date
  member_ids: string[]
  status: "collecting_constraints" | "planned" | "in_progress"
}

Constraint {
  trip_id: string
  user_id: string
  budget_per_day: number
  dietary: string[]              # e.g. ["vegetarian"]
  style_tags: string[]           # e.g. ["relaxed", "foodie"]
  must_see: string[]             # free text or place_ids
  must_avoid: string[]
}

Place {
  place_id: string                # from Places API
  name: string
  category: string                # "museum" | "restaurant" | "park" | ...
  lat: number
  lng: number
  est_cost: number
  opening_hours: OpeningHours | null   # null = unknown, see 9.3
}

PlanItem {
  place_id: string
  day_index: number
  start_time: datetime
  end_time: datetime
  cost: number
}

Plan {
  trip_id: string
  days: { date: date, items: PlanItem[] }[]
  version: number                 # bump on every rebalance, keep history
  validation_status: "valid" | "invalid" | "partial"
  notes: string[]                 # human-readable tradeoff explanations
}
```

Persist every `Plan` version rather than overwriting — this gives you
"show the before/after of a rebalance" for free in the demo, and it's
one extra column, not extra architecture.

### 9.2 Termination & Fallback Logic

Define this explicitly — don't leave "max iterations reached" as a dead
end.

```
max_iterations = 5

on validation failure at max_iterations:
  1. Rank the failing constraints by a fixed priority order, e.g.:
     must_avoid > budget > must_see > dietary > style_tags
  2. Relax the lowest-priority failing constraint by one step
     (e.g. allow 10% budget overrun, or drop one style_tag)
  3. Re-run ONE more validation pass with the relaxed constraint
  4. If still invalid: return the best-scoring candidate plan produced
     across all iterations (not necessarily the last one), and set
     validation_status = "partial"
  5. Always surface WHAT was relaxed and WHY in `Plan.notes`, e.g.
     "Could not satisfy both Alice's $40/day budget and the must-see
     list — allowed a $6/day overrun instead of dropping a must-see."
```

This turns your worst-case failure mode into a designed feature, and
it's one of the better interview talking points in the whole project:
you can explain *why* you chose that priority order.

### 9.3 Places API Edge Cases (decide now, not while debugging)

| Situation | Behavior |
|---|---|
| `opening_hours` is null/missing | Skip the open-hours check for that place; don't block the plan on missing data |
| Zero candidates returned for a category+budget+location query | Widen the search radius once (e.g. 2x), then widen budget tolerance by 15%; if still zero, surface to user: "No matching [category] found near [location] — try relaxing budget or dietary filters" |
| Places API rate limit / error | Retry once with backoff; on second failure, fall back to cached results from an earlier identical query if available, else fail the specific tool call (not the whole plan) and let the agent route around it |

### 9.4 Worked Eval Examples

Write these out as actual JSON fixtures before you build the scorer —
here are two to start with.

**Fixture 1 — budget conflict**
```json
{
  "trip": { "destination": "Lisbon", "days": 2 },
  "constraints": [
    { "user_id": "alice", "budget_per_day": 40, "dietary": ["vegetarian"] },
    { "user_id": "bob", "budget_per_day": 80, "dietary": [] }
  ],
  "expected_properties": [
    "no day's total cost per person exceeds max(budget_per_day) group average by more than 15%",
    "at least one vegetarian-friendly meal option scheduled per day",
    "no two consecutive activities more than 30 min travel apart"
  ]
}
```

**Fixture 2 — forced disruption (tests the rebalancer, not just the planner)**
```json
{
  "trip": { "destination": "Lisbon", "days": 3 },
  "initial_plan": "<a valid 3-day plan fixture>",
  "disruption": { "type": "venue_closed", "day_index": 1, "place_id": "belem_tower" },
  "expected_properties": [
    "only day_index 1 items are modified — day 0 and day 2 items unchanged from initial_plan",
    "replacement venue is same category (landmark) and within 2km of the original",
    "Plan.notes explains the substitution"
  ]
}
```

**Scoring script (conceptual, keep it this simple for v1):**
```
for each fixture:
  run agent -> produced_plan
  for each expected_property:
    run a deterministic checker function against produced_plan
    record pass/fail
report: pass rate per property, per fixture, and overall
compare against a "naive single-shot LLM, no validation loop" baseline
  run on the same fixtures, to get the comparison number for your README
```

Writing the two fixtures above before you write the agent loop will
surface most of your remaining design questions (what counts as
"same category," what "unchanged" means for a PlanItem, etc.) while
they're still cheap to answer.

---

## 10. Auth, Planning Mode, and Expense Split

### 10.1 Auth & Permission Model

- **Trip creator**: full account (email/password or OAuth). Required
  because they own the trip, trigger plan generation/regeneration, and
  are the durable identity the trip is tied to.
- **Joiners**: no account required. Join via link, enter a display name,
  get a session token (cookie/localStorage) scoping them to that trip.
  Cheap to build, no auth system needed for v1.
  - Known tradeoff, acceptable for v1: clearing cookies or switching
    devices loses that joiner's link to their submitted constraint. Not
    worth solving now — mention it as a known limitation in the README
    rather than building account recovery for anonymous users.
- **Permissions**:
  - Joiner can: submit/edit *their own* `Constraint`, view the `Plan`,
    view expenses, add their own expense entries.
  - Joiner cannot: edit another user's `Constraint`, trigger plan
    generation/regeneration, delete the trip.
  - Only the creator can: trigger `Generate Itinerary`, trigger a
    rebalance, close/end the trip.
  - Rationale: if any joiner could regenerate the plan, concurrent
    regenerations from different people would race and thrash — keep
    that action single-owner for v1.

### 10.2 Planning Mode Toggle

After constraints are collected, the creator picks one:

- **AI mode**: runs the propose → validate → rebalance agent loop from
  Section 3.
- **Manual mode**: user builds the itinerary by hand (drag-and-drop day
  view), but the *same* deterministic validators from the agent loop
  (`check_budget`, `check_travel_time`, `check_open_hours`) still run in
  the background and surface as non-blocking warnings ("this is a 40 min
  backtrack" / "over Alice's budget by $12"). Reuses code from Section 3
  instead of building a second, disconnected feature — don't skip this
  reuse, it's a cheap way to make manual mode feel just as polished as AI
  mode.
- Not required for v1, flag as a v2 hook only: letting a user switch
  from manual to AI mid-build ("AI, take over from Day 2 onward") — the
  rebalancer already operates on partial plans, so this is a small
  extension later rather than new architecture.

### 10.3 Expense Tracking & Settle-Up (kept intentionally simple)

This is a distinct sub-system from planning — don't conflate a
*planned* budget with *actual* spend. Keep the scope small so it
doesn't compete with the agent loop for build time.

```
Expense {
  trip_id: string
  paid_by: user_id
  amount: number
  description: string
  split_between: user_id[]      # who owes a share; defaults to all trip members
  category: string               # optional, e.g. "lodging" | "food" | "activity"
}
```

**v1 approach — pick even-split by default, allow manual override:**
1. Each `Expense` splits evenly across `split_between` unless the
   creator/payer manually enters custom shares.
2. At trip end (or any time), compute each person's **net balance**:
   `net_balance[user] = sum(amount paid by user) - sum(share owed by user across all expenses)`
3. Settle-up: sort users by net balance, greedily match highest-owed
   debtor to highest-owed creditor until all balances are ~0. This is
   the standard minimal-transaction settle-up approach — don't build a
   full graph optimizer, greedy matching is sufficient and easy to
   reason about in an interview.
4. Display per person: "You paid $X, your share was $Y, you
   [owe $Z to / are owed $Z from] [name(s)]."

**Explicitly out of scope for v1** (mention as future work, don't build):
multi-currency support, partial payments/IOUs tracked over time,
splitting by custom percentages beyond simple manual override. These
add real complexity for a feature that isn't the project's
differentiator — the agent loop is.

---

## 11. Production-Minded Tooling (and why each one)

Only add infrastructure you can justify in an interview. Each item below
has a specific reason tied to this project — resist adding anything
just because it sounds impressive; an interviewer asking "why did you
need this" and getting a vague answer is worse than not having it.

### 11.1 What to add, and why

| Addition | Why it's justified here |
|---|---|
| **API gateway** (Kong, Traefik, or FastAPI middleware) | Terminates auth (JWT/session validation) so the backend doesn't reimplement it per-route, and rate-limits anonymous joiners — important because repeated plan regeneration costs real LLM + Places API money. |
| **Redis** | Two jobs: rate-limit counters (small, hot, high-churn) and cached Places/Distance Matrix responses (larger, TTL-based). Co-located in one instance for v1 — justified by low scale, not by not knowing better. Split into two instances only if one workload actually starts contending with the other. |
| **CI running the eval suite** (GitHub Actions) | Directly reinforces the project's actual differentiator: a regression in agent plan quality (Section 9.4 fixtures) gets caught automatically on every PR, not just noticed by chance. |
| **Structured logging around the agent loop** | The propose→validate→rebalance loop is exactly the kind of multi-step process that's hard to debug blind. Log which validator rejected a candidate plan and how many iterations it took — this data feeds directly into the eval numbers in your README. |
| **Docker Compose** (backend + Postgres + Redis) | Now-expected baseline for local dev; its absence looks dated more than its presence looks impressive, so treat it as a checkbox, not a differentiator. |
| **`.env.example` + documented secrets handling** | Cheap, and prevents the common student-project mistake of leaking API keys in commit history. |

### 11.2 Deliberately not adding (and why)

| Skipped | Why |
|---|---|
| Kubernetes | Near-zero payoff for a single-service solo project; reads as "added for the CV" and is an easy gap for an interviewer to expose. |
| Splitting trip/agent/expense into separate deployed microservices | Already modeled as three logical services in one backend (Section 5). Physically splitting adds service discovery and network-call overhead with no actual scaling need at this size — keep it a modular monolith, mention the split as a "how I'd scale it" talking point instead of building it. |
| Message queue (Kafka/RabbitMQ) | The disruption/rebalance trigger isn't high-throughput enough to need one. A simple background task (FastAPI BackgroundTasks, or RQ/Celery if you want it properly async) covers it. |
| Multi-region / load balancer / CDN | Nothing to justify at this scale; claiming it invites a "why" question with no good answer. |

### 11.3 Known Limitations (put this in the README verbatim, adjusted to taste)

Stating these yourself, briefly, pre-empts the interviewer finding them
first — and shows you know the difference between "didn't think about
it" and "chose not to build it at this scale."

- Single Postgres instance, single Redis instance — no replication or
  failover. Acceptable for a portfolio project; would add read replicas
  and Redis persistence/clustering before any real production load.
- Anonymous joiner identity is a session token in a cookie — clearing
  cookies or switching devices loses that joiner's link to their
  submitted constraint. No account-recovery flow for anonymous users;
  not worth the complexity at this scale.
- The agent's plan-generation call is synchronous in v1 (the user waits
  for the propose→validate→rebalance loop to finish). At larger scale or
  longer trips, this should move to a background job with a polling or
  WebSocket-based status update instead of holding the HTTP connection
  open.
- No multi-region or CDN — single deployment region, acceptable for a
  demo audience.

### 11.4 Architecture Summary

Client tier (trip creator, anonymous joiner) → Frontend (React) →
API gateway (auth + rate limiting) → Backend API (trip service, agent
orchestrator, expense service) → Data layer (Redis for cache/rate-limit
state, Postgres for persistent data) and External APIs (Google Places,
Distance Matrix, LLM). See the system architecture diagram for the
visual version of this flow.

