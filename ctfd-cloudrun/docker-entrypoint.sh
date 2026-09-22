#!/bin/bash
set -euo pipefail

mkdir -p /app/db

# 1. Try to restore the sqlite db from the last Litestream replica in GCS
echo "[entrypoint] Checking for Litestream backup..."
litestream restore -if-replica-exists -config /app/litestream.yml /app/db/ctfd.db 2>&1 || true

if [ -f /app/db/ctfd.db ]; then
  echo "[entrypoint] Database restored from Litestream backup."
else
  echo "[entrypoint] No backup found. Starting with a fresh database."
fi

# 2. Start CTFd's own entrypoint (flask db upgrade + gunicorn) under continuous
#    Litestream replication, so every write streams back to GCS as it happens --
#    this is what survives Cloud Run silently recycling the instance mid-session.
echo "[entrypoint] Starting CTFd with Litestream replication..."
exec litestream replicate -config /app/litestream.yml -exec /opt/CTFd/docker-entrypoint.sh
