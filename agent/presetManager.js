const fs = require('fs');
const path = require('path');

/**
 * Lightweight, zero-dependency YAML parser for configuration files.
 * Handles nested dictionaries, lists, strings (single/double quoted/unquoted),
 * booleans, numbers, and comments.
 */
function parseSimpleYaml(content) {
  const lines = content.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, obj: root }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Remove full-line comments and trailing comments
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Determine line indent
    const indent = rawLine.search(/\S/);

    // Unwind stack to current indentation level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentContext = stack[stack.length - 1].obj;

    // Check if it's a list item: - value
    if (trimmed.startsWith('- ')) {
      const itemVal = parseYamlValue(trimmed.slice(2).trim());
      if (Array.isArray(currentContext)) {
        currentContext.push(itemVal);
      }
      continue;
    }

    // Check for key-value: key: value or key:
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const afterColon = trimmed.slice(colonIndex + 1).trim();

      // If next line has list item or nested map, lookahead
      if (afterColon === '' || afterColon.startsWith('#')) {
        // Peek next line to see if it's a list or object
        let nextIndent = -1;
        let isNextList = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrim = lines[j].trim();
          if (nextTrim && !nextTrim.startsWith('#')) {
            nextIndent = lines[j].search(/\S/);
            isNextList = nextTrim.startsWith('- ');
            break;
          }
        }

        const newChild = isNextList ? [] : {};
        if (Array.isArray(currentContext)) {
          currentContext.push({ [key]: newChild });
        } else {
          currentContext[key] = newChild;
        }

        stack.push({ indent: indent, obj: newChild });
      } else {
        const val = parseYamlValue(afterColon);
        if (Array.isArray(currentContext)) {
          currentContext.push({ [key]: val });
        } else {
          currentContext[key] = val;
        }
      }
    }
  }

  return root;
}

/**
 * Parses scalar values (booleans, numbers, quoted/unquoted strings)
 */
function parseYamlValue(str) {
  // Strip trailing comments if not quoted
  let val = str;
  if (!val.startsWith('"') && !val.startsWith("'")) {
    const commentIdx = val.indexOf('#');
    if (commentIdx !== -1) {
      val = val.slice(0, commentIdx).trim();
    }
  }

  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;

  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return Number(val);
  }

  // Double-quoted strings
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    return val
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // Single-quoted strings
  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    return val.slice(1, -1).replace(/\\'/g, "'");
  }

  return val;
}

class PresetManager {
  /**
   * @param {string} [filePath] - Path to YAML configuration
   */
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, 'presets.yml');
    this.cache = null;
    this.lastMtime = 0;
  }

  /**
   * Loads presets with automatic hot-reloading on file modification.
   * @returns {object} Map of preset configurations
   */
  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.warn(`[PresetManager] Presets file not found at ${this.filePath}`);
        return {};
      }

      const stats = fs.statSync(this.filePath);
      if (this.cache && stats.mtimeMs === this.lastMtime) {
        return this.cache;
      }

      const rawContent = fs.readFileSync(this.filePath, 'utf8');
      let parsed = null;

      // Try external yaml package if installed
      try {
        const externalYaml = require('yaml');
        parsed = externalYaml.parse(rawContent);
      } catch {
        // Fall back to self-contained parser
        parsed = parseSimpleYaml(rawContent);
      }

      this.cache = (parsed && parsed.presets) || {};
      this.lastMtime = stats.mtimeMs;
      return this.cache;
    } catch (err) {
      console.error(`[PresetManager] Error loading presets: ${err.message}`);
      return this.cache || {};
    }
  }

  /**
   * Gets a single preset by name.
   * @param {string} name
   * @returns {object|null}
   */
  get(name) {
    if (!name || typeof name !== 'string') return null;
    const presets = this.load();
    return presets[name.toLowerCase().trim()] || null;
  }

  /**
   * Returns all active presets.
   * @returns {object}
   */
  getAll() {
    return this.load();
  }

  /**
   * Returns a clean summary list of available presets for discovery.
   * @returns {Array<object>}
   */
  listSummary() {
    const presets = this.load();
    return Object.entries(presets).map(([id, p]) => ({
      id,
      name: p.name || id,
      description: p.description || '',
      time_range: p.time_range || null,
      default_limit: p.default_limit || 5,
      allowed_domains: p.allowed_domains || [],
      domain_patterns: p.domain_patterns || [],
      path_patterns: p.path_patterns || [],
    }));
  }
}

module.exports = {
  PresetManager,
  parseSimpleYaml,
  parseYamlValue,
};
