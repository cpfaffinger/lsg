# syntax=docker/dockerfile:1
# Development image with all dependencies. Source folders are bind-mounted by
# docker-compose.dev.yml so changes on the host reload inside the container.

FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/game/package.json apps/game/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund
COPY . .
ENV LSG_WATCH_POLLING=1 \
    LSG_VITE_CACHE_DIR=/tmp/vite \
    CHOKIDAR_USEPOLLING=1
