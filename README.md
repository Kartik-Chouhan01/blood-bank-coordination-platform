# DigiRakt - Blood Bank Management & Emergency Blood Coordination

> Connecting blood donors, hospitals, and blood banks when every unit matters.

A full-stack (MongoDB · Express · React · Node, TypeScript) platform that manages the lifecycle of
blood - donation → testing → inventory → request → reservation → issue → receipt — while
coordinating hospitals, blood banks, administrators and potential donors.

> **Medical safety boundary.** This is an administrative coordination system. All blood collection,
> testing, compatibility confirmation, transfusion and donor-eligibility decisions must be made by
> qualified medical/blood-bank personnel according to applicable regulations and protocols.

## Status

| Phase | Scope                                                                                                       | Status  |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------- |
| 1     | Foundation - monorepo, config, database, logging, error handling, health check, UI primitives, public pages | ✅ Done |
| 2     | Authentication & role-based access control, admin user management                                           | ✅ Done |
| 3     | Donor profiles, availability, notification preferences; staff donor directory & verification                | ✅ Done |
| 4     | Hospitals & verification, blood banks, staff invitations, audit log viewer                                  | ✅ Done |
| 5     | Blood inventory: donations, units, testing, unit lifecycle, expiry                                          | ✅ Done |
| 6     | Blood requests: lifecycle, urgency, staff review queue, expiry                                              | ✅ Done |
| 7     | Matching: compatibility, unit allocation, donor outreach                                                    | ✅ Done |
| 8     | Notifications: in-app and email, header bell, notifications page                                            | ✅ Done |
| 9     | Dashboards & analytics: staff overview, analytics, hospital figures, public stock levels                    | ✅ Done |
| 10    | Security & audit review, system settings, account deletion                                                  | ✅ Done |
| 11    | Test hardening, seed data, OpenAPI docs, deployment config                                                  | ✅ Done |

The full design - entities, APIs, state machines, matching algorithms and **every deliberate change
from the original specification** - is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The security
review (threat model, controls, findings) is in [docs/SECURITY.md](docs/SECURITY.md).

## Tech stack

| Layer    | Choices                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| Frontend | React 19, Vite, TypeScript, React Router 7, Tailwind CSS 4, Axios, lucide icons                  |
| Backend  | Node 22, Express 5, TypeScript, Mongoose 9, zod, pino, helmet, express-rate-limit                |
| Database | MongoDB **replica set** (required for multi-document transactions)                               |
| Testing  | Vitest everywhere · Supertest · mongodb-memory-server (real replica set) · React Testing Library |
| Tooling  | npm workspaces, ESLint (typescript-eslint), Prettier                                             |

## Repository layout

```text
packages/shared   Domain enums, error codes, API contract types shared by backend and frontend
backend/          REST API - feature modules under src/modules/<name>/
frontend/         React SPA - feature folders under src/features/<name>/
deploy/           nginx config (SPA + /api proxy + security headers), production env template
docs/             Architecture, security review, deployment guide, generated OpenAPI document
.github/          CI (typecheck, lint, tests with coverage, audit, container builds) and Dependabot
```

## Getting started

**Prerequisites:** Node.js ≥ 22.12 and npm. Docker is **not** required.

```bash
npm install
```

```bash
cp backend/.env.example backend/.env
```

Start a database — pick **one**:

- **Local (zero install):** in a separate terminal run `npm run dev:db`. This starts a single-node
  MongoDB replica set on port 27017 with data kept in `backend/.data/`. The first run downloads the
  MongoDB server binary (a one-time download of roughly 780 MB) from MongoDB's official download site.
- **MongoDB Atlas:** create a free cluster and put its connection string in `MONGODB_URI` in
  `backend/.env`.

Then start the API and web app together:

```bash
npm run dev
```

- Web app: http://localhost:5173
- API health: http://localhost:5000/api/health (also proxied at http://localhost:5173/api/health)

The footer of the web app shows **"All systems operational"** when the frontend, API and database
are all connected.

### Create the first administrator

