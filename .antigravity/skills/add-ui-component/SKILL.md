---
name: add-ui-component
description: Use when the user asks to create, implement, or modify a UI component in the React frontend.
---

# Workflow: Add a UI Component

Follow this procedure whenever adding a new React component to the frontend application.

## Step-by-Step Procedure

1. **Check Component Taxonomy & Domain:**
   - Determine whether the component is a primitive element (`frontend/src/components/common/`), a feature module (`frontend/src/components/itinerary/`, `frontend/src/components/map/`, `frontend/src/components/constraints/`, `frontend/src/components/expenses/`), or a route page (`frontend/src/pages/`).
   - Check if an existing component can be reused or extended before writing new code.

2. **Define Typed Props Interface:**
   - Import necessary domain data types from `packages/shared/types.ts` (e.g. `Trip`, `PlanItem`, `Constraint`).
   - Declare the component's `interface <ComponentName>Props` with explicit types for all props, callback handlers, and optional flags.

3. **Implement the Component:**
   - Create `frontend/src/components/<category>/<ComponentName>.tsx`.
   - Use functional React components with hooks.
   - Style exclusively using Tailwind CSS utility classes.
   - Implement states: loading skeleton, empty state, and error handling where data is fetched or dynamically transformed.
   - Ensure accessibility standards (proper ARIA attributes, semantic tags, keyboard navigability).

4. **Integrate and Export:**
   - Export the component from its module or index file.
   - Import and integrate it into the parent page or container component.

5. **Write a Unit Test:**
   - Create `frontend/src/components/<category>/<ComponentName>.test.tsx`.
   - Use Vitest and `@testing-library/react` to assert:
     - Component renders without crashing.
     - Expected labels, items, or children appear in the DOM.
     - User interactions (clicks, form submissions) trigger expected callback functions.

6. **Verify Locally:**
   - Run:
     ```bash
     cd frontend
     npm run lint
     npm run typecheck
     npm run test
     ```
