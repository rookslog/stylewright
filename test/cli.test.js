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

test('bare install runs the guided dialogue and honours its selection', async () => {
  const home = await tmp();
  const out = capture();
  let sawCatalog = null;
  const code = await run(['install'], {
    home,
    cwd: '/c',
    repoRoot: REPO,
    stdout: out,
    now: NOW,
    interactive: true,
    promptTargets: async ({ catalog }) => {
      sawCatalog = catalog.map((s) => s.name);
      // Pick ONE skill out of two, to prove the picker drives the install.
      return { platform: 'claude', scope: 'user', skill: ['demo-craft'] };
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(sawCatalog, ['demo-craft', 'demo-standard']);
  const dir = path.join(home, '.claude', 'skills');
  await fs.access(path.join(dir, 'demo-craft', 'SKILL.md'));
  await assert.rejects(() => fs.access(path.join(dir, 'demo-standard')));
});

test('cancelling the dialogue writes nothing', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(['install'], {
    home,
    cwd: '/c',
    repoRoot: REPO,
    stdout: out,
    now: NOW,
    interactive: true,
    promptTargets: async () => null,
  });
  assert.equal(code, 0);
  assert.match(out.text(), /Cancelled/);
  await assert.rejects(() => fs.access(path.join(home, '.claude')));
});

test('any selecting flag opts out of the dialogue', async () => {
  const home = await tmp();
  const out = capture();
  let prompted = false;
  const code = await run(['install', '--skill', 'demo-craft', '--platform', 'claude'], {
    home,
    cwd: '/c',
    repoRoot: REPO,
    stdout: out,
    now: NOW,
    interactive: true,
    promptTargets: async () => {
      prompted = true;
      return null;
    },
  });
  assert.equal(code, 0);
  assert.equal(prompted, false, 'flags must not trigger the dialogue');
  await fs.access(path.join(home, '.claude', 'skills', 'demo-craft', 'SKILL.md'));
});

test('reports an unknown skill name instead of throwing', async () => {
  const out = capture();
  const code = await run(['install', '--skill', 'nope', '--platform', 'claude'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2);
  assert.match(out.text(), /Unknown skill: nope/);
  assert.match(out.text(), /demo-craft/);
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
