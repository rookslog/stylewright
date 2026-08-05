import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';
import crypto from 'node:crypto';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
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
      // the real promptTargets. The shape contract between the two lives in
      // `the command layer installs what the dialogue returns`, in
      // test/prompt.test.js, which runs both sides for real.
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

test('update clears what an interrupted first install left, and says it changed', async () => {
  // A first install killed after a copy leaves a manifest with a statement and
  // no installed skill. `findInstalls` dropped that target on the skill count,
  // so update reported that nothing was installed and left the files — while
  // the README named update as one of the three commands that clear them.
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  const { writeManifest, emptyManifest } = await import('../src/manifest.js');
  const orphan = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(
    target,
    { ...emptyManifest(), pending: { 'demo-craft': { 'SKILL.md': sha256('half a copy\n') } } },
    null);

  const out = capture();
  const code = await run(['update'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });

  // Zero, because the command changed the tree. Counting only the skills it
  // wrote told a script that a cleanup which deleted files had failed.
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /cleared the unfinished install of demo-craft/);
  assert.match(out.text(), /removed demo-craft\/SKILL\.md/);
  await assert.rejects(fs.access(path.join(target, 'demo-craft')));
});

test('a cleanup that removed no file is still a change', async () => {
  // A run killed between its statement and its first copy leaves nothing on
  // disk. Withdrawing the statement is still a change, and a command that
  // reported otherwise told a script the cleanup had failed.
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  const { writeManifest, emptyManifest } = await import('../src/manifest.js');
  await writeManifest(
    target,
    { ...emptyManifest(), pending: { 'demo-craft': { 'SKILL.md': sha256('never written\n') } } },
    null);

  const out = capture();
  const code = await run(['update'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /cleared the unfinished install of demo-craft/);
  assert.equal((await (await import('../src/manifest.js')).readManifest(target)).pending, undefined);
});

test('install reports a cleanup that wrote no skill as a change', async () => {
  // The skill is refused for a file the user wrote, so nothing is installed.
  // The cleanup still deleted files, and a command that deleted files must not
  // tell a script that nothing happened.
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  const { writeManifest, emptyManifest } = await import('../src/manifest.js');
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');
  const orphan = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(
    target,
    { ...emptyManifest(), pending: { 'demo-standard': { 'SKILL.md': sha256('half a copy\n') } } },
    null);

  const out = capture();
  const code = await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /cleared the unfinished install of demo-standard/);
  assert.match(out.text(), /removed demo-standard\/SKILL\.md/);
  assert.match(out.text(), /skipped demo-craft/);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n');
});