There is deliberately no public way to register as an administrator. Create one from the command
line (the password is generated and printed once, or taken from `ADMIN_PASSWORD`):

```bash
npm run create-admin -w @bbms/backend -- --email admin@example.org --name "Site Admin"
```

After signing in as that administrator, add a blood bank (**Blood banks**) and invite staff
(**Users → Invite staff**); invitees receive a link to choose their own password. Donors and
hospitals register themselves at http://localhost:5173/register, and administrators verify
hospitals under **Hospitals**. In development,
verification and password-reset emails are printed to the API terminal — open the link from there.

### Demo data (optional)

To explore every screen with realistic data instead of starting empty:

```bash
npm run seed -w @bbms/backend
```

It creates two blood banks, staff, four hospitals, 48 donors, tested stock, requests at every stage
(pending, partly allocated, awaiting receipt, completed, rejected, cancelled, an emergency),
donor outreach, notifications and 60 days of history for the analytics page - all through the
application's own services. Accounts are printed at the end (`admin@digirakt.test`,
`staff.pune@digirakt.test`, `citygeneral@digirakt.test`, `donor01@digirakt.test`, …) and share
one password (`SEED_PASSWORD`, or a generated one shown once). It only runs on an empty database;
use `-- --reset` to replace existing data, and it refuses to run in production.

## Scripts (run from the repository root)

| Command                                 | What it does                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                           | Builds the shared package, then runs API (:5000) and web (:5173) with hot reload |
| `npm run dev:db`                        | Starts the local MongoDB replica set                                             |
| `npm test`                              | Runs all test suites (shared, backend, frontend)                                 |
| `npm run test:coverage`                 | Tests with coverage reports and minimum thresholds (as in CI)                    |
| `npm run seed -w @bbms/backend`         | Demo data (development only; `-- --reset` replaces existing data)                |
| `npm run docs:openapi -w @bbms/backend` | Regenerates `docs/openapi.json` from the route table                             |
| `npm run create-admin -w @bbms/backend` | Creates an administrator (`-- --email … --name …`)                               |
| `npm run build`                         | Production build of all packages                                                 |
| `npm run typecheck`                     | Type-checks every package                                                        |
| `npm run lint` / `npm run format`       | ESLint / Prettier                                                                |

## Environment variables

Backend (`backend/.env`, see [backend/.env.example](backend/.env.example)):

