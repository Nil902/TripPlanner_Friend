# Deployment and automatic releases

## Current release status

**Do not deploy this branch yet.** Authentication and trip authorization changes
are awaiting the owner's confirmation required by `SECURITY.md`. The container
smoke check in CI deliberately requires anonymous trip listing to return `401`.
The current API returns `200`, so that check blocks publication until the reviewed
security fixes are implemented. See [the security review](production-readiness-review.md).

## Hosting

The checked-in `render.yaml` describes one **free** Render web service in
Singapore. The root Dockerfile builds React with Node 22 and serves it from
FastAPI with Python 3.12. Both use the same HTTPS origin, so a second frontend
service and cross-origin credentials are unnecessary.

Use a **free Neon PostgreSQL project**, preferably in the corresponding Singapore
region. Render's free web filesystem is ephemeral; SQLite would lose records on
restarts or deployment. Render's own free PostgreSQL databases expire after 30
days and are not the intended datastore for this configuration.

Render free web services sleep after inactivity and have usage limits. This
deployment targets a small hobby application and does not provide continuous
availability or a production SLA. See [Render's free service limits](https://render.com/docs/free)
and [Neon's free plan](https://neon.com/pricing).

## One-time account setup

After the security changes have been reviewed and all production checks pass:

1. Connect the owner's Render and Neon accounts. Create the Neon project on its
   free plan and retain its PostgreSQL connection string with TLS enabled.
2. Connect Render to GitHub and authorize access to
   `Nil902/TripPlanner_Friend`. Use a connected GitHub repository, rather than
   its public clone URL, so Render can receive CI status and push events.
3. Create a Render Blueprint using this repository and its `render.yaml` on
   `main`. Keep `plan: free`. Provide the Neon URL as the secret `DATABASE_URL`
   in Render. The Blueprint generates and persists `SECRET_KEY` on creation.
   Never regenerate that key on each deployment: existing sessions depend on it.
4. Optional: set `GEMINI_API_KEY` in Render's secret environment settings for
   Gemini planning and Q&A. The configured model is `gemini-3.1-flash-lite`.
   Without a Gemini key the existing deterministic planner is used. Optional
   `GOOGLE_MAPS_API_KEY` enables the existing live Places integration; without
   it the app uses its destination catalog and estimated travel data.
5. Leave `CORS_ORIGINS` empty for this same-origin deployment. If a separate
   frontend is introduced later, list its exact HTTPS origin instead.

API keys and database credentials belong in Render environment settings.
Do not paste them into source files, GitHub workflow files, or chat messages.
An admin account is not created by default. Configure `ADMIN_EMAIL` and a strong
`ADMIN_PASSWORD` in Render only if the owner needs the administration portal.

## GitHub workflow

The owner pushes the prepared branch and opens a pull request to `main`:

```bash
git push -u origin chore/production-readiness
```

Use the commit message `improve system` as requested. Do not push directly to
`main`; review and merge the pull request after the production gate passes.

`.github/workflows/ci.yml` runs on pushes and pull requests and verifies:

- Backend lint, formatting, types, isolated tests, and production dependency audit.
- Frontend lint, types, tests, production build, and dependency audit.
- Fresh PostgreSQL migrations, repeatable upgrades, and schema parity.
- The real production Docker image, database readiness, frontend deep links,
  static assets, missing-route behavior, and anonymous-access protection.

Render's `autoDeployTrigger: checksPass` deploys changes to `main` after GitHub
checks pass. This avoids a deploy-hook secret and a race between tests and
deployment. It requires the Render/GitHub integration to be connected. See
[Render's CI integration](https://render.com/docs/deploys#integrating-with-ci).

On startup the container runs `alembic upgrade head` and starts one Uvicorn
worker as an unprivileged user. A failed migration stops startup. `/healthz`
checks the process; `/readyz` verifies database access and is Render's deployment
health check. Only runtime Python dependencies are included in the image.

## Verify a deployed release

```bash
python3 scripts/smoke_deployment.py https://YOUR-SERVICE.onrender.com --require-auth
```

This check reads the public site and API responses without creating trips,
sending credentials, or touching user records. Allow for a free-service cold
start. Also verify account signup/login, invite joining, an itinerary generation,
and an expense round trip using dedicated test accounts before sharing the site.

For rollback, choose an earlier successful Render deployment. Database upgrades
are additive; do not run destructive Alembic downgrades on a live database. Use
the database provider's backup/restore workflow when data restoration is needed.