test('uninstall reports a cleanup that removed no skill as a change', async () => {
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  const { writeManifest, emptyManifest } = await import('../src/manifest.js');
  const orphan = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(
    target,
    { ...emptyManifest(), pending: { 'demo-craft': { 'SKILL.md': sha256('half a copy\n') } } },
    null);

  const out = capture();
  const code = await run(['uninstall', '--all', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /cleared the unfinished install of demo-craft/);
  assert.match(out.text(), /removed demo-craft\/SKILL\.md/);
  await assert.rejects(fs.access(path.join(target, 'demo-craft')));
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
  // Non-zero, and this assertion was 0 until round 8. `install` and `uninstall`
  // already refused to report success for an operation that changed nothing,
  // and `update` was the third consumer of that rule without it. A scripted
  // update that refreshed no file said the refresh had happened.
  assert.notEqual(code, 0, out.text());
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
  const { readManifestWithIdentity, writeManifest } = await import('../src/manifest.js');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills.withdrawn = m.skills['demo-craft'];
  delete m.skills['demo-craft'];
  await writeManifest(target, m, identity);
  await fs.rename(path.join(target, 'demo-craft'), path.join(target, 'withdrawn'));

  const out = capture();
  const code = await run(['uninstall', '--skill', 'withdrawn', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /removed withdrawn/);
});

/** A clone carrying the same skill name in both tiers. */
async function collidingRepo() {
  const repo = await tmp();
  for (const tier of ['standards', 'craft']) {
    const dir = path.join(repo, 'skills', tier, 'twinned');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: twinned\ndescription: The ${tier} one.\n---\n\n# twinned\n`);
  }
  return repo;
}

test('a collision in the clone does not stop a removal, and is still said', async () => {
  // uninstall answers what is installed HERE, and the manifest is the only
  // thing that knows. A repository the user cannot fix, or is not looking at,
  // must not strand a skill on their machine.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const out = capture();
  const code = await run(['uninstall', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: await collidingRepo(), stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /removed demo-craft/);
  // Said out loud, because the clone still needs fixing.
  assert.match(out.text(), /twinned/);
  await assert.rejects(fs.access(path.join(home, '.claude', 'skills', 'demo-craft')));
});

test('a collision still stops an install', async () => {
  const home = await tmp();
  const repo = await collidingRepo();
  await assert.rejects(
    () => run(['install', '--skill', 'twinned', '--platform', 'claude'],
      { home, cwd: '/c', repoRoot: repo, stdout: capture(), now: NOW }),
    /twinned/);
});

test('install says what it cleared from an interrupted run', async () => {
  // A command that deletes files says which ones. Clearing them silently is the
  // same defect as leaving them: the user cannot audit what the tool did.
  const home = await tmp();
  const target = path.join(home, '.claude', 'skills');
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const { readManifestWithIdentity, writeManifest } = await import('../src/manifest.js');
  const orphan = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  const { manifest, identity } = await readManifestWithIdentity(target);
  await writeManifest(target, {
    ...manifest, pending: { 'demo-standard': { 'SKILL.md': sha256('half a copy\n') } },
  }, identity);

  const out = capture();
  const code = await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /cleared the unfinished install of demo-standard/);
  assert.match(out.text(), /removed demo-standard\/SKILL\.md/);
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
  const { readManifestWithIdentity, writeManifest } = await import('../src/manifest.js');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills.withdrawn = m.skills['demo-craft'];
  delete m.skills['demo-craft'];
  await writeManifest(target, m, identity);

  const out = capture();
  const code = await run(['update', '--skill', 'withdrawn'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  // The name is ACCEPTED — that is what this test is for, and the message
  // proves it. The exit code is non-zero because nothing was refreshed, which
  // is a different question from whether the name was valid. Round 8 made
  // `update` carry the rule install and uninstall already had.
  assert.notEqual(code, 0, out.text());
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

test('update names a skill that is installed nowhere it looked', async () => {
  // The name passes validation, because the catalogue ships it. It then matched
  // no install, was filtered to nothing, and still pushed a result, so the
  // "Nothing to update" branch was skipped and a scripted update printed
  // nothing and exited zero having done nothing.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const out = capture();
  const code = await run(['update', '--skill', 'demo-standard'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /demo-standard/);
});

test('doctor sees the cross-agent directory as part of each agent that reads it', async () => {
  // ~/.agents/skills is a convention shared between agents, not an agent of its
  // own. Grouping by platform key gave it a group to itself, so a skill in both
  // ~/.agents/skills and ~/.codex/skills drew no finding, though codex loads
  // both at once.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'codex,agents'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const out = capture();
  const code = await run(['doctor'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 1, out.text());
  assert.match(out.text(), /demo-craft/);
  assert.match(out.text(), /\.agents/);
});

test('the README install example still draws no finding', async () => {
  // The regression guard for the fix above. --platform claude,codex writes two
  // directories on purpose, and no single agent reads both.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude,codex'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const out = capture();
  const code = await run(['doctor'], { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
});

test('ground --check refuses a skill name it does not know', async () => {
  // The name yielded undefined, coalesced to an empty finding list, added
  // nothing, and printed "Grounding clean." `ground --check` is a CI gate, so a
  // typo or a renamed skill turned the gate into a no-op that reported pass.
  const out = capture();
  const code = await run(['ground', '--check', '--skill', 'totally-not-a-skill'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /totally-not-a-skill/);
  assert.doesNotMatch(out.text(), /Grounding clean/);
});

test('uninstall that removes nothing does not report success', async () => {
  // update exited 2 for the same skill on the same machine. One rule, two
  // commands, opposite answers.
  const home = await tmp();
  const out = capture();
  const code = await run(['uninstall', '--skill', 'demo-craft', '--platform', 'claude'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.notEqual(code, 0, out.text());
  assert.match(out.text(), /not installed/);
});

test('uninstall advises --force only where --force is the answer', async () => {
  // Advice that cannot be taken is worse than none: it sent the user through
  // the same command a second time with nothing left to try. An edited file is
  // force-able and says so. A directory holding unrecorded files is refused
  // whether or not force is passed, and now says only that.
  const home = await tmp();
  const opts = { home, cwd: '/c', repoRoot: REPO, now: NOW };
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { ...opts, stdout: capture() });
  const installed = path.join(home, '.claude', 'skills', 'demo-craft');

  await fs.writeFile(path.join(installed, 'SKILL.md'), 'edited\n');
  const edited = capture();
  await run(['uninstall', '--skill', 'demo-craft', '--platform', 'claude'],
    { ...opts, stdout: edited });
  assert.match(edited.text(), /locally-modified/);
  assert.match(edited.text(), /--force/);

  await fs.rm(path.join(installed, 'LICENSE'));
  await fs.mkdir(path.join(installed, 'LICENSE'));
  await fs.writeFile(path.join(installed, 'LICENSE', 'notes.md'), 'mine\n');
  const stuck = capture();
  await run(['uninstall', '--skill', 'demo-craft', '--platform', 'claude', '--force'],
    { ...opts, stdout: stuck });
  assert.match(stuck.text(), /not-ours/);
  assert.doesNotMatch(stuck.text(), /--force/, stuck.text());
});

test('install that refused every skill does not report success', async () => {
  // A scripted install that installed nothing was indistinguishable from one
  // that installed everything.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  await fs.writeFile(
    path.join(home, '.claude', 'skills', 'demo-craft', 'SKILL.md'), 'edited\n');

  const out = capture();
  const code = await run(['install', '--skill', 'demo-craft', '--platform', 'claude'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.notEqual(code, 0, out.text());
  assert.match(out.text(), /skipped demo-craft/);
});

test('update reports what it changed before it reports what it could not find', async () => {
  // The unmatched branch returned before the results loop, so naming one
  // installed skill and one uninstalled one rewrote files and then said only
  // that the second was missing. Exit 2 covered updated, refused, and
  // not-found at once.
  const home = await tmp();
  await run(['install', '--skill', 'demo-craft', '--platform', 'claude'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  await fs.rm(path.join(home, '.claude', 'skills', 'demo-craft', 'references', 'guide.md'));

  const out = capture();
  const code = await run(['update', '--skill', 'demo-craft', '--skill', 'demo-standard'], {
    home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW,
  });
  assert.equal(code, 2, out.text());
  assert.match(out.text(), /updated demo-craft/, 'must say what it did');
  assert.match(out.text(), /demo-standard/, 'and what it could not find');
});

test('the same scope named twice is one scope', async () => {
  // The guard counted occurrences rather than distinct scopes.
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--skill', 'demo-craft', '--platform', 'claude', '--scope', 'user', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0, out.text());
});

// `install` and `uninstall` shared one selection block, so an omitted
// selection meant "everything" for both. For install that is a file you can
// delete. For uninstall it was the whole catalogue, with nothing on the command
// line saying so.

const at = (home) => path.join(home, '.claude', 'skills');

test('uninstall with no selection removes nothing and says what to pass', async () => {
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const before = await fs.readdir(at(home));

  const out = capture();
  const code = await run(['uninstall', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /needs to know what to remove/);
  assert.deepEqual(await fs.readdir(at(home)), before);
});

test('uninstall --all removes everything, because it was typed', async () => {
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const code = await run(['uninstall', '--all', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  assert.equal(code, 0);
  await assert.rejects(fs.readdir(at(home)));
});

test('uninstall --tier removes one tier and leaves the other', async () => {
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const code = await run(
    ['uninstall', '--tier', 'craft', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  assert.equal(code, 0);
  assert.deepEqual((await fs.readdir(at(home))).sort(),
    ['.stylewright-manifest.json', 'demo-standard']);
});

test('uninstall --tier removes a withdrawn skill the manifest still records', async () => {
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  // Rename the installed craft skill to one this repository no longer ships,
  // as a withdrawal would leave it.
  const skills = at(home);
  const mf = path.join(skills, '.stylewright-manifest.json');
  const m = JSON.parse(await fs.readFile(mf, 'utf8'));
  m.skills.gone = m.skills['demo-craft'];
  delete m.skills['demo-craft'];
  await fs.writeFile(mf, JSON.stringify(m, null, 2));
  await fs.rename(path.join(skills, 'demo-craft'), path.join(skills, 'gone'));

  const code = await run(
    ['uninstall', '--tier', 'craft', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  assert.equal(code, 0);
  assert.deepEqual((await fs.readdir(skills)).sort(),
    ['.stylewright-manifest.json', 'demo-standard']);
});

test('a tier uninstall reads each target manifest, not one shared list', async () => {
  const home = await tmp();
  await run(['install', '--platform', 'claude,codex', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  // Record the same withdrawn name under two tiers: craft under claude, and
  // standards under codex. Only the claude copy is in the selected tier.
  const withdraw = async (dir, from) => {
    const mf = path.join(dir, '.stylewright-manifest.json');
    const m = JSON.parse(await fs.readFile(mf, 'utf8'));
    m.skills.gone = m.skills[from];
    delete m.skills[from];
    await fs.writeFile(mf, JSON.stringify(m, null, 2));
    await fs.rename(path.join(dir, from), path.join(dir, 'gone'));
  };
  const claude = path.join(home, '.claude', 'skills');
  const codex = path.join(home, '.codex', 'skills');
  await withdraw(claude, 'demo-craft');
  await withdraw(codex, 'demo-standard');

  const code = await run(
    ['uninstall', '--tier', 'craft', '--platform', 'claude,codex', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  assert.equal(code, 0);
  assert.deepEqual((await fs.readdir(claude)).sort(),
    ['.stylewright-manifest.json', 'demo-standard']);
  // The codex manifest records `gone` as standards, so --tier craft removed the
  // craft skill there and left it. One shared list took it from claude's tier.
  assert.deepEqual((await fs.readdir(codex)).sort(),
    ['.stylewright-manifest.json', 'gone']);
});

test('a tier uninstall places a skill by the manifest, not by the catalogue', async () => {
  // The catalogue says which tier this repository ships a skill in now. The
  // manifest says which tier it was installed under. A skill that moved tiers
  // is one name with two answers, and the removal takes the target's own.
  const home = await tmp();
  await run(['install', '--platform', 'claude,codex', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });

  const codex = path.join(home, '.codex', 'skills');
  const mf = path.join(codex, '.stylewright-manifest.json');
  const m = JSON.parse(await fs.readFile(mf, 'utf8'));
  m.skills['demo-craft'].tier = 'standards';
  await fs.writeFile(mf, JSON.stringify(m, null, 2));

  const code = await run(
    ['uninstall', '--tier', 'craft', '--platform', 'claude,codex', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  assert.equal(code, 0);
  assert.deepEqual((await fs.readdir(path.join(home, '.claude', 'skills'))).sort(),
    ['.stylewright-manifest.json', 'demo-standard']);
  assert.deepEqual((await fs.readdir(codex)).sort(),
    ['.stylewright-manifest.json', 'demo-craft', 'demo-standard']);
});

test('uninstall --tier all is not a way to remove everything', async () => {
  // `all` is a tier to install and is not one to remove. The usage says
  // `standards|craft` and reserves the whole target for --all, and the tier
  // value went unchecked, so this deleted everything anyway.
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const before = (await fs.readdir(at(home))).sort();

  const out = capture();
  const code = await run(
    ['uninstall', '--tier', 'all', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /--tier standards\|craft, not "all"/);
  assert.match(out.text(), /Use --all/);
  assert.deepEqual((await fs.readdir(at(home))).sort(), before);
});

test('a word that is not a flag is a typing mistake, not a selection', async () => {
  // `uninstall --all demo-craft` named one skill and removed every one. The
  // schema declared the flags a command reads and not the arguments, so the
  // word reached no consumer and no check.
  const home = await tmp();
  await run(['install', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW });
  const before = (await fs.readdir(at(home))).sort();

  const out = capture();
  const code = await run(
    ['uninstall', '--all', 'demo-craft', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /uninstall takes no arguments, and got "demo-craft"/);
  assert.deepEqual((await fs.readdir(at(home))).sort(), before);
});

test('a bare uninstall in a terminal never runs the install dialogue', async () => {
  const out = capture();
  const code = await run(['uninstall'], {
    home: '/h',
    cwd: '/c',
    repoRoot: REPO,
    stdout: out,
    now: NOW,
    interactive: true,
    promptTargets: async () => { throw new Error('the install dialogue must not run here'); },
  });
  assert.equal(code, 2);
  assert.match(out.text(), /needs to know what to remove/);
});

test('a command name from the prototype chain is not a command', async () => {
  // A plain object lookup found Object.prototype.constructor, and `.has` on a
  // function threw a type error at what is only a typing mistake.
  const out = capture();
  const code = await run(['constructor', '--force'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /stylewright/);
});

test('a single-value flag given twice is an error', async () => {
  const out = capture();
  const code = await run(
    ['uninstall', '--tier', 'craft', '--tier', 'standards', '--platform', 'claude'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /--tier was given more than once/);
});

test('uninstall takes one selection, not several', async () => {
  const out = capture();
  const code = await run(
    ['uninstall', '--all', '--tier', 'craft', '--platform', 'claude', '--scope', 'user'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
  assert.match(out.text(), /takes one of --tier, --all/);
});

test('the install usage offers the selectors the grammar accepts', async () => {
  // The selector check covers install too, so a usage line that showed --tier
  // and --skill as independent optionals advertised a rejected command.
  const out = capture();
  await run(['help'], { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  const line = out.text().split('\n').find((l) => l.trim().startsWith('install'));
  assert.match(line, /\[--tier standards\|craft\|all \| --skill <name>\.\.\.\]/);

  const said = capture();
  const code = await run(
    ['install', '--tier', 'craft', '--skill', 'demo-standard', '--platform', 'claude'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: said, now: NOW });
  assert.equal(code, 2);
  assert.match(said.text(), /install takes one of --skill, --tier, not several/);
});

test('a command rejects a flag it does not read', async () => {
  const out = capture();
  assert.equal(await run(['list', '--force'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW }), 2);
  assert.match(out.text(), /list does not take --force/);

  const said = capture();
  assert.equal(await run(['update', '--all'],
    { home: '/h', cwd: '/c', repoRoot: REPO, stdout: said, now: NOW }), 2);
  assert.match(said.text(), /update does not take --all/);
});
