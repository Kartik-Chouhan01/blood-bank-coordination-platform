# Architecture

> Status: approved design, implemented incrementally by phase. Sections marked _(Phase N)_ describe
> designs that are not built yet. See [Changes from the original specification](#changes-from-the-original-specification)
> for every deliberate deviation and why.

## 1. System overview

A **modular monolith**: one Express API with strict internal module boundaries, so modules can be
extracted into services later without rewriting them.

```text
React SPA (Vite) ──HTTPS/JSON──▶ Express API (/api/*)
                                  ├─ middleware: helmet · cors · rate-limit · request log · auth · rbac · validate · errors
                                  ├─ modules: auth · users · donors · hospitals · blood-banks · donations · blood-units
                                  │           requests · matching · notifications · dashboard · audit · settings
                                  ├─ domain core (pure, no I/O): compatibility · state machines · ranking
                                  └─ jobs: expiry sweep · reservation-hold release · outreach expiry
                                         │
                                  MongoDB replica set (transactions required)
```

**Rule:** state machines, compatibility and ranking are pure functions in `backend/src/domain`.
Services orchestrate (transaction → persist → audit → notify), controllers only translate HTTP,
and nothing writes a status field except through its state machine.

## 2. Repository layout

```text
packages/shared   Enums, error codes, API envelope types, disclaimers — used by BOTH backend and frontend
backend/          Express + Mongoose API (TypeScript, ESM)
frontend/         React + Vite SPA (TypeScript, Tailwind CSS v4)
docs/             This document and future ADRs
```

### Backend (`backend/src`)

```text
config/        env.ts (zod-validated, fails fast) · logger.ts (pino, PII redaction) · db.ts
domain/        compatibility/ · stateMachines/ · ranking/                       (Phase 5–7)
modules/<name>/  <name>.routes.ts · .controller.ts · .service.ts · .validators.ts · .model.ts
middleware/    requestLogger · validate · errorHandler · rateLimits · authenticate · authorize
jobs/          scheduler + individual jobs                                       (Phase 5+)
utils/         AppError · respond
routes.ts      the only place feature routers are mounted
```

Feature-grouped modules (instead of top-level `controllers/`, `services/`, … folders) keep each
domain's route, controller, service, validator and model together. The layering inside a module is
exactly Route → Controller → Service → Model.

### Frontend (`frontend/src`)

```text
components/ui       Button, Badge, Card, FormField/Input, Modal, ConfirmationDialog, Loading/Empty/ErrorState
components/domain   StatusBadge, MedicalDisclaimer (later: BloodGroupPill, UnitTimeline, FilterBar, StatCard…)
features/<name>     pages/ · components/ · hooks/ · api.ts   (public, system, auth, donor, hospital, inventory, …)
layouts/            PublicLayout · AuthLayout · DashboardLayout (permission-filtered navigation)
routes/             route table + guards
services/           httpClient (axios, envelope unwrapping, error normalisation), ApiClientError
hooks/              useApiQuery
constants/          app config, status → label/icon/tone presentation
```

## 3. Entities

```text
User 1─1 DonorProfile 1─* Donation 1─* BloodUnit *─1 BloodBank
User 1─1 Hospital     1─* BloodRequest 1─* Allocation *─1 BloodUnit
User(staff) *─1 BloodBank
BloodRequest 1─* DonorOutreach *─1 DonorProfile
User 1─* Notification     User 1─* AuthSession     AuditLog → any entity (polymorphic)
SystemSetting (typed key/value; defaults live in code)
```

| Model             | Key fields                                                                                                                                                                                                                                  | Indexes / constraints                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| User              | name, email, phone, passwordHash (`select:false`), role, accountStatus, emailVerified, phoneVerified, lastLoginAt, tokenVersion, bloodBankId (staff), consentAcceptedAt                                                                     | email unique; {role, accountStatus}                                                     |
| AuthSession       | userId, refreshTokenHash, family, expiresAt, revokedAt, replacedBy, userAgent                                                                                                                                                               | TTL(expiresAt); userId                                                                  |
| VerificationToken | userId, purpose (EMAIL_VERIFY / PASSWORD_RESET), tokenHash, expiresAt, usedAt                                                                                                                                                               | TTL                                                                                     |
| DonorProfile      | userId, bloodGroup, bloodGroupConfirmed (staff only), dateOfBirth, sex (optional), location {city, area, point≈1 km}, lastDonationAt, donationCount, availabilityStatus, availabilityHistory[], verificationStatus, notificationPreferences | userId unique; 2dsphere(point); {bloodGroup, availabilityStatus, verificationStatus}    |
| BloodBank         | name, code, address, location, contact, isActive                                                                                                                                                                                            | code unique                                                                             |
| Hospital          | userId, name, registrationNumber, contact, address, location, verificationStatus, verifiedBy/At, rejectionReason, operatingStatus                                                                                                           | registrationNumber unique; 2dsphere                                                     |
| Donation          | donorId, bloodBankId, collectedAt, collectedBy, donationType, volumeMl, testingStatus, testedBy/At                                                                                                                                          | {donorId, collectedAt}                                                                  |
| BloodUnit         | unitCode, donationId, donorId (never exposed), bloodBankId, bloodGroup, componentType, volumeMl, collectedAt, expiryDate, storageLocation, status, testingStatus, currentAllocationId, statusHistory[]                                      | unitCode unique; {status, bloodGroup, componentType, expiryDate}; {bloodBankId, status} |
| BloodRequest      | requestNumber, hospitalId, bloodGroup, componentType, unitsRequested/Allocated/Issued, urgency, requiredBy, reasonCategory, hospitalReference (opaque — no patient identity), status, statusHistory[], outreachStatus, version              | {status, urgency, createdAt}; {hospitalId, createdAt}; requestNumber unique             |
| Allocation        | requestId, unitId, status, reservedBy/At, holdUntil, issuedBy/At, releaseReason                                                                                                                                                             | **partial unique on unitId where status ∈ {RESERVED, ISSUED}**                          |
| DonorOutreach     | requestId, donorId, score, approxDistanceKm, status, notifiedAt, respondedAt                                                                                                                                                                | {requestId, donorId} unique; {donorId, notifiedAt}                                      |
| Notification      | recipientId, type, title, message, entity{type,id}, priority, readAt, deliveries[]                                                                                                                                                          | {recipientId, readAt, createdAt}                                                        |
| AuditLog          | actorId, actorRole, action, entityType, entityId, before, after, reason, meta{requestId, ipTruncated, userAgent}                                                                                                                            | {entityType, entityId, createdAt}; {actorId, createdAt}; append-only                    |
| SystemSetting     | key, value, updatedBy                                                                                                                                                                                                                       | key unique                                                                              |

## 4. API surface

Envelope: `{ success: true, data, meta? }` or `{ success: false, message, errorCode, details?, requestId? }`.

| Base path             | Highlights                                                                                                                                                                                                                   | Access                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `/api/health`         | DB-aware liveness (503 when degraded)                                                                                                                                                                                        | public — **built**                           |
| `/api/auth`           | register/donor, register/hospital, login, refresh, logout, logout-all, verify-email, forgot/reset-password, me                                                                                                               | public / authenticated — **built**           |
| `/api/users`          | list, get, change status (reason required), `me`, `staff` (invite), `:id/resend-invite`                                                                                                                                      | ADMIN — **built**                            |
| `/api/donors`         | `me` (get/patch, availability, notification-preferences), `me/donations`; list/get/verification/blood-group — **built** (requests for help live under `/api/donor-outreach`)                                                 | self / STAFF, ADMIN                          |
| `/api/hospitals`      | `me` (get/patch); list/get (STAFF, ADMIN); `:id/verification` (ADMIN) — **built**                                                                                                                                            | self / STAFF, ADMIN                          |
| `/api/blood-banks`    | list/get (STAFF, ADMIN); create/update incl. deactivate (ADMIN) — **built**                                                                                                                                                  | STAFF, ADMIN                                 |
| `/api/donations`      | record (creates units), list, get, `:id/start-testing`, `:id/test-result`; donors: `GET /donors/me/donations` — **built**                                                                                                    | STAFF (own bank), ADMIN                      |
| `/api/blood-units`    | filtered list (earliest expiry first), `summary`, detail with history and allowed actions, `POST :id/transitions` — **built**                                                                                                | read: STAFF, ADMIN; change: own bank / ADMIN |
| `/api/requests`       | hospital: create, `mine`, `mine/stats`, edit (PENDING), `:id/escalate`, `:id/confirm-receipt`; staff: queue (priority-sorted), `stats`, `:id/review`; both: `:id` (incl. allocations), `:id/cancel` — **built**              | HOSPITAL (own) / STAFF, ADMIN                |
| `/api/matching`       | `requests/:id/inventory` (ranked candidates), `requests/:id/allocations` (reserve), `allocations/:id/release`, `allocations/:id/issue`, `requests/:id/donors` (search), `requests/:id/outreach` (list / contact) — **built** | STAFF, ADMIN (change: own bank / ADMIN)      |
| `/api/donor-outreach` | `mine`, `:id/respond` — **built**                                                                                                                                                                                            | DONOR (own)                                  |
| `/api/notifications`  | mine, unread-count, read, read-all                                                                                                                                                                                           | owner                                        |
| `/api/dashboard`      | donor / hospital / admin / analytics / public-stats                                                                                                                                                                          | role-scoped                                  |
| `/api/audit-logs`     | filtered, paginated, read-only list (action, record type, record id, actor, date range) — **built**                                                                                                                          | ADMIN                                        |
| `/api/settings`       | get / patch (reason required, audited)                                                                                                                                                                                       | ADMIN                                        |

Self-service always uses `/me` routes, so a client never supplies its own owner id (IDOR by design).

## 5. Authentication & authorization

```text
login/register ──▶ { accessToken (JSON body, 15 min) } + Set-Cookie bbms_rt (httpOnly, 7 days, Path=/api/auth)
API call ──▶ Authorization: Bearer <access> ──▶ authenticate (JWT + DB lookup) ──▶ authorize(permission)
401 TOKEN_EXPIRED ──▶ client: single-flight POST /auth/refresh (cookie) ──▶ new pair ──▶ replay request
```

- **Access token** — HS256 JWT (`sub`, `role`, `tv` = tokenVersion; issuer/audience pinned), kept only
  in memory on the client. `authenticate` re-reads role, status and `tokenVersion` from the database
  on every request, so the role inside a token is never trusted, and suspension / sign-out-everywhere
  / password change take effect immediately.
- **Refresh token** — 256-bit random value in an httpOnly cookie; only its SHA-256 hash is stored
  (`AuthSession`). Every refresh **rotates** it inside the same `family`. Claiming a token is an
  atomic conditional update, so of two concurrent refreshes exactly one wins; the loser gets
  `SESSION_ROTATED` and retries once with the new cookie (multi-tab safe). Presenting an
  already-rotated token after a 15 s grace window is treated as theft: the whole family is revoked
  and `REFRESH_TOKEN_REUSE_DETECTED` is audited.
- **CSRF** — the cookie is `SameSite=Strict` by default and scoped to `/api/auth`; cookie-authenticated
  endpoints (refresh, logout) additionally reject foreign `Origin` headers.
- **Passwords** — bcrypt (cost 12, configurable, ≥10 enforced in production); policy: ≥10 characters
  with a letter and a digit, ≤72 bytes (bcrypt's limit). Unknown emails still run a dummy bcrypt
  comparison so response timing does not reveal registered accounts.
- **Brute force** — per-IP limiter on credential endpoints, plus a per-email lockout (5 failures →
  15 min) stored by email hash whether or not the account exists (no enumeration via lockout).
  Account status (suspended) is revealed only after the correct password.
- **Email verification / password reset** — single-use hashed tokens with TTL (24 h / 30 min),
  consumed atomically; issuing a new one invalidates the previous. Links carry the token in the URL
  **fragment** (`#token=`), which browsers never send to servers or in `Referer`, and the page strips
  it from the address bar. Forgot-password always answers 202. Reset revokes every session and
  marks the email verified. Emails go through a `MailAdapter` (console in development; refuses to
  print tokens in production).
- **Authorization** — a single permission map in `@bbms/shared` (`users:manage → [ADMIN]`, …).
  Routes use `authorize('users:manage')`; the UI uses the same map only to hide unusable controls.
- **Object-level checks** — services receive an `Actor`; self-service uses `/me` routes; admin routes
  validate ids (400) and return 404 for unknown ones.
- **Bootstrap** — there is no public way to become ADMIN or staff. The first admin is created with
  `npm run create-admin -w @bbms/backend -- --email … --name …`.

## 6. Blood-unit state machine

Implemented in `backend/src/domain/inventory/unitStateMachine.ts` (pure, unit-tested). Every status
change goes through `transitionUnit()`, which validates against this table, applies a
compare-and-set on the current status, appends to the unit's history and writes the audit entry.

```text
COLLECTED ──staff──▶ UNDER_TESTING ──test PASSED──▶ AVAILABLE ──allocation──▶ RESERVED ──allocation──▶ ISSUED ──allocation──▶ RECEIVED
    │                     │  └──test FAILED──▶ DISCARDED            ▲              │ release (reason)
    │ discard (reason)    │ discard (reason)                        └──────────────┘
    ▼                     ▼
 DISCARDED ◀──────────────┴──── AVAILABLE discard (reason) ◀─┐
    ▲   └──admin override (reason): back to UNDER_TESTING    │
    └── record disposal (reason) ◀── EXPIRED ◀── system: COLLECTED | UNDER_TESTING | AVAILABLE | RESERVED past expiry
```

| Actor                    | May do                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Staff (own bank) / admin | send to testing; discard with reason; record disposal of expired units                                                   |
| Testing result           | UNDER_TESTING → AVAILABLE (passed) or DISCARDED (failed) — the **only** route to AVAILABLE                               |
| Allocation               | reserve / release / issue / receive — the only route to RESERVED/ISSUED/RECEIVED                                         |
| System (expiry job)      | → EXPIRED (a RESERVED unit's allocation is released in the same transaction)                                             |
| Admin override           | DISCARDED → UNDER_TESTING (discarded in error); must be re-tested; flagged in history and audited as `WORKFLOW_OVERRIDE` |

Expiry is enforced by date in every query (usable stock = AVAILABLE **and** `expiryDate > now`), so
correctness never depends on the sweep job having run.

## 7. Blood-request state machine

Implemented in `backend/src/domain/requests/requestStateMachine.ts` (pure, unit-tested); every
change goes through `transitionRequest()` (compare-and-set on status + history + audit).

```text
PENDING ──staff approve──▶ APPROVED ⇄ PARTIALLY_ALLOCATED ⇄ ALLOCATED ──all issued──▶ FULFILLED ──hospital confirms──▶ COMPLETED
                             ▲                                  │ (releases move back down; status follows reserved+issued count)
                             └──────────────────────────────────┘
   │ ▲ system: EMERGENCY auto-approve (reason recorded)
   ├──staff reject (reason)──▶ REJECTED
   └──hospital or staff cancel (reason), from any open status──▶ CANCELLED
open + required-by passed + grace period + nothing issued ──system──▶ EXPIRED
```

- Hospitals edit only while PENDING; urgency can only be raised (escalating a pending request to
  EMERGENCY auto-approves it). Hospitals see only their own requests (others → 404).
- The staff queue sorts by stored `urgencyRank` (EMERGENCY 0, URGENT 1, ROUTINE 2), then earliest
  `requiredBy`; open requests past required-by are flagged **overdue** and stay actionable for
  `REQUEST_EXPIRY_GRACE_HOURS` (default 2) before the sweep expires them.
- Allocation states, FULFILLED and COMPLETED are reachable only through the allocation workflow
  (`modules/matching/allocationWorkflow.ts`). `unitsAllocated` counts reserved + issued units; the
  status is derived from it (`statusForAllocatedUnits`).
- Cancelling or expiring a request releases its reserved units in the same transaction; issued
  units stay issued and the hospital can still confirm their receipt.

## 8. Inventory matching & concurrency

1. `BloodCompatibilityService.getCompatibleDonorGroups(recipientGroup, componentType)` — **component-aware**:
   red cells follow standard ABO/Rh donor rules; **plasma is inverted** (AB is the universal plasma
   donor, Rh not considered); whole blood is ABO/Rh-identical; platelets use their own table.
2. Candidates: `status=AVAILABLE`, `testingStatus=PASSED`, `expiryDate > max(now, requiredBy)`,
   matching component and compatible group.
3. Ranking: identical group first → compatible substitutes (O− last, to conserve it) →
   earliest expiry → collection date.
4. Staff confirm the selection (pre-selected, never auto-reserved).
5. Reservation runs in one transaction: per unit, a conditional
   `findOneAndUpdate({_id, status:'AVAILABLE', expiryDate:{$gt:now}})` (null ⇒ abort with
   `UNIT_NOT_AVAILABLE`), insert Allocation (partial unique index = second guard), guarded request
   update (`version` + `unitsAllocated ≤ requested - n`), audit log. Notifications are sent after commit.
6. Reservations carry `holdUntil` (`RESERVATION_HOLD_HOURS`, default 24); the hold sweep releases
   stale ones. Issuing re-checks the expiry date, so an expired unit can never be handed over.
7. Staff see every bank's candidates but reserve, issue and release only their own bank's units.

Built as described. As implemented, step 5's per-unit guard is `transitionUnit()`'s compare-and-set
on AVAILABLE inside the transaction (after an in-transaction read that re-checks status, testing,
expiry and compatibility); a duplicate-key error from the partial unique index is reported as
`UNIT_NOT_AVAILABLE`. Concurrency is covered by integration tests (same unit for two requests; two
staff over-allocating one request).

## 9. Donor matching

Hard filters ("system criteria"): compatible group, AVAILABLE, verified, active account, cooldown
elapsed by `requiredBy` (configurable), preferences permit contact, weekly contact cap, not already
contacted, within radius (`$geoNear` on ≈1 km-rounded point, wider for EMERGENCY).
Score = weighted proximity + exact-group preference + time since cooldown + response history.
Top N (≈ shortfall × 3) get a `DonorOutreach` record and a notification. Staff see only
group/area/≈distance/availability; contact details are revealed to blood-bank staff only after a
donor responds INTERESTED. Hospitals never see donor identity. Wording is always
"Potential donor based on system criteria".

As built (`modules/matching/donorMatching.service.ts`, scoring in `domain/matching/ranking.ts`):
radius `DONOR_SEARCH_RADIUS_KM` (25) / `DONOR_SEARCH_RADIUS_EMERGENCY_KM` (50); donors without an
approximate location are matched by the hospital's city; score weights proximity 40, exact group
20, staff-confirmed group 10, time since contact allowed 15, response history 15 (no history is
neutral). Suggested contacts = shortfall × `OUTREACH_DONORS_PER_UNIT` (3), at most
`OUTREACH_MAX_DONORS` (30) per request. Staff confirm the selection; EMERGENCY requests contact the
top suggestions automatically only when compatible stock cannot cover them. Until notifications
exist (Phase 8), donors see requests for help on their dashboard; unanswered outreach becomes
NO_RESPONSE when the request closes or passes required-by.

## 10. Security

helmet · CORS allowlist (wildcard refused in production) · per-IP rate limit (stricter on auth) ·
a request guard rejecting `$`-prefixed or dotted keys anywhere in body/query, plus zod validation that
strips unknown keys (NoSQL-injection and mass-assignment guard) · 100 kb JSON limit · consistent errors that never expose stack traces or
internal messages · request ids for support correlation · pino log redaction of credentials, tokens,
email, phone and date of birth · secrets only from environment, validated at startup.

## 11. Testing

- **Backend** — Vitest + Supertest against a real single-node replica set (mongodb-memory-server),
  so transactions and unique indexes behave exactly as in production. Unit tests for pure domain
  logic; integration tests for workflows, IDOR, role violations and concurrent reservations.
- **Frontend** — Vitest + React Testing Library (jsdom).
- **Shared** — Vitest for enum helpers.

## 12. Phases

| #   | Phase                                                                                  | Status   |
| --- | -------------------------------------------------------------------------------------- | -------- |
| 1   | Foundation: monorepo, config, DB, logging, errors, health, UI primitives, public pages | **done** |
| 2   | Authentication & RBAC                                                                  | **done** |
| 3   | Donors                                                                                 | **done** |
| 4   | Hospitals, blood banks, verification, audit module                                     | **done** |
| 5   | Inventory: donations, units, testing, unit state machine, expiry job                   | **done** |
| 6   | Requests lifecycle                                                                     | **done** |
| 7   | Matching: compatibility, allocation, donor outreach                                    | **done** |
| 8   | Notifications                                                                          | next     |
| 9   | Dashboards & analytics                                                                 |          |
| 10  | Security & audit review                                                                |          |
| 11  | Test hardening, seed data, OpenAPI docs, deployment config                             |          |

## Changes from the original specification

Approved deviations, with rationale. New items are appended as phases land.

### Safety & correctness

| #   | Change                                                                                                                                                           | Why                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| S1  | Compatibility is evaluated **per component type** (separate red-cell, plasma, platelet, whole-blood rules).                                                      | A single ABO/Rh matrix gives dangerous answers for plasma, whose compatibility is inverted. |
| S2  | Compatibility matrices live in version-controlled, tested code — **not admin-editable**. Admins can only toggle policies (e.g. allow substitution, conserve O−). | A mistaken UI edit would silently create unsafe recommendations.                            |
| S3  | Donors see "next date the system may contact you", never "you are eligible".                                                                                     | The spec forbids implying medical fitness.                                                  |
| S4  | Self-declared blood groups are flagged until staff set `bloodGroupConfirmed`; unconfirmed donors rank lower.                                                     | A donor's self-report is not a lab result.                                                  |
| S5  | No patient identity on requests — only an opaque hospital reference.                                                                                             | Data minimisation; the platform does not need it.                                           |
| S6  | Single configurable cooldown per donation type; `sex` optional and unused for now.                                                                               | Avoids collecting sensitive data just for rule variants.                                    |

### Workflow

| #   | Change                                                                                                                                                                                                                    | Why                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| W1  | Request states: `CREATED` merged into `PENDING`; `MATCHING` removed as a state (it's an activity, tracked by `outreachStatus`); reservation ≠ fulfilment (`PARTIALLY_ALLOCATED`/`ALLOCATED` → `FULFILLED` → `COMPLETED`). | The spec's Scenario 2 called 3-of-5 reserved "fulfilled", which misreports what the hospital actually has. |
| W2  | Unit lifecycle ends at `RECEIVED` (hospital confirms receipt) instead of `USED`. `APPROVED/REJECTED` became `testingStatus`, not lifecycle states.                                                                        | The blood bank cannot know a unit was transfused, and recording transfusion is clinical data.              |
| W3  | Staff (not hospitals) reserve units; the double-booking guard protects concurrent staff and competing requests.                                                                                                           | Matches how the spec's own workflow assigns responsibility.                                                |
| W4  | Hospitals may edit a request only while `PENDING`; afterwards only cancel or escalate urgency (audited).                                                                                                                  | Prevents changing a request after units were allocated against it.                                         |
| W5  | EMERGENCY requests from verified hospitals auto-approve; donor outreach auto-runs only on a shortfall. ROUTINE/URGENT wait for staff review.                                                                              | Speed where it matters without spamming donors.                                                            |
| W6  | The public "emergency request" CTA routes to sign-in plus an optional configurable hotline — no anonymous request form.                                                                                                   | An unauthenticated form is an abuse/spam vector.                                                           |
| W7  | Reservations expire (`holdUntil`) and are auto-released.                                                                                                                                                                  | Otherwise units could be locked indefinitely.                                                              |
| W8  | Public inventory statistics are coarse levels (Low / Moderate / Good) per group, cached.                                                                                                                                  | Exact counts can be scraped and misread.                                                                   |

### Architecture, usability & scalability (added during Phase 1)

| #   | Change                                                                                                     | Why                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A1  | **TypeScript everywhere** with a shared `@bbms/shared` package for enums, error codes and API types.       | One source of truth: a status added on the backend is a compile error in the UI until handled.               |
| A2  | **zod** instead of express-validator.                                                                      | Typed validation, reusable on the frontend with React Hook Form (Phase 2), strips unknown fields by default. |
| A3  | **Vitest** for all packages instead of Jest.                                                               | Native TS/ESM, one runner and config style across the monorepo.                                              |
| A4  | Separate `BLOOD_BANK_STAFF` role and `BloodBank` entity from day one.                                      | The multi-bank network becomes a data change, not a migration.                                               |
| A5  | New `Allocation` and `DonorOutreach` collections.                                                          | Traceability of unit↔request links and donor contact history; DB-level double-booking guard.                 |
| A6  | Zero-install local MongoDB replica set (`npm run dev:db`) instead of requiring Docker or a native install. | Transactions need a replica set; this works on any machine with Node. Atlas is the alternative.              |
| A7  | Express 5 (native async error propagation), pino structured logging with request ids and PII redaction.    | Fewer try/catch wrappers; logs that are safe to ship and easy to correlate with user reports.                |
| A8  | Tailwind v4, React Router 7 (library mode), native `<dialog>` for modals.                                  | Current, low-dependency choices; `<dialog>` gives accessible focus trapping for free.                        |
| A9  | Status badges always pair an icon and text label with colour; a single `MedicalDisclaimer` component.      | Accessibility (never colour-only) and consistent safety messaging.                                           |
| A10 | Consent timestamp at registration; account deletion implemented as anonymisation.                          | Health-adjacent personal data (e.g. India's DPDP Act) while keeping donation records intact.                 |
| A11 | Health endpoint returns 503 when the database is down.                                                     | Lets load balancers / uptime monitors take a degraded instance out of rotation.                              |

### Added during Phase 2

| #   | Change                                                                                                                                                                           | Why                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A12 | Refresh-token **rotation with reuse detection** and a short multi-tab grace window; access tokens carry `tokenVersion`.                                                          | Stolen refresh tokens are detected and neutralised; "sign out everywhere", suspension and password changes are instant.                                      |
| A13 | **Per-email login lockout** (keyed by email hash, applies to unknown emails too) in addition to per-IP rate limits; constant-time-ish unknown-user path.                         | Stops credential stuffing against one account from many IPs without revealing which emails exist.                                                            |
| A14 | Email links put tokens in the **URL fragment** and the page strips them.                                                                                                         | Tokens never reach server logs, proxies or third parties via `Referer`.                                                                                      |
| A15 | Replaced Mongoose's global `sanitizeFilter` with an HTTP-boundary guard that **rejects** `$`/dotted keys.                                                                        | `sanitizeFilter` also rewrites the application's own `$in`/`$gt` queries, which would break later phases; rejecting at the edge is clearer and just as safe. |
| A16 | **Audit log brought forward** from Phase 4: registration, email verification, password reset/change, sign-out-everywhere, status changes and token-reuse events are audited now. | Accountability for account events from day one.                                                                                                              |
| A17 | Admin **Users page** (search, role/status filters, pagination, suspend/reactivate with mandatory reason) delivered in Phase 2.                                                   | Exercises the RBAC stack end-to-end and gives admins a real tool immediately.                                                                                |
| A18 | `create-admin` CLI; no public path to ADMIN/staff roles.                                                                                                                         | Safe bootstrap without a hard-coded default admin.                                                                                                           |
| A19 | Change-password (keeps this device signed in, signs out others) and "sign out of all devices" on an Account page.                                                                | Standard account-security self-service.                                                                                                                      |
| A20 | Registration is transactional (user + profile + audit) and signs the user in immediately.                                                                                        | No orphan accounts on failure; fewer steps for new users.                                                                                                    |
| A21 | Shared zod schemas drive **both** API validation and React Hook Form validation.                                                                                                 | One set of rules; the UI shows the same messages the API would.                                                                                              |

### Added during Phase 3

| #   | Change                                                                                                                                                                                                                                | Why                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A22 | "Away until a date" availability: a temporarily unavailable donor becomes available again automatically. Effective availability is computed on read and in queries (`domain/donors/availability.ts`), so no background job can drift. | Donors don't have to remember to switch back; matching in Phase 7 reuses the same filter.  |
| A23 | Coordinates are rounded to ≈1 km **in the browser and again on the server**, never returned by any API (donors only see "location saved"), and never written to the audit log.                                                        | Location privacy by construction, not just by UI.                                          |
| A24 | Staff donor views show **age, not date of birth**, and no phone/email/coordinates.                                                                                                                                                    | Data minimisation: coordination needs group, area and availability — not identity details. |
| A25 | Donors can correct their self-declared blood group until staff confirm it; afterwards it is locked. Staff corrections that change the declared group require an audited note.                                                         | Fixes honest mistakes early without letting confirmed data drift.                          |
| A26 | `DONOR_CONTACT_INTERVAL_DAYS` (default 90) drives "the system will not contact you before…". Environment setting for now; moves to admin-editable System Settings in Phase 10.                                                        | The interval is a blood-bank policy, not a hard-coded medical rule.                        |
| A27 | Donor **profile-completion checklist** with deep links, distinguishing donor actions from staff-only steps.                                                                                                                           | Guides donors to become reachable and well-matched.                                        |
| A28 | Self-service name/phone for every role (`PATCH /users/me`); changing phone resets `phoneVerified`. Audit stores only which fields changed.                                                                                            | Keeps contact details current without leaking them into logs.                              |
| A29 | Availability history capped at the latest 50 changes (`$push` + `$slice`).                                                                                                                                                            | Bounded document growth.                                                                   |
| A30 | Bug fix: a deliberate sign-out no longer remembers the page for "return after sign-in" (the next person signing in on a shared device was sent to the previous user's page).                                                          | Found during end-to-end testing; covered by a regression test.                             |

### Added during Phase 4

| #   | Change                                                                                                                                                                                                                                                                                                               | Why                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A31 | **Staff invitations** instead of admin-set passwords: the admin invites, the account stays `PENDING` (cannot sign in, cannot be force-activated) until the invitee chooses a password via a 72-hour single-use link, and is then signed straight in. "Forgot password" on a pending account re-sends the invitation. | Admins never know staff passwords; no shared or default credentials.                        |
| A32 | Staff must belong to an **active** blood bank; the staff member's bank is shown in the header and the Users list. Admins may optionally belong to one.                                                                                                                                                               | Prepares every staff action (inventory, allocation) to be scoped to a bank.                 |
| A33 | Blood banks are **deactivated, never deleted**.                                                                                                                                                                                                                                                                      | Units and audit history will reference them permanently.                                    |
| A34 | Hospital **resubmission flow**: a rejected hospital that corrects its name/registration number goes back to `PENDING` automatically (with `resubmittedAt`), and admins see "Resubmitted with corrected details".                                                                                                     | Rejection is recoverable without admin back-and-forth.                                      |
| A35 | Hospital name and registration number are **locked once verified**; address and operating status stay editable. The UI sends only changed fields.                                                                                                                                                                    | What the admin verified cannot silently change afterwards.                                  |
| A36 | Hospitals are **emailed** the verification decision (with the reason when rejected/suspended), sent only after the database commit.                                                                                                                                                                                  | The hospital learns the outcome without polling; a rolled-back decision is never announced. |
| A37 | Hospital directory lists **pending reviews first**; the admin console shows an "N awaiting review" badge.                                                                                                                                                                                                            | Verification work is visible where admins start.                                            |
| A38 | **Audit log viewer** (admin only) with filters and a field-by-field before/after view, plus a per-record **History** panel on donor and hospital pages. There is no API to edit or delete entries (tested).                                                                                                          | Accountability is usable, not just stored.                                                  |
| A39 | Audit action names and labels moved to `@bbms/shared`, so the backend model and the admin viewer cannot drift apart.                                                                                                                                                                                                 | Single source of truth.                                                                     |
| A40 | `rejectionReason` generalised to `statusReason` (used for rejection and suspension).                                                                                                                                                                                                                                 | One field, consistent meaning.                                                              |

### Added during Phase 5

| #   | Change                                                                                                                                                                                                                                                                                                                                                                 | Why                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A41 | The spec's `APPROVED`/`REJECTED` unit states are the **test result** (`testingStatus`), applied per donation to every unit under testing. A passed result records the **tested blood group** on the units and confirms the donor's group; a tested group contradicting an already-confirmed donor group is refused and the units stay under testing for investigation. | Lab results, not self-declarations, determine the group used in inventory.            |
| A42 | The only override is "return a unit discarded in error to testing". Overrides can never reach AVAILABLE, RESERVED or ISSUED (asserted by unit tests).                                                                                                                                                                                                                  | Overrides correct records; they never bypass testing or allocation.                   |
| A43 | Shelf lives are configurable per component (`SHELF_LIFE_DAYS`); defaults are reference values the user approved.                                                                                                                                                                                                                                                       | Local regulations and storage differ.                                                 |
| A44 | Expired-by-date units are excluded from usable stock immediately and shown as "Expired — awaiting disposal"; the sweep job (every 5 min, idempotent, per-unit history + audit) then marks them.                                                                                                                                                                        | Allocation can never pick an expired unit, even between sweeps or if the job is down. |
| A45 | Staff can view all banks' inventory but change only their own bank's units and donations; admins can change any.                                                                                                                                                                                                                                                       | Network visibility for matching without cross-bank edits.                             |
| A46 | Readable unit codes `BANKCODE-YYMMDD-NNNN` from an atomic counter (date in UTC), reserved outside the transaction to avoid a write hot spot.                                                                                                                                                                                                                           | Humans read codes on labels; concurrency-safe (tested with parallel recordings).      |
| A47 | Unit volume is stored for whole blood only; separated components are not assigned invented volumes.                                                                                                                                                                                                                                                                    | No fabricated clinical measurements.                                                  |
| A48 | Donors see only date, blood bank and type of their donations — never test results or unit details. Failed-test notes are staff/audit-only.                                                                                                                                                                                                                             | Test results can reveal medical information.                                          |
| A49 | Donations cannot be recorded for rejected/suspended donors; back-dating is limited to 7 days; donor `donationCount`/`lastDonationAt` update in the same transaction.                                                                                                                                                                                                   | Data integrity; feeds the contact-interval rule from Phase 3.                         |

### Added during Phase 6

| #   | Change                                                                                                                                                                       | Why                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A50 | Emergency auto-approval is a **recorded system step** (history + audit with reason), and escalating a pending request to EMERGENCY auto-approves it too.                     | The spec's "system immediately" behaviour stays accountable.                              |
| A51 | Urgency can only be **raised** by the hospital, with a reason; edits are allowed only while pending.                                                                         | Prevents quietly downgrading or rewriting a request after staff act on it.                |
| A52 | **Grace period before expiry** (`REQUEST_EXPIRY_GRACE_HOURS`, default 2): past required-by, a request is flagged _overdue_ but stays actionable before the sweep expires it. | Staff may still be working on a late request; expiring it instantly would lose that work. |
| A53 | Queue priority stored as `urgencyRank` and indexed `{status, urgencyRank, requiredBy}`.                                                                                      | Priority sorting happens in the database, not in memory.                                  |
| A54 | Administrative **reason categories** only, a hospital reference restricted to `A–Z 0–9 / _ . -`, and an explicit "no patient identifiers" notice on the form.                | Data minimisation — the reference field cannot hold a name with spaces.                   |
| A55 | Staff request detail shows **exact-match usable stock** as a hint; compatible-group matching comes with Phase 7.                                                             | Useful for review now without pre-empting the compatibility service.                      |
| A56 | Requests from unverified or closed hospitals are refused with an explanation, and the hospital's new-request page explains why instead of showing the form.                  | Clear feedback instead of a failed submit.                                                |
| A57 | Wording fix: the UI no longer claims staff are "alerted" for emergencies until notifications exist (Phase 8); it says the request is at the top of the staff queue.          | The UI must not claim something the system doesn't do yet.                                |

### Added during Phase 7

| #   | Change                                                                                                                                                                                                                | Why                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A58 | Compatibility tables per component: red cells standard ABO/Rh; plasma **and cryoprecipitate** inverted (Rh ignored); whole blood identical only; platelets plasma-ABO-compatible with Rh-negative kept Rh-negative.   | Conservative administrative defaults; every table is covered by unit tests (S1, S2).          |
| A59 | Substitutes are offered with Rh-positive before Rh-negative, and universal donors (O− red cells, AB plasma) last.                                                                                                     | Conserves the groups that patients without alternatives depend on.                            |
| A60 | New rule `ALLOCATED → APPROVED` (by allocation, with reason) for when every reservation of a request is released.                                                                                                     | A single-unit request whose only unit is released must return to approved.                    |
| A61 | Staff may reserve only their own bank's units (other banks' candidates are listed but not selectable); administrators may reserve any.                                                                                | Consistent with A45: visibility across the network, changes only by the owning bank.          |
| A62 | Issuing refuses a unit past its expiry date even before the sweep marks it, and the hold/expiry jobs release reservations transactionally.                                                                            | An expired unit can never leave the bank; a request never counts a unit it cannot receive.    |
| A63 | Hospitals see units reserved/issued for their request (code, group, bank, expiry) but not who reserved them or released reservations; they confirm receipt for all issued units at once.                              | Enough to receive units physically; internal staff activity stays internal.                   |
| A64 | Donor search returns no names, contact details or coordinates; contact appears only for INTERESTED (or DONATED) outreach. Donors see only group, component, urgency, timing, city and ≈distance — never the hospital. | Data minimisation on both sides of the match.                                                 |
| A65 | Donors can change their answer (interested ⇄ declined) while the request is open; marking outreach DONATED is deferred to a later phase.                                                                              | People's plans change; linking a donation to an outreach needs more workflow than this phase. |
| A66 | Emergency auto-outreach runs after the request commits and never fails the request; its outreach is recorded with no human actor.                                                                                     | Raising an emergency request must not depend on the donor search succeeding.                  |
| A67 | The request's `exactMatchAvailable` hint (A55) is replaced by `stock { exact, compatibleSubstitutes }`, shown to staff while the request is open, including during review.                                            | Reviewers see realistic availability, using the same filter the allocation uses.              |
