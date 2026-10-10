const {
  filterCandidateResults,
  isSubstantiveMarkdown,
  cleanAndTruncateMarkdown,
  detectTables,
  detectTickers,
  extractPublishedDate,
} = require('./sanitizer');
const { PresetManager } = require('./presetManager');

/**
 * Wraps a promise with a timeout.
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} errorMsg
 * @returns {Promise}
 */
function withTimeout(promise, ms, errorMsg = 'Operation timed out') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

class AgentSearchService {
  /**
   * @param {object} dependencies
   * @param {object} dependencies.searxng - SearXNGClient instance
   * @param {object} dependencies.converter - MarkdownConverter instance
   * @param {PresetManager} [dependencies.presetManager] - Optional PresetManager instance
   */
  constructor({ searxng, converter, presetManager }) {
    if (!searxng) throw new Error('SearXNGClient is required for AgentSearchService');
    if (!converter) throw new Error('MarkdownConverter is required for AgentSearchService');
    this.searxng = searxng;
    this.converter = converter;
    this.presetManager = presetManager || new PresetManager();
  }

  /**
   * Executes the agent search pipeline:
   * 1. Query SearXNG for candidate links (with optional preset query expansion).
   * 2. Sanitize and filter candidates (URL filters, domain diversity, preset scoring).
   * 3. Concurrently fetch and convert top candidates to Markdown with per-page timeouts.
   * 4. Verify markdown quality (exclude bot-blocks, empty pages).
   * 5. Extract fintech & technical metadata (tables, tickers, dates).
   * 6. Fall back to search snippets if a page fails or is low quality.
   *
   * @param {object} options
   * @param {string} options.query - The search query
   * @param {string} [options.preset] - Optional research preset name (e.g. fintech_ir, regulatory, etc.)
   * @param {number} [options.limit=5] - Target number of results (1-15)
   * @param {number} [options.max_chars_per_page=15000] - Max characters per markdown page
   * @param {string} [options.time_range] - SearXNG time range: day, week, month, year
   * @param {string} [options.engines] - SearXNG comma-separated engine list
   * @param {string} [options.categories] - SearXNG comma-separated category list
   * @param {number} [options.page_timeout_ms=5000] - Timeout per page scrape in ms
   * @param {boolean} [options.fallback_to_snippet=true] - Whether to retain failed pages as snippet-only
   * @returns {Promise<object>}
   */
  async execute({
    query,
    preset,
    limit,
    max_chars_per_page,
    time_range,
    engines,
    categories,
    page_timeout_ms = 5000,
    fallback_to_snippet = true,
  }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('Missing or empty search query');
    }

    const cleanQuery = query.trim();
    const t0 = Date.now();

    // 1. Resolve preset if provided
    let presetConfig = null;
    let effectiveQuery = cleanQuery;
    let selectedPreset = null;

    if (preset) {
      presetConfig = this.presetManager.get(preset);
      if (presetConfig) {
        selectedPreset = preset.toLowerCase().trim();
        // Expand query if preset specifies a query_suffix
        if (presetConfig.query_suffix && !cleanQuery.toLowerCase().includes(presetConfig.query_suffix.toLowerCase())) {
          effectiveQuery = `${cleanQuery} (${presetConfig.query_suffix})`;
        }
      }
    }

    // Apply defaults from preset if not explicitly overridden
    const targetLimit = Math.max(
      1,
      Math.min(parseInt(limit || presetConfig?.default_limit || 5, 10), 15)
    );
    const maxChars =
      parseInt(max_chars_per_page || presetConfig?.max_chars_per_page || 15000, 10);
    const effectiveTimeRange = time_range || presetConfig?.time_range;
    const pageTimeout = Math.max(1000, parseInt(page_timeout_ms, 10) || 5000);

    // 2. Query SearXNG
    const searchParams = {
      q: effectiveQuery,
      format: 'json',
    };
    if (effectiveTimeRange) searchParams.time_range = effectiveTimeRange;
    if (engines) searchParams.engines = engines;
    if (categories) searchParams.categories = categories;

