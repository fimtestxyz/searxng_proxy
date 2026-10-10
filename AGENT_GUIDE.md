# Agentic Search & Preset Service — Agent Integration Guide

An institutional-grade web search and Markdown extraction API built for AI agents, market researchers, quants, and tech analysts.

---

## 1. Overview & Key Capabilities

Standard search APIs return brief, truncated snippets requiring secondary fetch scripts. This service provides a **single tool call pipeline**:

1. **Over-Fetch & Fill Strategy**: Queries SearXNG upstream for $1.5\times - 2\times$ candidates to ensure dead links and bot-blocked pages don't starve the agent of results.
2. **YAML Research Presets**: Pre-tuned domain whitelists, regex pattern matching, and query expansion operators loaded from `agent/presets.yml` (hot-reloads automatically without restart).
3. **Parallel Markdown Scraping with Strict Timeouts**: Converts top working pages in parallel via a concurrency pool with a 5,000ms per-page timeout guard.
4. **Two-Tier Quality Gate**: Rejects Cloudflare challenge pages, captchas, and low-entropy bot walls.
5. **Fintech Signal Enrichment**: Automatically extracts:
   - **GFM Tables** (`has_tables: true`) for balance sheets, guidance, and pricing grids.
   - **Tickers** (`detected_tickers: ["$NVDA", "$AAPL"]`).
   - **Timestamps** (`published_date: "2025-01-29"`).
6. **Graceful Fallback**: If a page is blocked, it falls back to the search snippet (`scrape_status: "snippet_only"`) so the agent never loses the source.

---

## 2. Quick Start

### Start the Server
```bash
npm start
# Server listens on http://localhost:5555
```

### Run a Test Query
```bash
curl -X POST http://localhost:5555/api/agent/search \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "Nvidia datacenter revenue",
    "preset": "fintech_ir",
    "limit": 3
  }'
```

---

## 3. Available Research Presets

Presets are configured in [`agent/presets.yml`](agent/presets.yml) and can be discovered dynamically at runtime:

| Preset ID | Focus | Key Target Sources | Automatic Query Expansion |
| :--- | :--- | :--- | :--- |
| **`fintech_ir`** | Corporate earnings, forward guidance, quarterly results, SEC filings, primary wires | `sec.gov`, `businesswire.com`, `prnewswire.com`, `globenewswire.com`, `reuters.com`, `investor.*`, `ir.*` | `(earnings OR guidance OR "quarterly results" OR "financial results")` |
| **`regulatory`** | Financial regulators, legal enforcement, compliance penalties, material filings | `sec.gov`, `fca.org.uk`, `mas.gov.sg`, `bis.org`, `cftc.gov`, `consumerfinance.gov`, `federalreserve.gov` | `(filing OR enforcement OR order OR "Form 8-K" OR "Form 10-Q" OR penalty)` |
| **`tech_intel`** | AI/ML research papers, system architecture teardowns, engineering blogs | `arxiv.org`, `github.com`, `huggingface.co`, `news.ycombinator.com`, `engineering.*`, `research.*` | — |
| **`competitor`** | Product pricing grids, fee terms, API documentation, changelogs | Any domain matching `/pricing`, `/fees`, `/terms`, `/docs`, `/api`, `/changelog` | — |
| **`macro`** | Central bank monetary policy, interest rates, inflation, Treasury yields | `federalreserve.gov`, `treasury.gov`, `ecb.europa.eu`, `bis.org`, `imf.org`, `bls.gov` | `("monetary policy" OR inflation OR "interest rate" OR yields OR FOMC)` |

---

## 4. API Reference

### `GET /api/agent/presets`
Lists all active presets, descriptions, and default limits.

#### Response
```json
{
  "count": 5,
  "presets": [
    {
      "id": "fintech_ir",
      "name": "Fintech & Investor Relations",
      "description": "Target earnings reports, quarterly results, forward guidance, SEC disclosures, and primary press wires",
      "time_range": "month",
      "default_limit": 5,
      "allowed_domains": ["sec.gov", "businesswire.com", ...]
    }
  ]
}
```

---

### `POST /api/agent/search`
Primary endpoint for LLM agent tool calls.

#### Request Body
```json
{
  "search_query": "Stripe payment processing fees",
  "preset": "competitor",
  "limit": 3,
  "max_chars_per_page": 15000,
  "time_range": "month",
  "page_timeout_ms": 5000,
  "fallback_to_snippet": true
}
```

#### Request Parameters
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `search_query` / `query` | `string` | **Required** | The raw search query from the agent. |
| `preset` | `string` | `null` | Optional research preset (`fintech_ir`, `regulatory`, `tech_intel`, `competitor`, `macro`). |
| `limit` | `number` | `5` | Desired working markdown pages (clamped between 1 and 15). |
| `max_chars_per_page` | `number` | `15000` | Max characters per markdown article before clean paragraph truncation. |
| `time_range` | `string` | Preset default | SearXNG time window: `day`, `week`, `month`, `year`. |
| `engines` | `string` | `null` | Optional comma-separated SearXNG engines (e.g. `google,bing`). |
| `page_timeout_ms` | `number` | `5000` | Per-page scrape timeout in milliseconds. |
| `fallback_to_snippet` | `boolean` | `true` | If `true`, returns snippet fallback for failed pages; if `false`, only returns successful markdown. |

