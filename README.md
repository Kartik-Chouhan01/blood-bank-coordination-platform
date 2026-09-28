# LifeLink — Blood Bank Management & Emergency Blood Coordination

> Connecting blood donors, hospitals, and blood banks when every unit matters.

A full-stack (MongoDB · Express · React · Node, TypeScript) platform that manages the lifecycle of
blood — donation → testing → inventory → request → reservation → issue → receipt — while
coordinating hospitals, blood banks, administrators and potential donors.

> **Medical safety boundary.** This is an administrative coordination system. All blood collection,
> testing, compatibility confirmation, transfusion and donor-eligibility decisions must be made by
> qualified medical/blood-bank personnel according to applicable regulations and protocols.

## Status

| Phase | Scope                                                                                                       | Status  |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------- |
| 1     | Foundation — monorepo, config, database, logging, error handling, health check, UI primitives, public pages | ✅ Done |
| 2     | Authentication & role-based access control, admin user management                                           | ✅ Done |
| 3     | Donor profiles, availability, donation history                                                              | ⏭ Next  |
| 4–11  | Hospitals, inventory, requests, matching, notifications, analytics, security review, testing & deployment   | Planned |

The full design — entities, APIs, state machines, matching algorithms and **every deliberate change
from the original specification** — is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
backend/          REST API — feature modules under src/modules/<name>/
frontend/         React SPA — feature folders under src/features/<name>/
docs/             Architecture and design decisions
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

Donors and hospitals register themselves at http://localhost:5173/register. In development,
verification and password-reset emails are printed to the API terminal — open the link from there.

## Scripts (run from the repository root)

| Command                           | What it does                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                     | Builds the shared package, then runs API (:5000) and web (:5173) with hot reload |
| `npm run dev:db`                  | Starts the local MongoDB replica set                                             |
| `npm test`                        | Runs all test suites (shared, backend, frontend)                                 |
| `npm run build`                   | Production build of all packages                                                 |
| `npm run typecheck`               | Type-checks every package                                                        |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                |

## Environment variables

Backend (`backend/.env`, see [backend/.env.example](backend/.env.example)):

| Variable                                  | Required | Default                 | Purpose                                                        |
| ----------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `MONGODB_URI`                             | ✅       | —                       | Replica-set connection string                                  |
| `NODE_ENV`                                |          | `development`           | `development` \| `test` \| `production`                        |
| `PORT`                                    |          | `5000`                  | API port                                                       |
| `LOG_LEVEL`                               |          | `info`                  | pino log level                                                 |
| `CORS_ORIGINS`                            |          | `http://localhost:5173` | Comma-separated allowed browser origins (no `*` in production) |
| `TRUST_PROXY`                             |          | `0`                     | Number of reverse proxies in front of the API                  |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` |          | 15 min / 1000           | General per-IP rate limit                                      |
| `AUTH_RATE_LIMIT_MAX`                     |          | `20`                    | Per-IP limit (per 15 min) on login, registration, reset        |
| `JWT_ACCESS_SECRET`                       | ✅       | —                       | ≥ 32 random characters; placeholders are refused in production |
| `JWT_ACCESS_TTL_SECONDS`                  |          | `900`                   | Access-token lifetime                                          |
| `REFRESH_TOKEN_TTL_DAYS`                  |          | `7`                     | Refresh-session lifetime                                       |
| `BCRYPT_ROUNDS`                           |          | `12`                    | Password hashing cost (≥ 10 in production)                     |
| `APP_URL`                                 |          | `http://localhost:5173` | Web app URL used in email links                                |
| `COOKIE_SAMESITE`                         |          | `strict`                | `strict` for same-site deployments; `none` only if cross-site  |
| `DONOR_CONTACT_INTERVAL_DAYS`             |          | `90`                    | Days after a donation before the system may contact a donor    |

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
