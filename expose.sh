#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

echo "Starting SearXNG proxy on port $PORT..."
node server.js &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

sleep 2

echo "Starting cloudflared tunnel..."
cloudflared tunnel --url "http://localhost:$PORT"
