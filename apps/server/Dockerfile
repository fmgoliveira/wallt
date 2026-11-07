# syntax=docker/dockerfile:1
# Build context is the repository root:  docker build -f apps/server/Dockerfile .
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.18.0

# 1) Build the web export and the bundled server.
FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @wallt/app web:export && pnpm --filter @wallt/server build

# 2) Native addon only (better-sqlite3), built here so the runtime image needs no toolchain.
FROM base AS native
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /native
COPY apps/server/package.json /tmp/server-package.json
RUN BS="$(node -p "require('/tmp/server-package.json').dependencies['better-sqlite3']")" \
    && npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund "better-sqlite3@${BS}"

# 3) Runtime: non-root, only the bundle, the addon and the static web export.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    PORT=3000
WORKDIR /app
COPY --from=native /native/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist/main.mjs ./main.mjs
COPY --from=build /repo/apps/server/dist/restore.mjs ./restore.mjs
COPY --from=build /repo/apps/server/dist/drive-auth.mjs ./drive-auth.mjs
COPY --from=build /repo/apps/app/dist ./web
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "main.mjs"]
