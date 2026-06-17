const axios = require('axios');

class URL2MDClient {
  constructor(baseUrl = process.env.URL2MD_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.timeout = 30000;
  }

  async convert(url, options = {}) {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/markdown`, {
        params: {
          url,
          raw: options.raw || false
        },
        timeout: this.timeout,
      });
      return data;
    } catch (err) {
      throw new Error(`URL2MD service request failed: ${err.message}`);
    }
  }

  async isReachable() {
    try {
      await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { URL2MDClient };
