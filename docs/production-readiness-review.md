# Production readiness review

Reviewed on 2026-10-29. Work is on `chore/production-readiness`.
The owner authorized the documented security fixes by requesting deployment.

## Release status

The application security changes are implemented. Local tests, production builds,
and migration checks pass. Live deployment still requires connected Render and
Neon accounts and publication of the finished branch to the GitHub deployment
branch. No cloud resources have been created, and no source has been pushed.

## Changes

- Trip creation requires a verified account. The authenticated account determines
  ownership, and ordinary accounts list only their own or joined trips.
- Shared API dependencies enforce trip membership for private data, expenses,
  calendar exports, and advisory AI. Creator/admin access is required for trip
  management and itinerary changes. Query parameters and supplied role headers
  cannot grant access.
- Invitation joins retain signup-free participation. Guests receive opaque IDs
  and signed, expiring credentials scoped to one trip. Names are stored in a
  dedicated guest table. Guests can submit only their own preferences.
- Stop updates/deletes verify the parent plan belongs to the authorized trip and
  reject edits to historical versions. Editing a shared catalog place creates
  a private copy for that stop instead of altering other trips or plan history.
- Expenses reject non-finite values and invalid or duplicate split members.
  Expense updates/deletion require the payer or trip manager. The settlement
  and budget algorithms have not been changed.
- Public authentication/join requests and AI requests have application rate
  limits. Bodies are limited to 64 KiB. One planning request per trip and at
  most four simultaneous AI requests are admitted by the single worker.
- Production settings require PostgreSQL, a persistent signing key, enabled rate
  limits, and exact HTTPS CORS origins when configured. Public interactive API
  documentation is disabled. Credentials are hidden from configuration errors.
- Gemini authenticates through a header rather than a query parameter. HTTP logs
  redact credentials, and provider failures do not log raw response bodies or
  exception messages containing request secrets.
- The fetch client retries reads only. Trip, preference, expense, and rebalance
  failures are shown to the user instead of being presented as saved data.
- Manual visits, itinerary generation, and member removal show failed requests
  without inventing saved data or successful plan versions. The nonfunctional
  version-switch action is removed; earlier plan records remain preserved.
- The frontend uses verified guest IDs, sends guest credentials only to the
  joined trip, exports calendars with authentication headers, and hides creator
  controls from joiners. Unsigned old guest sessions must rejoin.
- Database migrations add the previously missing admin column/moderation status
  and the guest table. Explicit transactional child-before-parent deletes fix
  PostgreSQL foreign-key failures. SQLite now enforces foreign keys too.
- Runtime dependencies are pinned and excluded from development tooling in the
  production image. The legacy backend Docker build includes its migration files
  and runtime requirements. Local Compose no longer defaults to a known signing
  secret or wildcard CORS; database/cache host ports bind to loopback.
- The shared OpenAPI contract is regenerated from the actual API. Its TypeScript
  interfaces and frontend consumers reflect the updated requests and guest
  response.
- The release includes the latest `main` changes through `70c4fb8`, including
  trip lifecycle/status displays, planner safety and transaction fixes, and
  opening-hours validation. Their tests now use verified accounts where needed.
- GitHub CI verifies lint, types, tests, dependency advisories, PostgreSQL schema
  upgrades, the production container, and authenticated PostgreSQL write flows.
  The Render Blueprint deploys `main` after GitHub checks pass.

## Verification

- Backend: lint, formatting, types, and **130 passing tests**, including access,
  impersonation, cross-trip editing, request guards, and credential redaction.
- Frontend: lint, types, production build, and **142 passing tests**.
- The backend suite also passes inside the Linux/Python 3.12 container.
- Runtime and frontend dependency audits report zero known vulnerabilities.
- Fresh PostgreSQL upgrades, repeat upgrades, and Alembic schema parity pass.
- The container's production access gate passes: anonymous trip listing returns
  `401`, missing API/assets return `404`, and public API docs are disabled.
- PostgreSQL lifecycle verification covers signup/login, invitation joining,
  own-member constraints, versioned planning/rebalance, authenticated calendar
  export, expenses, settlement, and authorized trip deletion.
- A limited source scan found no API-key or private-key patterns. This is not
  a guarantee about every credential format or all Git history.

## Deployment and limits

Use the free Render web service and external free Neon PostgreSQL described in
[the deployment guide](DEPLOYMENT.md). The SPA and API share one HTTPS origin.
Secrets belong in the host environment; `SECRET_KEY` must persist across deploys.
Gemini and Google Maps keys are optional; without them planning uses the existing
destination catalog, estimates, and deterministic fallback.

Free Render hosting has cold starts and usage quotas, and has no production SLA.
The in-memory rate/concurrency guards support the configured single-worker
deployment; multiple workers or instances require shared coordination first.
Invitation codes confer the ability to join their trip, and guest sessions
expire after the configured token lifetime. Admin API usage/cost figures are
estimates rather than provider billing records.

For remote continuation, see [the Codex Cloud handoff](CLOUD_HANDOFF.md).
No published Codex Cloud environment was available during the local check;
creating a handoff document does not start a remote task.
