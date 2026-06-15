# Trader Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/trader` page to the SearXNG proxy that lets stock traders search recent news about ticker symbols, filtered by configurable sources and time windows.

**Architecture:** A new Express route serves a self-contained HTML page (`public/trader.html`) with a dedicated backend module (`lib/trader.js`). Source definitions live in a JSON config file (`data/sources.json`). The search endpoint builds per-source queries and fires parallel SearXNG requests, merges and groups results. Zero new npm dependencies.

**Tech Stack:** Node.js, Express, axios (via existing searxng.js), existing Pool/MarkdownCache/MarkdownConverter, marked.js + DOMPurify via CDN.

---

### Task 1: Create data/sources.json

**Files:**
- Create: `data/sources.json`

- [ ] **Step 1: Create the sources.json config file**

Create `data/sources.json` with the initial source definitions:

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

- [ ] **Step 2: Verify file exists**

Run: `cat data/sources.json | node -e "process.stdin.on('data',d=>{JSON.parse(d);console.log('valid JSON')})"`

Expected: `valid JSON`

- [ ] **Step 3: Commit**

```bash
git add data/sources.json
git commit -m "feat: add default sources config for trader page"
```

---

### Task 2: Create lib/trader.js — Source Manager

**Files:**
- Create: `lib/trader.js`

- [ ] **Step 1: Write source manager module**

Create `lib/trader.js` with the first export — a `SourceManager` class:

```javascript
const fs = require('fs');
const path = require('path');

const SOURCES_PATH = path.join(__dirname, '..', 'data', 'sources.json');

class SourceManager {
  constructor() {
    this.sources = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    } catch (err) {
      console.error(`Failed to load sources from ${SOURCES_PATH}: ${err.message}`);
      return { news: [], analysis: [], social: [], custom: [] };
    }
  }

  getAll() {
    return this.sources;
  }

  getByCategory(category) {
    return this.sources[category] || [];
  }

  save(sources) {
    const tmpPath = SOURCES_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(sources, null, 2));
    fs.renameSync(tmpPath, SOURCES_PATH);
    this.sources = sources;
  }

  addSource(category, source) {
    if (!this.sources[category]) {
      this.sources[category] = [];
    }
    this.sources[category].push({ ...source });
    this.save(this.sources);
  }

  removeSource(category, index) {
    this.sources[category].splice(index, 1);
    this.save(this.sources);
  }
}

module.exports = { SourceManager };
```

- [ ] **Step 2: Verify module loads**

Run: `node -e "const {SourceManager} = require('./lib/trader'); const sm = new SourceManager(); console.log('Sources:', Object.keys(sm.getAll()))"`

Expected: `Sources: [ 'news', 'analysis', 'social', 'custom' ]`

- [ ] **Step 3: Commit**

```bash
git add lib/trader.js data/sources.json
git commit -m "feat: add SourceManager for trader page source config"
```

---

### Task 3: Create lib/trader.js — Search Builder

**Files:**
- Modify: `lib/trader.js` (append to existing file)

- [ ] **Step 1: Add time window mapping helper**

Append to `lib/trader.js`, after the `SourceManager` class:

```javascript
const TIME_WINDOW_MAP = {
  '1h': 'day',
  '1d': 'day',
  '3d': 'week',
  '5d': 'week',
  '1m': 'month',
  '3m': 'month',
};

function mapTimeWindow(window) {
  return TIME_WINDOW_MAP[window] || 'month';
}

function buildQuery(tickers, domain) {
  if (tickers.length === 0) return '';
  const tickerPart = tickers.map(t => t.toUpperCase().trim()).filter(Boolean);
  if (tickerPart.length === 1) return `${tickerPart[0]} site:${domain}`;
  return `(${tickerPart.join(' OR ')}) site:${domain}`;
}
```

- [ ] **Step 2: Add search result builder**

Append to `lib/trader.js`:

```javascript
function cleanResult(r) {
  return {
    url: r.url || '',
    title: r.title || '',
    content: r.content || '',
    engines: r.engines || [],
    publishedDate: r.publishedDate || '',
    category: r.category || '',
  };
}

async function searchSearXNG(searxngClient, tickers, domain, engine, timeRange, category) {
  const params = {
    q: buildQuery(tickers, domain),
    format: 'json',
    time_range: timeRange,
    categories: category === 'social' ? 'social media' : 'news',
  };

  if (engine) {
    params.engines = engine;
  }

  const data = await searxngClient.searchWithParams(params);
  return (data.results || []).map(cleanResult);
}

module.exports = { SourceManager, mapTimeWindow, buildQuery, cleanResult, searchSearXNG };
```

