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
      // List-shaped, as parseFlags produces. This stub asserts nothing about
      // the real promptTargets, which needs a terminal to run at all. PR #22
      // makes it injectable, and the shape contract belongs in that test.
      return { platform: ['claude'], scope: ['user'], skill: ['demo-craft'] };
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

test('--skill accepts a comma-separated list, as --platform does', async () => {
  // The two flags took different shapes, and the error named the whole string
  // as one unknown skill while listing its parts as available. See issue #15.
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--skill', 'demo-standard,demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  await fs.access(path.join(home, '.claude', 'skills', 'demo-standard', 'SKILL.md'));
  await fs.access(path.join(home, '.claude', 'skills', 'demo-craft', 'SKILL.md'));
});

test('--skill still accepts the repeated form', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--skill', 'demo-standard', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  await fs.access(path.join(home, '.claude', 'skills', 'demo-craft', 'SKILL.md'));
});

test('an unknown skill is still rejected, and is named accurately', async () => {
  const out = capture();
  const code = await run(
    ['install', '--skill', 'demo-craft,nonesuch', '--platform', 'claude'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /Unknown skill: nonesuch\./);
});

test('update refreshes an installed skill', async () => {
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const skillFile = path.join(target, 'demo-craft', 'SKILL.md');
  const original = await fs.readFile(skillFile, 'utf8');
  await fs.writeFile(skillFile, 'stale\n');

  const out = capture();
  const code = await run(['update', '--force'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 0, out.text());
  assert.equal(await fs.readFile(skillFile, 'utf8'), original);
});

test('update needs no flags, and finds its targets from the manifests', async () => {
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude,codex'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const out = capture();
  const code = await run(['update'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /\.claude/);
  assert.match(out.text(), /\.codex/);
});

test('update refuses to overwrite an edited file without --force', async () => {
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const skillFile = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.writeFile(skillFile, 'my edit\n');

  const out = capture();
  const code = await run(['update'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.equal(await fs.readFile(skillFile, 'utf8'), 'my edit\n');
  assert.match(out.text(), /--force/);
});

test('update says so when nothing is installed', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(['update'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0);
  assert.match(out.text(), /[Nn]othing/);
});

test('update rejects a misspelled platform instead of reporting nothing found', async () => {
  // A blanket catch turned an invalid filter into an empty search, so a
  // scripted update exited 0 while doing nothing.
  const home = await tmp();
  const out = capture();
  const code = await run(['update', '--platform', 'cluade'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /cluade/);
});

test('update rejects a misspelled scope', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(['update', '--scope', 'globl'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
});

test('update still skips a platform that does not support the given scope', async () => {
  // agents supports user scope only. Asking for project scope across every
  // platform must not fail, because that combination is a normal gap rather
  // than a typing mistake.
  const home = await tmp();
  const out = capture();
  const code = await run(['update', '--scope', 'project'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 0, out.text());
});

test('uninstall accepts a skill this repository no longer ships', async () => {
  // update tells the user to uninstall an orphan. uninstall validated the name
  // against the catalog first and refused, so the advice could not be followed.
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  // Rename the recorded entry to a skill the catalog does not know.
  const { readManifest, writeManifest } = await import('../src/manifest.js');
  const m = await readManifest(target);
  m.skills.withdrawn = m.skills['demo-craft'];
  delete m.skills['demo-craft'];
  await writeManifest(target, m);
  await fs.rename(path.join(target, 'demo-craft'), path.join(target, 'withdrawn'));

  const out = capture();
  const code = await run(['uninstall', '--skill', 'withdrawn', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /removed withdrawn/);
});

test('an unknown skill is still rejected on install', async () => {
  const out = capture();
  const code = await run(['install', '--skill', 'nonesuch', '--platform', 'claude'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /Unknown skill: nonesuch/);
});

test('a --skill flag with no value is an error, not "select everything"', async () => {
  // splitList(undefined) returned an empty list, which the install path reads
  // as "no skill filter, take the whole tier". So a trailing --skill silently
  // installed the entire catalogue. Introduced by the comma-list fix.
  const home = await tmp();
  const out = capture();
  const code = await run(['install', '--platform', 'claude', '--skill'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /--skill/);
  assert.equal(await fs.readdir(home).then((d) => d.length), 0, 'nothing may be written');
});

test('any flag that takes a value rejects a missing one', async () => {
  const out = capture();
  const code = await run(['install', '--platform'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2);
  assert.match(out.text(), /--platform/);
});

test('update rejects a skill name that is neither shipped nor installed', async () => {
  // Round one validated --platform and --scope. --skill was the third consumer
  // of the same rule and was missed, so a misspelling filtered everything out
  // and exited zero looking successful.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const out = capture();
  const code = await run(['update', '--skill', 'demo-crafts'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /demo-crafts/);
});

test('update accepts a withdrawn skill name that a manifest records', async () => {
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const { readManifest, writeManifest } = await import('../src/manifest.js');
  const m = await readManifest(target);
  m.skills.withdrawn = m.skills['demo-craft'];
  delete m.skills['demo-craft'];
  await writeManifest(target, m);

  const out = capture();
  const code = await run(['update', '--skill', 'withdrawn'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /no longer in this repository: withdrawn/);
});

test('a list flag whose value names nothing is an error', async () => {
  // `--skill ,` split to an empty list, which install reads as "take the whole
  // tier". The missing-value check did not catch it, because a value WAS
  // present. Round three on the same rule, so the check now lives in
  // parseFlags and covers every flag that takes a value.
  for (const argv of [
    ['install', '--platform', 'claude', '--skill', ','],
    ['install', '--platform', ' , '],
    ['uninstall', '--platform', 'claude', '--skill', ','],
    ['update', '--skill', ','],
  ]) {
    const home = await tmp();
    const out = capture();
    const code = await run(argv, {
      home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
    });
    assert.equal(code, 2, `${argv.join(' ')}: ${out.text()}`);
    assert.equal(await fs.readdir(home).then((d) => d.length), 0, 'nothing may be written');
  }
});

test('update rejects a platform and scope the user named that cannot pair', async () => {
  // cowork has no project scope. Skipping the pair is right when findInstalls
  // enumerated it, and wrong when the user typed both sides: the command
  // reported nothing installed and exited zero on a request it never ran.
  const home = await tmp();
  const out = capture();
  const code = await run(['update', '--platform', 'cowork', '--scope', 'project'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /cowork/);
});

test('update still skips an unsupported pair it enumerated itself', async () => {
  // The other half of the same rule. --platform alone leaves scopes to the
  // defaults, and agents has no project scope, so the walk must pass over it.
  const home = await tmp();
  const out = capture();
  const code = await run(['update', '--platform', 'agents'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 0, out.text());
});

test('install refuses more than one scope rather than writing half the request', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--platform', 'claude', '--skill', 'demo-craft', '--scope', 'user,project'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2, out.text());
  assert.equal(await fs.readdir(home).then((d) => d.length), 0, 'nothing may be written');
});
