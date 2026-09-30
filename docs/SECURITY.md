# Security & audit review

> Phase 10 review of DigiRakt (all code up to and including Phase 10). Each finding lists how it was
> resolved and the test that keeps it resolved. Residual risks are listed at the end with the
> phase that addresses them.

## 1. What we protect, and from whom

| Asset                                                        | Why it matters                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Donor personal data (name, contact, date of birth, location) | Health-adjacent personal data (India's DPDP Act); misuse harms donors.    |
| Blood-unit and request records                               | Traceability of blood products; wrong data can harm patients.             |
| Allocation integrity                                         | A unit must never be promised twice or issued after expiry.               |
| Accounts and sessions                                        | Staff and admin accounts can change inventory, policies and verification. |
| The audit trail                                              | Accountability; must be complete and not editable through the app.        |

Threat actors considered: anonymous internet users (scraping, credential stuffing, injection),
a signed-in user acting beyond their role (a donor or hospital probing staff APIs, one hospital
reading another's requests), a staff member acting outside their bank, a stolen session or
refresh token, and operator mistakes (wrong policy change, deactivated bank still operating).

## 2. Controls in place

| Area                | Control                                                                                                                                                                                                        | Where / tested by                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Authentication      | 15-min access JWT in memory only; httpOnly `SameSite=Strict` refresh cookie scoped to `/api/auth`, rotated on every use with reuse detection; `tokenVersion` revokes all tokens instantly                      | ARCHITECTURE §5; `auth.test.ts`                               |
| Every request       | `authenticate` re-reads role, status, token version **and (new) the staff member's bank status** from the database                                                                                             | `security.test.ts`                                            |
| Authorization       | One permission map shared by API and UI; routes use `authorize(permission)`; services re-check ownership; self-service only via `/me`; other owners' records return 404                                        | IDOR tests per module; **route matrix** in `security.test.ts` |
| Brute force         | Per-IP limits (stricter on credential endpoints) + per-email lockout (keyed by hash, applies to unknown emails too); constant-time-ish unknown-user path                                                       | `auth.test.ts`; lockout now audited                           |
| Input               | zod validation strips unknown keys (mass assignment); `$`/dotted keys rejected at the edge (NoSQL injection); 100 kb body limit; regex search input escaped                                                    | `security-utils.test.ts`, `app.test.ts`                       |
| Output              | Errors never leak stack traces or internals; staff donor views omit contact/DOB/coordinates; donor contact revealed only after an INTERESTED reply; donors never see the hospital; public stock is levels only | `donors.test.ts`, `matching.test.ts`, `dashboard.test.ts`     |
| Concurrency         | Compare-and-set status transitions, request version guard, partial unique index on live allocations                                                                                                            | `matching.test.ts` (concurrent reservations)                  |
| Transport & headers | helmet defaults, CORS allowlist (wildcard refused in production), `x-powered-by` off, trust-proxy configurable, Origin check on cookie endpoints                                                               | `app.test.ts`, `env.test.ts`                                  |
| Logging             | pino with request ids; credentials, tokens, email, phone and DOB redacted                                                                                                                                      | `config/logger.ts`                                            |
| Audit               | Append-only log inside the same transaction as the change; no update/delete path in the app; admin viewer; per-record history                                                                                  | `staff.test.ts` (no edit/delete API)                          |
| Secrets & config    | Validated at startup (fail fast); production refuses placeholder secrets, weak bcrypt cost and wildcard CORS                                                                                                   | `env.test.ts`                                                 |
| Dependencies        | `npm audit` (production and dev): **0 known vulnerabilities** at review time                                                                                                                                   | run before release                                            |

## 3. Findings

| #    | Severity | Finding                                                                                                                                                                 | Resolution                                                                                                                                                                      | Test                                   |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| F-01 | High     | Deactivating a blood bank did not stop its staff: they could still sign in and reserve, issue or release units (A32 was enforced only at invitation and donation time). | `assertStaffBankActive` at sign-in, token refresh and in `authenticate` on every request; takes effect immediately and reverses on reactivation. Administrators are unaffected. | `security.test.ts` › deactivated banks |
| F-02 | Medium   | Account deletion promised by A10 was not implemented (DPDP right to erasure).                                                                                           | Donor self-service deletion by **anonymisation** with password re-entry and a typed confirmation (see §4).                                                                      | `settings.test.ts` › account deletion  |
| F-03 | Medium   | Donor contact consent changes (availability, notification preferences) left no audit record.                                                                            | Audited as `DONOR_AVAILABILITY_CHANGED` / `DONOR_CONTACT_PREFERENCES_CHANGED` in the same transaction.                                                                          | `security.test.ts` › audit trail       |
| F-04 | Medium   | Account lockouts (credential stuffing signal) were not audited.                                                                                                         | `ACCOUNT_LOCKED` recorded against the account when the email belongs to one; unknown emails still leave no trace (no enumeration).                                              | `security.test.ts` › audit trail       |
| F-05 | Medium   | No systematic proof that every route is protected; a new route without `authenticate` would go unnoticed.                                                               | Routes are exported as one mount table; a test walks **every** route and asserts 401 without a session (explicit public allowlist) and 403 for a donor outside their own area.  | `security.test.ts` › route protection  |
| F-06 | Low      | Policy values (contact interval, hold time, radii, thresholds) could only be changed by redeploying, and changes were not attributable (A26).                           | Admin **System Settings** with a mandatory reason, per-setting audit entry, strict validation (unknown keys rejected), live refresh across instances within a minute.           | `settings.test.ts` › system settings   |
| F-07 | Low      | The post-sign-in return path and notification links were trusted as-is (defence in depth; neither is attacker-controllable today).                                      | `isInternalPath` allows only same-app paths (`/x`, never `//host`, schemes or backslashes).                                                                                     | `utils/paths.test.ts`                  |
| F-08 | Info     | Test fixtures created staff users without a blood bank, a state the application forbids — hiding F-01.                                                                  | Factory now assigns an active bank to staff by default, matching the real invariant.                                                                                            | whole suite                            |

Reviewed with no change needed: token handling, refresh rotation and reuse detection, password
reset/verification tokens (hashed, single-use, in URL fragment), CORS/Origin checks, error
sanitisation, log redaction, IDOR guards (requests, outreach, notifications), NoSQL-injection guard,
regex escaping, public endpoints (health, public-stats: no counts, cached), email only to verified
addresses, notification content (no patient data, donors never told the hospital).

## 4. Account deletion (anonymisation)

Donation records must survive for traceability, so deleting an account removes the person from
them rather than deleting them:

- **User**: name → "Deleted donor", email → `deleted-<id>@deleted.invalid`, phone removed, password
  replaced by an unknown random hash, status DEACTIVATED, token version bumped, all sessions
  revoked, pending email tokens deleted.
- **Donor profile**: location cleared, date of birth reduced to the year, preferences and
  availability history cleared, availability DO_NOT_CONTACT — the donor can never be matched or
  contacted again. Blood group and donation counts remain for traceability.
- **Outreach**: open requests for help are marked declined. **Notifications**: deleted.
- **Audit log**: untouched (append-only) — entries contain ids and statuses, not personal details.
- Hospitals and staff hold organisational records; their accounts are closed by an administrator.

## 5. Residual risks and next steps

| Risk                                                                            | Mitigation now                                                                                    | Planned                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Audit log can be altered by someone with direct database access                 | No application path edits it; entries written in-transaction                                      | Ship audit entries to write-once storage / SIEM (Phase 11 deployment) |
| No multi-factor authentication for administrators                               | Strong password policy, lockout, short-lived tokens                                               | TOTP for ADMIN accounts (future)                                      |
| The SPA's Content-Security-Policy and HSTS depend on how the frontend is hosted | **Resolved in Phase 11**: `deploy/nginx.conf` sets CSP, HSTS and related headers                  | Keep the same headers if hosting elsewhere                            |
| Email transport is the console adapter                                          | **Resolved in Phase 11**: SMTP adapter (`MAIL_TRANSPORT=smtp`); startup warning otherwise         | Configure SPF/DKIM/DMARC for the sender domain                        |
| Staff can see all banks' inventory (by design, A45)                             | Changes limited to own bank; all changes audited                                                  | Revisit if a multi-organisation network needs stricter isolation      |
| Dependency vulnerabilities appear over time                                     | **Resolved in Phase 11**: `npm audit` in CI (production deps must be clean) and weekly Dependabot | Review and merge updates promptly                                     |
