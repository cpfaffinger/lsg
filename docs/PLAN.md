# LSG – Technologie & Realisierungsplan

Stand: 2026-10-30 · Begleitdokument zu [KONZEPT.md](KONZEPT.md)

Qualitätsziel: **High Polish** (hochwertige animierte PBR-Modelle, GPU-Partikel, Post-Processing). Der Einstieg erfolgt bewusst simpel mit Platzhaltern, damit das Spielgefühl früh getestet werden kann; das Polishing hat eigene, verbindliche Meilensteine.

---

## Änderungsprotokoll während der Umsetzung

Abweichungen vom ursprünglichen Plan, mit Begründung. Wo dieser Abschnitt und der Rest des Dokuments sich widersprechen, gilt dieser Abschnitt.

| Datum | Meilenstein | Änderung | Grund |
|-------|-------------|----------|-------|
| 2026-10-30 | M0 | **SQLite statt PostgreSQL**; kein `db`-Container | PostgreSQL startet nicht mit Bind-Mount auf dem Windows-Laufwerk unter WSL (`could not change permissions`), Test in M0. SQLite (WAL) funktioniert dort, braucht keinen Container und keine native Abhängigkeit (`node:sqlite`). Für Konten und Spielstände mehr als ausreichend |
| 2026-10-30 | M0 | **scrypt statt Argon2id** für Admin-Passwörter | Argon2 braucht native Module; scrypt ist in Node eingebaut und ebenfalls speicherhart |
| 2026-10-30 | M0 | Kein ORM (Drizzle entfällt) | Wenige Tabellen; eigene Migrationen mit `PRAGMA user_version` |
| 2026-10-30 | M0 | **Dev-Overlay** `docker-compose.dev.yml` statt Profilen; kein `docker-compose.prod.yml` | Die Basis-Compose-Datei ist direkt die Produktionskonfiguration; das Overlay ersetzt nur, was in der Entwicklung anders ist |
| 2026-10-30 | M0 | API läuft direkt aus TypeScript (Node-Type-Stripping), kein Build-Schritt | Weniger Tooling, identischer Code in Dev und Prod |
| 2026-10-30 | M0 | Geheimer Schlüssel wird bei Bedarf automatisch erzeugt (`./data/secret.key`) | Stack startet ohne Vorarbeit; Schlüssel wird mit dem Datenordner gesichert |
| 2026-10-30 | M0 | Backups per SQLite `VACUUM INTO` aus der API nach `./data/backups` | Konsistente Schnappschüsse im laufenden Betrieb ohne Zusatzcontainer |
| 2026-10-30 | M0 | Eigene schlanke i18n-Schicht statt `i18next` | Wenige Funktionen nötig (Schlüssel, Parameter, Pluralregeln über `Intl.PluralRules`); spart Bundle-Größe |

## 0. Getroffene Entscheidungen (2026-10-30)

| Thema | Entscheidung |
|-------|--------------|
| Truppe | Stilisierte **Soldaten** |
| Assets | **Kein Kauf.** Automatisch erzeugt (prozedural, Blender-Skripte, Shader) plus offene, frei verfügbare Assets (CC0/CC-BY) aus dem Internet; alles in `docs/ASSETS.md` protokolliert |
| Engine | **Three.js** (Begründung in Abschnitt 1) |
| Plattform | Handy hat Fokus, Desktop gleichwertig |
| Progression | Shop nur mit **Ingame-Münzen**, nie Echtgeld |
| Konten | Optionale Spielerkonten mit **Google-Login**; Gast-Modus ist Standard |
| Admin | Eigener **Admin-Bereich mit lokalem Konto** (kein Google); Admin konfiguriert Google-OAuth, sieht DB-Status, verwaltet Spieler |
| Sprachen | **Englisch zuerst**, Deutsch als zweite Sprache; Mehrsprachigkeit von Anfang an |
| Hosting | **Prod-Container auf eigenem Server** via Docker Compose |
| Netzwerk | Der Stack exponiert **genau einen HTTP-Port** (kein TLS). SSL, Zertifikate und der äußere Reverse Proxy kommen von einem **externen Proxy, der nicht Teil des Projekts ist** |
| Container | **Docker Compose ist Pflicht** (Dev und Prod), lokal unter WSL |
| Persistenz | **Keine Docker Volumes.** Alle persistenten Daten liegen in Ordnern relativ zur Compose-Datei (Bind-Mounts, z. B. `./data/db`), damit Backups ein einfaches Kopieren des Projektordners sind |
| Git | **Lokales Repo ohne Origin**, Hauptbranch heißt **`master`** (nicht `main`) |
| Code-Sprache | **Alles im Code auf Englisch**: Bezeichner, Kommentare, Commit-Nachrichten, Dateinamen, Konfigurationsschlüssel, Datenbank-Tabellen und -Spalten, API-Pfade, Log-Meldungen, Fehlertexte für Entwickler. Deutsch nur in den Planungsdokumenten unter `docs/` und in der Sprachdatei `de.json` |
| Name | "LSG" als Projekt- und Arbeitstitel, auch für Namespaces; Branding später |

