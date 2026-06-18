#!/bin/bash
# Start the SearXNG proxy server

cd "$(dirname "$0")"


echo "Starting SearXNG proxy..."
node server.js
