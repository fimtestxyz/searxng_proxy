const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { PresetManager, parseSimpleYaml } = require('../agent/presetManager');

test('presetManager: parses YAML with nested maps and lists', () => {
  const yamlText = `
presets:
  custom_mode:
    name: "Custom Mode"
    allowed_domains:
      - example.com
      - test.org
    default_limit: 7
    preserve_tables: true
`;
  const parsed = parseSimpleYaml(yamlText);
  assert.ok(parsed.presets);
  assert.ok(parsed.presets.custom_mode);
  assert.equal(parsed.presets.custom_mode.name, 'Custom Mode');
  assert.deepEqual(parsed.presets.custom_mode.allowed_domains, ['example.com', 'test.org']);
  assert.equal(parsed.presets.custom_mode.default_limit, 7);
  assert.equal(parsed.presets.custom_mode.preserve_tables, true);
});

test('presetManager: loads real agent/presets.yml with all 5 default presets', () => {
  const manager = new PresetManager(path.join(__dirname, '../agent/presets.yml'));
  const all = manager.getAll();

  assert.ok(all.fintech_ir, 'Missing fintech_ir preset');
  assert.ok(all.regulatory, 'Missing regulatory preset');
  assert.ok(all.tech_intel, 'Missing tech_intel preset');
  assert.ok(all.competitor, 'Missing competitor preset');
  assert.ok(all.macro, 'Missing macro preset');

  // Verify fintech_ir details
  const fintech = manager.get('fintech_ir');
  assert.ok(fintech.allowed_domains.includes('sec.gov'));
  assert.ok(fintech.allowed_domains.includes('businesswire.com'));
  assert.ok(fintech.query_suffix.includes('earnings'));
  assert.equal(fintech.preserve_tables, true);

  // Verify discovery summary
  const summary = manager.listSummary();
  assert.equal(summary.length >= 5, true);
  const ids = summary.map((s) => s.id);
  assert.ok(ids.includes('fintech_ir'));
  assert.ok(ids.includes('regulatory'));
});
