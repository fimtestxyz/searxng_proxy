const DISALLOWED_EXTENSIONS = new Set([
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.bin', '.dmg', '.iso',
  '.mp4', '.mkv', '.avi', '.mov', '.webm',
  '.mp3', '.wav', '.flac', '.ogg',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
]);

const BLOCKED_HOST_PATTERNS = [
  'facebook.com/login',
  'instagram.com',
  'twitter.com/i/flow',
  'x.com/i/flow',
  'linkedin.com/checkpoint',
  'login.yahoo.com',
  'accounts.google.com',
];

const BOT_BLOCK_PATTERNS = [
  /just a moment\.\.\./i,
  /enable javascript and cookies/i,
  /cloudflare ray id/i,
  /please verify you are a human/i,
  /attention required!\s*\|\s*cloudflare/i,
  /access denied\s*\|\s*\d{3}/i,
  /checking your browser before accessing/i,
  /security check to access/i,
];

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
];

/**
 * Strips tracking parameters and hash fragments to maximize cache hits.
 * @param {string} urlStr
 * @returns {string} Cleaned URL
 */
function cleanUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    parsed.hash = '';
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Determines whether a URL is valid and suitable for article extraction.
 * @param {string} urlStr
 * @returns {boolean}
 */
function isAllowedUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  // Only allow HTTP/HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Check file extension
  const pathname = parsed.pathname.toLowerCase();
  for (const ext of DISALLOWED_EXTENSIONS) {
    if (pathname.endsWith(ext)) {
      return false;
    }
  }

  // Check known blocked host / path combinations
  const fullHostPath = (parsed.hostname + parsed.pathname).toLowerCase();
  for (const blocked of BLOCKED_HOST_PATTERNS) {
    if (fullHostPath.includes(blocked)) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates a match score for a candidate URL based on a research preset.
 * @param {string} urlStr
 * @param {object} [preset]
 * @returns {number} Higher score = higher priority
 */
function scoreCandidateByPreset(urlStr, preset) {
  if (!preset || !urlStr) return 0;

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 0;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  let score = 0;

  // 1. Exact or suffix allowed domain match (e.g. sec.gov, prnewswire.com)
  if (Array.isArray(preset.allowed_domains)) {
    for (const domain of preset.allowed_domains) {
      const cleanDomain = domain.toLowerCase();
      if (hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`)) {
        score += 10;
        break;
      }
    }
  }

  // 2. Domain regex patterns (e.g. ^investor\., ^ir\., ^engineering\.)
  if (Array.isArray(preset.domain_patterns)) {
    for (const pattern of preset.domain_patterns) {
      try {
        const re = new RegExp(pattern, 'i');
        if (re.test(hostname)) {
          score += 8;
          break;
        }
      } catch {
        // Ignore invalid regex
      }
    }
  }

  // 3. Path patterns (e.g. /pricing, /fees, /terms)
  if (Array.isArray(preset.path_patterns)) {
    for (const p of preset.path_patterns) {
      if (pathname.includes(p.toLowerCase())) {
        score += 6;
        break;
      }
    }
  }

  return score;
}

/**
 * Filters and deduplicates search candidate items based on URL suitability, domain diversity,
 * and optionally prioritizes candidates matching a research preset.
 *
 * @param {Array<object>} items - Search result items with { url, ... }
 * @param {number} [maxPerDomain=2] - Max links allowed from the same hostname
 * @param {object} [preset=null] - Optional preset configuration
 * @returns {Array<object>} Filtered and prioritized items with cleaned URLs
 */
function filterCandidateResults(items, maxPerDomain = 2, preset = null) {
  if (!Array.isArray(items)) return [];

  const seenUrls = new Set();
  const domainCounts = new Map();
  const eligible = [];

  for (const item of items) {
    if (!item || !item.url) continue;

    const normalizedUrl = cleanUrl(item.url);
    if (!isAllowedUrl(normalizedUrl)) continue;
    if (seenUrls.has(normalizedUrl)) continue;

    let hostname = '';
    try {
      hostname = new URL(normalizedUrl).hostname;
    } catch {
      continue;
    }

    const currentCount = domainCounts.get(hostname) || 0;
    if (currentCount >= maxPerDomain) continue;

    domainCounts.set(hostname, currentCount + 1);
    seenUrls.add(normalizedUrl);

    const presetScore = scoreCandidateByPreset(normalizedUrl, preset);

    eligible.push({
      ...item,
      url: normalizedUrl,
      _preset_score: presetScore,
    });
  }

  // If a preset is provided, sort by preset match score descending (stable sort)
  if (preset) {
    eligible.sort((a, b) => (b._preset_score || 0) - (a._preset_score || 0));
  }

  return eligible;
}

/**
 * Checks if markdown text is genuine substantive content (not a bot-block, 404, or tiny empty snippet).
 * @param {string} markdown
 * @param {number} minChars - Minimum characters required
 * @returns {boolean}
 */
function isSubstantiveMarkdown(markdown, minChars = 150) {
  if (!markdown || typeof markdown !== 'string') return false;

  const trimmed = markdown.trim();
  if (trimmed.length < minChars) return false;

  // Check bot block patterns in the first 2000 characters
  const sample = trimmed.slice(0, 2000);
  for (const pattern of BOT_BLOCK_PATTERNS) {
    if (pattern.test(sample)) {
      return false;
    }
  }

  return true;
}

/**
 * Detects whether markdown contains GitHub Flavored Markdown (GFM) tables.
 * @param {string} markdown
 * @returns {boolean}
 */
function detectTables(markdown) {
  if (!markdown || typeof markdown !== 'string') return false;
  // Look for markdown table separator row: e.g. |---| or |:---|:---|
  return /\|[\s-:]+\|[\s-:]+\|/.test(markdown);
}

/**
 * Extracts stock/crypto tickers from text (e.g. $NVDA, $BTC, $TSLA).
 * @param {string} text
 * @returns {Array<string>} Unique uppercase tickers
 */
function detectTickers(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\$([A-Za-z]{1,6})\b/g) || [];
  const unique = new Set(matches.map((t) => t.toUpperCase()));
  return Array.from(unique);
}

/**
 * Extracts published date from candidate metadata or snippet.
 * @param {object} candidate
 * @returns {string|null}
 */
function extractPublishedDate(candidate) {
  if (!candidate) return null;
  if (candidate.publishedDate) return candidate.publishedDate;

  // Search snippet for common date patterns like "27 Dec 2024" or "2024-11-20"
  const content = candidate.content || '';
  const dateMatch =
    content.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i) ||
    content.match(/\b\d{4}-\d{2}-\d{2}\b/);

  return dateMatch ? dateMatch[0] : null;
}

/**
 * Cleans up markdown bloat (base64 image URIs, excessive newlines) and truncates safely at paragraph boundary.
 * @param {string} markdown
 * @param {number} maxChars
 * @returns {{ markdown: string, char_count: number, truncated: boolean }}
 */
function cleanAndTruncateMarkdown(markdown, maxChars = 15000) {
  if (!markdown || typeof markdown !== 'string') {
    return { markdown: '', char_count: 0, truncated: false };
  }

  // Strip massive base64 image data strings: ![alt](data:image/...;base64,...)
  let cleaned = markdown.replace(/!\[[^\]]*\]\(data:image\/[^;]+;base64,[^)]+\)/gi, '[image removed]');

  // Normalize excessive consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  const originalLength = cleaned.length;
  if (maxChars > 0 && originalLength > maxChars) {
    // Attempt to cut at the nearest newline before maxChars
    let cutPoint = cleaned.lastIndexOf('\n\n', maxChars);
    if (cutPoint === -1 || cutPoint < maxChars * 0.7) {
      cutPoint = cleaned.lastIndexOf('\n', maxChars);
    }
    if (cutPoint === -1 || cutPoint < maxChars * 0.7) {
      cutPoint = maxChars;
    }

    cleaned = cleaned.slice(0, cutPoint).trim() + `\n\n[Content truncated at ${cutPoint} characters...]`;
    return {
      markdown: cleaned,
      char_count: cleaned.length,
      truncated: true,
    };
  }

  return {
    markdown: cleaned,
    char_count: cleaned.length,
    truncated: false,
  };
}

module.exports = {
  cleanUrl,
  isAllowedUrl,
  scoreCandidateByPreset,
  filterCandidateResults,
  isSubstantiveMarkdown,
  detectTables,
  detectTickers,
  extractPublishedDate,
  cleanAndTruncateMarkdown,
};
