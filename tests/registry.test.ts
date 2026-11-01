import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrySettings, selectedRegistry, normalizeRegistry, installationRegistry, mirrorRegistry, officialRegistry } from '../src/registry';

test('one default mirror is selected when settings are missing or corrupt', () => {
  for (const value of [null, [], 'broken', { mode: 'unknown' }, { mode: 'custom', customUrl: 'invalid' }]) {
    assert.equal(selectedRegistry(registrySettings(value)), mirrorRegistry);
  }
  assert.equal(selectedRegistry(registrySettings({ mode: 'official' })), officialRegistry);
});
test('custom registries support private HTTP servers and preserve path prefixes', () => {
  assert.equal(normalizeRegistry(' http://127.0.0.1:4873/npm '), 'http://127.0.0.1:4873/npm/');
  assert.equal(normalizeRegistry('https://npm.example.com/team/'), 'https://npm.example.com/team/');
  assert.equal(selectedRegistry(registrySettings({ mode: 'custom', customUrl: 'http://npm.lan:4873' })), 'http://npm.lan:4873/');
});
test('registry settings reject embedded secrets, non-HTTP URLs and URL parameters', () => {
  for (const url of ['https://user:token@example.com/', 'file:///tmp/npm', 'javascript:alert(1)', 'https://npm.example.com/?token=secret', 'https://npm.example.com/#secret', 'example.com', '']) {
    assert.throws(() => normalizeRegistry(url));
    assert.equal(registrySettings({ mode: 'custom', customUrl: url }).customUrl, '');
  }
});
test('explicit subscription registries take priority over public mirrors for private packages', () => {
  const settings = registrySettings(null);
  assert.equal(installationRegistry(settings), mirrorRegistry);
  assert.equal(installationRegistry(settings, 'https://private.example/team'), 'https://private.example/team/');
});
