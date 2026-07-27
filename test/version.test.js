import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../src/version.js';

test('VERSION is a semver string', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('VERSION matches package.json', async () => {
  const pkg = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});
