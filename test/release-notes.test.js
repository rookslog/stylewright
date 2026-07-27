import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseNotes } from '../scripts/release-notes.mjs';
import { VERSION } from '../src/version.js';

const SAMPLE = `# Changelog

Prose that belongs to no version.

## Unreleased

## 1.2.0 — 2026-01-02

### Added

- A thing.

## 1.1.0

### Fixed

- Another thing.
`;

test('reads the section for a version with a date in its heading', () => {
  assert.equal(releaseNotes(SAMPLE, '1.2.0'), '### Added\n\n- A thing.');
});

test('reads the section for a version with a bare heading', () => {
  assert.equal(releaseNotes(SAMPLE, '1.1.0'), '### Fixed\n\n- Another thing.');
});

test('accepts a git tag with its leading v', () => {
  assert.equal(releaseNotes(SAMPLE, 'v1.2.0'), releaseNotes(SAMPLE, '1.2.0'));
});

test('a version prefix does not match a longer version', () => {
  // Without a boundary check, `1.1` would select the `1.1.0` section and the
  // release would carry notes for a version that nobody asked for.
  assert.throws(() => releaseNotes(SAMPLE, '1.1'), /no section for version 1\.1$/);
});

test('throws when the version is absent', () => {
  assert.throws(() => releaseNotes(SAMPLE, '9.9.9'), /no section for version 9\.9\.9/);
});

test('throws when the section is empty', () => {
  // `Unreleased` is empty here. An empty body must fail rather than ship a
  // release with no notes.
  assert.throws(() => releaseNotes(SAMPLE, 'Unreleased'), /is empty/);
});

// The release workflow runs this against the real file. A missing section would
// fail the release itself, so catch it here instead.
test('the real CHANGELOG has notes for the current version', async () => {
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(releaseNotes(changelog, VERSION).length > 0);
});
