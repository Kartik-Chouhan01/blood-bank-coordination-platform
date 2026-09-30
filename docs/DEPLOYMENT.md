# Deploying DigiRakt

Three containers: **MongoDB** (single-node replica set — transactions are required), the **API**
and the **web** app (nginx serving the built SPA and proxying `/api`, so the browser only ever
talks to one origin). Put TLS in front of the web container (a load balancer, ingress, Caddy or
another nginx) — HSTS and `upgrade-insecure-requests` assume HTTPS.

```text
Browser ──HTTPS──▶ TLS proxy ──▶ web :8080 (nginx: SPA + security headers) ──/api──▶ api :5000 ──▶ mongo :27017 (rs0)
```

## 1. Configure

```bash
cp deploy/.env.production.example deploy/.env.production
```

Fill in at least:

| Setting                   | Value                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `APP_URL`, `CORS_ORIGINS` | The public HTTPS origin people open, e.g. `https://blood.example.org`                         |
| `JWT_ACCESS_SECRET`       | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`              |
| `MAIL_TRANSPORT=smtp`     | With `SMTP_URL` and a verified `MAIL_FROM` (SES, SendGrid, Postmark, Mailgun, your own relay) |
| `APP_TIME_ZONE`           | The zone used in email and notification text and analytics buckets (default `Asia/Kolkata`)   |

The API refuses to start with placeholder secrets, a wildcard CORS origin, a weak bcrypt cost,
or `MAIL_TRANSPORT=smtp` without `SMTP_URL`. Policy values (contact interval, reservation hold,
radii, public stock thresholds …) are only **defaults**: administrators change them later in
**System Settings**, with a reason, and every change is audited.

`deploy/.env.production` holds secrets — it is ignored by git; store it in your secret manager.

## 2. Start

```bash
docker compose up -d --build
docker compose ps          # all three should become "healthy"
```

MongoDB initialises its replica set on first start. The API waits for it, and the web container
waits for the API's health check (`GET /api/health`, which reports 503 when the database is down).

## 3. Create the first administrator

There is deliberately no public way to become an administrator:

```bash
docker compose exec api node dist/cli/create-admin.js --email you@example.org --name "Your Name"
```

The password is printed once (or set `ADMIN_PASSWORD` for the command). Sign in, then create blood
banks and invite staff from the admin console; staff choose their own passwords from the invitation
email.

## 4. Operate

| Task              | How                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logs              | `docker compose logs -f api` — JSON (pino) with request ids; credentials, tokens, email, phone and date of birth are redacted.                                        |
| Health            | `GET /api/health` (API, DB-aware) and `GET /healthz` (web).                                                                                                           |
| Backups           | Back up the `mongo-data` volume, or better, run `mongodump --uri "mongodb://mongo:27017/digirakt?replicaSet=rs0"` on a schedule and store it off-site. Test restores. |
| Upgrades          | `git pull && docker compose up -d --build`. Schema changes are additive; indexes are built on start.                                                                  |
| Scaling the API   | Run several API replicas behind the proxy: sessions are stateless (JWT + database), background jobs are idempotent, and settings refresh every minute.                |
| Managed database  | Point `MONGODB_URI` at MongoDB Atlas (any replica set) and drop the `mongo` service.                                                                                  |
| API documentation | `docs/openapi.json` in the repository; served at `/api/docs/openapi.json` only when `API_DOCS_ENABLED=true`.                                                          |

## 5. Security checklist before going live

- [ ] HTTPS in front of the web container; HTTP redirects to HTTPS.
- [ ] Real `JWT_ACCESS_SECRET`, SMTP credentials and database credentials in a secret manager.
- [ ] MongoDB not exposed publicly (compose does not publish its port); enable authentication if
      the database is shared.
- [ ] Backups scheduled and a restore tested.
- [ ] Ship API logs and audit entries to write-once storage / your SIEM (see `docs/SECURITY.md` §5).
- [ ] CI green, including `npm audit` and the container build.

## Without Docker

```bash
npm ci
npm run build
NODE_ENV=production node backend/dist/server.js     # API; configure via environment variables
# Serve frontend/dist with any static host; route /api to the API and every other path to index.html.
```

Reuse `deploy/nginx.conf` (or its headers) for the static host so the web app keeps its
Content-Security-Policy and other security headers.

## Demo data (never in production)

```bash
npm run seed -w @bbms/backend              # empty database
npm run seed -w @bbms/backend -- --reset   # replace everything in the configured database
```

Creates banks, staff, hospitals, donors, stock, requests at every stage and 60 days of history.
It refuses to run with `NODE_ENV=production`. All accounts share `SEED_PASSWORD` (or a generated
password printed once).