- [ ] **Step 3: Add searchWithParams to SearXNGClient**

Modify `lib/searxng.js` to add a params-based search method:

```javascript
async searchWithParams(params) {
  const { data } = await axios.get(`${this.baseUrl}/search`, {
    params: { ...params },
    timeout: this.timeout,
  });
  return data;
}
```

Append this method to the `SearXNGClient` class, before the closing brace of the class and before `module.exports`.

- [ ] **Step 4: Verify module**

Run: `node -e "const {SourceManager,mapTimeWindow,buildQuery,searchSearXNG} = require('./lib/trader'); console.log(mapTimeWindow('3d'), buildQuery(['AAPL','MSFT'],'bloomberg.com'))"`

Expected: `week (AAPL OR MSFT) site:bloomberg.com`

- [ ] **Step 5: Commit**

```bash
git add lib/trader.js lib/searxng.js
git commit -m "feat: add search builder with time window mapping and SearXNG query construction"
```

---

### Task 4: Wire /api/trader/* routes into server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add imports and route mounting**

Add to the top of `server.js`, after the existing requires:

```javascript
const { SourceManager, mapTimeWindow, searchSearXNG } = require('./lib/trader');
const sourceManager = new SourceManager();
```

Add after the health route (before `app.listen`), in `server.js`:

```javascript
// Trader routes
app.get('/trader', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trader.html'));
});

app.get('/api/trader/search', async (req, res) => {
  const tickers = (req.query.tickers || '').split(',').map(t => t.trim()).filter(Boolean);
  const timeWindow = req.query.time_window || '1d';
  const sourcesRaw = req.query.sources;
  let sources;
  try {
    sources = sourcesRaw ? JSON.parse(sourcesRaw) : [];
  } catch {
    return res.status(400).json({ error: 'Invalid sources parameter' });
  }

  if (tickers.length === 0) {
    return res.status(400).json({ error: 'Missing tickers parameter' });
  }

  const timeRange = mapTimeWindow(timeWindow);
  const t0 = Date.now();

  const tasks = sources.map(async (src) => {
    const category = src.category || 'news';
    const results = await searchSearXNG(searxng, tickers, src.domain, src.engine, timeRange, category).catch(() => []);
    return {
      source: { name: src.name, domain: src.domain, category },
      results,
    };
  });

  const grouped = await Promise.all(tasks);
  const elapsed = Date.now() - t0;

  res.json({
    tickers,
    time_window: timeWindow,
    time_range_label: timeWindow === '1h' ? '1 day' : `${timeWindow}`,
    count: grouped.reduce((sum, g) => sum + g.results.length, 0),
    grouped,
    elapsed_ms: elapsed,
  });
});

app.get('/api/trader/sources', (_req, res) => {
  res.json(sourceManager.getAll());
});

app.post('/api/trader/sources', (req, res) => {
  sourceManager.save(req.body);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Add static file serving for /trader page**

Modify the `express.static` line in `server.js` (line 39) to also serve `public/trader.html`:

The current line is:
```javascript
app.use(express.static(path.join(__dirname, 'public'), {
```

This already serves `public/trader.html` — no change needed. The `/trader` route explicitly serves it.

- [ ] **Step 3: Verify server starts**

Run: `timeout 5 node server.js 2>&1 || true`

Expected: Output includes `SearXNG proxy listening on http://localhost:3000` and `SearXNG backend: ...`

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: wire trader API routes into server"
```

---

### Task 5: Create public/trader.html — Search UI

**Files:**
- Create: `public/trader.html`

- [ ] **Step 1: Create the trader page HTML with search controls**

Create `public/trader.html` with:

- Header: "Trader — Stock News Search"
- Ticker input area: text input + pill badges for entered tickers
- Time window selector: radio-button styled horizontal tabs for 1d, 3d, 5d, 1m, 3m
- Source filter panel: checkboxes grouped by category (news, analysis, social, custom)
- Source checkboxes load dynamically from `/api/trader/sources`
- Search button
- Loading spinner during search

Key JS structures:
- `tickers` array (strings)
- `selectedTimeWindow` string (default `'1d'`)
- `selectedSources` array (boolean flags per source by `category:index` key)
- `viewMode` string (`'ticker'` or `'source'`)

HTML structure for ticker input:
```html
<div class="ticker-input-area">
  <div class="ticker-pills" id="tickerPills"></div>
  <input class="search-input" id="tickerSearchInput" type="text" placeholder="Enter ticker and press Enter..." autocomplete="off">
</div>
```

JS for ticker entry:
```javascript
tickerSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim().toUpperCase();
    if (val && !tickers.includes(val)) {
      tickers.push(val);
      renderPills();
    }
    e.target.value = '';
  }
});
```

Pill rendering:
```javascript
function renderPills() {
  const container = document.getElementById('tickerPills');
  container.innerHTML = tickers.map(t =>
    `<span class="ticker-pill">${t}<button onclick="removeTicker('${t}')">×</button></span>`
  ).join('');
}

