# LSG – Lane Shooting Game

An ad-free, high-polish 3D lane shooter that runs entirely in the browser.
Move your squad left and right, shoot upgrade gates, beat waves of enemies and bosses.
No ads, no tracking, no real-money purchases.

## Features

- 30-level campaign in three worlds (desert, city, space station) with mini-bosses and bosses,
  plus an endless mode.
- Upgrade gates (units, multipliers, damage, fire rate, weapons), seven enemy kinds, obstacles.
- Permanent upgrades and cosmetics bought with in-game coins only; stars per level.
- Procedural 3D models with GPU vertex animation, particle effects, image-based lighting,
  post-processing, quality presets with automatic adjustment.
- Synthesized sound effects and music per world, haptics, reduced motion and colorblind options.
- English and German, installable as a PWA, playable offline as a guest.
- Optional Google sign-in to sync progress; admin area with a local account.

## Quick start (Docker Compose)

Requirements: Docker Engine with Compose v2.24+ (on Windows: inside WSL).

```bash
cp .env.example .env        # optional, all values have defaults
docker compose up -d --build
```

Open `http://localhost:8080` for the game and `http://localhost:8080/admin/` for the admin area.

The stack exposes exactly **one plain HTTP port** (`LSG_HTTP_PORT`, default `8080`).
TLS, certificates and the public reverse proxy (for example Cloudflare) are intentionally
**not** part of this project. Point your proxy at this port.

### Services

| Service | Purpose                                                                       | Exposed              |
| ------- | ----------------------------------------------------------------------------- | -------------------- |
| `web`   | nginx: serves the game and the admin SPA, forwards `/api` to `api` internally | `LSG_HTTP_PORT` → 80 |
| `api`   | Fastify backend: accounts, progress sync, admin API, SQLite database          | internal only        |

### Data and backups

All persistent data lives in `./data` next to `docker-compose.yml` (bind mount, no Docker volumes):

| Path                 | Content                                                        |
| -------------------- | -------------------------------------------------------------- |
| `data/db/lsg.sqlite` | SQLite database (WAL mode)                                     |
| `data/secret.key`    | Auto-generated encryption key (if `LSG_SECRET_KEY` is not set) |
| `data/backups/`      | Database snapshots created by the API                          |
| `data/logs/`         | Server logs                                                    |

Back up by copying the whole `data` folder. For a guaranteed-consistent database file while the
server runs, use the snapshots in `data/backups/` (created with SQLite `VACUUM INTO`).
**Keep `secret.key` together with the database**: without it, stored secrets such as the Google
client secret cannot be decrypted.

### First start: admin account

On the first start the API creates an admin account:

- With `LSG_ADMIN_USER` / `LSG_ADMIN_PASSWORD` (12+ characters) in `.env`, those credentials are used.
- Otherwise a random password is generated and written to `data/initial-admin-password.txt`
  (also printed to `docker compose logs api`). You must change it on first login; the file is then deleted.

Open `http://<host>:8080/admin/`. The admin area uses local accounts only (never Google) and supports
an authenticator app as second factor.

### Google sign-in for players (optional)

Players can always play as guests. To let them keep progress across devices:

1. Admin → **Settings** → set the **Public URL** (e.g. `https://lsg.example.com`).
2. Admin → **Google sign-in** shows a step-by-step guide with the exact values to enter in the
   Google Cloud Console (JavaScript origin, redirect URI `…/api/auth/google/callback`, authorized
   domain, scopes) with copy buttons.
3. Paste the client ID and secret (stored encrypted), run **Test sign-in with Google**, then enable it.

### Running behind Cloudflare

- Set the public URL in the admin area (Settings → Public URL), e.g. `https://lsg.example.com`.
  Google sign-in redirect URLs and secure cookies are derived from it.
- The real client IP is read from `CF-Connecting-IP` (`LSG_CLIENT_IP_HEADER`).
  Only expose the HTTP port to Cloudflare / your proxy, otherwise this header can be spoofed.

## Development

### With Docker (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- Game: `http://localhost:5173`
- Admin: `http://localhost:5174/admin/`

Source folders are bind-mounted; file watching uses polling so it also works for projects on a
Windows drive mounted into WSL.

### Without Docker (Node 24+)

```bash
npm install
npm run dev:api     # http://localhost:3000
npm run dev:game    # http://localhost:5173
npm run dev:admin   # http://localhost:5174/admin/
```

### Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Balancing tools

```bash
npm run probe                                                        # bots of three skill levels play every campaign level
node --disable-warning=ExperimentalWarning tools/balance/economy.ts average   # whole campaign with upgrades and retries
node --disable-warning=ExperimentalWarning tools/balance/tune.ts              # regenerates apps/game/src/data/levels/tuning.ts
```

The tuner searches each level's wave difficulty and boss strength so that competent bots keep a
target share of their squad and an average bot still wins. Rerun it after changing the level
generator or gameplay numbers in `apps/game/src/sim/balance.ts`.

### Dev helpers

- Model viewer: `http://localhost:5173/?viewer` (add `&focus=<model>` to show a single model).
- In the dev build the game is exposed as `window.lsg` for debugging.

## Repository layout

```
apps/game        Vite + Three.js game client
apps/admin       Admin SPA (Preact), served under /admin
apps/api         Fastify API, SQLite via node:sqlite
packages/shared  Types and schemas shared by all apps
tools/           Balancing bots and tuner, asset download, icon generator
docker/          Dockerfiles, nginx config, entrypoint
docs/            Concept and roadmap (German)
```

## Conventions

- All code, comments, identifiers and commit messages are in English.
- English is the primary UI language; German is the second locale. No UI strings in code.
- Every third-party asset is listed with its license in `docs/ASSETS.md`.
