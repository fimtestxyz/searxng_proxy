# Trader Page — Stock News Search

## Overview

Add a `/trader` page to the SearXNG proxy that lets stock traders quickly surface recent news about ticker symbols, filtered by trusted sources, social media, and analysis sites. Supports searching multiple tickers simultaneously with results grouped by ticker.

## Time Windows

User selects one time window at a time (radio-button tabs):

| UI Label | SearXNG `time_range` |
|----------|---------------------|
| 1h       | `day`               |
| 1d       | `day`               |
| 3d       | `week`              |
| 5d       | `week`              |
| 1m       | `month`             |
| 3m       | `month`             |

Note: SearXNG does not support hour-granularity, so 1h maps to `day`.

## Source Configuration

Source definitions stored in `data/sources.json`. Categories:

- **news** — trusted news agencies (Bloomberg, CNA, Business Times)
- **analysis** — stock analysis sites (Finviz, TradingView)
- **social** — social media (Reddit, X/Twitter)
- **custom** — user-added sources

Each source entry has: `name`, `domain`, `engine` (optional SearXNG engine name), `category`.

```json
{
  "news": [
    { "name": "Bloomberg", "domain": "bloomberg.com", "engine": "bing_news" },
    { "name": "CNA", "domain": "cna.com.sg", "engine": "bing_news" },
    { "name": "Business Times", "domain": "businesstimes.com.sg", "engine": "bing_news" }
  ],
  "analysis": [
    { "name": "Finviz", "domain": "finviz.com", "engine": "google" },
    { "name": "TradingView", "domain": "tradingview.com", "engine": "google" }
  ],
  "social": [
    { "name": "Reddit", "domain": "reddit.com", "engine": "reddit" },
    { "name": "X (Twitter)", "domain": "x.com", "engine": "google" }
  ],
  "custom": []
}
```

Source filtering uses a hybrid approach:
1. If the source has a SearXNG engine, include it in the request.
2. Append `site:domain.com` to the query for precise domain targeting.

## Backend API

### GET /api/trader/search

**Parameters:**
- `tickers` — comma-separated ticker symbols (e.g., `AAPL,MSFT,GOOGL`)
- `time_window` — one of `1d`, `3d`, `5d`, `1m`, `3m`
- `sources` — JSON array of selected source configs (from sources.json)

**Behavior:**
1. Build per-source queries: `(TICKER1 OR TICKER2 ...) site:domain.com`
2. Fire parallel SearXNG requests via existing `Pool` with `categories`, `time_range`, and optional `engines`.
3. Merge results, deduplicate by URL.
4. Group results by ticker then by source category.
5. Return JSON with grouped structure.

### GET /api/trader/sources

Returns the current `sources.json` configuration.

### POST /api/trader/sources

Accepts updated config object. Writes atomically to `data/sources.json` (write to temp file then `fs.rename`).

## Frontend Design

### File

`public/trader.html` — self-contained page, no new npm dependencies.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Trader — Stock News Search                                  │
│                                                              │
│  Tickers:  [ AAPL MSFT GOOGL × ]                            │
│            [ Enter ticker and press Enter...                ]│
│                                                              │
│  Time Window:  [● 1d] [3d] [5d] [1m] [3m]                  │
│                                                              │
│  Sources:     ☑ Bloomberg ☑ CNA ☑ Finviz                   │
│               ☑ TradingView ☑ Reddit ☑ X (Twitter)          │
│               ☐ Custom...               [+ Add Source]       │
│                                                              │
│  [ Search ]                                                  │
├─────────────────────────────────────────────────────────────┤
│  Results for AAPL, MSFT, GOOGL — 1 day — 4 sources — 23    │
│                                                              │
│  View: [● Ticker] [Source]                                  │
│                                                              │
│  ┌─ AAPR ─────────────────────────────────────────────────┐ │
│  │ 📰 Bloomberg   │ AAPL breaks $250... [read more]       │ │
│  │ 📰 CNA         │ Apple suppliers... [read more]        │ │
│  │ 💬 Reddit      │ r/wallstreetbets: AAPL options...     │ │
│  │ 📊 Finviz      │ AAPL technical analysis... [read]     │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 📰 Bloomberg   │ NVIDIA chip... [read more]            │ │
│  │ 💬 Reddit      │ MSFT earnings... [read]               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Ticker Input

- Type ticker symbol, press Enter → pill badge appears
- Click × on badge to remove
- Supports any number of tickers
- No auto-complete (keep it simple)

### View Toggle

- **By Ticker** (default): results grouped under ticker headers
- **By Source**: results grouped under source/category headers

### Markdown Loading

- Reuses existing `/api/markdown` and `/api/markdown/batch` endpoints
- Same auto-load toggle and raw markdown toggle as `index.html`

### Dark Mode

- Matches `prefers-color-scheme: dark` styles from `index.html`

## New Files

| File | Purpose |
|------|---------|
| `data/sources.json` | Source definitions (news, analysis, social, custom) |
| `lib/trader.js` | Trader backend: search builder, source manager |
| `public/trader.html` | Trader page UI |
| `server.js` | Modified: add `/trader` route + `/api/trader/*` routes |

## Dependencies

None. Reuses existing: `express`, `axios`, `marked.js` (CDN), `DOMPurify` (CDN), `Pool`, `MarkdownCache`, `MarkdownConverter`.
