# syntax=docker/dockerfile:1
# Runs the API directly from TypeScript sources using Node's built-in type stripping.

FROM node:24-alpine
ENV NODE_ENV=production \
    LSG_DATA_DIR=/data
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/game/package.json apps/game/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --no-audit --no-fund -w @lsg/api -w @lsg/shared \
    && npm cache clean --force
COPY tsconfig.base.json ./
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/healthz >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
