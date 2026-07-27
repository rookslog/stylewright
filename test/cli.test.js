import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-cli-'));

function capture() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join('') };
}

test('list prints both tiers', async () => {
  const out = capture();
  const code = await run(['list'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 0);
  assert.match(out.text(), /demo-standard/);
  assert.match(out.text(), /demo-craft/);
});

test('install with flags writes into the resolved target', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--tier', 'standards', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0);
  await fs.access(path.join(home, '.claude', 'skills', 'demo-standard', 'SKILL.md'));
});

test('install refuses to prompt without a TTY', async () => {
  const out = capture();
  const code = await run(['install'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW, interactive: false,
  });
  assert.notEqual(code, 0);
  assert.match(out.text(), /--platform/);
});

test('lint returns 1 and prints the finding', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'bad.md');
  await fs.writeFile(file, 'Do this; then that.\n');
  const out = capture();
  const code = await run(['lint', file], {
    home: '/h', cwd: dir, repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 1);
  assert.match(out.text(), /semicolon/);
});

test('ground --check --all fails on the craft fixture', async () => {
  const out = capture();
  const code = await run(['ground', '--check', '--all'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 1);
  assert.match(out.text(), /demo-craft/);
});

test('unknown command returns 2', async () => {
  const out = capture();
  const code = await run(['frobnicate'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2);
});
