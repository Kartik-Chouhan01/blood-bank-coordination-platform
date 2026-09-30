# Web image: the built single-page app served by nginx, which also proxies /api to the API so
# the browser only ever talks to one origin (strict same-site cookies, no CORS).
#   docker build -f frontend/Dockerfile -t digirakt-web .

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --workspace @bbms/shared --workspace @bbms/frontend --include-workspace-root \
    --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY frontend frontend
# Public, build-time values only (they end up in the browser bundle — never secrets).
ARG VITE_API_BASE_URL=/api
ARG VITE_EMERGENCY_HOTLINE=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_EMERGENCY_HOTLINE=$VITE_EMERGENCY_HOTLINE
RUN npm run build -w @bbms/shared && npm run build -w @bbms/frontend

# ── Runtime: unprivileged nginx ─────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
