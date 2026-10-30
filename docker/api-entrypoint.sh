#!/bin/sh
# Prepares the bind-mounted data directory and drops root privileges.
# On Linux hosts Docker creates missing bind-mount folders as root, so we fix
# ownership here. On Windows drives mounted into WSL, chown is not supported;
# those folders are already writable for everyone, so failures are ignored.
set -e

DATA_DIR="${LSG_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/db" "$DATA_DIR/logs" "$DATA_DIR/backups" "$DATA_DIR/uploads"
chown -R node:node "$DATA_DIR" 2>/dev/null || true

exec su-exec node "$@"
