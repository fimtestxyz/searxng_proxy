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
    return [...this.sources[category]];
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
    if (!this.sources[category]) return;
    this.sources[category].splice(index, 1);
    this.save(this.sources);
  }
}

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
