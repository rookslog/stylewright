import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const repoRoot = path.dirname(import.meta.dirname);

// The published artifact is not the checkout. CI runs every other test
// against the checkout, so a file the tarball omits fails only on a user's
// machine. This suite packs the artifact, extracts it, and runs every
// command the help text advertises, in its flag-driven shape, against the
// extracted copy. It does not install the tarball's dependencies, so a
// wrong dependency manifest passes here, and the interactive dialogue is
// never reached. It also needs `npm` and `tar` on PATH, which every runner
// in the CI matrix has.

// `npm` is `npm.cmd` on Windows, and Node refuses to spawn a `.cmd` without a
// shell. A shell splits the command line on spaces, and `execFile` quotes
// nothing once `shell` is set, so the arguments carry their own quotes there.
const onWindows = process.platform === 'win32';
const npm = (args, options) => run(
  onWindows ? 'npm.cmd' : 'npm',
  onWindows ? args.map((a) => `"${a}"`) : args,
  { ...options, shell: onWindows },
);

test('the packed artifact serves every advertised command', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stylewright-pack-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, 'home');
  const project = path.join(tmp, 'project');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(project, { recursive: true });

  const { stdout: packOut } = await npm(['pack', '--pack-destination', tmp], {
    cwd: repoRoot,
  });
  const tarball = path.join(tmp, packOut.trim().split('\n').pop());
  await run('tar', ['-xzf', tarball, '-C', tmp]);
  const pkgRoot = path.join(tmp, 'package');
  const bin = path.join(pkgRoot, 'bin', 'stylewright.mjs');

  // The dialogue is the single dependency consumer, and it loads only in
  // interactive mode, so the extracted package runs without an install.
  function cli(args, cwd = project) {
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        [bin, ...args],
        { cwd, env: { ...process.env, HOME: home, USERPROFILE: home } },
        (err, stdout, stderr) => {
          resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr });
        },
      );
    });
  }

  await t.test('list names every skill', async () => {
    const r = await cli(['list']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    for (const name of ['simplified-technical-english', 'plain-language', 'compressed-deliberation']) {
      assert.match(r.stdout, new RegExp(name));
    }
  });

  await t.test('lint reads a file the package ships', async () => {
    const r = await cli(['lint', 'README.md'], pkgRoot);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Lint clean\./);
  });

  await t.test('ground --check --all has matrices to read', async () => {
    const r = await cli(['ground', '--check', '--all']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Grounding clean\./);
  });

  await t.test('install writes a project tree', async () => {
    const r = await cli(['install', '--tier', 'all', '--platform', 'claude', '--scope', 'project']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const installed = path.join(project, '.claude', 'skills', 'plain-language', 'SKILL.md');
    await fs.access(installed);
    // The package ships `grounding/` at its root. Install copies skill
    // directories only, so no matrix may reach the installed tree.
    const names = await fs.readdir(path.join(project, '.claude', 'skills'));
    assert.ok(!names.includes('grounding'), `installed tree holds: ${names.join(', ')}`);
  });

  await t.test('doctor finds nothing wrong with that tree', async () => {
    const r = await cli(['doctor']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No problems found\./);
  });

  await t.test('update covers the same tree', async () => {
    const r = await cli(['update', '--platform', 'claude', '--scope', 'project']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    // "Nothing to update" also exits zero, so the assertion needs the name.
    assert.match(r.stdout, /updated plain-language/);
  });

  await t.test('uninstall removes what it names', async () => {
    const r = await cli(['uninstall', '--skill', 'plain-language', '--platform', 'claude', '--scope', 'project']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    await assert.rejects(fs.access(path.join(project, '.claude', 'skills', 'plain-language')));
  });

  await t.test('new-skill scaffolds inside the package root', async () => {
    const r = await cli(['new-skill', 'packed-demo', '--tier', 'craft'], pkgRoot);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    await fs.access(path.join(pkgRoot, 'skills', 'craft', 'packed-demo', 'SKILL.md'));
    await fs.access(path.join(pkgRoot, 'grounding', 'craft', 'packed-demo.md'));
  });
});
