const express = require('express');
const path = require('path');
const { SearXNGClient } = require('./lib/searxng');
const { MarkdownCache } = require('./lib/cache');
const { MarkdownConverter } = require('./lib/markdown');

const URL2MD_PATH = process.env.URL2MD_PATH || '../url2md/src/api';
let urlToMd;
try {
  urlToMd = require(path.resolve(__dirname, URL2MD_PATH)).urlToMd;
} catch (err) {
  console.error(`Failed to load url2md from: ${URL2MD_PATH}`);
  console.error(`Set URL2MD_PATH env var to the correct path.`);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const MARKDOWN_CONCURRENCY = parseInt(process.env.MARKDOWN_CONCURRENCY || '3', 10);

const searxng = new SearXNGClient();
const cache = new MarkdownCache(
  parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
  parseInt(process.env.CACHE_TTL_MS || '1800000', 10)
);
const converter = new MarkdownConverter(urlToMd, cache, MARKDOWN_CONCURRENCY);

const KEEP_FIELDS = new Set(['url', 'title', 'content', 'engines', 'score', 'category']);

function cleanResult(r) {
  const out = {};
  for (const k of KEEP_FIELDS) {
    if (r[k] !== undefined) out[k] = r[k];
  }
  return out;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); },
}));

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Missing q parameter' });
  }
  const t0 = Date.now();
  try {
    const data = await searxng.search(q.trim());
    const results = (data.results || []).map(cleanResult);
    res.json({
      query: data.query || q,
      results,
      count: results.length,
      elapsed_ms: Date.now() - t0,
    });
  } catch (err) {
    const detail = err.code === 'ECONNREFUSED' ? 'SearXNG is unreachable' : err.message;
    res.status(502).json({ error: 'SearXNG request failed', detail });
  }
});

app.get('/api/markdown', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }
  try {
    const result = await converter.convert(url);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Markdown conversion failed', detail: err.message });
  }
});

app.post('/api/markdown/batch', async (req, res) => {
  const urls = req.body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid urls array' });
  }
  const t0 = Date.now();
  const results = await converter.convertBatch(urls);
  res.json({
    results,
    count: results.length,
    elapsed_ms: Date.now() - t0,
  });
});

app.get('/api/health', async (_req, res) => {
  const searxngOk = await searxng.isReachable();
  res.json({
    searxng: searxngOk ? 'ok' : 'unreachable',
    url2md: urlToMd ? 'loaded' : 'missing',
    markdown_concurrency: MARKDOWN_CONCURRENCY,
  });
});

app.listen(PORT, () => {
  console.log(`SearXNG proxy listening on http://localhost:${PORT}`);
  console.log(`SearXNG backend: ${searxng.baseUrl}`);
  console.log(`Markdown concurrency: ${MARKDOWN_CONCURRENCY}`);
});
