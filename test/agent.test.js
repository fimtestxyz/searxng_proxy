const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanUrl,
  isAllowedUrl,
  filterCandidateResults,
  isSubstantiveMarkdown,
  cleanAndTruncateMarkdown,
} = require('../agent/sanitizer');
const { AgentSearchService, withTimeout } = require('../agent/service');

test('sanitizer: cleanUrl strips tracking params', () => {
  const dirty = 'https://example.com/page?utm_source=google&utm_medium=cpc&id=123#heading';
  const cleaned = cleanUrl(dirty);
  assert.equal(cleaned, 'https://example.com/page?id=123');
});

test('sanitizer: isAllowedUrl rejects disallowed file extensions and invalid protocols', () => {
  assert.equal(isAllowedUrl('https://example.com/report.pdf'), false);
  assert.equal(isAllowedUrl('https://example.com/archive.zip'), false);
  assert.equal(isAllowedUrl('https://example.com/video.mp4'), false);
  assert.equal(isAllowedUrl('ftp://example.com/article'), false);
  assert.equal(isAllowedUrl('https://facebook.com/login/identify'), false);
  assert.equal(isAllowedUrl('https://example.com/blog/article-1'), true);
});

test('sanitizer: filterCandidateResults enforces domain diversity and removes invalid URLs', () => {
  const candidates = [
    { url: 'https://site-a.com/page-1', title: 'A1', content: 'c1' },
    { url: 'https://site-a.com/page-2', title: 'A2', content: 'c2' },
    { url: 'https://site-a.com/page-3', title: 'A3', content: 'c3' }, // should be skipped (max 2 per domain)
    { url: 'https://site-b.com/file.pdf', title: 'B1', content: 'c4' }, // should be skipped (pdf)
    { url: 'https://site-c.com/page-1?utm_campaign=spring', title: 'C1', content: 'c5' }, // should be cleaned
  ];

  const filtered = filterCandidateResults(candidates, 2);
  assert.equal(filtered.length, 3);
  assert.equal(filtered[0].url, 'https://site-a.com/page-1');
  assert.equal(filtered[1].url, 'https://site-a.com/page-2');
  assert.equal(filtered[2].url, 'https://site-c.com/page-1');
});

test('sanitizer: isSubstantiveMarkdown detects short content and bot block patterns', () => {
  assert.equal(isSubstantiveMarkdown('Too short'), false);
  assert.equal(
    isSubstantiveMarkdown(
      'Just a moment... Enable JavaScript and cookies to continue. Cloudflare Ray ID: 87817263541' +
      'a'.repeat(200)
    ),
    false
  );
  assert.equal(
    isSubstantiveMarkdown(
      '# The Future of AI\n\nArtificial Intelligence continues to evolve rapidly with autonomous agents and local SLMs.' +
      ' Detailed analysis follows below.\n\n'.repeat(5)
    ),
    true
  );
});

test('sanitizer: cleanAndTruncateMarkdown strips base64 images and truncates cleanly', () => {
  const contentWithImage = 'Intro text\n\n![diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...)\n\nConclusion text.';
  const res1 = cleanAndTruncateMarkdown(contentWithImage, 5000);
  assert.ok(!res1.markdown.includes('data:image/png;base64'));
  assert.ok(res1.markdown.includes('[image removed]'));

  const longContent = 'Paragraph 1.\n\n' + 'Paragraph 2 with extra content.\n\n'.repeat(50);
  const res2 = cleanAndTruncateMarkdown(longContent, 200);
  assert.equal(res2.truncated, true);
  assert.ok(res2.char_count <= 260); // includes truncation footer
  assert.ok(res2.markdown.includes('[Content truncated at'));
});

test('service: withTimeout aborts if promise is slower than limit', async () => {
  const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 100));
  await assert.rejects(
    () => withTimeout(slowPromise, 20, 'Too slow'),
    /Too slow/
  );
});

