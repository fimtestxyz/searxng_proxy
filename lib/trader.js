const fs = require('fs');
const path = require('path');

const SOURCES_PATH = path.join(__dirname, '..', 'data', 'sources.json');

class SourceManager {
  constructor() {
    this.sources = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    } catch (err) {
      console.error(`Failed to load sources from ${SOURCES_PATH}: ${err.message}`);
      return { news: [], analysis: [], social: [], custom: [] };
    }
  }

  getAll() {
    return this.sources;
  }

  getByCategory(category) {
    return this.sources[category] || [];
  }

  save(sources) {
    const tmpPath = SOURCES_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(sources, null, 2));
    fs.renameSync(tmpPath, SOURCES_PATH);
    this.sources = sources;
  }

  addSource(category, source) {
    if (!this.sources[category]) {
      this.sources[category] = [];
    }
    this.sources[category].push({ ...source });
    this.save(this.sources);
  }

  removeSource(category, index) {
    this.sources[category].splice(index, 1);
    this.save(this.sources);
  }
}

module.exports = { SourceManager };