## 1. Technologie-Stack

### 1.1 Spiel (Frontend)

| Bereich            | Wahl                                   | Begründung |
|--------------------|----------------------------------------|------------|
| Sprache            | **TypeScript**                         | Typsicherheit bei vielen Entitäten/Zahlen; geteilte Typen zwischen Spiel und Server |
| Build/Dev-Server   | **Vite**                               | Sekundenschneller Start, Hot Reload, optimiertes Bundle, PWA-Plugin |
| 3D-Engine          | **Three.js** (aktuelles Release, WebGL2, WebGPU-Renderer optional) | Größtes Ökosystem und beste Dokumentation; `InstancedMesh` + Skinning für hunderte animierte Einheiten; ausgereifte glTF-/KTX2-/Draco-Loader; stärkstes Partikel- und Post-Processing-Ökosystem; schlankeres Bundle als Babylon.js. Entscheidung ist final. |
| Post-Processing    | **`postprocessing`** (pmndrs)           | Bloom, SSAO/GTAO, DoF, SMAA, LUT, Vignette, Chromatic Aberration in einem effizienten Pass-System |
| Partikel           | **GPU-Partikelsystem** (`three.quarks` oder eigenes, shaderbasiert) | Zehntausende Partikel, Trails, Texturatlas, Soft Particles ohne CPU-Last |
| Animation          | Three.js `AnimationMixer` + instanziertes Skinning (Bone-Texturen) | Hunderte animierte Soldaten in wenigen Draw Calls |
| Asset-Format       | **glTF 2.0** (.glb) + Draco/Meshopt + KTX2/Basis | Offener Standard, Blender-Export, kleine Dateien, GPU-komprimierte Texturen |
| Asset-Werkzeuge    | **Blender** headless (Python-Skripte im Tools-Container), `gltf-transform` CLI | Automatische Erzeugung, Vereinheitlichung und Optimierung aller Assets |
| Spiellogik         | eigene, leichte ECS-Struktur           | Logik ohne Engine-Abhängigkeit, testbar ohne WebGL |
| Kollision          | eigene AABB/Kreis-Kollision            | Keine echte Physik nötig |
| Audio              | **Web Audio API** direkt               | SFX-Pooling, Musik-Loops, Lautstärke-Gruppen |
| UI (HUD, Menüs)    | HTML/CSS-Overlay + eigenes Design-System | Scharfer Text, Barrierefreiheit; 3D-Vorschauen als eingebettete Canvas-Szenen |
| i18n               | **`i18next`** mit JSON-Sprachdateien (`en` zuerst, `de` danach), ICU-Pluralregeln | Standard, Lazy-Loading pro Sprache, keine Texte im Code |
| Lokaler Zustand    | **IndexedDB** (via `idb-keyval`)       | Gast-Modus, Offline-Cache des Kontostands |
| PWA                | `vite-plugin-pwa` (Workbox)            | Installierbar, offline, Welt-Assets gecacht |
| Tests              | **Vitest** (Logik), Playwright (Smoke/Screenshots) | Spielregeln, Balancing, visuelle Regressionen |
| Qualität           | ESLint, Prettier                       | Standard |

### 1.2 Server (Backend für Konten und Admin)

