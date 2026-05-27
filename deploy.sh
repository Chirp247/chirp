#!/bin/bash
#
# chirp deploy: compile on the linux worker (84.32.98.120), relay the binary
# through this Mac, scp to the production server (webserver.skelpo.net /
# 84.32.98.163, the gscmaster hub), atomic-swap, restart the systemd unit,
# health-check, and roll back on failure. Mirrors gscmaster.com/api/deploy.sh.
#
# Differences from gscmaster:
#   - prod uses systemd (chirp.service), not pm2.
#   - chirp depends on @perryts/mysql, which is NOT a Perry-bundled package, so
#     the worker runs `npm install` before compiling.
#   - Requires a Perry that implements crypto.publicEncrypt (>= 0.5.1026) for
#     caching_sha2_password auth used by @perryts/mysql.
#
# The hub has no Perry (out of disk, 2026-05-17) so we must build on the worker.

set -euo pipefail

WORKER=root@84.32.98.120
PROD=root@webserver.skelpo.net
WORKER_BUILD_DIR=/tmp/chirp-build
PERRY=/opt/perry-src/target/release/perry
PROD_APP_DIR=/opt/chirp
HEALTH_URL=http://127.0.0.1:3102/health
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1. Rsync source + package files to worker"
ssh "$WORKER" "mkdir -p $WORKER_BUILD_DIR"
rsync -az --delete \
  --exclude node_modules --exclude '.perry-cache' --exclude chirp --exclude '*.log' \
  "$ROOT/src/" "$WORKER:$WORKER_BUILD_DIR/src/"
scp -q "$ROOT/package.json" "$ROOT/package-lock.json" "$WORKER:$WORKER_BUILD_DIR/"

echo "==> 2. Install deps (@perryts/mysql) + compile on worker"
ssh "$WORKER" "cd $WORKER_BUILD_DIR && npm install --no-audit --no-fund >/dev/null 2>&1 && $PERRY compile src/main.ts -o chirp 2>&1 | tail -3"
ssh "$WORKER" "file $WORKER_BUILD_DIR/chirp | grep -q 'ELF 64-bit'" \
  || { echo "    build did not produce an ELF binary — aborting"; exit 1; }

echo "==> 3. Relay binary to this Mac"
TMP=$(mktemp -d -t chirp-deploy.XXXX)
trap 'rm -rf "$TMP"' EXIT
scp -q "$WORKER:$WORKER_BUILD_DIR/chirp" "$TMP/chirp"
file "$TMP/chirp"

echo "==> 4. Ship to production"
scp -q "$TMP/chirp" "$PROD:$PROD_APP_DIR/chirp.new"

echo "==> 5. Atomic swap + systemd restart (keeps timestamped backup)"
ssh "$PROD" "cd $PROD_APP_DIR \
  && cp -a chirp chirp.bak.\$(date +%s) \
  && mv chirp.new chirp \
  && chmod +x chirp \
  && systemctl restart chirp"

echo "==> 6. Health check (the new binary runs runMigrations on startup)"
ok=0
for n in 1 2 3 4 5 6; do
  sleep 3
  if ssh "$PROD" "curl -sf -m 5 $HEALTH_URL 2>/dev/null | grep -q healthy"; then ok=1; break; fi
done
if [ "$ok" = 1 ]; then
  echo "    /health OK — deploy complete"
  ssh "$PROD" "cd $PROD_APP_DIR && ls -t chirp.bak.* 2>/dev/null | tail -n +6 | xargs -r rm -f"  # keep last 5 backups
else
  echo "    /health FAILED — rolling back to previous binary"
  ssh "$PROD" "cd $PROD_APP_DIR && cp -a \$(ls -t chirp.bak.* | head -1) chirp && systemctl restart chirp"
  exit 1
fi
