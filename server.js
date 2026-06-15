const express = require('express');
const path = require('path');
const { SearXNGClient } = require('./lib/searxng');
const { MarkdownCache } = require('./lib/cache');

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
const searxng = new SearXNGClient();
const cache = new MarkdownCache(
  parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
  parseInt(process.env.CACHE_TTL_MS || '1800000', 10)
);
const inflight = new Map();

const KEEP_FIELDS = new Set(['url', 'title', 'content', 'engines', 'score', 'category']);

function cleanResult(r) {
  const out = {};
  for (const k of KEEP_FIELDS) {
    if (r[k] !== undefined) out[k] = r[k];
  }
  return out;
}

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

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

  const cached = cache.get(url);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  if (inflight.has(url)) {
    try {
      const result = await inflight.get(url);
      return res.json({ ...result, cached: false });
    } catch (err) {
      return res.status(502).json({ error: 'Markdown conversion failed', detail: err.message });
    }
  }

  const promise = urlToMd(url, { raw: true }).then((result) => {
    const out = {
      url: result.url,
      title: result.title,
      markdown: result.markdown,
      provider: result.provider || 'jina',
    };
    cache.set(url, out);
    inflight.delete(url);
    return out;
  }).catch((err) => {
    inflight.delete(url);
    throw err;
  });

  inflight.set(url, promise);

  try {
    const result = await promise;
    res.json({ ...result, cached: false });
  } catch (err) {
    const detail = err.message || 'Unknown error';
    res.status(502).json({ error: 'Markdown conversion failed', detail });
  }
});

app.get('/api/health', async (_req, res) => {
  const searxngOk = await searxng.isReachable();
  res.json({
    searxng: searxngOk ? 'ok' : 'unreachable',
    url2md: urlToMd ? 'loaded' : 'missing',
  });
});

app.listen(PORT, () => {
  console.log(`SearXNG proxy listening on http://localhost:${PORT}`);
  console.log(`SearXNG backend: ${searxng.baseUrl}`);
});
