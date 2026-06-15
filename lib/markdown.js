const { Pool } = require('./pool');

class MarkdownConverter {
  constructor(urlToMd, cache, concurrency = 3) {
    this.urlToMd = urlToMd;
    this.cache = cache;
    this.pool = new Pool(concurrency);
    this.inflight = new Map();
  }

  async convert(url) {
    const cached = this.cache.get(url);
    if (cached) return { ...cached, cached: true };

    if (this.inflight.has(url)) {
      const result = await this.inflight.get(url);
      return { ...result, cached: false };
    }

    const promise = this.pool.run(() =>
      this.urlToMd(url, { raw: true }).then((result) => ({
        url: result.url,
        title: result.title,
        markdown: result.markdown,
        provider: result.provider || 'jina',
      }))
    );

    this.inflight.set(url, promise);

    try {
      const result = await promise;
      this.cache.set(url, result);
      return { ...result, cached: false };
    } finally {
      this.inflight.delete(url);
    }
  }

  async convertBatch(urls) {
    const results = await Promise.allSettled(
      urls.map((url) => this.convert(url))
    );
    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { url: urls[i], error: r.reason?.message || 'Unknown error' }
    );
  }
}

module.exports = { MarkdownConverter };
