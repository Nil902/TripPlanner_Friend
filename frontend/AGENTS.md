# AGENTS.md — Frontend Module Guidelines

This document governs agent operations within the `frontend/` directory.

---

## Scope & Purpose
The frontend module contains the Single Page Application (SPA) built with React, Vite, TypeScript, and Tailwind CSS. It is responsible for trip creation, constraint collection, interactive day-by-day itinerary browsing, disruption simulation, and expense settling.

---

## Local Setup & Commands
Ensure you are in the `frontend/` directory:
- **Install dependencies:** `npm install`
- **Run dev server:** `npm run dev` (starts on `http://localhost:5173`)
- **Run unit tests:** `npm run test`
- **Run tests in watch mode:** `npm run test:watch`
- **Lint code:** `npm run lint`
- **Type check:** `npm run typecheck`
- **Build production bundle:** `npm run build`

---

## Directory Structure & Component Organization
- `src/api/`: Typed API client wrappers. All network requests go through this layer and use interfaces defined in `packages/shared/types.ts`.
- `src/components/`:
  - `common/`: Reusable primitive UI elements (Buttons, Badges, Modals, Loaders, Alerts).
  - `itinerary/`: Day view, timeline item card, schedule trade-off explanation banner.
  - `map/`: Interactive route and marker map (Leaflet or Google Maps embed).
  - `constraints/`: Constraint intake form (budget slider, style tag selector, dietary picker).
  - `expenses/`: Expense logging table and greedy settle-up summary cards.
- `src/hooks/`: Custom hooks for encapsulating async lifecycle and state:
  - `useTrip.ts`, `usePlan.ts`, `useRebalance.ts`, `useExpenses.ts`.
- `src/pages/`: Route-level entry points:
  - `TripPage.tsx`: Main dashboard for a specific trip.
  - `NewTripPage.tsx`: Trip creation form.
  - `JoinTripPage.tsx`: Constraint submission form for joiners.

---

## Frontend Hard Rules & Conventions
1. **Always import shared types from `packages/shared/types.ts`:** Do not duplicate domain schemas (e.g. `Trip`, `PlanItem`, `Constraint`) inside frontend local files.
2. **Strict Tailwind CSS usage:** Do not introduce `.module.css` or arbitrary inline CSS styles unless dynamically calculating coordinates for custom map overlays.
3. **Accessibility (a11y):** All interactive elements must have accessible labels, keyboard focus indicators (`focus-visible`), and semantic HTML elements (`<button>`, `<main>`, `<nav>`).
4. **Resilient UI States:** Every view consuming async backend data must explicitly handle three distinct states:
   - **Loading State:** Skeleton loaders or spinner indicators.
   - **Error State:** User-friendly alert banner with retry action.
   - **Empty State:** Helpful prompt guiding the user on what action to take next.
5. **No Direct DOM Mutation:** Always rely on React state and refs; do not query or mutate DOM nodes directly outside of map canvas integration boundaries.
