# Step-by-step free deployment guide

For this repository's React + Vite frontend, FastAPI backend, and PostgreSQL database.
Provider instructions checked on **October 10, 2026**. Dashboard labels and free-plan limits can change.

## What you will deploy

| Part | Service | Public address / purpose |
| --- | --- | --- |
| Frontend | Cloudflare Pages, Free | `https://YOUR_PROJECT.pages.dev` — the website you share |
| Backend | Render Web Service, Free | `https://YOUR_API.onrender.com` — handles API requests |
| Database | Neon, Free | Private PostgreSQL connection string — stores accounts and trips |

Follow this order: **upload code → Neon → Render → Cloudflare → connect and test**.

This is a free-tier demo/hobby deployment, not a guarantee of production availability.
Render's free API sleeps after 15 minutes without traffic and can take about a minute to wake up.
Its local files disappear on restarts/redeploys, so do not use SQLite there. Its free PostgreSQL service expires after 30 days; this guide uses Neon instead. [Render free-service limitations](https://render.com/docs/free).

You do not need a paid domain, Redis service, Google Maps key, or Gemini key to start the built-in demo.
Free hosting does not make optional third-party API calls free.

## 1. Prepare your accounts and upload the code

### 1.1 Create or sign in to these accounts

- [GitHub](https://github.com/) — stores the code that the hosts will deploy.
- [Neon](https://neon.com/) — select its Free plan.
- [Render](https://render.com/) — select a Free web-service instance later.
- [Cloudflare](https://dash.cloudflare.com/) — create a Pages project later.

Use a private GitHub repository if you do not want your source code publicly visible.
Give each hosting integration access only to the repository it needs.

### 1.2 Check the project locally

Open Terminal. These commands use your current Mac project path; change it if you move the project.
Use local development settings, not production database credentials, for these checks.

If dependencies are already installed, skip installation. Otherwise, install the backend dependencies:

```bash
cd /Users/nil/Documents/PersonalProject2
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
```

Run the backend checks in the same terminal:

```bash
cd /Users/nil/Documents/PersonalProject2
cd backend && source .venv/bin/activate && pytest -v
cd /Users/nil/Documents/PersonalProject2
cd backend && source .venv/bin/activate && ruff check . && ruff format --check .
cd /Users/nil/Documents/PersonalProject2
cd backend && source .venv/bin/activate && mypy app
```

Check and build the frontend:

```bash
cd /Users/nil/Documents/PersonalProject2
cd frontend && npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Stop and resolve failures before publishing. A local build alone does not verify the hosted PostgreSQL database.

### 1.3 Put the complete repository on GitHub

Upload the whole project, including `backend/`, `frontend/`, and `packages/shared/`.
The frontend imports shared types from `packages/shared`; uploading only `frontend/` is not enough.

There are already local changes in this workspace. Review them before staging or committing.
Do not commit `.env`, `.venv`, `node_modules`, database files, passwords, or API keys.
Do not commit directly to `main`.

If using GitHub Desktop, select this repository, create or use a non-main branch, review the changed files,
commit the intended changes, then publish/push that branch.

For Terminal, first inspect your branch and changes:

```bash
cd /Users/nil/Documents/PersonalProject2
git status
git branch --show-current
git remote -v
```

You may use the existing `fix/grounded-ai-planning` branch, or create a new branch:

```bash
git switch -c chore/free-hosting
```

Skip that command if you already have the branch you want. Stage only files you reviewed.
For example, after reviewing the deployment guide and all intended application changes in these paths:

```bash
git add -- DEPLOYMENT_GUIDE.md README.md backend frontend packages/shared docs
```

Omit paths containing changes you do not want to publish, or list individual files instead.
The project's ignore rules exclude typical local secrets and build artifacts, but still check the staged files yourself:

```bash
git diff --cached --name-only
git diff --cached
```

Once the staged diff is correct, commit it with a message matching the changes, for example:

```bash
git commit -m "chore: prepare travel planner deployment"
```

Then push your chosen branch. If you chose `chore/free-hosting`:

```bash
git push -u origin chore/free-hosting
```

If no remote exists, create an empty GitHub repository and follow its instructions to add `origin` first.
Do not replace an existing remote without checking it. Both hosting services must use the same uploaded branch.
Your local, uncommitted changes will not appear on either host.

## 2. Create the database on Neon

### 2.1 Create a project

1. Open the Neon dashboard and create a project named, for example, `travel-planner`.
2. Confirm the project uses the **Free** plan.
3. Choose a region close to your Render backend. Prefer matching regions when available.
4. Use a fresh database for the first deployment. Neon's default database name is commonly `neondb`.
5. Open **Connect** / connection details and select the branch, database, and database role you intend to use.

This creates a new, empty database. Your local SQLite accounts and trips are not automatically uploaded.
If you need existing data, arrange a separate reviewed data migration; do not overwrite a database you already use.

### 2.2 Copy the connection string privately

Choose a **direct / unpooled** connection for this initial single-service setup.
The same connection will be used by the application and its schema migrations.
Copy only the connection URL, not a surrounding `psql` command or quotation marks.
Keep Neon's SSL options. [Neon connection instructions](https://neon.com/docs/connect/connect-from-any-app).

For this project's installed PostgreSQL driver, change the URL prefix from:

```text
postgresql://
```

to:

```text
postgresql+psycopg2://
```

Leave the rest of the copied URL unchanged. It will resemble this placeholder:

```text
postgresql+psycopg2://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_NEON_HOST/neondb?sslmode=require
```

Use your actual copied URL, not this example. The driver is already included in `backend/requirements.txt`.
[SQLAlchemy PostgreSQL connection format](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#dialect-postgresql-psycopg2-connect).

Store the URL privately. **It contains a database password. Put it only in Render's `DATABASE_URL`, never in frontend settings or GitHub.**

## 3. Deploy the backend on Render

### 3.1 Create a Python web service

1. Open the Render dashboard.
2. Select **New → Web Service**.
3. Connect GitHub and select your repository.
4. Select the branch you pushed in step 1.
5. Use the settings below.

| Render setting | Value |
| --- | --- |
| Name | A unique name, for example `travel-planner-api-yourname` |
| Region | Near your Neon database |
| Root Directory | `backend` |
| Language / Runtime | **Python 3**, not Docker |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | **Free** |
| Health Check Path | `/healthz` |

The repository contains a Dockerfile, so check that Render has not automatically selected Docker.
The commands above are for Render's native Python runtime. Do not add `--reload`.
Enter `$PORT` literally in Render; Render supplies its value.
[Render FastAPI deployment](https://render.com/docs/deploy-fastapi), [monorepo root directories](https://render.com/docs/monorepo-support).

The start command runs migrations before starting the API. Render's pre-deploy command is unavailable for free web services,
so do not put migrations in a separate paid-only pre-deploy field. Keep this setup to one service instance.
For future paid/scaled deployments, review migration coordination first. [Render deploy commands](https://render.com/docs/deploys).

Use Python 3.11 or newer. You can leave Render's Python version at its supported default initially.
If pinning it with `PYTHON_VERSION`, Render requires a complete version number, not just `3.12`.
[Render Python-version configuration](https://render.com/docs/python-version).

### 3.2 Generate a secret key locally

Run this command in Terminal yourself:

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

Copy the result directly into Render's `SECRET_KEY` field. Do not paste it into this guide, GitHub, screenshots, or chat.
Keep the same key across ordinary restarts and redeployments; changing it invalidates existing session tokens.

### 3.3 Add the backend environment variables

In Render's environment-variable section, enter these values without surrounding quotation marks:

| Variable | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Your private Neon URL from step 2 |
| `SECRET_KEY` | The random key you generated |
| `CORS_ORIGINS` | `https://YOUR_PROJECT.pages.dev` — the planned frontend address |

Choose your intended Cloudflare project name now, for example `travel-planner-yourname`.
Its planned origin would be `https://travel-planner-yourname.pages.dev`.
If Cloudflare assigns a different name, you will correct `CORS_ORIGINS` in step 5.

Leave `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, and `OPENAI_API_KEY` unset for the first demo.
No Redis deployment is needed for the current implementation.

Production requires a unique `SECRET_KEY` of at least 32 characters and rejects wildcard CORS.
Use an exact HTTPS origin: no trailing slash, route, or `*`.

### 3.4 Deploy and check the logs

1. Click **Create Web Service** / **Deploy Web Service**.
2. Watch the build and runtime logs.
3. Confirm dependency installation succeeds, Alembic finishes, and Uvicorn starts.
4. Copy the actual Render URL, such as `https://travel-planner-api-yourname.onrender.com`.
5. Open the following addresses, substituting your actual hostname:

```text
https://YOUR_API.onrender.com/healthz
https://YOUR_API.onrender.com/docs
```

The health response should be:

```json
{"status":"ok","version":"1.0.0"}
```

`/healthz` checks that the application responds; it does not perform a live database query.
You must also complete the database and signup tests below.

### 3.5 Check the database schema

In Neon's SQL editor, select the same database/branch as `DATABASE_URL` and run this read-only query:

```sql
SELECT version_num FROM alembic_version;
```

For the repository at the time of this guide, the expected revision is `aa20260930`.
If new migrations are added later, expect the new migration head instead.

You can inspect the created tables without viewing user data:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should find tables including `users`, `trips`, `trip_members`, `constraints`, `plans`, `plan_items`, `expenses`, and `places`.
If migrations fail on an existing database, stop and review its schema/history. Do not drop tables or blindly stamp migrations.

## 4. Deploy the frontend on Cloudflare Pages

### 4.1 Connect the repository

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages → Create application → Pages** and choose the Git integration / connect-to-Git option.
3. Connect GitHub and choose the same repository.
4. Set the **production branch** to the branch you deployed on Render.
5. Choose your intended project name, for example `travel-planner-yourname`.

Select a **Pages** project, not a standalone Worker deployment.
The production branch can be your reviewed non-main branch.
[Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

### 4.2 Enter these build settings

| Cloudflare setting | Value |
| --- | --- |
| Framework preset | `None` / manual configuration |
| Root directory | Leave blank: use the repository root |
| Build command | `cd frontend && npm install && npm run build` |
| Build output directory | `frontend/dist` |

Keep the repository root available because the frontend also needs `packages/shared`.
Do not pair these commands with a root directory of `frontend`; that would make the relative paths wrong.
You are publishing the generated `dist` files, not running Vite's development server.
[Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

### 4.3 Add production build variables

Open the environment-variable section and add:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | Your actual Render origin, e.g. `https://travel-planner-api-yourname.onrender.com` |
| `NODE_VERSION` | `22` |
| `SKIP_DEPENDENCY_INSTALL` | `1` |

`SKIP_DEPENDENCY_INSTALL` avoids an automatic install at the repository root, which has no frontend `package.json`.
The build command explicitly installs inside `frontend/`. [Cloudflare build-image controls](https://developers.cloudflare.com/pages/configuration/build-image/).

For `VITE_API_URL`, use only the HTTPS backend origin:

```text
Correct: https://YOUR_API.onrender.com
Wrong:   https://YOUR_API.onrender.com/api/v1
Wrong:   http://localhost:8000
```

Do not add a trailing slash. The frontend already appends API paths.

**Never put `DATABASE_URL`, `SECRET_KEY`, or provider API keys in Cloudflare frontend variables.**
Vite variables prefixed with `VITE_` are included in the browser bundle and are not secrets.
Changing `VITE_API_URL` requires a new frontend build/deployment; refreshing the browser is not enough.
[Vite environment-variable behavior](https://vite.dev/guide/env-and-mode).

### 4.4 Publish

1. Click **Save and Deploy**.
2. Check that installation, TypeScript checking, and Vite build finish successfully.
3. Copy the stable production address: `https://YOUR_PROJECT.pages.dev`.
4. Open that address in your browser.

Use the stable production address for your initial tests, not a hash-prefixed preview deployment URL.
Each preview hostname is a different origin and is not automatically allowed by backend CORS.

## 5. Connect the two services using the final addresses

### 5.1 Update Render's allowed frontend origin

1. Open your Render service → **Environment**.
2. Set `CORS_ORIGINS` to the actual Cloudflare production origin:

```text
https://YOUR_PROJECT.pages.dev
```

3. Save and redeploy/restart the backend.
4. Confirm the new backend deploy is live.

If you intentionally use two frontend domains, enter exact origins separated by commas:

```text
https://YOUR_PROJECT.pages.dev,https://YOUR_CUSTOM_DOMAIN
```

Do not enter `*`, a page path, or a trailing slash. Do not broadly allow every preview domain.

### 5.2 Recheck Cloudflare's API origin

Confirm `VITE_API_URL` equals the actual Render HTTPS origin. If you correct it, trigger another Cloudflare deployment.
Cloudflare settings point **to Render**; Render CORS points **to Cloudflare**.

### 5.3 Verify frontend route refreshes

Open `https://YOUR_PROJECT.pages.dev/auth` directly and refresh it.
After signing in, also refresh a dashboard or trip-room page.

Cloudflare Pages automatically supports SPA fallback when there is no top-level `404.html`.
This frontend does not need a new redirect file for the basic deployment described here.
[Cloudflare SPA routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## 6. Test the complete hosted system

Use disposable test accounts and non-sensitive trip data first.

1. Open the Render `/healthz` page and wait for the API to wake up if necessary.
2. Open the Cloudflare website, choose creator signup, and register a new test account.
3. Sign out and sign back in. This tests real database reads and authentication.
4. Create a short test trip to **Lisbon**, **Tokyo**, **Paris**, or **Siem Reap**.
5. Add preferences and budgets, then generate an itinerary.
6. Open the invite link/code in a separate browser or private window and join as a guest.
7. Confirm the guest can see the intended trip and submit their own preferences.
8. Test a plan refinement/rebalance as the creator and confirm earlier plan versions remain available.
9. Add a small test expense and inspect the costs/settle-up view.
10. Download a calendar export if shown and check that the `.ics` file opens.
11. Refresh a trip-room URL and confirm the page still loads.
12. Trigger a normal Render redeploy, wait for it to finish, then confirm the account and trip remain available.

The four listed destinations have built-in catalog data and can demonstrate planning without paid API keys.
That catalog is fixture/demo data, not a guarantee of current prices or opening hours.
Arbitrary destinations and live place lookup require external-provider setup.

If any test fails, use the troubleshooting table below before sharing the website.
Do not treat a working homepage as proof that login, database persistence, and planning work.

## 7. Optional features and important limitations

### Live places and AI-assisted planning

First get the key-free demo working. Then, if needed, configure `GOOGLE_MAPS_API_KEY` and/or `GEMINI_API_KEY`
only in Render's environment settings and redeploy the backend.

The places client uses Google's Places API (New); enable the API your account supports and apply appropriate key restrictions.
The planner uses Gemini when configured. The current default model is `gemini-3.1-flash-lite`;
verify that your account can access it before overriding `LLM_MODEL_NAME`.
An `OPENAI_API_KEY` alone does not enable this project's Gemini planner.

Check provider pricing, quotas, and billing controls before enabling calls.
[Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

### Admin dashboard: review required before relying on all actions

Leave `ADMIN_EMAIL` and `ADMIN_PASSWORD` unset for the initial deployment; no administrator is seeded.
If you intentionally need admin access, review the security documentation and use strong private credentials in Render.

There is a known PostgreSQL migration gap in the current repository: the Python trip-status model includes `FLAGGED`,
but the initial database enum migration does not include that status and the next migration does not add it.
Admin trip-flagging can therefore fail on a freshly migrated Neon database.
A reviewed, additive Alembic migration and PostgreSQL tests are needed before relying on that action.
This guide does not modify protected admin code or your database schema manually.

### Custom domain

The supplied `pages.dev` address is sufficient. Buying a custom domain is optional and may cost money.
If you add one through Cloudflare Pages, add its exact HTTPS origin to Render's `CORS_ORIGINS` and redeploy the backend.

### Before real users or important financial/travel data

Arrange tested database backups/restores, review authentication and permissions, and resolve the admin schema gap if using admin functions.
Monitor quotas and errors. A free-tier demo is not a substitute for a security review or an availability commitment.
Do not assume the selected free plan provides the backup retention your application needs.

## 8. How to publish future updates

1. Make changes on a non-main branch and run the appropriate local checks from step 1.
2. Review and commit the intended files, then push the branch configured in both dashboards.
3. With Git auto-deploy enabled, each service builds from that branch. Otherwise, trigger a manual deployment.
4. Check Render's migration/startup logs and Cloudflare's build logs.
5. Repeat the signup/login, trip, planning, and route-refresh smoke tests.

For coordinated API-contract changes, do not assume the two hosts deploy simultaneously.
Use backward-compatible changes or deliberately coordinate the releases.
On Render, schema migrations run again at startup but already-applied revisions are not reapplied.
Changing a Cloudflare build variable requires rebuilding; changing a Render variable requires redeploying/restarting.

Never delete the Neon project as a redeployment step. Do not run Alembic downgrades or destructive SQL to troubleshoot a live service.

## 9. Troubleshooting

| Symptom | Check / next step |
| --- | --- |
| First request is slow or temporarily fails | Open Render `/healthz`, allow roughly a minute for cold start, then retry. Check runtime logs if it stays unavailable. |
| Browser reports CORS / failed fetch | Check API health first, then verify exact Render `CORS_ORIGINS` and Cloudflare `VITE_API_URL`; redeploy the service whose setting changed. |
| Browser requests API routes on `pages.dev` | `VITE_API_URL` was absent or empty when built. Set the Render origin and rebuild Cloudflare. |
| API requests contain `/api/v1/api/v1` | Remove `/api/v1` from `VITE_API_URL` and rebuild. |
| Cloudflare cannot find `package.json` | Use repository-root build settings and `SKIP_DEPENDENCY_INSTALL=1`; install inside `frontend/` with the documented build command. |
| Frontend cannot find shared types | Confirm `packages/shared/` was pushed and the Cloudflare build has access to the whole repository. |
| Render cannot import `app` or find Alembic files | Set Root Directory to `backend`, runtime to Python 3, and use the exact documented start command. |
| Render says no port was detected | Bind Uvicorn to `0.0.0.0` and the literal `$PORT` supplied by Render. Check whether migrations failed before Uvicorn started. |
| Production secret validation fails | Set `APP_ENV=production`, a unique key of at least 32 characters, and exact non-wildcard CORS origins. |
| Database login/SSL fails | Recopy the Neon connection URL privately; verify branch, database, role, password, and SSL parameters. Do not paste credentials into logs or support messages. |
| Alembic says a table already exists | Check whether the database was used before and inspect migration history. Do not stamp/drop blindly; use a fresh demo database only if it contains no data you need. |
| Alembic reports an interpolation error for `%` | A URL-encoded credential can encounter the current Alembic config's interpolation handling. Request a reviewed config fix; do not remove password encoding or expose the URL. |
| Trips disappear after a restart | Verify Render actually uses the Neon `DATABASE_URL`, not the default local SQLite URL, and that the same Neon branch is selected. |
| Existing accounts do not appear | A fresh Neon database does not contain your local SQLite data. Create test accounts or arrange a separate data migration. |
| Unexpected destination cannot generate a plan | Test a built-in destination first; arbitrary destinations need correctly configured live places access. |
| Admin flagging fails with a `tripstatus` enum error | The migration currently lacks `FLAGGED`; request the reviewed forward migration described in step 7. |
| Sessions stop working after redeployment | Check whether `SECRET_KEY` changed. Reuse the original key; expired tokens still require a fresh login. |
| Preview website fails but production works | Preview hostname is a different origin. Use the production URL or intentionally allow only the specific preview origin you need. |
| Build or service is suspended | Check provider usage dashboards and current free-plan limits; avoid assuming free means unlimited. |

When sharing an error, include its message and the failing step, but redact passwords, connection strings, tokens, and API keys.

## 10. Completion checklist

- [ ] The complete reviewed project is committed and pushed on the selected non-main branch.
- [ ] Neon is on the Free plan, and its private URL is stored only in backend settings.
- [ ] Render uses a Free Python web service with `backend` as its root directory.
- [ ] Render runs migrations successfully and responds at `/healthz`.
- [ ] Neon shows the current Alembic revision and application tables.
- [ ] Cloudflare Pages builds from the repository root and publishes `frontend/dist`.
- [ ] `VITE_API_URL` points to Render; `CORS_ORIGINS` points to Cloudflare.
- [ ] No database password, signing key, or provider API key is in the frontend bundle or GitHub.
- [ ] Signup, login, trip creation, guest joining, planning, and costs work on the hosted system.
- [ ] Frontend deep links survive refresh and database data survives a backend redeploy.
- [ ] Free-plan usage limits and the admin trip-flagging limitation are understood.

**Share the Cloudflare production website URL with your users — not the database connection string.**
