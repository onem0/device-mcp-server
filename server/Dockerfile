# syntax=docker/dockerfile:1
# The build context is the project folder (see docker-compose.yml): the pnpm workspace files live there.
# The daemon is not part of this image; devices download it from the GitHub releases of the daemon repo.

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
    PANEL_DIST_DIR=/app/panel
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/drizzle ./drizzle
COPY --from=build /repo/server/install ./install
COPY --from=build /repo/server/panel/.output/public ./panel
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
