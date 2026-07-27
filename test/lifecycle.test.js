// Every defect in the v0.2.0 correctness milestone was the same shape: the
// README documented behaviour that nobody had run. `update` was in the commands
// table and had no branch in the dispatcher. `doctor` failed on the README's own
// install example. `uninstall` left a file behind that the README said it
// removed.
//
// These tests walk the documented surface instead of testing one function. They
// are here to make that class of defect impossible, not to cover a single bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';
import { MANIFEST_NAME } from '../src/manifest.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const ROOT = path.join(import.meta.dirname, '..');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-life-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

function capture() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join('') };
}

// Reads the first column of the README's Commands table.
async function documentedCommands() {
  const text = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Commands');
  assert.notEqual(start, -1, 'README must have a Commands section');
  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const cell = line.match(/^\|\s*`([a-z-]+)`\s*\|/);
    if (cell) names.push(cell[1]);
  }
  assert.ok(names.length >= 8, `expected the full table, parsed ${names.join(', ')}`);
  return names;
}

test('every command in the README table is dispatched', async () => {
  // `update` sat in this table from the first release and fell through to
  // "Unknown command". A table nobody reads back is a promise nobody keeps.
  for (const name of await documentedCommands()) {
    const out = capture();
    const code = await run([name], {
      home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW, interactive: false,
    });
    assert.doesNotMatch(out.text(), /Unknown command/,
      `README documents "${name}" and the dispatcher does not know it`);
    assert.notEqual(code, undefined);
  }
});

test('every command in the README table appears in the usage text', async () => {
  const out = capture();
  await run(['help'], { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  const usage = out.text();
  for (const name of await documentedCommands()) {
    assert.match(usage, new RegExp(`\\b${name}\\b`),
      `"${name}" is in the README table and not in --help`);
  }
});

test('the README install example leaves a machine that doctor calls clean', async () => {
  // The documented multi-agent install must not produce a finding. Reported as
  // a duplicate before issue #14.
  const home = await tmp();
  const cwd = await tmp();
  const ctx = { home, cwd, repoRoot: REPO, stdout: capture(), now: NOW };

  assert.equal(await run(['install', '--platform', 'claude,codex', '--tier', 'all'], ctx), 0);

  const out = capture();
  const code = await run(['doctor'], { ...ctx, stdout: out });
  assert.equal(code, 0, `doctor reported: ${out.text()}`);
  assert.match(out.text(), /No problems found/);
});

test('install, update, uninstall leaves the tree as it was found', async () => {
  // The whole documented lifecycle, in order. Nothing the installer wrote may
  // survive the uninstall, including the manifest.
  const home = await tmp();
  const cwd = await tmp();
  const ctx = { home, cwd, repoRoot: REPO, stdout: capture(), now: NOW };

  assert.equal(await run(['install', '--platform', 'claude,codex', '--tier', 'all'], ctx), 0);
  assert.equal(await run(['update'], ctx), 0);

  const out = capture();
  assert.equal(await run(
    ['uninstall', '--skill', 'demo-standard,demo-craft', '--platform', 'claude,codex'],
    { ...ctx, stdout: out }), 0, out.text());

  for (const dir of ['.claude', '.codex']) {
    const skills = path.join(home, dir, 'skills');
    assert.ok(!(await exists(path.join(skills, MANIFEST_NAME))),
      `${dir} kept a manifest after a full uninstall`);
    assert.ok(!(await exists(skills)), `${dir} kept an empty skills directory`);
    // `.claude` and `.codex` stay. They belong to the agent, not to us. We
    // created them only because they were absent, and an agent keeps its own
    // settings there. Removing an agent's configuration root because our
    // skills are gone would reach well past what the installer wrote.
    assert.ok(await exists(path.join(home, dir)), `${dir} itself must survive`);
  }
});