function removeTicker(ticker) {
  tickers.splice(tickers.indexOf(ticker), 1);
  renderPills();
}
```

Time window selector (radio-button styled):
```html
<div class="time-window-selector" id="timeWindowSelector">
  <label class="tw-option"><input type="radio" name="tw" value="1d" checked><span>1d</span></label>
  <label class="tw-option"><input type="radio" name="tw" value="3d"><span>3d</span></label>
  <label class="tw-option"><input type="radio" name="tw" value="5d"><span>5d</span></label>
  <label class="tw-option"><input type="radio" name="tw" value="1m"><span>1m</span></label>
  <label class="tw-option"><input type="radio" name="tw" value="3m"><span>3m</span></label>
</div>
```

- [ ] **Step 2: Create CSS styles matching the existing page**

Include dark mode support via `@media (prefers-color-scheme: dark)`. Use the same color tokens:
- Primary: `#4a90d9` (light), `#6ab0ff` (dark text links)
- Background: `#fff` (light), `#0f0f0f` (dark)
- Card bg: `#f8f8f8` (light), `#1a1a1a` (dark)
- Border: `#e8e8e8` (light), `#2a2a2a` (dark)

Time window style:
```css
.time-window-selector { display: flex; gap: 4px; flex-wrap: wrap; }
.tw-option { cursor: pointer; }
.tw-option input { display: none; }
.tw-option span { display: block; padding: 6px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; }
.tw-option input:checked + span { background: #4a90d9; color: #fff; border-color: #4a90d9; }
@media (prefers-color-scheme: dark) {
  .tw-option span { border-color: #333; color: #ccc; background: #1a1a1a; }
  .tw-option input:checked + span { background: #4a90d9; color: #fff; }
}
```

Pill style:
```css
.ticker-pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #e8f0fe; border-radius: 16px; font-size: 0.88rem; font-weight: 500; margin: 2px; }
.ticker-pill button { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #666; padding: 0 2px; }
@media (prefers-color-scheme: dark) { .ticker-pill { background: #2a3a5a; } }
```

- [ ] **Step 3: Commit**

```bash
git add public/trader.html
git commit -m "feat: add trader page search UI (ticker input, time window, source filters)"
```

---

### Task 6: Create public/trader.html — Source Filters + Search

**Files:**
- Modify: `public/trader.html`

- [ ] **Step 1: Add source filter checkboxes**

After the time window selector, add:

```html
<div class="source-filters" id="sourceFilters">
  <div class="source-category" data-category="news">
    <h4>📰 News</h4>
    <div class="source-checkboxes"></div>
  </div>
  <div class="source-category" data-category="analysis">
    <h4>📊 Analysis</h4>
    <div class="source-checkboxes"></div>
  </div>
  <div class="source-category" data-category="social">
    <h4>💬 Social</h4>
    <div class="source-checkboxes"></div>
  </div>
  <div class="source-category" data-category="custom">
    <h4>⚙️ Custom</h4>
    <div class="source-checkboxes"></div>
  </div>
</div>
```

JS to load and render sources on page load (also stores flat source map for lookup):
```javascript
let allSourcesFlat = {}; // { "category:index": { name, domain, engine, category } }

async function loadSources() {
  try {
    const resp = await fetch('/api/trader/sources');
    const sources = await resp.json();
    for (const [category, items] of Object.entries(sources)) {
      const container = document.querySelector(`.source-category[data-category="${category}"] .source-checkboxes`);
      items.forEach((src, i) => {
        const key = `${category}:${i}`;
        allSourcesFlat[key] = { ...src, category };
        const label = document.createElement('label');
        label.className = 'source-label';
        label.innerHTML = `
          <input type="checkbox" value="${key}" checked>
          <span>${escHtml(src.name)}</span>
        `;
        container.appendChild(label);
      });
    }
  } catch (err) {
    console.error('Failed to load sources:', err);
  }
}
loadSources();
```

