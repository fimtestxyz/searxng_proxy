#!/bin/bash
# Start the SearXNG proxy server

cd "$(dirname "$0")"

# Kill any existing instance
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "Stopping existing server on port 3000..."
  kill $(lsof -ti:3000) 2>/dev/null
  sleep 1
fi

echo "Starting SearXNG proxy..."
node server.js
