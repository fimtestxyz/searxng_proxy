const axios = require('axios');

class SearXNGClient {
  constructor(baseUrl = process.env.SEARXNG_URL || 'http://localhost:8889') {
    this.baseUrl = baseUrl;
    this.timeout = 10000;
  }

  async search(query) {
    const { data } = await axios.get(`${this.baseUrl}/search`, {
      params: { q: query, format: 'json' },
      timeout: this.timeout,
    });
    return data;
  }

  async isReachable() {
    try {
      await axios.get(this.baseUrl, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { SearXNGClient };
