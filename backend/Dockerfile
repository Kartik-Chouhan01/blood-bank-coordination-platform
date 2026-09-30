# API image. Build from the repository root (the shared package is part of the build):
#   docker build -f backend/Dockerfile -t digirakt-api .

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
# The frontend workspace is declared in the root package.json; its manifest must exist for npm ci.
COPY frontend/package.json frontend/
RUN npm ci --workspace @bbms/shared --workspace @bbms/backend --include-workspace-root \
    --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY backend backend
RUN npm run build -w @bbms/shared && npm run build -w @bbms/backend

# ── Runtime: production dependencies and compiled output only ───────────────
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace @bbms/shared --workspace @bbms/backend --omit=dev \
    --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/dist backend/dist

# Never run as root.
USER node
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
