const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { AgentSearchService } = require('../agent/service');
const { PresetManager } = require('../agent/presetManager');

test('use-case 1: fintech_ir preset prioritizes IR domains, expands query, and extracts tables & tickers', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://random-forum.xyz/opinions/123',
            title: 'My thoughts on AAPL',
            content: 'Just random chatter without data.',
          },
          {
            url: 'https://investor.apple.com/financials/quarterly-results',
            title: 'Apple Inc. ($AAPL) Q4 FY25 Financial Results',
            content: '31 Oct 2025 ... Revenue was $94.9 billion.',
          },
          {
            url: 'https://www.businesswire.com/news/home/20251031005001/en/Apple-Reports-Fourth-Quarter-Results',
            title: 'Apple Reports Fourth Quarter Results',
            content: 'Business Wire press release with official tables.',
          },
        ],
      };
    },
  };

  const mockConverter = {
    convert: async (url) => {
      if (url.includes('investor.apple.com')) {
        return {
          url,
          title: 'Apple Inc. Financial Results',
          markdown: '# Apple Q4 Financials\n\n| Segment | Revenue | YoY |\n| :--- | :--- | :--- |\n| iPhone | $46.2B | +6% |\n| Services | $24.9B | +12% |\n\n' + 'Analysis '.repeat(20),
          provider: 'jina',
        };
      }
      return {
        url,
        title: 'Generic Page',
        markdown: '# Generic Page\n\nSome standard article text.\n\n' + 'Content '.repeat(20),
        provider: 'jina',
      };
    },
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'Apple quarterly revenue',
    preset: 'fintech_ir',
    limit: 2,
  });

  // 1. Query expansion check
  assert.ok(capturedParams.q.includes('earnings OR guidance'));

  // 2. Prioritization check: both IR & wire domains should be ranked ahead of random-forum
  const returnedUrls = response.results.map((r) => r.url);
  assert.ok(returnedUrls.includes('https://investor.apple.com/financials/quarterly-results'));
  assert.ok(returnedUrls.includes('https://www.businesswire.com/news/home/20251031005001/en/Apple-Reports-Fourth-Quarter-Results'));
  assert.ok(!returnedUrls.includes('https://random-forum.xyz/opinions/123'));

  const irResult = response.results.find((r) => r.url.includes('investor.apple.com'));
  assert.equal(irResult.has_tables, true);
  assert.ok(irResult.detected_tickers.includes('$AAPL'));
  assert.equal(irResult.published_date, '31 Oct 2025');
  assert.equal(response.returned, 2);
});

test('use-case 2: regulatory preset targets SEC and financial regulators with 1-year time range', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://www.sec.gov/litigation/admin/2025/34-99999.htm',
            title: 'SEC Enforcement Release: Cease-and-Desist Order',
            content: '15 Jan 2025 ... The Securities and Exchange Commission announced...',
          },
          {
            url: 'https://newsblog.com/crypto-sec-news',
            title: 'Blog commentary on SEC',
            content: 'Summary by blog writer.',
          },
        ],
      };
    },
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'SEC Enforcement Action',
      markdown: '# UNITED STATES OF AMERICA Before the SEC\n\nADMINISTRATIVE PROCEEDING File No. 3-21000\n\nOrder Instituting Cease-and-Desist Proceedings.\n\n' + 'Legal text '.repeat(25),
      provider: 'jina',
    }),
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'Coinbase staking order',
    preset: 'regulatory',
    limit: 1,
  });

  // Check query expansion for regulatory filings
  assert.ok(capturedParams.q.includes('filing OR enforcement OR order'));
  assert.equal(capturedParams.time_range, 'year');

  // Check prioritization of sec.gov
  assert.equal(response.results[0].url, 'https://www.sec.gov/litigation/admin/2025/34-99999.htm');
  assert.equal(response.results[0].published_date, '15 Jan 2025');
});