#### Response Schema
```json
{
  "query": "Stripe payment processing fees",
  "effective_query": "Stripe payment processing fees",
  "preset": "competitor",
  "total_candidates": 18,
  "returned": 3,
  "working_markdown_count": 3,
  "elapsed_ms": 2340,
  "results": [
    {
      "url": "https://stripe.com/pricing",
      "title": "Stripe Pricing & Fees",
      "snippet": "Pay-as-you-go card processing fees starting at 2.9% + 30c...",
      "published_date": null,
      "markdown": "# Stripe Pricing\n\n| Payment Method | Transaction Fee | Fixed Fee |\n| :--- | :--- | :--- |\n| Standard Cards | 2.9% | $0.30 |\n| International Cards | +1.5% | $0.30 |\n...",
      "scrape_status": "success",
      "char_count": 8420,
      "truncated": false,
      "has_tables": true,
      "detected_tickers": [],
      "provider": "jina",
      "cached": false,
      "elapsed_ms": 1180
    }
  ],
  "failed": []
}
```

---

### `GET /api/agent/search`
Convenience endpoint for GET-only agents or direct browser inspection:
```text
GET /api/agent/search?q=Nvidia+Q3+earnings&preset=fintech_ir&limit=3
```

---

## 5. Agent Tool Calling Schemas

### OpenAI / OpenClaw Tool Definition (JSON Schema)
```json
{
  "type": "function",
  "function": {
    "name": "web_search_and_markdown",
    "description": "Performs deep web search and directly returns clean Markdown contents of top working pages with tables, tickers, and dates.",
    "parameters": {
      "type": "object",
      "properties": {
        "search_query": {
          "type": "string",
          "description": "The search query (e.g. 'Apple Q4 earnings guidance datacenter' or 'FOMC rate decision')."
        },
        "preset": {
          "type": "string",
          "enum": ["fintech_ir", "regulatory", "tech_intel", "competitor", "macro"],
          "description": "Optional research preset to prioritize source tiers and expand query operators."
        },
        "limit": {
          "type": "integer",
          "description": "Number of articles to extract (default 5, max 15).",
          "default": 5
        },
        "max_chars_per_page": {
          "type": "integer",
          "description": "Character limit per page (default 15000, approx. 3500 tokens).",
          "default": 15000
        }
      },
      "required": ["search_query"]
    }
  }
}
```

---

## 6. Code Examples

### Python (using `httpx` or `requests`)
```python
import httpx

def agent_search(query: str, preset: str = "fintech_ir", limit: int = 3) -> dict:
    url = "http://localhost:5555/api/agent/search"
    payload = {
        "search_query": query,
        "preset": preset,
        "limit": limit,
        "max_chars_per_page": 20000
    }
    with httpx.Client(timeout=15.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        for item in data.get("results", []):
            print(f"[{item['scrape_status'].upper()}] {item['title']} ({item['url']})")
            if item.get("has_tables"):
                print("  -> Contains financial/tabular data")
            if item.get("detected_tickers"):
                print(f"  -> Tickers: {item['detected_tickers']}")
        return data

# Example call
results = agent_search("Nvidia revenue datacenter", preset="fintech_ir")
```

### Node.js / TypeScript
```typescript
interface SearchResult {
  url: string;
  title: string;
  markdown: string | null;
  scrape_status: 'success' | 'snippet_only';
  has_tables: boolean;
  detected_tickers: string[];
  published_date: string | null;
}

async function agentSearch(query: string, preset = 'tech_intel', limit = 3) {
  const res = await fetch('http://localhost:5555/api/agent/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_query: query, preset, limit }),
  });
  
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  const data = await res.json();
  return data.results as SearchResult[];
}
```

---

## 7. Customizing `agent/presets.yml`

To add a new preset (e.g., for Crypto & DeFi research), simply append it to [`agent/presets.yml`](agent/presets.yml):

```yaml
presets:
  crypto_defi:
    name: "Crypto & DeFi Protocols"
    description: "Target whitepapers, governance proposals, on-chain audits, and analytics"
    allowed_domains:
      - github.com
      - defillama.com
      - etherscan.io
      - coinmarketcap.com
    domain_patterns:
      - "^docs\\."
      - "^governance\\."
    query_suffix: "\"whitepaper\" OR audit OR tokenomics OR governance"
    time_range: "month"
    default_limit: 4
    max_chars_per_page: 25000
    preserve_tables: true
```

> **Hot Reloading**: You do **not** need to restart the application. The new preset is available immediately on the next request.

---

## 8. Best Practices for Agents

1. **Always Check `has_tables`**:
   - If an agent is computing gross margins, balance sheets, or pricing, filter for `result.has_tables === true` to extract exact numbers.
2. **Token Economy**:
   - For fast summarization, use `limit: 3` and `max_chars_per_page: 10000`.
   - For deep 10-K or whitepaper analysis, use `limit: 2` and `max_chars_per_page: 30000`.
3. **Handle `scrape_status`**:
   - `success`: Full clean markdown is in `result.markdown`.
   - `snippet_only`: Page failed (e.g. strict paywall or bot block); read `result.snippet` instead of hallucinating.