| Bereich            | Wahl                                   | Begründung |
|--------------------|----------------------------------------|------------|
| Laufzeit/Sprache   | **Node.js 24 + TypeScript**            | Gleiche Sprache wie das Spiel, geteilte Typen und Validierungs-Schemata |
| Web-Framework      | **Fastify**                            | Schnell, schema-validiert (JSON Schema/TypeBox), gute Plugin-Welt (Cookies, Rate-Limit, Helmet) |
| Datenbank          | **SQLite** über das in Node 24 eingebaute `node:sqlite` (WAL-Modus), Datei in `./data/db/lsg.sqlite` | Ersetzt PostgreSQL (siehe Änderungsprotokoll): läuft im Bind-Mount auch auf Windows-Laufwerken unter WSL, kein DB-Container, keine native Abhängigkeit, Backup = eine Datei |
| Migrationen        | Eigene, nummerierte SQL-Migrationen im Code, Stand in `PRAGMA user_version` | Kein ORM nötig für wenige Tabellen; volle Kontrolle |
| Spieler-Login      | **Google OpenID Connect** via `openid-client` (PKCE, Authorization Code Flow) | Standardkonform, kein Passwort-System; Client-ID/Secret vom Admin konfigurierbar, verschlüsselt in der DB (AES-GCM, Schlüssel aus Umgebung) |
| Sessions           | HTTP-only, Secure, SameSite-Cookies; serverseitige Sessions in SQLite | Kein JWT-Handling im Browser, einfache Abmeldung/Sperrung |
| Admin-Login        | Lokales Konto, **scrypt**-Hash (Node-`crypto`, speicherhart, keine native Abhängigkeit), optional **TOTP** (2FA), Rate-Limit, Audit-Log | Getrennt vom Spieler-Login, kein Google |
| Admin-UI           | Eigene kleine SPA unter `/admin` (Vite, TypeScript, gleiches Design-System) | Konfiguration, Spielerverwaltung, Status, Kennzahlen |
| API-Vertrag        | REST + JSON, Schemata in `packages/shared` (TypeBox) | Ein Schema für Server-Validierung und Client-Typen |
| Sicherheit         | Helmet-Header, CSRF-Schutz (SameSite + Origin-Check), Rate-Limits, Eingabe-Validierung, Secrets nur aus Umgebung/DB | Server ist öffentlich erreichbar |
| Tests              | Vitest + Fastify `inject`, In-Memory-SQLite | API-Tests mit echter DB, ohne Container |

### 1.3 Container & Betrieb

