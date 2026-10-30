# syntax=docker/dockerfile:1
# Builds the game and the admin SPA, then serves both with nginx on plain HTTP (port 80).
# TLS and the public reverse proxy are handled outside of this project.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/game/package.json apps/game/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/game apps/game
COPY apps/admin apps/admin
# Identifies this build for the update check in the game.
ARG LSG_BUILD_ID=
ENV LSG_BUILD_ID=$LSG_BUILD_ID
RUN npm run build -w @lsg/game && npm run build -w @lsg/admin

FROM nginx:1.29-alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/game/dist /usr/share/nginx/html
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html/admin
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
