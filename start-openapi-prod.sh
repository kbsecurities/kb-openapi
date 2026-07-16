#!/usr/bin/env bash
# macOS/Linux equivalent of start-openapi-prod.cmd
# Starts the KB OpenAPI production environment (backend + frontend).
set -uo pipefail
set -m # background jobs get their own process group so stop-openapi-prod.sh can kill the whole tree

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$SCRIPT_DIR"

if [[ ! -f "$APP_ROOT/frontend/package.json" && -f "$SCRIPT_DIR/project/frontend/package.json" ]]; then
  APP_ROOT="$SCRIPT_DIR/project"
fi

if [[ ! -f "$APP_ROOT/frontend/package.json" ]]; then
  echo "Could not find frontend package.json." >&2
  echo "Expected: $APP_ROOT/frontend/package.json" >&2
  exit 1
fi

export AIS_OPENAPI_MODE=production
AIS_OPENAPI_BACKEND_PORT="${AIS_OPENAPI_BACKEND_PORT:-8020}"
AIS_OPENAPI_FRONTEND_PORT="${AIS_OPENAPI_FRONTEND_PORT:-3020}"

RUNTIME="$APP_ROOT/.runtime-openapi"
mkdir -p "$RUNTIME"

echo "=== KB OpenAPI Production Environment ==="
echo "App root: $APP_ROOT"
echo "Frontend: http://localhost:$AIS_OPENAPI_FRONTEND_PORT"
echo "Backend:  http://localhost:$AIS_OPENAPI_BACKEND_PORT"
echo

if [[ -x "$SCRIPT_DIR/stop-openapi-prod.sh" ]]; then
  "$SCRIPT_DIR/stop-openapi-prod.sh" --quiet || echo "Existing process cleanup failed. Continuing with startup..."
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv command not found. Install uv or add it to PATH." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm command not found. Install Node.js/npm or add it to PATH." >&2
  exit 1
fi

FRONTEND="$APP_ROOT/frontend"
if [[ ! -d "$FRONTEND/node_modules" ]]; then
  echo "[Frontend] node_modules not found, running npm install..."
  (cd "$FRONTEND" && npm install)
fi

BACKEND_BASE="http://localhost:$AIS_OPENAPI_BACKEND_PORT"

echo "[Backend] Starting on port $AIS_OPENAPI_BACKEND_PORT (production)..."
(
  cd "$APP_ROOT" || exit 1
  export AIS_OPENAPI_MODE=production
  exec uv run python -m uvicorn backend.main:app --host 0.0.0.0 --port "$AIS_OPENAPI_BACKEND_PORT"
) >"$RUNTIME/backend.log" 2>"$RUNTIME/backend.err.log" &
BACKEND_PID=$!
echo "$BACKEND_PID" >"$RUNTIME/backend.pid"

sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start. See $RUNTIME/backend.err.log" >&2
  exit 1
fi

echo "[Frontend] Starting on port $AIS_OPENAPI_FRONTEND_PORT (production)..."

(
  cd "$FRONTEND" || exit 1
  export NEXT_PUBLIC_API_URL="$BACKEND_BASE"
  export NEXT_PUBLIC_OPENAPI_TEST=1
  export NEXT_PUBLIC_OPENAPI_MODE=production
  npm run build
  exec npm run start -- --port "$AIS_OPENAPI_FRONTEND_PORT"
) >"$RUNTIME/frontend.log" 2>"$RUNTIME/frontend.err.log" &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >"$RUNTIME/frontend.pid"

sleep 2
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "Frontend failed to start. See $RUNTIME/frontend.err.log" >&2
  exit 1
fi

echo "[Backend] PID: $BACKEND_PID"
echo "[Frontend] PID: $FRONTEND_PID"
echo "[Backend URL] $BACKEND_BASE"
echo "[Frontend URL] http://localhost:$AIS_OPENAPI_FRONTEND_PORT"
echo
echo "Started."
echo "Logs:"
echo "  $RUNTIME/backend.log"
echo "  $RUNTIME/backend.err.log"
echo "  $RUNTIME/frontend.log"
echo "  $RUNTIME/frontend.err.log"
echo
echo "Run ./stop-openapi-prod.sh to stop this environment."
