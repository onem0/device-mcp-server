# syntax=docker/dockerfile:1
# The build context is the project folder (see docker-compose.yml) because the image also contains the daemon binaries.

# --- Daemon: single binaries for Linux and macOS (x64, arm64) plus manifest.json
FROM oven/bun:1.3.11 AS daemon
WORKDIR /build
COPY daemon/package.json daemon/build.ts daemon/tsconfig.json ./
COPY daemon/src ./src
RUN bun run build.ts && ls -la dist

# --- Server (tsc) and panel (nuxt generate) --------------------------------
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY server/panel/package.json server/panel/
RUN pnpm install --frozen-lockfile --filter server --filter panel
COPY server/ server/
RUN pnpm --filter panel generate && pnpm --filter server build
RUN pnpm --filter server deploy --prod --legacy /out

# --- Runtime ----------------------------------------------------------------
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    PANEL_DIST_DIR=/app/panel \
    DAEMON_DIST_DIR=/app/daemon
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/drizzle ./drizzle
COPY --from=build /repo/server/install ./install
COPY --from=build /repo/server/panel/.output/public ./panel
COPY --from=daemon /build/dist/*.gz /build/dist/manifest.json ./daemon/
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