| Variable                                           | Required | Default                 | Purpose                                                        |
| -------------------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `MONGODB_URI`                                      | ✅       | —                       | Replica-set connection string                                  |
| `NODE_ENV`                                         |          | `development`           | `development` \| `test` \| `production`                        |
| `PORT`                                             |          | `5000`                  | API port                                                       |
| `LOG_LEVEL`                                        |          | `info`                  | pino log level                                                 |
| `CORS_ORIGINS`                                     |          | `http://localhost:5173` | Comma-separated allowed browser origins (no `*` in production) |
| `TRUST_PROXY`                                      |          | `0`                     | Number of reverse proxies in front of the API                  |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`          |          | 15 min / 1000           | General per-IP rate limit                                      |
| `AUTH_RATE_LIMIT_MAX`                              |          | `20`                    | Per-IP limit (per 15 min) on login, registration, reset        |
| `JWT_ACCESS_SECRET`                                | ✅       | —                       | ≥ 32 random characters; placeholders are refused in production |
| `JWT_ACCESS_TTL_SECONDS`                           |          | `900`                   | Access-token lifetime                                          |
| `REFRESH_TOKEN_TTL_DAYS`                           |          | `7`                     | Refresh-session lifetime                                       |
| `BCRYPT_ROUNDS`                                    |          | `12`                    | Password hashing cost (≥ 10 in production)                     |
| `APP_URL`                                          |          | `http://localhost:5173` | Web app URL used in email links                                |
| `COOKIE_SAMESITE`                                  |          | `strict`                | `strict` for same-site deployments; `none` only if cross-site  |
| `DONOR_CONTACT_INTERVAL_DAYS`                      |          | `90`                    | Days after a donation before the system may contact a donor    |
| `SHELF_LIFE_DAYS`                                  |          | reference values        | Per-component overrides, e.g. `PLATELETS=7,PRBC=35`            |
| `EXPIRY_WARNING_DAYS`                              |          | `3`                     | "Expiring soon" window                                         |
| `EXPIRY_SWEEP_INTERVAL_MINUTES`                    |          | `5`                     | How often expired units are marked                             |
| `JOBS_ENABLED`                                     |          | `true`                  | Background jobs on/off                                         |
| `REQUEST_EXPIRY_GRACE_HOURS`                       |          | `2`                     | Hours an overdue request stays open before it expires          |
| `RESERVATION_HOLD_HOURS`                           |          | `24`                    | Unissued reservations are released after this                  |
| `DONOR_SEARCH_RADIUS_KM` / `…_EMERGENCY_KM`        |          | `25` / `50`             | Donor search radius around the hospital                        |
| `OUTREACH_DONORS_PER_UNIT` / `OUTREACH_MAX_DONORS` |          | `3` / `30`              | How many potential donors are suggested / at most contacted    |
| `PUBLIC_STOCK_LOW_BELOW` / `…_GOOD_FROM`           |          | `5` / `15`              | Public stock level thresholds (units)                          |
| `APP_TIME_ZONE`                                    |          | `Asia/Kolkata`          | Time zone for message text and analytics buckets               |
| `NOTIFICATION_RETENTION_DAYS`                      |          | `180`                   | Notifications are deleted after this                           |
| `MAIL_TRANSPORT` / `SMTP_URL` / `MAIL_FROM`        |          | `console`               | `smtp` sends real email through `SMTP_URL`                     |
| `API_DOCS_ENABLED`                                 |          | on outside production   | Serve the OpenAPI document at `/api/docs/openapi.json`         |

Policy values (contact interval, holds, radii, outreach size, grace period, warnings, public
thresholds) are only **defaults**: administrators change them at runtime in **System Settings**.

The server validates its configuration at startup and refuses to start with a clear message if
anything is missing or invalid.

Frontend (`frontend/.env`, optional, see [frontend/.env.example](frontend/.env.example)):
`VITE_API_BASE_URL` (default `/api`) and `VITE_EMERGENCY_HOTLINE` (shown on the public emergency
call-to-action when set).

## API conventions

Every response uses one envelope:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "message": "Blood unit cannot be reserved",
  "errorCode": "UNIT_NOT_AVAILABLE",
  "details": [{ "field": "body.unitIds", "message": "..." }],
  "requestId": "3f1c…"
}
```

`errorCode` values are defined once in `packages/shared` and are what the frontend branches on.
Stack traces and internal messages are never returned; the `requestId` (also sent as the
`X-Request-Id` header) links a user-visible error to server logs.

## Authentication at a glance

- Short-lived access token (memory only) + rotating httpOnly refresh cookie; reuse of an old refresh
  token revokes the whole session chain.
- Roles: `DONOR`, `HOSPITAL`, `BLOOD_BANK_STAFF`, `ADMIN`, mapped to permissions in
  `packages/shared/src/constants/permissions.ts`. The backend re-checks the user's real role and
  status on every request.
- Per-IP rate limits, per-email lockout, email verification, password reset, change password and
  "sign out of all devices".

Details: [docs/ARCHITECTURE.md §5](docs/ARCHITECTURE.md#5-authentication--authorization).

## Testing

Backend integration tests run against a real in-memory **replica set**, so transactions and unique
indexes behave exactly as in production.

```bash
npm test
```

## API documentation

The OpenAPI 3.1 description in [docs/openapi.json](docs/openapi.json) is generated from the route
table itself — paths, request schemas (the same zod schemas that validate requests) and access
rules (the same middleware that enforces them) — so it cannot drift: a test fails when it is out
of date. It is also served at `/api/docs/openapi.json` in development. Open it in any OpenAPI
viewer (e.g. Swagger Editor, Postman, Insomnia).

## Deployment

Docker images, a compose file (MongoDB replica set + API + nginx web), security headers, CI and a
go-live checklist: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
