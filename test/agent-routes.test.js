const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRouter } = require('../agent/routes');

function invokeRoute(router, { method, url, body, query }) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      body: body || {},
      query: query || {},
      headers: {},
    };

    const res = {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        resolve(this);
      },
      send(data) {
        this.body = data;
        resolve(this);
      },
    };

    router(req, res, (err) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

test('routes: POST /search returns 400 when query is missing', async () => {
  const mockSearxng = { searchWithParams: async () => ({ results: [] }) };
  const mockConverter = { convert: async () => ({}) };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  const res = await invokeRoute(router, {
    method: 'POST',
    url: '/search',
    body: {},
  });

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes('Missing required parameter'));
});

test('routes: POST /search accepts search_query and returns results', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({
      results: [
        {
          url: 'https://example.com/test-article',
          title: 'Test Article',
          content: 'Snippet content',
        },
      ],
    }),
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Converted Title',
      markdown: '# Hello World\n\nThis is substantive test markdown.\n\n' + 'Content '.repeat(30),
      provider: 'jina',
      cached: false,
    }),
  };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  const res = await invokeRoute(router, {
    method: 'POST',
    url: '/search',
    body: { search_query: 'agentic search', limit: 2 },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.query, 'agentic search');
  assert.equal(res.body.returned, 1);
  assert.equal(res.body.working_markdown_count, 1);
  assert.equal(res.body.results[0].scrape_status, 'success');
  assert.ok(res.body.results[0].markdown.includes('# Hello World'));
});

test('routes: GET /search accepts q parameter', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({
      results: [
        {
          url: 'https://example.com/get-article',
          title: 'GET Article',
          content: 'Snippet',
        },
      ],
    }),
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Extracted GET Title',
      markdown: '# GET Search\n\nSubstantive markdown content for GET request.\n\n' + 'Details '.repeat(30),
      provider: 'jina',
    }),
  };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  const res = await invokeRoute(router, {
    method: 'GET',
    url: '/search',
    query: { q: 'test get query' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.query, 'test get query');
  assert.equal(res.body.returned, 1);
  assert.equal(res.body.results[0].title, 'Extracted GET Title');
});

test('routes: GET /info returns API documentation', async () => {
  const mockSearxng = { searchWithParams: async () => ({}) };
  const mockConverter = { convert: async () => ({}) };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  const res = await invokeRoute(router, {
    method: 'GET',
    url: '/info',
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.name.includes('Agentic Search'));
  assert.ok(res.body.endpoints['POST /api/agent/search']);
});

test('routes: GET /presets returns available research presets', async () => {
  const mockSearxng = { searchWithParams: async () => ({}) };
  const mockConverter = { convert: async () => ({}) };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  const res = await invokeRoute(router, {
    method: 'GET',
    url: '/presets',
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.count >= 5);
  const ids = res.body.presets.map((p) => p.id);
  assert.ok(ids.includes('fintech_ir'));
  assert.ok(ids.includes('regulatory'));
  assert.ok(ids.includes('tech_intel'));
});

test('routes: POST /search defaults to normal web search when preset is omitted, empty, or none', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://example.com/normal-result',
            title: 'Normal Web Result',
            content: 'General content',
          },
        ],
      };
    },
  };
  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Normal Converted',
      markdown: '# Normal Content\n\nSubstantive general content.\n\n' + 'Word '.repeat(30),
      provider: 'jina',
    }),
  };

  const router = createAgentRouter({ searxng: mockSearxng, converter: mockConverter });

  // 1. Omitted preset
  const res1 = await invokeRoute(router, {
    method: 'POST',
    url: '/search',
    body: { query: 'general news query' },
  });
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.preset, null);
  assert.equal(capturedParams.q, 'general news query'); // No query expansion

  // 2. Preset set to "none"
  const res2 = await invokeRoute(router, {
    method: 'POST',
    url: '/search',
    body: { query: 'general news query', preset: 'none' },
  });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.preset, null);
  assert.equal(capturedParams.q, 'general news query');
});

