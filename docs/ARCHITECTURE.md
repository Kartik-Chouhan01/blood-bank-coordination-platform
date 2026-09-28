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
layouts/            PublicLayout (DashboardLayout in Phase 2)
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

| Base path             | Highlights                                                                                                     | Access                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `/api/health`         | DB-aware liveness (503 when degraded)                                                                          | public — **built**            |
| `/api/auth`           | register/donor, register/hospital, login, refresh, logout, logout-all, verify-email, forgot/reset-password, me | public / authenticated        |
| `/api/users`          | list, get, change status (reason required)                                                                     | ADMIN                         |
| `/api/donors`         | `me` (get/patch/availability/donations/opportunities); list/get/verify/confirm blood group                     | self / STAFF, ADMIN           |
| `/api/hospitals`      | `me`; list/get/verify                                                                                          | self / ADMIN                  |
| `/api/blood-banks`    | CRUD                                                                                                           | ADMIN                         |
| `/api/donations`      | record donation (+ generates component units), testing result                                                  | STAFF, ADMIN                  |
| `/api/blood-units`    | filtered list, detail, history, `POST :id/transitions`, expiring                                               | STAFF, ADMIN                  |
| `/api/requests`       | create, mine, list, detail, edit (PENDING only), review, cancel, confirm-receipt                               | HOSPITAL (own) / STAFF, ADMIN |
| `/api/matching`       | inventory candidates, allocate, release, issue, donor search, outreach list                                    | STAFF, ADMIN                  |
| `/api/donor-outreach` | mine, respond                                                                                                  | DONOR (own)                   |
| `/api/notifications`  | mine, unread-count, read, read-all                                                                             | owner                         |
| `/api/dashboard`      | donor / hospital / admin / analytics / public-stats                                                            | role-scoped                   |
| `/api/audit-logs`     | filtered list                                                                                                  | ADMIN                         |
| `/api/settings`       | get / patch (reason required, audited)                                                                         | ADMIN                         |

Self-service always uses `/me` routes, so a client never supplies its own owner id (IDOR by design).

## 5. Authentication & authorization _(Phase 2)_

- Short-lived access JWT (15 min, in memory on the client) + rotating refresh token (7 days) in an
  **httpOnly, Secure, SameSite=Strict cookie** scoped to `/api/auth`. The refresh token's hash lives
  in `AuthSession`; reuse of a rotated token revokes the whole session family.
- Logout revokes the session; logout-all and suspension bump `tokenVersion`.
- bcrypt (cost 12). Email-verification and password-reset tokens are random, hashed, single-use, TTL'd.
  Email goes through a `MailAdapter` (console in development).
- `authenticate` loads the user from the database on every request (role claims are never trusted);
  `authorize(permission)` checks a central permission map — route files never contain role names.
- Object-level checks: services receive an `actor` and scope queries by ownership, so another
  user's id yields 404 (no existence leak).

## 6. Blood-unit state machine _(Phase 5)_

```text
COLLECTED → UNDER_TESTING →(testing PASSED)→ AVAILABLE → RESERVED → ISSUED → RECEIVED
                 │ (FAILED)                     │  ▲          │
                 ▼                            expiry└─release──┘ (release / hold timeout)
             DISCARDED ◀── (reason) ── EXPIRED ◀──────────────── (expiry while reserved)
AVAILABLE → DISCARDED (staff, reason required: damage / QC)
```

`status` (lifecycle) and `testingStatus` (PENDING/PASSED/FAILED) are separate fields. Each
transition declares allowed roles, preconditions (e.g. AVAILABLE requires PASSED and
`expiryDate > now`) and whether a reason is required. Overrides use the same function with
`override: true`, a mandatory reason, and an `OVERRIDE` audit entry.

## 7. Blood-request state machine _(Phase 6)_

```text
PENDING → APPROVED → PARTIALLY_ALLOCATED → ALLOCATED → FULFILLED → COMPLETED
   │          └──────────── CANCELLED (reason; reserved units auto-released) ──┘
   ├→ REJECTED
   └→ CANCELLED            EXPIRED (job: requiredBy passed, nothing issued)
```

`unitsAllocated` and `unitsIssued` drive transitions — reserving units is not fulfilment.
EMERGENCY requests from verified hospitals auto-approve and alert staff immediately.

## 8. Inventory matching & concurrency _(Phase 7)_

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
6. Reservations carry `holdUntil`; a job releases stale holds.

## 9. Donor matching _(Phase 7)_

Hard filters ("system criteria"): compatible group, AVAILABLE, verified, active account, cooldown
elapsed by `requiredBy` (configurable), preferences permit contact, weekly contact cap, not already
contacted, within radius (`$geoNear` on ≈1 km-rounded point, wider for EMERGENCY).
Score = weighted proximity + exact-group preference + time since cooldown + response history.
Top N (≈ shortfall × 3) get a `DonorOutreach` record and a notification. Staff see only
group/area/≈distance/availability; contact details are revealed to blood-bank staff only after a
donor responds INTERESTED. Hospitals never see donor identity. Wording is always
"Potential donor based on system criteria".

## 10. Security

helmet · CORS allowlist (wildcard refused in production) · per-IP rate limit (stricter on auth) ·
`mongoose.set('sanitizeFilter', true)` + zod validation that strips unknown keys (NoSQL-injection and
mass-assignment guard) · 100 kb JSON limit · consistent errors that never expose stack traces or
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
| 2   | Authentication & RBAC                                                                  | next     |
| 3   | Donors                                                                                 |          |
| 4   | Hospitals, blood banks, verification, audit module                                     |          |
| 5   | Inventory: donations, units, testing, unit state machine, expiry job                   |          |
| 6   | Requests lifecycle                                                                     |          |
| 7   | Matching: compatibility, allocation, donor outreach                                    |          |
| 8   | Notifications                                                                          |          |
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
