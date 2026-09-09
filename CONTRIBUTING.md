# Contributing Guidelines

Thank you for contributing to the **Autonomous Travel & Group Itinerary Coordinator**! This document defines development workflows, branching conventions, commit standards, and pull request procedures for both human engineers and AI agents.

---

## 1. Branching Strategy

We follow a GitHub flow branching model:

- `main` is always stable, releasable, and protected.
- Never commit directly to `main`.
- All work must be completed on short-lived feature, fix, or chore branches cut from `main`.

### Branch Naming Conventions

Branch names must follow the format `<type>/<issue-or-short-slug>`:

| Prefix | Usage | Example |
|---|---|---|
| `feat/` | New features or capabilities | `feat/travel-time-validator` |
| `fix/` | Bug fixes and corrections | `fix/settle-up-float-rounding` |
| `agent/` | Agent loop improvements, prompts, or tool schemas | `agent/rebalance-window-slicing` |
| `eval/` | Eval fixtures, benchmarks, and test harness changes | `eval/lisbon-budget-scenarios` |
| `refactor/` | Code refactoring without behavioral changes | `refactor/sqlmodel-trip-relations` |
| `docs/` | Documentation additions or updates | `docs/adr-places-caching` |
| `test/` | Adding or updating unit/integration tests | `test/open-hours-checker` |
| `chore/` | Tooling, dependencies, or CI/CD updates | `chore/bump-vite-vitest` |

---

## 2. Commit Message Format

Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary in imperative mood>

[optional body explaining motivation and context]

[optional footer(s), e.g. Closes #123]
```

### Allowed Types
- `feat`: A new user-facing feature or agent capability
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Formatting, whitespace changes (no code logic changes)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to build process, dependency updates, or tooling

### Allowed Scopes
- `backend`, `frontend`, `shared`, `agent`, `validator`, `eval`, `db`, `ci`

### Commit Examples
- `feat(agent): implement backtracking penalty in travel time validator`
- `fix(backend): prevent negative expense share in greedy settle-up`
- `docs(specs): add spec template for dynamic rebalancing hooks`
- `test(eval): add 3-day lisbon venue closed disruption fixture`

---

## 3. Pull Request (PR) Process

1. **Keep PRs Focused:** Aim for small, reviewable pull requests (< 300 lines of changes). Separate refactorings from new feature logic.
2. **Pre-flight Checks:** Before opening a PR, ensure all local checks pass:
   ```bash
   # Backend
   cd backend && ruff check . && mypy app && pytest
   
   # Frontend
   cd ../frontend && npm run lint && npm run typecheck && npm run test
   ```
3. **Draft PRs:** Open PRs as "Draft" if work is in progress. Mark "Ready for Review" once CI passes and acceptance criteria are met.
4. **Description Requirements:** Every PR must include:
   - **Summary:** What was changed and why.
   - **Impacted Areas:** Components modified (e.g. backend models, frontend UI, shared contracts).
   - **Verification:** Screenshots/GIFs for UI changes, or terminal output for backend/eval changes.
   - **Breaking Changes:** Explicit note if API contract or database schemas are altered.
5. **Review & Merge:**
   - At least 1 code review approval is required.
   - Squash and merge is the standard merge strategy to maintain a clean git history.

---

## 4. Code Standards & Guidelines

### Python (Backend & Agent Core)
- Formatted and linted with **Ruff** (line length 88).
- Strict typing with **Mypy** on all functions and models.
- Asynchronous routes with `async def` in FastAPI.
- Deterministic validators must be pure functions where possible (no external I/O inside math validation logic).

### TypeScript (Frontend & Shared Packages)
- Formatted with **Prettier** and linted with **ESLint**.
- No implicit `any` types; all API interactions must type-check against `packages/shared/types.ts`.
- Functional components with React hooks.
- Tailwind CSS utility classes; avoid inline styles.

### Testing Expectations
- Every new API endpoint must have a corresponding test in `backend/tests/`.
- Every deterministic validator (`check_budget`, `check_travel_time`, `check_open_hours`) must have 100% branch test coverage with unit tests.
- Every new UI component must have a corresponding test in `frontend/src/`.