CSS for source filters:
```css
.source-filters { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0; }
.source-category h4 { font-size: 0.85rem; margin-bottom: 4px; color: #666; }
.source-label { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; font-size: 0.88rem; cursor: pointer; }
.source-label span { padding: 3px 8px; border: 1px solid #ddd; border-radius: 4px; }
.source-label input:checked + span { background: #e8f5e9; border-color: #81c784; color: #2e7d32; }
@media (prefers-color-scheme: dark) {
  .source-label span { border-color: #333; background: #1a1a1a; }
  .source-label input:checked + span { background: #1b3a1b; border-color: #4caf50; color: #81c784; }
}
```

- [ ] **Step 2: Add search button and handler**

```html
<button class="search-btn" id="traderSearchBtn" type="button">Search</button>
```

JS handler:
```javascript
document.getElementById('traderSearchBtn').addEventListener('click', performTraderSearch);

async function performTraderSearch() {
  const checkboxes = document.querySelectorAll('#sourceFilters input:checked');
  const sourcesPayload = Array.from(checkboxes).map(cb => allSourcesFlat[cb.value]).filter(Boolean);
  if (sourcesPayload.length === 0) return;
  if (tickers.length === 0) return;

  const timeWindow = document.querySelector('#timeWindowSelector input:checked').value;

  const statusEl = document.getElementById('traderStatus');
  statusEl.innerHTML = '<span class="spinner"></span> Searching...';
  document.getElementById('traderResults').innerHTML = '';
  loadedMarkdown.clear();

  try {
    const resp = await fetch(`/api/trader/search?tickers=${encodeURIComponent(tickers.join(','))}&time_window=${timeWindow}&sources=${encodeURIComponent(JSON.stringify(sourcesPayload))}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Search failed');

    statusEl.innerHTML = `${data.tickers.join(', ')} — ${data.time_range_label} — ${data.count} results in ${data.elapsed_ms}ms`;
    loadedSearchTickers = [...tickers];
    renderResults(data);
  } catch (err) {
    statusEl.innerHTML = `<span class="error">${err.message}</span>`;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/trader.html
git commit -m "feat: add source filters and search handler to trader page"
```

---

### Task 7: Create public/trader.html — Results Rendering

**Files:**
- Modify: `public/trader.html`

- [ ] **Step 1: Add results area with view toggle**

Add after the search controls:

```html
<div id="traderStatus"></div>
<div class="results-toolbar">
  <div class="view-toggle">
    <button class="view-btn active" data-view="ticker" onclick="setViewMode('ticker')">By Ticker</button>
    <button class="view-btn" data-view="source" onclick="setViewMode('source')">By Source</button>
  </div>
</div>
<div id="traderResults"></div>
```

- [ ] **Step 2: Implement renderResults grouping function**

```javascript
function renderResults(data) {
  const container = document.getElementById('traderResults');
  const results = data.grouped.flatMap(g =>
    g.results.map(r => ({ ...r, source: g.source }))
  );

  if (results.length === 0) {
    container.innerHTML = '<p class="no-results">No results found.</p>';
    return;
  }

  if (currentView === 'ticker') {
    renderByTicker(container, results);
  } else {
    renderBySource(container, results);
  }
}

function renderByTicker(container, results) {
  const byTicker = {};
  results.forEach(r => {
    const ticker = findTickerMatch(r.title, r.content);
    if (!byTicker[ticker]) byTicker[ticker] = [];
    byTicker[ticker].push(r);
  });

  const tickerList = Object.keys(byTicker);
  container.innerHTML = tickerList.map(ticker => {
    const cards = byTicker[ticker].map((r, i) => renderCard(r)).join('');
    return `<div class="ticker-group"><div class="ticker-group-header">${ticker}</div>${cards}</div>`;
  }).join('');
}

function renderBySource(container, results) {
  const bySource = {};
  results.forEach(r => {
    const key = `${r.source.category}/${r.source.name}`;
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(r);
  });

  container.innerHTML = Object.keys(bySource).map(key => {
    const cards = bySource[key].map(r => renderCard(r)).join('');
    return `<div class="source-group"><div class="source-group-header">${key}</div>${cards}</div>`;
  }).join('');
}

function renderCard(r) {
  const icon = { news: '📰', analysis: '📊', social: '💬', custom: '⚙️' };
  const catIcon = icon[r.source.category] || '📰';
  return `
    <div class="result-card" data-url="${escAttr(r.url)}">
      <div class="result-card-header">
        <span class="result-card-source">${catIcon} ${r.source.name}</span>
        <span class="result-card-date">${r.publishedDate || ''}</span>
      </div>
      <div class="result-card-title">${escHtml(r.title)}</div>
      <div class="result-card-snippet">${escHtml(r.content || '')}</div>
      <div class="result-card-actions">
        <a href="${escAttr(r.url)}" target="_blank" rel="noopener">Open original</a>
        <button class="load-btn" data-url="${escAttr(r.url)}" onclick="toggleMarkdown(this)">Load content</button>
      </div>
      <div class="markdown-panel"></div>
    </div>
  `;
}
```

- [ ] **Step 3: Add ticker matching helper**

Since results come grouped by source (not ticker), we need to match each result to the closest ticker from the search:

```javascript
function findTickerMatch(title, content) {
  const text = (title + ' ' + content).toUpperCase();
  const searchTickers = loadedSearchTickers || [];
  // Simple: first ticker found in text, or default to first ticker
  for (const t of searchTickers) {
    if (text.includes(t)) return t;
  }
  return searchTickers[0] || 'Other';
}
```

Store `loadedSearchTickers` globally before calling `renderResults`.

- [ ] **Step 4: Add CSS for result cards and grouping**

```css
.ticker-group, .source-group { margin-bottom: 16px; }
.ticker-group-header, .source-group-header { font-size: 1rem; font-weight: 600; padding: 8px 0; border-bottom: 2px solid #4a90d9; margin-bottom: 8px; }
.result-card { border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
.result-card-header { display: flex; justify-content: space-between; font-size: 0.82rem; color: #888; margin-bottom: 6px; }
.result-card-source { font-weight: 500; color: #555; }
.result-card-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 4px; }
.result-card-snippet { font-size: 0.88rem; line-height: 1.5; color: inherit; opacity: 0.85; margin-bottom: 8px; }
.result-card-actions { display: flex; gap: 8px; font-size: 0.82rem; }
.result-card-actions a { color: #1a73e8; }
.view-toggle { display: flex; gap: 4px; }
.view-btn { padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; cursor: pointer; font-size: 0.85rem; }
.view-btn.active { background: #4a90d9; color: #fff; border-color: #4a90d9; }
.no-results { text-align: center; color: #888; padding: 40px 0; }
@media (prefers-color-scheme: dark) {
  .result-card { border-color: #2a2a2a; background: #1a1a1a; }
  .view-btn { border-color: #333; background: #1a1a1a; color: #ccc; }
  .ticker-group-header, .source-group-header { border-color: #4a90d9; }
}
```

- [ ] **Step 5: Commit**

```bash
git add public/trader.html
git commit -m "feat: add results rendering with by-ticker and by-source grouping"
```

---

### Task 8: Wire up markdown loading on trader page

**Files:**
- Modify: `public/trader.html`

- [ ] **Step 1: Add markdown loading functions**

Copy the markdown loading logic from `index.html` and adapt for trader page:

```javascript
const loadedMarkdown = new Map();
const loadedSearchTickers = [];

async function toggleMarkdown(btn) {
  const url = btn.dataset.url;
  const card = btn.closest('.result-card');
  const panel = card.querySelector('.markdown-panel');

  if (loadedMarkdown.has(url)) {
    const isOpen = panel.classList.toggle('open');
    btn.textContent = isOpen ? 'Hide content' : 'Load content';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const resp = await fetch(`/api/markdown?url=${encodeURIComponent(url)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Conversion failed');

    loadedMarkdown.set(url, data);
    renderPanel(panel, data);
    panel.classList.add('open');
    btn.textContent = 'Hide content';
    btn.classList.add('loaded');
  } catch (err) {
    btn.textContent = 'Retry';
    btn.disabled = false;
    panel.innerHTML = `<span class="error">${err.message}</span>`;
    panel.classList.add('open');
  }
}

function renderPanel(panel, data) {
  if (rawMarkdownToggle.checked) {
    panel.innerHTML = `<pre class="raw-markdown">${escHtml(data.markdown || '')}</pre>`;
  } else {
    panel.innerHTML = DOMPurify.sanitize(marked.parse(data.markdown || ''));
  }
}
```

- [ ] **Step 2: Add auto-load toggle and raw markdown toggle to trader page**

Add to the header area, same as index.html:

```html
<div class="auto-toggle">
  <label>
    <input type="checkbox" class="toggle-input" id="autoLoadToggle">
    <span class="toggle-track"></span>
    Auto-load content
  </label>
  <label>
    <input type="checkbox" class="toggle-input" id="rawMarkdownToggle">
    <span class="toggle-track"></span>
    Raw markdown
  </label>
</div>
```

- [ ] **Step 3: Auto-load results after search**

In `performTraderSearch`, after `renderResults(data)`:

```javascript
if (autoLoadToggle.checked) {
  const buttons = [...document.querySelectorAll('.load-btn:not(.loaded)')];
  if (buttons.length > 0) {
    const urls = buttons.map(b => b.dataset.url);
    buttons.forEach(btn => { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Loading...'; });
    try {
      const resp = await fetch('/api/markdown/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Batch conversion failed');
      data.results.forEach((result, i) => {
        const btn = buttons[i];
        const panel = btn.closest('.result-card')?.querySelector('.markdown-panel');
        if (result.error) { btn.textContent = 'Retry'; btn.disabled = false; return; }
        loadedMarkdown.set(result.url, result);
        renderPanel(panel, result);
        panel.classList.add('open');
        btn.textContent = 'Hide content';
        btn.classList.add('loaded');
        btn.disabled = false;
      });
    } catch (err) {
      buttons.forEach(btn => { btn.textContent = 'Retry'; btn.disabled = false; });
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add public/trader.html
git commit -m "feat: add markdown loading and auto-load to trader page"
```

---

### Task 9: Testing and verification

**Files:**
- All files

- [ ] **Step 1: Verify server starts and routes respond**

Run: `timeout 5 node server.js 2>&1 || true`

Expected: `SearXNG proxy listening on http://localhost:3000`

- [ ] **Step 2: Verify sources endpoint**

Run: `curl -s http://localhost:3000/api/trader/sources | node -e "process.stdin.on('data',d=>{const s=JSON.parse(d);console.log('Categories:',Object.keys(s));console.log('News count:',s.news.length)})"`

Expected: `Categories: [ 'news', 'analysis', 'social', 'custom' ]` and `News count: 3`

- [ ] **Step 3: Verify trader page serves**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/trader`

Expected: `200`

- [ ] **Step 4: Test source management**

Run:
```bash
curl -s http://localhost:3000/api/trader/sources | node -e "
process.stdin.on('data', async d => {
  const sources = JSON.parse(d);
  sources.custom = sources.custom || [];
  sources.custom.push({ name: 'Test Source', domain: 'test.com', engine: 'google', category: 'custom' });
  const body = JSON.stringify(sources);
  const resp = await fetch('http://localhost:3000/api/trader/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  console.log('Save result:', await resp.json());
});
"
```

Expected: `{ ok: true }`

Verify persistence: `cat data/sources.json | node -e "process.stdin.on('data',d=>{console.log('Custom sources:', JSON.parse(d).custom.length)})"`

Expected: `Custom sources: 1`

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify trader page integration"
```

---

### Task 10: Polish and cleanup

**Files:**
- `public/trader.html`

- [ ] **Step 1: Add responsive layout**

Ensure the page works on narrower viewports:
- Stack source checkboxes into fewer columns
- Make ticker pills wrap naturally
- Ensure cards stack vertically

Add media queries:
```css
@media (max-width: 600px) {
  .source-filters { flex-direction: column; gap: 8px; }
  .result-card-header { flex-direction: column; gap: 2px; }
}
```

- [ ] **Step 2: Remove any console.log debug statements**

- [ ] **Step 3: Final visual check**

Visit `http://localhost:3000/trader` and verify:
- Ticker input accepts tickers via Enter key
- Pills display and can be removed
- Time window tabs are clickable and visually selected
- Source checkboxes load from server
- Search button shows loading spinner
- Results render in "By Ticker" view
- Toggle to "By Source" view works
- Markdown loading works for individual cards
- Auto-load toggle works with batch loading
- Dark mode renders correctly

- [ ] **Step 4: Final commit**

```bash
git add public/trader.html
git commit -m "style: polish trader page responsive layout and dark mode"
```
