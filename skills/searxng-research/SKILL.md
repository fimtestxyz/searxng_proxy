---
name: searxng-research
description: >
  Performs deep web search and full-page Markdown extraction by calling the local SearXNG Proxy HTTP API (http://localhost:5555/api/agent/search).
  Agents MUST call the HTTP API directly rather than executing shell or python scripts.
  Features normal multi-engine web search (preset omitted) plus 5 institutional research presets
  (fintech_ir, regulatory, tech_intel, competitor, macro) with GFM table preservation, ticker detection,
  date parsing, and anti-bot fallback.
metadata:
  version: "1.1.0"
  author: "GobbleMd / SearXNG Proxy"
  tags: ["search", "api", "scraping", "fintech", "markdown", "research", "agentic"]
---

# SearXNG Research & Markdown Skill

This skill equips AI agents (Antigravity, OpenClaw, Claude Code, Codex, Cursor, Hermes) with an **end-to-end web research and Markdown extraction tool via direct HTTP API calls**. Instead of running local CLI commands or receiving brief snippets, the agent calls `http://localhost:5555/api/agent/search` to retrieve clean, full-page Markdown content with tables, tickers, and publication dates in a single API operation.

---

> [!IMPORTANT]
> **API-First Calling Convention**:
> Always call the service through its **HTTP API endpoint** (`http://localhost:5555/api/agent/search`).
> **Do NOT run `search.sh` or `search.py` via shell/command execution.** Making direct API calls is faster, avoids sandbox/permission restrictions, and directly yields structured JSON with Markdown.

---

## When to Use This Skill

Activate this skill when:
- **General Web Research**: Any current news, real-time facts, documentation, or multi-source queries (preset omitted).
- **Financial & Market Research**: Corporate earnings, quarterly transcripts, SEC filings (10-K, 8-K), forward guidance, balance sheets (`fintech_ir`).
- **Regulatory & Legal Compliance**: Financial regulatory actions from SEC, FCA, MAS, CFTC, CFPB (`regulatory`).
- **Deep Tech & Engineering**: AI whitepapers, technical architectures, Arxiv papers, engineering blogs (`tech_intel`).
- **Competitor Teardowns**: Pricing grids, fee schedules, terms of service, API docs, changelogs (`competitor`).
- **Macroeconomics**: Central bank policy statements from Fed FOMC, ECB, BIS, Treasury yields (`macro`).

---

## Available Research Presets vs Normal Web Search

- **Normal Web Search (Default)**: Omit the `preset` parameter (or pass `null` / `"none"`). The query is searched across all default web engines without domain restrictions or query expansion, returning clean, full-page Markdown.
- **Institutional Presets**: Choose a preset when conducting deep domain-specific research to filter for authoritative sources, expand financial/technical terms, and boost signal-to-noise ratio.

| Preset | Target Sources | Use Case |
| :--- | :--- | :--- |
| *(omitted / null / none)* | General web search across all engines | Standard web queries, breaking news, general research |
| `fintech_ir` | `sec.gov`, `businesswire.com`, `prnewswire.com`, `globenewswire.com`, `investor.*`, `ir.*` | Earnings reports, guidance, transcripts, financial tables |
| `regulatory` | `sec.gov`, `fca.org.uk`, `mas.gov.sg`, `bis.org`, `cftc.gov`, `federalreserve.gov` | Regulatory enforcement, legal orders, material disclosures |
| `tech_intel` | `arxiv.org`, `github.com`, `huggingface.co`, `news.ycombinator.com`, `engineering.*` | AI papers, code repositories, architecture deep dives |
| `competitor` | URL paths matching `/pricing`, `/fees`, `/terms`, `/docs`, `/api` | Product pricing, fee changes, feature matrices |
| `macro` | `federalreserve.gov`, `treasury.gov`, `ecb.europa.eu`, `bis.org`, `imf.org` | Interest rate decisions, inflation data, monetary policy |

---

## How to Call the API

Agents should call the HTTP endpoint using their built-in HTTP / URL fetch / API call capabilities:

### 1. Primary: POST `http://localhost:5555/api/agent/search`

#### A. Normal Web Search (Preset Omitted)
```http
POST http://localhost:5555/api/agent/search
Content-Type: application/json

{
  "search_query": "latest developments in humanoid robotics",
  "limit": 3
}
```

#### B. Targeted Research with Preset
```http
POST http://localhost:5555/api/agent/search
Content-Type: application/json

{
  "search_query": "Nvidia datacenter revenue growth",
  "preset": "fintech_ir",
  "limit": 3,
  "max_chars_per_page": 20000
}
```

### 2. Convenience: GET `http://localhost:5555/api/agent/search`

For agents or tools that perform HTTP GET requests:

- **Normal Search**:
  `http://localhost:5555/api/agent/search?q=latest+humanoid+robotics&limit=3`
- **With Preset**:
  `http://localhost:5555/api/agent/search?q=Nvidia+datacenter+revenue&preset=fintech_ir&limit=3`

### 3. Service Health & Preset Discovery
- **Health Check**: `GET http://localhost:5555/api/health`
  Returns `{"searxng":"ok","url2md":"loaded","markdown_concurrency":3}`.
- **List Presets**: `GET http://localhost:5555/api/agent/presets`
  Returns active presets, descriptions, and domain rules.

*(Note: `search.sh` and `search.py` in `scripts/` are strictly optional CLI helpers for human terminal debugging, not for agent invocation).*

---

## Output Structure & How to Interpret

The service returns an enriched JSON object:

```json
{
  "query": "Nvidia Q3 earnings guidance",
  "preset": "fintech_ir",
  "returned": 3,
  "working_markdown_count": 3,
  "results": [
    {
      "url": "https://investor.nvidia.com/...",
      "title": "NVIDIA Reports Third-Quarter Financial Results",
      "published_date": "20 Nov 2024",
      "scrape_status": "success",
      "has_tables": true,
      "detected_tickers": ["$NVDA"],
      "char_count": 14250,
      "truncated": false,
      "markdown": "# NVIDIA Reports Third-Quarter Financial Results\n\n| Metric | Q3 FY25 | YoY |\n| :--- | :--- | :--- |\n| Revenue | $35.08B | +94% |\n..."
    }
  ]
}
```

### Key Decision Rules for Agents:
1. **Examine `has_tables: true`**:
   - If looking for balance sheets, revenue breakdowns, or pricing tiers, prioritize sections with Markdown tables (`| ... |`).
2. **Check `scrape_status`**:
   - `success`: Full article content is available in `markdown`.
   - `snippet_only`: Page was blocked by paywall or anti-bot challenge; rely on the search `snippet` instead of hallucinating.
3. **Check `detected_tickers`**:
   - Lists all detected stock/crypto symbols (e.g. `["$NVDA", "$AAPL"]`) for entity verification.
4. **Token Management**:
   - If an article exceeds `max_chars_per_page`, it is cleanly truncated at paragraph boundaries with a `[Content truncated at N characters...]` notice. Adjust `max_chars_per_page` up to 30,000 if deep extraction is required.

---

## Customizing Presets

To view all active presets or add new research domains, inspect:
- Discovery endpoint: `http://localhost:5555/api/agent/presets`
- Configuration file: `agent/presets.yml` (changes take effect immediately without server restart).
