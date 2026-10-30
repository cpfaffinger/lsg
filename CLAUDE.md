# LSG – Lane Shooting Game

Ad-free, high-polish 3D lane shooter for the browser. Concept and roadmap (German) live in `docs/KONZEPT.md` and `docs/PLAN.md`.

## Hard constraints

- All code, comments, identifiers, file names, commit messages, DB names and API paths in **English**. German only in `docs/` and `de.json`.
- **Docker Compose is mandatory.** Docker Engine runs inside WSL Debian: `wsl -d Debian --cd /mnt/c/Users/cp/local/lsg -- docker compose ...`.
- **No named Docker volumes.** Persistent data uses bind mounts relative to `docker-compose.yml` under `./data/` (git-ignored).
- The stack exposes **exactly one HTTP port** (`web`, `LSG_HTTP_PORT`, default 8080). TLS, certificates and the outer reverse proxy (Cloudflare) are out of scope.
- Public URL/domain is configured in the admin area (`public_url` setting); client IP comes from `CF-Connecting-IP`.
- Git is local only, branch `master`, no remote. Commit after every completed step.
- No purchased assets: generated procedurally or downloaded CC0/CC-BY, every asset logged in `docs/ASSETS.md`.
- No ads, no tracking, no real-money purchases. Guest mode works fully offline; Google login only syncs progress.

## Layout

- `apps/game` – Vite + Three.js game
- `apps/admin` – admin SPA served under `/admin`
- `apps/api` – Fastify backend, SQLite via `node:sqlite`, runs directly from TypeScript (type stripping: use `.ts` import extensions, no enums/parameter properties)
- `packages/shared` – shared types and schemas
- `tools/` – asset generation scripts

## Commands (inside containers or with Node 24 locally)

- `npm run check` (lint, typecheck, tests, build)
- Prod: `docker compose up -d --build` → http://localhost:8080
- Dev: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` → game :5173, admin :5174/admin/
- Deviations from the original plan are logged in `docs/PLAN.md` ("Änderungsprotokoll").
- Production runs at https://lsg.gleesh.net; deployment steps are in `docs/DEPLOY.md`.
