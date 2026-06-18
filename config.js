// Centralized configuration for searxng-proxy
// All port numbers and service URLs in one place

const config = {
  // --- SearXNG Proxy Server (this app) ---
  port: parseInt(process.env.PORT || '5555', 10),

  // --- SearXNG Backend (upstream search engine) ---
  searxng: {
    baseUrl: process.env.SEARXNG_URL || 'http://localhost:8889',
    timeout: 10000,
  },

  // --- URL2MD Service (markdown conversion) ---
  url2md: {
    baseUrl: process.env.URL2MD_URL || 'http://localhost:3000',
    timeout: 30000,
  },

  // --- Markdown Processing ---
  markdown: {
    concurrency: parseInt(process.env.MARKDOWN_CONCURRENCY || '3', 10),
    cache: {
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
      ttlMs: parseInt(process.env.CACHE_TTL_MS || '1800000', 10), // 30 minutes
    },
  },

  // --- Cloudflare Tunnel ---
  tunnel: {
    // If not set, defaults to config.port
    port: process.env.TUNNEL_PORT || null,
  },

  // Helper to get the port that cloudflared should tunnel to
  getTunnelPort() {
    return this.tunnel.port || this.port;
  },
};

module.exports = config;