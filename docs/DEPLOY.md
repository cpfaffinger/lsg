# Deployment hinter einem nginx auf eigenem Server

Beispiel für den Betrieb hinter Cloudflare und einem nginx auf demselben Server. Die Live-Version läuft unter **https://lsg.gleesh.net**.

```
Browser → Cloudflare → nginx auf dem Server (:443) → 127.0.0.1:28099 → lsg-web → lsg-api
```

| Punkt | Wert |
|-------|------|
| Server | Linux mit Docker Engine und Compose (getestet auf ARM64 und x86-64) |
| Projektordner | `/etc/docker/compose/lsg` |
| Dienst | `docker-compose@lsg.service` (startet beim Booten) |
| Host-Port | `127.0.0.1:28099`, von außen nicht erreichbar |
| nginx | `/etc/nginx/sites-enabled/lsg.gleesh.net.conf`, Zertifikat: Cloudflare Origin `*.gleesh.net` |
| Daten | `/etc/docker/compose/lsg/data` (Datenbank, `secret.key`, Backups, Logs) |
| Konfiguration | `/etc/docker/compose/lsg/.env` (`LSG_HTTP_BIND=127.0.0.1`, `LSG_HTTP_PORT=28099`, `LSG_PUBLIC_URL=https://lsg.gleesh.net`) |

Die Datei `REVISION` im Projektordner nennt den ausgelieferten Commit.

## Update ausrollen

Der normale Weg ist das Skript: `tools/deploy/deploy.example` nach `.deploy.local` kopieren, ausfüllen und dann

```bash
sh tools/deploy/deploy.sh
```

ausführen. Es liefert den committeten Stand aus, baut die Images, lädt den Dienst neu und wartet auf den Healthcheck. Von Hand geht es so.

Lokal im Projektordner:

```bash
git archive --format=tar -o lsg.tar HEAD
scp lsg.tar <benutzer>@<server>:/tmp/lsg.tar
```

Auf dem Server:

```bash
cd /etc/docker/compose/lsg
tar -xf /tmp/lsg.tar && rm /tmp/lsg.tar
docker compose build
systemctl reload docker-compose@lsg
```

`data/` und `.env` sind nicht im Archiv und bleiben unverändert. Die Images werden **vor** dem Reload gebaut, weil die Unit nur 180 Sekunden Zeit zum Starten hat und ein Build auf dem Server länger dauern kann.

## Prüfen und Logs

```bash
systemctl status docker-compose@lsg
docker compose ps
curl -s https://lsg.gleesh.net/api/healthz
tail -f data/logs/api-$(date +%F).log
```

## Backup

Den Ordner `data/` sichern. Die API legt täglich einen Datenbank-Schnappschuss in `data/backups/` an und behält 14 Stück. `data/secret.key` gehört zur Datenbank: Ohne diese Datei lässt sich das gespeicherte Google-Client-Secret nicht mehr entschlüsseln.

## Erster Admin-Login

Das Startpasswort steht in `data/initial-admin-password.txt`. Beim ersten Login unter https://lsg.gleesh.net/admin/ verlangt die App ein neues Passwort und löscht die Datei.
