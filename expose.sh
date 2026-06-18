#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Start server in background
echo "Starting SearXNG proxy..."
LOG_FILE=$(mktemp)
node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to start and detect the port from its output
echo "Waiting for server to be ready..."
TIMEOUT=10
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  PORT=$(grep -o "listening on http://localhost:[0-9]*" "$LOG_FILE" 2>/dev/null | head -n1 | grep -o '[0-9]*$' || true)
  if [ -n "$PORT" ]; then
    echo "✓ Server is ready on port $PORT"
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ -z "${PORT:-}" ]; then
  echo "⚠ Failed to detect port from server output, falling back to config.js..."
  PORT=$(node -e "console.log(require('./config').getTunnelPort())" 2>/dev/null || echo "5555")
  echo "Using port $PORT from config"
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID 2>/dev/null
  rm -f "$LOG_FILE"
  exit 0
}
trap cleanup INT TERM

# Start cloudflared tunnel pointing at the server's actual port
echo ""
echo "Starting cloudflared tunnel for http://localhost:$PORT..."
cloudflared tunnel --url "http://localhost:$PORT"
