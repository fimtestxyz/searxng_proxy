#!/usr/bin/env python3
"""
SearXNG Research Skill — Python Helper & Library
Works with zero external dependencies (standard library only).

CLI Usage:
    # Normal web search across all engines (preset omitted):
    python3 search.py "latest artificial intelligence developments" --limit 3

    # Institutional research with specialized preset:
    python3 search.py "Nvidia Q3 earnings" --preset fintech_ir --limit 3
    python3 search.py "Adyen pricing" --preset competitor --format json

Library Usage:
    from search import search_web_markdown
    # Normal web search:
    data = search_web_markdown("OpenAI updates", limit=3)

    # Targeted preset search:
    data = search_web_markdown("FOMC rate decision", preset="macro", limit=2)
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

DEFAULT_BASE_URL = os.environ.get("SEARXNG_PROXY_URL", "http://localhost:5555")


def search_web_markdown(
    query: str,
    preset: Optional[str] = None,
    limit: int = 3,
    max_chars_per_page: int = 15000,
    time_range: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
    fallback_to_snippet: bool = True,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """
    Executes an agentic search query and retrieves full-page Markdown.
    """
    url = f"{base_url.rstrip('/')}/api/agent/search"
    payload: Dict[str, Any] = {
        "search_query": query,
        "limit": limit,
        "max_chars_per_page": max_chars_per_page,
        "fallback_to_snippet": fallback_to_snippet,
    }
    if preset and str(preset).strip() and str(preset).strip().lower() not in ("none", "default", "normal"):
        payload["preset"] = str(preset).strip()
    if time_range:
        payload["time_range"] = time_range

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json", "User-Agent": "SearXNG-Research-Skill/1.0"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        error_detail = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP Error {e.code}: {e.reason} - {error_detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed to {url}: {e.reason}") from e


def format_markdown_output(data: Dict[str, Any]) -> str:
    """Formats the API response into a clean readable string for agents/humans."""
    lines: List[str] = []
    lines.append(f"# Research Results: {data.get('query')}")
    if data.get("preset"):
        lines.append(f"**Preset:** `{data.get('preset')}`")
    else:
        lines.append("**Mode:** General Web Search")
    lines.append(
        f"**Returned:** {data.get('returned', 0)} articles "
        f"({data.get('working_markdown_count', 0)} working markdown) in {data.get('elapsed_ms', 0)}ms\n"
    )

    for idx, item in enumerate(data.get("results", []), 1):
        lines.append(f"## [{idx}] {item.get('title')}")
        lines.append(f"- **URL:** {item.get('url')}")
        if item.get("published_date"):
            lines.append(f"- **Date:** {item.get('published_date')}")
        if item.get("detected_tickers"):
            lines.append(f"- **Tickers:** {', '.join(item.get('detected_tickers'))}")
        if item.get("has_tables"):
            lines.append("- **Contains Tabular Data:** Yes")
        lines.append(f"- **Status:** `{item.get('scrape_status')}`\n")

        if item.get("markdown"):
            lines.append(item["markdown"].strip())
        elif item.get("snippet"):
            lines.append(f"> **[Snippet Fallback]**\n> {item['snippet']}")
        lines.append("\n---\n")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="SearXNG Research Skill CLI")
    parser.add_argument("query", help="Search query")
    parser.add_argument(
        "--preset",
        "-p",
        choices=["fintech_ir", "regulatory", "tech_intel", "competitor", "macro", "none", "default", "normal"],
        default=None,
        help="Research preset (optional; omit or specify 'none' for normal web search)",
    )
    parser.add_argument("--limit", "-l", type=int, default=3, help="Max articles to extract (default: 3)")
    parser.add_argument("--max-chars", "-m", type=int, default=15000, help="Max chars per page")
    parser.add_argument("--time-range", "-t", choices=["day", "week", "month", "year"], help="Time window")
    parser.add_argument("--url", "-u", default=DEFAULT_BASE_URL, help=f"Proxy URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument(
        "--format",
        "-f",
        choices=["markdown", "json"],
        default="markdown",
        help="Output format (default: markdown)",
    )

    args = parser.parse_args()

    try:
        data = search_web_markdown(
            query=args.query,
            preset=args.preset,
            limit=args.limit,
            max_chars_per_page=args.max_chars,
            time_range=args.time_range,
            base_url=args.url,
        )

        if args.format == "json":
            print(json.dumps(data, indent=2))
        else:
            print(format_markdown_output(data))
    except Exception as err:
        sys.stderr.write(f"Error: {err}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
