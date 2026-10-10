const express = require('express');
const { AgentSearchService } = require('./service');
const { PresetManager } = require('./presetManager');

/**
 * Creates the Express router for agentic search APIs.
 * @param {object} dependencies
 * @param {object} dependencies.searxng - SearXNGClient instance
 * @param {object} dependencies.converter - MarkdownConverter instance
 * @param {PresetManager} [dependencies.presetManager] - Optional PresetManager instance
 * @returns {express.Router}
 */
function createAgentRouter({ searxng, converter, presetManager }) {
  const router = express.Router();
  const manager = presetManager || new PresetManager();
  const agentService = new AgentSearchService({ searxng, converter, presetManager: manager });

  /**
   * Helper to parse query options from request
   */
  function parseOptions(source) {
    const rawPreset = source.preset;
    const preset = (rawPreset && typeof rawPreset === 'string' && rawPreset.trim() && !['none', 'default', 'normal'].includes(rawPreset.trim().toLowerCase()))
      ? rawPreset.trim()
      : undefined;

    return {
      query: source.query || source.search_query || source.q,
      preset,
      limit: source.limit ? parseInt(source.limit, 10) : undefined,
      max_chars_per_page: source.max_chars_per_page || source.max_chars,
      time_range: source.time_range,
      engines: source.engines,
      categories: source.categories,
      page_timeout_ms: source.page_timeout_ms,
      fallback_to_snippet: source.fallback_to_snippet !== undefined
        ? source.fallback_to_snippet === true || source.fallback_to_snippet === 'true'
        : true,
    };
  }

  /**
   * GET /api/agent/presets
   * Discovery endpoint for agents to list all active research presets.
   */
  router.get('/presets', (_req, res) => {
    try {
      const summary = manager.listSummary();
      res.json({
        count: summary.length,
        presets: summary,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve presets', detail: err.message });
    }
  });

  /**
   * POST /api/agent/search
   * Primary agent tool calling endpoint.
   */
  router.post('/search', async (req, res) => {
    const options = parseOptions(req.body || {});
    if (!options.query || !options.query.trim()) {
      return res.status(400).json({
        error: 'Missing required parameter: query (or search_query)',
      });
    }

    try {
      const response = await agentService.execute(options);
      res.json(response);
    } catch (err) {
      const isUpstream = err.code === 'ECONNREFUSED' || err.message?.includes('SearXNG');
      const statusCode = isUpstream ? 502 : 500;
      res.status(statusCode).json({
        error: 'Agent search pipeline failed',
        detail: err.message,
      });
    }
  });

  /**
   * GET /api/agent/search
   * Convenience endpoint for browser testing and simple GET agents.
   */
  router.get('/search', async (req, res) => {
    const options = parseOptions(req.query || {});
    if (!options.query || !options.query.trim()) {
      return res.status(400).json({
        error: 'Missing required query parameter: q (or query / search_query)',
      });
    }

    try {
      const response = await agentService.execute(options);
      res.json(response);
    } catch (err) {
      const isUpstream = err.code === 'ECONNREFUSED' || err.message?.includes('SearXNG');
      const statusCode = isUpstream ? 502 : 500;
      res.status(statusCode).json({
        error: 'Agent search pipeline failed',
        detail: err.message,
      });
    }
  });

  /**
   * GET /api/agent/info
   * Metadata endpoint describing tool capabilities for agents.
   */
  router.get('/info', (_req, res) => {
    res.json({
      name: 'Agentic Search & Markdown API',
      description: 'Institutional-grade research scraper for fintech, regulatory, and deep tech intelligence.',
      presets: manager.listSummary().map((p) => p.id),
      endpoints: {
        'GET /api/agent/presets': 'List available research presets with their domain lists and defaults',
        'POST /api/agent/search': {
          body: {
            query: 'string (required, or search_query)',
            preset: 'string (optional: fintech_ir, regulatory, tech_intel, competitor, macro)',
            limit: 'number (optional, default 5, max 15)',
            max_chars_per_page: 'number (optional, default 15000)',
            time_range: 'string (optional: day, week, month, year)',
            engines: 'string (optional comma-separated engines)',
            fallback_to_snippet: 'boolean (optional, default true)',
          },
        },
        'GET /api/agent/search': {
          query_params: ['q (or query)', 'preset', 'limit', 'max_chars', 'time_range', 'engines'],
        },
      },
    });
  });

  return router;
}

module.exports = { createAgentRouter };