test('service: AgentSearchService end-to-end pipeline with working and failing pages', async () => {
  const mockSearxng = {
    searchWithParams: async () => ({
      results: [
        {
          url: 'https://working-site.com/post-1',
          title: 'Working Site Title',
          content: 'Working snippet from search engine',
        },
        {
          url: 'https://hanging-site.com/timeout',
          title: 'Timeout Site',
          content: 'Timeout snippet',
        },
        {
          url: 'https://cloudflare-block.com/article',
          title: 'Blocked Site',
          content: 'Blocked snippet',
        },
        {
          url: 'https://working-site-2.com/post-2',
          title: 'Working Site 2',
          content: 'Working 2 snippet',
        },
      ],
    }),
  };

  const mockConverter = {
    convert: async (url) => {
      if (url.includes('timeout')) {
        // simulate a hung site
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { markdown: 'Delayed' };
      }
      if (url.includes('cloudflare-block')) {
        return {
          title: 'Access Denied',
          markdown: 'Attention Required! | Cloudflare. Please verify you are a human. ' + 'x'.repeat(200),
        };
      }
      return {
        url,
        title: 'Extracted Article',
        markdown: `# Real Article for ${url}\n\nHere is deep substantive research content.\n\n` + 'Analysis. '.repeat(30),
        provider: 'jina',
        cached: false,
      };
    },
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'test agent search',
    limit: 3,
    page_timeout_ms: 100, // fast timeout for test
    fallback_to_snippet: true,
  });

  assert.equal(response.query, 'test agent search');
  assert.equal(response.returned, 3);
  assert.equal(response.working_markdown_count, 2);

  // First 2 should be the successful working pages
  assert.equal(response.results[0].scrape_status, 'success');
  assert.ok(response.results[0].markdown.includes('# Real Article'));
  assert.equal(response.results[1].scrape_status, 'success');

  // The 3rd item should be the snippet fallback
  assert.equal(response.results[2].scrape_status, 'snippet_only');
  assert.equal(response.results[2].markdown, null);
  assert.ok(response.results[2].snippet);

  // Failed list should include timeout and block
  assert.equal(response.failed.length, 2);
});

test('service: AgentSearchService with preset expands query and enriches signals', async () => {
  let capturedParams = null;
  const mockSearxng = {
    searchWithParams: async (params) => {
      capturedParams = params;
      return {
        results: [
          {
            url: 'https://investor.nvidia.com/quarterly-results',
            title: 'NVIDIA Reports Q3 Financial Results ($NVDA)',
            content: '20 Nov 2024 ... Net income was record high.',
          },
          {
            url: 'https://random-forum.org/thread-123',
            title: 'Random Discussion',
            content: 'Just chatting',
          },
        ],
      };
    },
  };

  const mockConverter = {
    convert: async (url) => ({
      url,
      title: 'Q3 Financials',
      markdown: '# NVIDIA Q3 Results\n\n| Revenue | Net Income |\n| :--- | :--- |\n| $35.1B | $19.3B |\n\n' + 'Content '.repeat(20),
      provider: 'jina',
    }),
  };

  const service = new AgentSearchService({
    searxng: mockSearxng,
    converter: mockConverter,
  });

  const response = await service.execute({
    query: 'Nvidia',
    preset: 'fintech_ir',
    limit: 1,
  });

  // Check query expansion
  assert.ok(capturedParams.q.includes('earnings OR guidance'));
  assert.equal(response.preset, 'fintech_ir');
  assert.equal(response.returned, 1);

  // Check fintech signal enrichment
  const firstResult = response.results[0];
  assert.equal(firstResult.has_tables, true);
  assert.ok(firstResult.detected_tickers.includes('$NVDA'));
  assert.equal(firstResult.published_date, '20 Nov 2024');
  assert.equal(firstResult.url, 'https://investor.nvidia.com/quarterly-results');
});

