#!/usr/bin/env bash
# macOS/Linux equivalent of stop-openapi-prod.cmd
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$SCRIPT_DIR"

if [[ ! -f "$APP_ROOT/frontend/package.json" && -f "$SCRIPT_DIR/project/frontend/package.json" ]]; then
  APP_ROOT="$SCRIPT_DIR/project"
fi

RUNTIME="$APP_ROOT/.runtime-openapi"

AIS_OPENAPI_BACKEND_PORT="${AIS_OPENAPI_BACKEND_PORT:-8020}"
AIS_OPENAPI_FRONTEND_PORT="${AIS_OPENAPI_FRONTEND_PORT:-3020}"

QUIET=0
if [[ "${1:-}" == "--quiet" || "${1:-}" == "/quiet" ]]; then
  QUIET=1
fi

log() {
  if [[ "$QUIET" -eq 0 ]]; then
    echo "$@"
  fi
}

log "Stopping KB OpenAPI production services..."

stop_process_tree() {
  local pid="$1"
  [[ -z "$pid" || "$pid" -le 0 ]] 2>/dev/null && return 0
  kill -TERM -- "-$pid" 2>/dev/null
  kill -TERM "$pid" 2>/dev/null
  sleep 1
  kill -KILL -- "-$pid" 2>/dev/null
  kill -KILL "$pid" 2>/dev/null
}

if [[ -d "$RUNTIME" ]]; then
  for name in backend.pid frontend.pid; do
    pid_file="$RUNTIME/$name"
    [[ -f "$pid_file" ]] || continue
    while IFS= read -r line; do
      pid="$(printf '%s' "$line" | tr -d '[:space:]')"
      [[ "$pid" =~ ^[0-9]+$ ]] && stop_process_tree "$pid"
    done <"$pid_file"
    rm -f "$pid_file"
  done
fi

for port in "$AIS_OPENAPI_BACKEND_PORT" "$AIS_OPENAPI_FRONTEND_PORT"; do
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    for pid in $pids; do
      stop_process_tree "$pid"
    done
  fi
done

log "Stopped."
