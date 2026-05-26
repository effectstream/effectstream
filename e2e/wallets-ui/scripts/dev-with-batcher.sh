#!/usr/bin/env bash
#
# Boot the EVM orchestrator (hardhat + sync node + EffectstreamL2 batcher +
# Postgres), wait for the batcher to be healthy, then launch the wallets-ui
# Vite dev server in the foreground. Ctrl-C tears the orchestrator down again.
#
# Exposes:
#   - http://localhost:4201       wallets-ui (Vite dev, HMR enabled)
#   - http://localhost:3334/send-input   EffectstreamL2 batcher
#   - http://localhost:8545       hardhat
#   - http://localhost:4747       orchestrator API (health / processes)
#
# Usage:
#   ./scripts/dev-with-batcher.sh
#   ORCHESTRATOR_READY_TIMEOUT_S=180 ./scripts/dev-with-batcher.sh   # bigger timeout
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WALLETS_UI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$WALLETS_UI_DIR/../.." && pwd)"

CLI="$REPO_ROOT/packages/build-tools/orchestrator/src/cli.ts"
LAUNCHER="$REPO_ROOT/e2e/evm/launcher.cli.ts"

ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT:-4747}"
BATCHER_HEALTH_URL="${BATCHER_HEALTH_URL:-http://localhost:3334/health}"
READY_TIMEOUT_S="${ORCHESTRATOR_READY_TIMEOUT_S:-120}"

cd "$REPO_ROOT"

log() {
  echo "[dev-with-batcher] $*"
}

stop_orchestrator() {
  log "stopping orchestrator (ports cleanup)"
  bun "$CLI" stop >/dev/null 2>&1 || true
}

# Tear down whatever was already running before we started, so we get a clean slate.
stop_orchestrator

trap stop_orchestrator EXIT INT TERM

log "starting orchestrator via $LAUNCHER (background)"
bun "$CLI" start "$LAUNCHER" --background

log "waiting for orchestrator API on :$ORCHESTRATOR_PORT (timeout ${READY_TIMEOUT_S}s)"
deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
until curl -fsS "http://localhost:$ORCHESTRATOR_PORT/health" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "ERROR: orchestrator API never came up. Try 'bun $CLI logs' for diagnostics."
    exit 1
  fi
  sleep 1
done

log "waiting for processes to be running"
deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
while :; do
  proc_json="$(curl -fsS "http://localhost:$ORCHESTRATOR_PORT/processes" 2>/dev/null || echo '')"
  batcher_state="$(printf '%s' "$proc_json" | grep -oE '"name":"batcher"[^}]*"state":"[a-z]+"' | grep -oE '"state":"[a-z]+"' | tail -1 || true)"
  if [[ "$batcher_state" == '"state":"running"' || "$batcher_state" == '"state":"done"' ]]; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "ERROR: 'batcher' process never reached 'running'. Last /processes payload:"
    printf '%s\n' "$proc_json"
    exit 1
  fi
  sleep 1
done

log "waiting for batcher health at $BATCHER_HEALTH_URL"
deadline=$(( $(date +%s) + 60 ))
until curl -fsS "$BATCHER_HEALTH_URL" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "WARNING: batcher health endpoint never responded. The dev server will still come up;"
    log "         the 'Send to Batcher' button may fail until the batcher is ready."
    break
  fi
  sleep 1
done

log "infrastructure ready. launching wallets-ui dev server."
log "    open http://localhost:4201"
log "    Ctrl-C to stop both the dev server and the orchestrator."
cd "$WALLETS_UI_DIR"
exec bun run dev
