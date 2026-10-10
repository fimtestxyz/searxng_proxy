const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreCandidateByPreset,
  detectTables,
  detectTickers,
  extractPublishedDate,
} = require('../agent/sanitizer');

test('fintech-signals: detectTickers finds valid stock and crypto symbols', () => {
  const text = 'Nvidia ($NVDA) and Apple ($AAPL) reported revenue. Also checked $BTC and $ETH prices.';
  const tickers = detectTickers(text);
  assert.deepEqual(tickers.sort(), ['$AAPL', '$BTC', '$ETH', '$NVDA']);
});

test('fintech-signals: detectTables detects GFM markdown pipe tables', () => {
  const tableMd = `
# Financial Statements
| Quarter | Revenue | Gross Margin |
| :--- | :--- | :--- |
| Q1 2025 | $26.0B | 78.4% |
`;
  assert.equal(detectTables(tableMd), true);
  assert.equal(detectTables('Just regular paragraph without any tables.'), false);
});

test('fintech-signals: extractPublishedDate extracts metadata and snippet dates', () => {
  assert.equal(
    extractPublishedDate({ publishedDate: '2025-05-15' }),
    '2025-05-15'
  );
  assert.equal(
    extractPublishedDate({ content: '27 Dec 2024 ... The technical report shows...' }),
    '27 Dec 2024'
  );
  assert.equal(
    extractPublishedDate({ content: 'Published on 2024-11-20 by Reuters' }),
    '2024-11-20'
  );
});

test('fintech-signals: scoreCandidateByPreset prioritizes allowed domains and patterns', () => {
  const preset = {
    allowed_domains: ['sec.gov', 'businesswire.com'],
    domain_patterns: ['^investor\\.', '^ir\\.'],
    path_patterns: ['/pricing'],
  };

  const scoreSec = scoreCandidateByPreset('https://www.sec.gov/edgar/searchedgar/companysearch', preset);
  const scoreIr = scoreCandidateByPreset('https://investor.nvidia.com/news/article', preset);
  const scorePricing = scoreCandidateByPreset('https://stripe.com/pricing', preset);
  const scoreGeneric = scoreCandidateByPreset('https://randomblog.xyz/post-1', preset);

  assert.ok(scoreSec >= 10, 'SEC domain should score high');
  assert.ok(scoreIr >= 8, 'investor pattern should score high');
  assert.ok(scorePricing >= 6, 'pricing path pattern should score high');
  assert.equal(scoreGeneric, 0, 'Generic domain should score 0');
});