| Bereich            | Wahl                                   |
|--------------------|----------------------------------------|
| Container          | **Docker + Docker Compose (Pflicht)**, entwickelt unter WSL |
| Exponierter Port   | **Ein einziger HTTP-Port** vom `web`-Container (Standard `8080`, konfigurierbar über `LSG_HTTP_PORT`). `api` und `db` sind nur im internen Compose-Netz erreichbar |
| Interner Webserver | **nginx** im `web`-Container: liefert Spiel und Admin-SPA aus und leitet `/api` intern an `api` weiter, damit nach außen ein Port reicht; gzip/brotli, Cache-Header, MIME-Typen für .glb/.ktx2/.wasm. Kein TLS, keine Zertifikate |
| TLS / äußerer Proxy| **Nicht Teil des Projekts.** Ein externer Reverse Proxy terminiert HTTPS und leitet auf den HTTP-Port weiter. Das Projekt liefert keine Proxy-, Zertifikats- oder Let's-Encrypt-Konfiguration |
| Betrieb hinter Proxy | Betrieb hinter **Cloudflare**. Die **öffentliche Adresse wird im Admin-Bereich eingestellt** (DB-Einstellung `public_url`; optionaler Startwert `LSG_PUBLIC_URL` in `.env`). Daraus entstehen Google-Rücksprung-Adressen, Secure-Cookies (bei `https`) und Links. Die App braucht keine Forwarded-Header, um korrekt zu funktionieren. Echte Client-IP für Rate-Limits und Audit-Log kommt aus **`CF-Connecting-IP`** (`LSG_CLIENT_IP_HEADER=cf-connecting-ip`, alternativ `x-forwarded-for` oder keiner). Hinweis: Dieser Header ist nur vertrauenswürdig, wenn der Server ausschließlich über Cloudflare erreichbar ist |
| Google-Assistent   | Admin-Bereich zeigt aus der eingestellten Domain die exakten Werte für die Google Cloud Console (JavaScript-Quelle, Weiterleitungs-URI `<domain>/api/auth/google/callback`, Scopes, autorisierte Domain), mit Kopier-Buttons und Verbindungstest gegen Googles Discovery-Dokument |
| CI                 | Lokal: npm-Skripte (`lint`, `test`, `build`) und ein `docker compose build`; kein GitHub-Remote. Falls später ein Remote dazukommt, lassen sich dieselben Skripte in GitHub Actions ausführen |
| Hosting            | Eigener Server (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`), hinter dem externen Proxy. Ein reines Static-Hosting des Spiels (z. B. Cloudflare Pages) bleibt technisch möglich, weil der Gast-Modus keinen Server braucht, ist aber kein Projektziel |

### Docker-Compose-Services

```
docker-compose.yml        (Basis, Dev-Standard)
├── web      nginx – Spiel (dist/), Admin-SPA, interne Weiterleitung /api; einziger exponierter Port :8080 (HTTP)
├── api      Fastify-Server :3000 (nur intern, nicht exponiert)
    (SQLite-Datei in ./data/db, kein eigener DB-Container)

docker-compose.dev.yml    (Overlay für Entwicklung)
├── api       läuft aus Quellcode mit Auto-Reload
├── web       deaktiviert
├── game-dev  Vite-Dev-Server mit Hot Reload :5173
└── admin-dev Vite-Dev-Server der Admin-SPA :5174
```

- **Keine benannten Docker Volumes.** Jeder persistente Pfad ist ein Bind-Mount auf einen Ordner relativ zur Compose-Datei:
  - `./data/db` → PostgreSQL-Datenverzeichnis
  - `./data/backups` → DB-Dumps (Backup-Job als Compose-Service, `pg_dump` per Cron oder manuell)
  - `./data/logs` → Server-Logs
  - `./data/uploads` → vom Admin hochgeladene Dateien (falls später nötig)
  - Quellcode-Ordner (`./apps`, `./packages`) für die Dev-Services
  Der Ordner `./data` steht in `.gitignore`; Backup = Projektordner kopieren (bei laufender DB vorher `pg_dump` oder Container stoppen, damit der Dump konsistent ist).
  Hinweis für Windows/WSL: PostgreSQL verlangt strenge Dateirechte auf seinem Datenordner. Liegt das Projekt auf einem Windows-Laufwerk (`/mnt/c/...`), kann der Bind-Mount an den Rechten scheitern. Lösung: das Projekt im WSL-Dateisystem halten (z. B. `~/lsg`) oder im `db`-Service `PGDATA` auf einen Unterordner setzen und den Start in M0 verifizieren.
- Konfiguration über `.env` (Vorlage `.env.example`): DB-Zugang, Session-Secret, Verschlüsselungsschlüssel, Erst-Admin-Zugangsdaten, öffentliche URL.
- Google-OAuth-Daten werden **nicht** in `.env` gepflegt, sondern vom Admin im Admin-Bereich eingetragen (Konzept 12.2).
- Migrationen laufen beim Start des `api`-Containers automatisch.
- Standardwege: `docker compose --profile dev up` (Entwicklung), `docker compose up web api db` (Prod-ähnlich lokal), `docker compose --profile tools run tools <skript>` (Assets).

### Geprüfte Alternativen
- **Babylon.js**: vollständigere Engine; schwereres Bundle, weniger Kontrolle über den Render-Pfad. Three.js gewinnt beim Partikel-/Post-FX-Ökosystem und bei der Community.
- **Unity/Godot Web-Export**: widerspricht "pure Web-Technologie", große Bundles.
- **Auth-Dienste (Auth0, Firebase Auth, Supabase)**: widersprechen Self-Hosting und Datensparsamkeit; `openid-client` reicht für einen Anbieter.
- **Passwort-Login für Spieler**: bewusst nicht, um Passwort-Resets, Phishing-Risiko und Support zu vermeiden. Google reicht; weitere OIDC-Anbieter (Apple, GitHub) sind später über dieselbe Schnittstelle möglich.
- **React/Vue fürs Spiel-UI**: unnötig für ~10 Screens. Für die Admin-SPA ist ein leichtes Framework (Preact oder Svelte) erlaubt, wenn es die Tabellen/Formulare spürbar vereinfacht.

## 2. Architektur

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  Spiel (Canvas + HTML-Overlay)           Admin-SPA (/admin)      │
│  ┌──────────┬───────────┬────────┐                               │
│  │Simulation│ Rendering │ Audio  │   i18n (en, de) · IndexedDB   │
│  └──────────┴───────────┴────────┘   Sync-Client (Gast ↔ Konto) │
└──────────────┬────────────────────────────────┬──────────────────┘
               │ HTTPS                          │
┌──────────────▼──── externer Reverse Proxy ────▼──────────────────┐
│  NICHT Teil des Projekts: TLS, Zertifikate, Domain               │
└──────────────┬────────────────────────────────┬──────────────────┘
               │ HTTP (ein Port, LSG_HTTP_PORT) │
┌──────────────▼────────────── web (nginx) ─────▼──────────────────┐
│  statisch: Spiel, Admin-SPA, Assets      Proxy: /api → api        │
└──────────────────────────────┬───────────────────────────────────┘
┌──────────────────────────────▼─── api (Fastify) ─────────────────┐
│  /api/auth/google  /api/me  /api/save  /api/admin/*  /healthz     │
│  OIDC · Sessions · Spielstand-Sync · Admin-Auth · Audit · Config  │
└──────────────────────────────┬───────────────────────────────────┘
┌──────────────────────────────▼─── db (PostgreSQL) ───────────────┐
│  users · sessions · saves · admins · settings(encrypted) · audit  │
└──────────────────────────────────────────────────────────────────┘
```

Prinzipien:
- **Spiel läuft ohne Server.** Der Gast-Modus hat keine Abhängigkeit zur API; der Server ist nur für Sync und Admin da.
- **Simulation getrennt vom Rendering**, fester Zeitschritt, interpoliertes Rendering.
- **Object Pooling** und **Instanced Rendering** inkl. animiertem Skinning.
- **Qualitätsstufen** als zentrale Konfiguration, automatisch per Benchmark gewählt.
- **Asset-Streaming**: kleines Kern-Bundle, Welt-Assets nachladen und cachen.
- **Daten-getriebene Level** (JSON) und Balancing-Tabellen; der Admin kann Balancing-Werte serverseitig überschreiben (Feature-Schalter).
- **Monorepo mit geteilten Typen**: `packages/shared` hält Spielstand-Schema, API-Schemata und Balancing-Typen für Spiel, Admin und Server.

### Geplante Ordnerstruktur
```
lsg/
├── docs/                 Konzept, Plan, Art-Bible, ASSETS.md (Lizenzen), Balancing
├── docker/               nginx.conf (intern, nur HTTP), Tools-Image
├── apps/
│   ├── game/             Vite + Three.js (das Spiel)
│   │   ├── public/       Icons, Manifest, optimierte .glb/.ktx2, Musik
│   │   └── src/          core/ sim/ render/ audio/ ui/ data/ i18n/ sync/ util/
│   ├── admin/            Vite-SPA für /admin
│   └── api/              Fastify-Server, Drizzle-Schema, Migrationen
├── packages/
│   └── shared/           geteilte Typen und Schemata
├── assets-src/           Blender-Dateien, Generator-Skripte, Rohdownloads (nicht im Bundle)
├── tests/                E2E (Playwright)
├── Dockerfile.*          je App ein Multi-Stage-Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── package.json          npm-Workspaces
```

## 3. Meilensteine

Aufwandsangaben sind grobe Schätzungen für eine Person mit KI-Unterstützung. Jeder Meilenstein endet mit etwas **Spielbarem bzw. Zeigbarem**. Phase A baut das Spiel mit Platzhaltern, Phase B den Server mit Konten und Admin, Phase C das Polishing, Phase D den Release.

### Phase A – Spiel mit Platzhaltern

#### M0 – Fundament (ca. 2–3 Tage)
Ziel: Monorepo läuft im Container, deployt, leere 3D-Szene im Browser.
- npm-Workspaces: `apps/game`, `apps/admin`, `apps/api`, `packages/shared`; Vite, TypeScript, ESLint/Prettier, Vitest
- **Dockerfiles + docker-compose.yml** (web, api, db, dev, admin-dev, tools) + `docker-compose.prod.yml` + `.env.example`; Test unter WSL
- API-Skelett mit `/healthz`, DB-Verbindung, erste Migration; Admin-SPA-Skelett
- i18n-Grundgerüst mit `en.json`, Sprachumschalter (de als leere Datei vorbereitet)
- Lokales Git-Repository (Branch `master`, kein Origin), `.gitignore` mit `data/`, `node_modules/`, `dist/`, `.env`; npm-Skripte für Lint, Tests, Build
- Bind-Mount-Struktur `./data/*` angelegt und mit PostgreSQL unter WSL verifiziert (siehe Hinweis oben)
- Leere Szene: Bahn, Kamera, Licht, FPS-Anzeige, Qualitätsstufen-Skelett
- Game-Loop mit festem Zeitschritt, Zustandsmaschine (Skelett), Input-Abstraktion (Maus, Touch, Tastatur)
- **Akzeptanz**: `docker compose --profile dev up` und `docker compose up web api db` funktionieren; `/healthz` antwortet; Szene läuft mit 60 FPS auf Handy und Desktop; Platzhalter-Würfel bewegt sich links/rechts.

#### M1 – Spielbarer Kern-Prototyp (ca. 1 Woche)
- Squad-Formation mit N Einheiten, wächst/schrumpft
- Auto-Fire, Projektil-Pool, Kollisionen (Projektil↔Gegner/Tor, Gegner↔Squad)
- Tore `+N`, `xM`, `-N`, `÷M` mit Anschießen und Durchfahren
- Gegner: Läufer und Panzer, HP-Zahlen
- Welt scrollt, Level-Ende, Verlieren bei N = 0; HUD
- Unit-Tests für Tor-Mathematik und Kollision
- **Akzeptanz**: 2 Minuten spielbar; **Go/No-Go zum Spielgefühl**.

#### M2 – Spielgefühl-Basis & Audio (ca. 1 Woche)
- Erste freie Soldaten-/Gegner-Modelle (CC0) als Platzhalter mit finalen Schnittstellen (Skalierung, Pivot, Animations-Namen), `docs/ASSETS.md` angelegt
- Basis-Partikel, Floating Damage Numbers, Screen-Shake, Tor-Plopp
- AudioManager + Platzhalter-SFX + ein Musik-Loop
- Kamera-Verhalten; Performance-Pass 1 (Instancing, Profiling auf Handy)
- **Akzeptanz**: 200 Einheiten + 100 Gegner + 500 Projektile bei 60 FPS auf Mittelklasse-Handy.

#### M3 – Inhalt & Progression (ca. 2 Wochen)
- Alle 7 Gegnertypen, 3 Bosse (Logik), 4 Waffen, Tor-Typen komplett, Hindernisse
- Level-Datenformat, 30 Kampagnen-Level, Endlos-Generator (seedbar)
- Meta-Progression: Münzen, Shop (nur Ingame-Münzen), Upgrades; **Spielstand-Schema in `packages/shared`**, lokal in IndexedDB
- Balancing-Tabellen, Simulations-Tests
- Funktionale Menüs (ungestylt), alle Texte über i18n
- **Akzeptanz**: Kampagne 1–30 durchspielbar, faire Kurve, komplett als Gast und offline.

### Phase B – Konten, Sync & Admin

#### M4 – Server, Google-Login, Admin-Bereich (ca. 2–3 Wochen)
- Datenmodell: users, sessions, saves (JSONB + Version), admins, settings (verschlüsselt), audit_log
- Google-OIDC-Login (PKCE), Session-Cookies, Logout, Konto löschen, Datenexport
- Spielstand-Sync: Upload/Download mit Versionsnummer, Konfliktregel (Server gewinnt, Zusammenführung beim ersten Login: Maximum pro Wert, Münzen addiert), Offline-Queue im Client
- Admin-Bereich: lokaler Login (Argon2id, Rate-Limit, optional TOTP), Erst-Admin aus `.env`/CLI, Einstellung der öffentlichen Domain, Google-Einrichtungsassistent mit exakten Werten für die Google Cloud Console und Verbindungstest, DB-/Migrations-Status, Spielersuche/-sperre/-löschung, Feature-Schalter, Wartungsmodus, Ankündigung, aggregierte Kennzahlen, Audit-Log
- Sicherheit: Helmet, CSRF, Rate-Limits, Validierung aller Eingaben, Secrets-Handling; kurzer Sicherheits-Review
- Rechtstexte-Platzhalter: Datenschutz, Impressum, Credits-Seite
- API-Tests gegen Test-Postgres; E2E-Test Login→Sync→zweites Gerät
- **Akzeptanz**: Login auf Handy, Weiterspielen am Desktop mit gleichem Stand; Admin konfiguriert Google ohne Code-Änderung; Konto-Löschung entfernt alle Daten.

### Phase C – Polishing (verbindlich)

#### M5 – Art-Pipeline & finale Modelle (ca. 3–4 Wochen)
- **Art-Bible** (`docs/ART-BIBLE.md`): Stilreferenzen, Paletten pro Welt, Formensprache, Material-Regeln, Polycount-/Textur-Budgets
- **Generator-Pipeline** im Tools-Container: Blender-Python-Skripte für Tore, Projektile, Hindernisse, Umgebungs-Module, Props; prozedurale Texturen
- **Freie Assets** beschaffen und vereinheitlichen: Soldaten-Basismodell mit Varianten, 7 Gegner, 3 Bosse (ggf. aus Basismodellen zusammengesetzt), Mixamo-Animationen (Laufen, Schießen, Jubeln, Tod, Angriff, Spawn), HDRIs und PBR-Texturen (Poly Haven); alles in `docs/ASSETS.md`
- `gltf-transform`-Skript (Draco/Meshopt, KTX2, LOD-Erzeugung), instanziertes Skinning, LOD-System
- Umgebung für 3 Welten, Dekoration, animierte Elemente, Skybox pro Welt
- **Akzeptanz**: Kein Platzhalter mehr sichtbar; Budgets eingehalten; 60 FPS auf Mittelklasse-Handy (Stufe "Mittel").

#### M6 – VFX, Beleuchtung & Post-Processing (ca. 2–3 Wochen)
- GPU-Partikelsystem (Texturatlas, Soft Particles, Trails)
- VFX-Katalog: Mündungsfeuer, Hülsen, Trails, Einschläge mit Funken/Decals, materialspezifische Zerstörung, Explosionen, Boss-Set-Pieces
- Shader: Tor-Energiefeld, Dissolve, Hit-Flash, Schild-Hex, Fresnel
- IBL pro Welt, Cascaded Shadow Maps, ACES; Post-Stack: Bloom, SSAO/GTAO, DoF, SMAA, LUT, Vignette, Chromatic Aberration
- Welt-Effekte: Hitzeflimmern, Regen + nasse Reflexionen, Sternenfeld
- Qualitätsstufen final mit Auto-Erkennung; Performance-Pass 2
- **Akzeptanz**: Side-by-Side gegen Referenztitel; 60 FPS Mobile (Mittel) und Desktop (Ultra).

#### M7 – UI-Design, Audio-Polish, Mobile & PWA (ca. 2 Wochen)
- UI-Design-System (auch für Admin-SPA), animierte Übergänge, Sterne-Zeremonie, 3D-Elemente in Menüs
- Freie SFX-Bibliothek (Kenney, freesound CC0) aufbereitet, Musik pro Welt + Boss-Track (CC0/CC-BY), dynamische Intensität, Mixing
- Haptik, Einstellungen (Lautstärken, Qualität, Sprache, Reduzierte Bewegung, Farbenblind-Modus), Konto-Bereich (Login, Löschen, Export)
- Deutsch als zweite Sprache vollständig übersetzt
- Responsive Hoch-/Querformat, Safe Areas, Fullscreen; PWA mit Welt-Asset-Caching, Offline, Update-Hinweis
- **Akzeptanz**: Homescreen-Installation, Flugmodus-Spiel als Gast, Sync nach Reconnect; jede Oberfläche entspricht dem Design-System.

### Phase D – Release

#### M8 – Test, Balancing, Release 1.0 (ca. 1–2 Wochen)
- Gerätetests, Fehlerbehebung, Juice-Feinschliff (Zeitlupe beim Boss-Kill, Combo, Kosmetik)
- Bundle-/Ladeoptimierung, Ladebildschirm, Lighthouse
- Playtest mit 5 Personen, Balancing
- Prod-Deployment auf dem eigenen Server (Compose-Overlay, ein HTTP-Port hinter dem externen Proxy; Test, dass Forwarded-Header, Secure-Cookies und Google-Redirect korrekt funktionieren), Backup-Service mit `pg_dump` nach `./data/backups`, Monitoring-Basics (Healthchecks, Logs in `./data/logs`)
- README mit Docker-Anleitung, `docs/ASSETS.md` final, Credits im Spiel, Release-Tag
- **Akzeptanz**: Erfolgskriterien aus Konzept Abschnitt 13 erfüllt.

#### M9 – Nach dem Release (optional)
- Tägliche Herausforderung, Online-Leaderboard (Konten existieren bereits), weitere Welten/Bosse, WebGPU-Renderer, weitere Login-Anbieter, weitere Sprachen

**Gesamtschätzung bis 1.0: ca. 5–6 Monate.** Phase A ca. 5 Wochen, Phase B ca. 3 Wochen, Phase C ca. 8–9 Wochen, Phase D ca. 2 Wochen. Die Asset-Beschaffung aus freien Quellen ist der größte Unsicherheitsfaktor in M5.

## 4. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|--------|---------------|
| Spielgefühl stimmt nicht | M1 als Go/No-Go-Punkt vor Inhalten und Assets |
| Freie Assets passen stilistisch nicht zusammen | Art-Bible verbindlich; Vereinheitlichung in Blender (Material-Setup, Palette, LUT); wenige Basismodelle mit Varianten statt vieler Quellen |
| Freie Charaktermodelle in passender Qualität sind rar | Früh (M2) sichten; Rückfall: eigene Soldaten per Blender-Skript aus Primitiven mit Mixamo-Rig; Gegner bewusst abstrakter gestalten |
| Lizenzverstöße | Jedes Asset nur mit dokumentierter Lizenz in `docs/ASSETS.md`; CC-BY-Nennung in Credits; keine "Lizenz unklar"-Downloads |
| High Polish killt Performance auf Mobile | Qualitätsstufen ab M0; jedes M6-Feature hat eine "Mittel"-Variante; Profiling pro Meilenstein |
| Server ist Angriffsziel | Kein Passwort-Login für Spieler; Admin mit Argon2id, Rate-Limit, optional TOTP; Secrets nur aus Umgebung/verschlüsselt; Sicherheits-Review in M4; Updates der Images in CI |
| DSGVO-Pflichten beim Betrieb mit Google-Login | Datensparsamkeit, Löschung und Export eingebaut; Rechtstexte in M4 vorbereitet |
| Sync-Konflikte frustrieren Spieler | Klare Regel (Server gewinnt), Zusammenführung beim ersten Login, Versionsnummern, Tests |
| iOS-Safari-Eigenheiten | Früh auf echtem iPhone testen, Audio-Unlock, Fallback-Texturformate |
| Falsche Adressen oder unsichere Cookies hinter dem externen Proxy (Google-Redirect zeigt auf `http://`, Login-Schleife) | Öffentliche Adresse wird im Admin-Bereich gesetzt und vom Google-Assistenten angezeigt; Secure-Cookies hängen am Schema dieser Adresse, nicht an Headern; Test in M4 und M8 |
| `CF-Connecting-IP` kann gefälscht werden, wenn der Server direkt erreichbar ist | README empfiehlt, den HTTP-Port nur für Cloudflare bzw. den lokalen Proxy freizugeben; Header nur für Rate-Limits/Audit genutzt, nie für Berechtigungen |
| PostgreSQL-Bind-Mount scheitert an Dateirechten unter Windows/WSL | Projekt im WSL-Dateisystem halten; `PGDATA`-Unterordner; in M0 verifizieren, bevor weitergebaut wird |
| Backup des Projektordners bei laufender DB ist inkonsistent | Backup-Service mit `pg_dump` nach `./data/backups`; Anleitung in der README |
| Umfang wächst | Konzept Abschnitt 11 (Nicht-Ziele) verbindlich bis 1.0 |

## 5. Code-Konventionen

- **Sprache**: Englisch für alles, was im Repository außerhalb von `docs/` liegt. Keine deutschen Bezeichner, Kommentare oder Strings im Code. Spielertexte kommen ausschließlich aus den i18n-Dateien (`en.json`, später `de.json`).
- **Namensgebung**: `camelCase` für Variablen und Funktionen, `PascalCase` für Typen und Klassen, `SCREAMING_SNAKE_CASE` für Konstanten, `kebab-case` für Dateinamen, `snake_case` für Datenbank-Tabellen und -Spalten, `kebab-case` für API-Pfade.
- **Namespace**: `lsg` als Präfix für Pakete (`@lsg/game`, `@lsg/api`, `@lsg/admin`, `@lsg/shared`), Container-Namen (`lsg-web`, `lsg-api`, `lsg-db`) und Umgebungsvariablen (`LSG_*`).
- **Commit-Nachrichten**: Englisch, Imperativ, Conventional-Commits-Stil (`feat:`, `fix:`, `docs:`, `chore:`).
- **Dokumentation**: `docs/` bleibt Deutsch (Planung und Konzept für dich); README, Code-Dokumentation und Admin-Oberfläche sind Englisch.

## 6. Verbleibende Annahmen (nicht blockierend)

Diese Punkte habe ich festgelegt; sie lassen sich jederzeit ändern:
- Spieler-Login nur Google, keine weiteren Anbieter für 1.0.
- Konflikt-Regel beim Sync: Server gewinnt; erster Login führt zusammen (Maximum pro Wert, Münzen addiert).
- Admin-Zweitfaktor (TOTP) ist optional einschaltbar, nicht Pflicht.
- Admin-SPA darf Preact oder Svelte nutzen; das Spiel-UI bleibt reines DOM.
- Datenbank-Zugang kommt aus `.env`, nicht aus dem Admin-Bereich (muss vor dem ersten Login existieren).
- Docker läuft in der Debian-WSL (Docker Engine, kein Docker Desktop). Befehle vom Windows-Host: `wsl -d Debian --cd <projekt> -- docker compose ...`.
- Statt Blender headless erzeugt die Asset-Pipeline Modelle bevorzugt per Node-Skript (Three.js-Geometrie + glTF-Transform); Blender bleibt optional im Tools-Container, falls ein Asset es braucht.
- Rechtstexte (Datenschutz, Impressum) liefere ich als Vorlagen; die Inhalte musst du als Betreiber prüfen.