test('use-case 3: competitor preset prioritizes /pricing and /terms paths', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({
      results: [
        {
          url: 'https://stripe.com/blog/community-news',
          title: 'Community Update',
          content: 'Generic blog post',
        },
        {
          url: 'https://stripe.com/pricing',
          title: 'Stripe Pricing & Processing Fees',
          content: 'Card processing fees: 2.9% + 30c.',
        },
      ],
    }),
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Stripe Pricing',
      markdown: '# Stripe Pricing Structure\n\n| Method | Rate | Fixed |\n| :--- | :--- | :--- |\n| Cards | 2.9% | $0.30 |\n\n' + 'Details '.repeat(20),
      provider: 'jina',
    }),
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'Stripe payment fees',
    preset: 'competitor',
    limit: 1,
  });

  // /pricing path should be prioritized first
  assert.equal(response.results[0].url, 'https://stripe.com/pricing');
  assert.equal(response.results[0].has_tables, true);
});

test('use-case 4: macro preset prioritizes central banks and central bank query expansion', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250129a.htm',
            title: 'Federal Reserve issues FOMC statement',
            content: '29 Jan 2025 ... The Federal Open Market Committee decided...',
          },
        ],
      };
    },
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'FOMC Statement',
      markdown: '# Federal Reserve Press Release\n\nRecent indicators suggest that economic activity has continued to expand at a solid pace.\n\n' + 'Statement '.repeat(25),
      provider: 'jina',
    }),
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'FOMC rate decision',
    preset: 'macro',
  });

  assert.ok(capturedParams.q.includes('monetary policy'));
  assert.equal(response.results[0].url, 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250129a.htm');
  assert.equal(response.results[0].published_date, '29 Jan 2025');
});

test('resilience: unknown preset degrades gracefully to clean query', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://example.com/article',
            title: 'Example Article',
            content: 'Snippet',
          },
        ],
      };
    },
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Example',
      markdown: '# Article\n\nSubstantive content.\n\n' + 'Text '.repeat(30),
    }),
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'quantum computing',
    preset: 'non_existent_preset_xyz',
    limit: 5,
  });

  // Query should not be modified
  assert.equal(capturedParams.q, 'quantum computing');
  assert.equal(response.preset, null);
  assert.equal(response.returned, 1);
});

test('resilience: clamps limit values strictly between 1 and 15', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({ results: [] }),
  };
  const mockConverter = { convert: async () => ({}) };

  const service = new AgentSearchService({ searxng: mockSearxng, converter: mockConverter });

  // Negative limit
  const resLow = await service.execute({ query: 'test', limit: -10 });
  assert.equal(resLow.returned, 0);

  // Excessive limit
  const resHigh = await service.execute({ query: 'test', limit: 100 });
  assert.equal(resHigh.returned, 0);
});

test('resilience: fallback_to_snippet=false excludes failed pages from results', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({
      results: [
        {
          url: 'https://broken-site.com/dead-link',
          title: 'Dead Link',
          content: 'Dead content',
        },
      ],
    }),
  };

  const mockConverter = {
    convert: async () => {
      throw new Error('Connection refused');
    },
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'failing test',
    fallback_to_snippet: false,
  });

  assert.equal(response.returned, 0);
  assert.equal(response.results.length, 0);
  assert.equal(response.failed.length, 1);
  assert.equal(response.failed[0].url, 'https://broken-site.com/dead-link');
});

test('hot-reload: PresetManager dynamically picks up changes when file is updated', () => {
  const tmpFilePath = path.join(__dirname, 'temp-presets.yml');
  try {
    fs.writeFileSync(
      tmpFilePath,
      `
presets:
  version_one:
    name: "Version 1"
    default_limit: 3
`
    );

    const manager = new PresetManager(tmpFilePath);
    assert.equal(manager.get('version_one').name, 'Version 1');
    assert.equal(manager.get('version_two'), null);

    // Update file with new preset and ensure mtime updates
    const now = Date.now() + 1000;
    fs.writeFileSync(
      tmpFilePath,
      `
presets:
  version_one:
    name: "Version 1 Modified"
  version_two:
    name: "Version 2 Added"
`
    );
    // Touch mtime explicitly
    fs.utimesSync(tmpFilePath, new Date(now), new Date(now));

    assert.equal(manager.get('version_one').name, 'Version 1 Modified');
    assert.ok(manager.get('version_two'), 'Should hot reload version_two');
    assert.equal(manager.get('version_two').name, 'Version 2 Added');
  } finally {
    if (fs.existsSync(tmpFilePath)) {
      fs.unlinkSync(tmpFilePath);
    }
  }
});
