# Production readiness review

Reviewed against the current `main` checkout on 2026-10-29. Changes are being
prepared on `chore/production-readiness`.

## Confirmed release blockers

1. **API authorization:** trip listing, trip creation, constraint submission,
   itinerary changes, rebalance, and expenses accept unauthenticated requests.
   Trip update/delete permit requests when no authenticated identity is present.
   Caller-controlled roles and user IDs are used in permission decisions.
2. **Cross-trip edits:** itinerary item update/delete look up an item by its ID
   without verifying that its plan belongs to the trip in the request URL.
3. **Guest impersonation:** joining a trip accepts a caller-supplied member ID.
   Guests do not receive a signed credential that proves their membership.
4. **Database migrations:** the initial migration lacks the `users.is_admin`
   column and `FLAGGED` trip status used by the current application. Production
   startup uses `create_all`, which cannot upgrade existing PostgreSQL tables.
5. **Deployment configuration:** Docker Compose defaults to a known signing
   secret and wildcard CORS. The frontend and backend are separate containers;
   there is no cloud deployment manifest or continuous deployment configuration.
6. **Client retries:** the fetch wrapper retries writes after network/server
   failures and retries client errors because they are caught by the outer
   catch. This can duplicate expenses, registrations, and AI plan generations.
7. **Credential exposure risk in error logging:** Gemini keys are included in
   request URLs, and some HTTP failures are logged with their exception text.
8. **Verification:** baseline backend results are 45 passing tests and one
   failing permission test. Frontend lint fails on an unused catch parameter.
   Backend lint, formatting, and type checking pass.

## Proposed security changes for owner review

The repository's `SECURITY.md` requires explicit confirmation before changing
authentication, permissions, environment configuration, or GitHub workflows.
The proposed changes are:

- Require a verified account to create trips; use that account's ID as creator.
  List only trips belonging to the verified account.
- Add shared API dependencies for trip members and trip managers. Use verified
  credentials and database membership, never client-provided roles or user IDs.
  Require creator/admin access for trip management and itinerary mutation;
  require membership for trip data, expenses, and advisory AI requests.
- Preserve joining by invitation without signup. Issue an expiring, signed,
  trip-scoped guest credential and store a guest's display name separately.
  Guests can submit their own constraints and read their joined trip; they
  cannot impersonate creators or joiners of another trip.
- Verify itinerary items belong to the authorized trip before edits or deletion.
  Validate expense participants on update as well as creation, without changing
  the protected settlement or budget algorithms.
- Bound public authentication/join requests and costly AI requests with rate
  limits in the application, including when Nginx is not used.
- Validate production configuration, use a persistent signing secret supplied
  by the host, reject wildcard CORS, disable public interactive API docs in
  production, and keep secrets in host environment variables.
- Update the existing GitHub workflow to run isolated tests, PostgreSQL migration
  checks, dependency audits, and production builds. Configure Render to deploy
  `main` only after those checks pass.
- Add regression tests for missing/forged credentials, unrelated users,
  trip-scoped guests, cross-trip item edits, and deployment behavior.

No real credentials or existing production data are needed for these changes.
Existing unsigned guest sessions will need to rejoin using their invitation.

## Hosting proposal

Use one free Render web service to serve FastAPI and the built React SPA from
the same HTTPS origin, with a separate free Neon PostgreSQL database. The
database must be external because the Render free service filesystem is
ephemeral. Do not use Render's free PostgreSQL tier for durable deployment;
it expires after 30 days.

Use a checked-in Render Blueprint and the existing GitHub repository. Keep the
database URL, signing secret, and optional Gemini/Google Maps keys exclusively
in Render environment settings. Preserve plan version history. Apply Alembic
upgrades before starting the application and verify database readiness.

Free hosting has cold starts, usage quotas, and no production availability
guarantee. This configuration targets a small, low-traffic application.

Provisioning and live verification require the owner's connected Render and
Neon accounts. Publishing source depends on the owner's push preference.

## Implemented while security review is pending

- Upgraded Vite, its React plugin, Vitest, and their lockfile; the frontend
  dependency audit now reports zero vulnerabilities.
- Fixed client retry behavior so failed writes are not replayed and client
  errors are not retried.
- Trip creation and expense creation keep unsaved forms open on failure.
  Rebalance reports the real saved version and notes instead of fabricated
  success data. Added corresponding regression tests.
- Isolated backend tests in disposable databases with external API keys disabled.
  Removed a test's incorrect expectation that a caller-supplied role should
  grant management access, and removed test ordering dependence for admin setup.
- Added an additive migration for the existing `is_admin` field and `FLAGGED`
  status, with SQLite upgrade and schema-parity coverage.
- Added same-origin static hosting, database readiness checks, a non-root
  production container, pinned runtime dependencies, and a Render Blueprint.
- Added the explicitly requested CI/CD configuration. Its production smoke gate
  currently blocks deployment because anonymous trip listing remains open.
- The Python dependency audit identified an outdated certificate bundle;
  `certifi` has been updated to its patched release.

Authentication, guest credentials, permission routines, protected environment
configuration, and settlement math have not been modified. They remain part of
the pending security review. No cloud resources have been provisioned.

## Verification of the prepared changes

- Backend lint, formatting, and type checking pass; **56 tests pass**.
- Frontend lint, type checking, production build, and **78 tests pass**.
- npm and the Python production dependency audits report **zero known
  vulnerabilities**, including an audit of the Linux/Python 3.12 image.
- The production image builds for `linux/amd64` and serves the SPA, assets, deep
  links, and database readiness successfully against disposable PostgreSQL.
- Fresh PostgreSQL migrations, repeat upgrades, and `alembic check` pass.
- The production authorization gate **fails**, as intended for the current
  unprotected API: anonymous `GET /api/v1/trips` returns `200` instead of `401`.
  The release remains blocked until the owner's approved fixes are implemented.
- The prepared source scan found no API-key or private-key patterns. This is
  a limited source scan, not a guarantee about credentials or all Git history.
