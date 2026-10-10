#!/usr/bin/env bash
# ==============================================================================
# SearXNG Research Skill CLI Helper
# Usage:
#   ./search.sh "query" [preset] [limit]
#   ./search.sh -q "query" -p fintech_ir -l 3
# ==============================================================================

set -euo pipefail

BASE_URL="${SEARXNG_PROXY_URL:-http://localhost:5555}"
QUERY=""
PRESET=""
LIMIT=3
MAX_CHARS=15000
RAW_OUTPUT=false

# Parse flags or positional arguments
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 \"<search_query>\" [preset] [limit]"
  echo "       $0 \"<search_query>\" [limit]           (for normal web search)"
  echo "       $0 -q \"<search_query>\" [-p preset] [-l limit] [-m max_chars] [--raw]"
  echo ""
  echo "Presets: fintech_ir, regulatory, tech_intel, competitor, macro"
  echo "         (omit preset or specify 'none' for normal web search across all engines)"
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -q|--query)
      QUERY="$2"
      shift 2
      ;;
    -p|--preset)
      if [[ "$2" == "none" || "$2" == "default" || "$2" == "normal" ]]; then
        PRESET=""
      else
        PRESET="$2"
      fi
      shift 2
      ;;
    -l|--limit)
      LIMIT="$2"
      shift 2
      ;;
    -m|--max-chars)
      MAX_CHARS="$2"
      shift 2
      ;;
    -u|--url)
      BASE_URL="$2"
      shift 2
      ;;
    --raw)
      RAW_OUTPUT=true
      shift
      ;;
    -h|--help)
      echo "SearXNG Research CLI Helper"
      echo "Options:"
      echo "  -q, --query TEXT        Search query (required)"
      echo "  -p, --preset NAME       Research preset (fintech_ir, regulatory, tech_intel, competitor, macro)"
      echo "                          Omit or pass 'none' for standard multi-engine web search."
      echo "  -l, --limit INT         Number of pages to return (default: 3)"
      echo "  -m, --max-chars INT     Max characters per page (default: 15000)"
      echo "  -u, --url URL           Base URL of proxy (default: http://localhost:5555)"
      echo "      --raw               Output raw JSON without markdown formatting"
      exit 0
      ;;
    *)
      if [[ -z "$QUERY" ]]; then
        QUERY="$1"
      elif [[ -z "$PRESET" ]]; then
        if [[ "$1" =~ ^[0-9]+$ ]]; then
          LIMIT="$1"
        elif [[ "$1" == "none" || "$1" == "default" || "$1" == "normal" ]]; then
          PRESET=""
        else
          PRESET="$1"
        fi
      else
        LIMIT="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$QUERY" ]]; then
  echo "Error: Missing search query" >&2
  exit 1
fi

# Build JSON payload
PAYLOAD=$(node -e '
  const query = process.argv[1];
  const preset = process.argv[2];
  const limit = parseInt(process.argv[3], 10) || 3;
  const maxChars = parseInt(process.argv[4], 10) || 15000;
  
  const body = {
    search_query: query,
    limit,
    max_chars_per_page: maxChars,
    fallback_to_snippet: true
  };
  if (preset && preset.trim() !== "") {
    body.preset = preset.trim();
  }
  process.stdout.write(JSON.stringify(body));
' "$QUERY" "$PRESET" "$LIMIT" "$MAX_CHARS")

# Check service reachability
if ! curl -s --connect-timeout 2 "${BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "Warning: Service at ${BASE_URL} might not be running. Attempting request anyway..." >&2
fi

RESPONSE=$(curl -s -X POST "${BASE_URL}/api/agent/search" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [[ "$RAW_OUTPUT" == "true" ]]; then
  echo "$RESPONSE"
  exit 0
fi

# Format results cleanly for terminal/agent consumption
node -e '
  let data;
  try {
    data = JSON.parse(process.argv[1]);
  } catch (err) {
    console.error("Failed to parse API response:", process.argv[1]);
    process.exit(1);
  }

  if (data.error) {
    console.error(`Error (${data.error}): ${data.detail || ""}`);
    process.exit(1);
  }

  console.log(`\n=== SearXNG Research: "${data.query}" ===`);
  if (data.preset) {
    console.log(`Preset: ${data.preset}`);
  } else {
    console.log(`Mode:   General Web Search`);
  }
  console.log(`Results: ${data.returned} returned (${data.working_markdown_count || 0} working markdown) in ${data.elapsed_ms}ms\n`);

  (data.results || []).forEach((item, idx) => {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[${idx + 1}] ${item.title}`);
    console.log(`URL:    ${item.url}`);
    if (item.published_date) console.log(`Date:   ${item.published_date}`);
    if (item.has_tables) console.log(`Tables: Yes (GFM pipe tables detected)`);
    if (item.detected_tickers && item.detected_tickers.length > 0) {
      console.log(`Tickers: ${item.detected_tickers.join(", ")}`);
    }
    console.log(`Status: ${item.scrape_status}`);
    console.log(`--------------------------------------------------------------------------------\n`);

    if (item.markdown) {
      console.log(item.markdown.trim());
    } else if (item.snippet) {
      console.log(`[Snippet fallback]\n${item.snippet}`);
    }
    console.log("\n");
  });
' "$RESPONSE"