    const rawData = await this.searxng.searchWithParams(searchParams);
    const rawResults = rawData.results || [];

    // 3. Sanitize & filter candidate URLs, prioritizing preset domains if applicable
    const sanitizedCandidates = filterCandidateResults(rawResults, 2, presetConfig);

    // Over-fetch: scrape up to 1.5x - 2x the target limit to account for dead links / blocks
    const candidatePoolSize = Math.min(Math.max(targetLimit * 2, 8), sanitizedCandidates.length);
    const candidatePool = sanitizedCandidates.slice(0, candidatePoolSize);

    // 4. Concurrently scrape candidates with per-page timeouts
    const scrapeTasks = candidatePool.map(async (candidate) => {
      const startTime = Date.now();
      const publishedDate = extractPublishedDate(candidate);

      try {
        const converted = await withTimeout(
          this.converter.convert(candidate.url),
          pageTimeout,
          `Page scrape timed out after ${pageTimeout}ms`
        );

        // 5. Validate markdown quality
        if (!isSubstantiveMarkdown(converted.markdown)) {
          return {
            url: candidate.url,
            title: candidate.title || converted.title,
            snippet: candidate.content,
            published_date: publishedDate,
            markdown: null,
            scrape_status: 'snippet_only',
            reason: 'Insufficient content or challenge page detected',
            elapsed_ms: Date.now() - startTime,
          };
        }

        // Clean & truncate markdown
        const cleaned = cleanAndTruncateMarkdown(converted.markdown, maxChars);
        const hasTables = detectTables(cleaned.markdown);
        const detectedTickers = detectTickers(
          (candidate.title || '') + ' ' + (candidate.content || '') + ' ' + cleaned.markdown.slice(0, 5000)
        );

        return {
          url: candidate.url,
          title: converted.title || candidate.title,
          snippet: candidate.content,
          published_date: publishedDate,
          markdown: cleaned.markdown,
          scrape_status: 'success',
          char_count: cleaned.char_count,
          truncated: cleaned.truncated,
          has_tables: hasTables,
          detected_tickers: detectedTickers,
          provider: converted.provider || 'jina',
          cached: Boolean(converted.cached),
          elapsed_ms: Date.now() - startTime,
        };
      } catch (err) {
        return {
          url: candidate.url,
          title: candidate.title,
          snippet: candidate.content,
          published_date: publishedDate,
          markdown: null,
          scrape_status: 'snippet_only',
          reason: err.message,
          elapsed_ms: Date.now() - startTime,
        };
      }
    });

    const settledResults = await Promise.all(scrapeTasks);

    // 6. Build results list prioritizing working markdown pages
    const workingResults = [];
    const fallbackResults = [];
    const failedItems = [];

    for (const item of settledResults) {
      if (item.scrape_status === 'success') {
        workingResults.push(item);
      } else {
        if (fallback_to_snippet) {
          fallbackResults.push(item);
        }
        failedItems.push({
          url: item.url,
          reason: item.reason,
        });
      }
    }

    // Assemble up to targetLimit results: fill with working first, then snippets if allowed
    const finalResults = [];
    for (const item of workingResults) {
      if (finalResults.length >= targetLimit) break;
      finalResults.push(item);
    }
    if (fallback_to_snippet) {
      for (const item of fallbackResults) {
        if (finalResults.length >= targetLimit) break;
        finalResults.push(item);
      }
    }

    return {
      query: cleanQuery,
      effective_query: effectiveQuery !== cleanQuery ? effectiveQuery : undefined,
      preset: selectedPreset,
      total_candidates: rawResults.length,
      returned: finalResults.length,
      working_markdown_count: workingResults.length,
      elapsed_ms: Date.now() - t0,
      results: finalResults,
      ...(failedItems.length > 0 ? { failed: failedItems } : {}),
    };
  }
}

module.exports = {
  AgentSearchService,
  withTimeout,
};
