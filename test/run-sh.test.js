import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * The runner itself, driven end to end over a stand-in `claude`.
 *
 * Everything else that touches an arm builds one by writing the FILES an arm
 * holds — `test/bench-helpers.js` does exactly that, and so the runner that
 * produces them had no exercise anywhere. The first real review arm then hit a
 * failure on its first line of work that no smoke run could have seen: a fresh
 * arm directory matches no sidecar, and the resume check asked the question
 * with a glob whose NOMATCH zsh reports. Building the output skips the runner,
 * so the smoke path and the real path diverged on the one step only the runner
 * takes.
 *
 * The stand-in echoes one fixed JSON run, so this costs no model call. It is
 * the same trick `bench/review-arms.mjs` gets from an injected `git`.
 *
 * The runner writes under `bench/out/`, which is where it always writes, so
 * these arms are named for this test and removed after it. CI does not run
 * this: `bench/run.sh` needs zsh, and a host without it skips rather than
 * fails, which `bench/README.md` already states for every command in that
 * directory.
 */

const REPO = path.dirname(import.meta.dirname);
const RUN = path.join(REPO, 'bench', 'run.sh');

const STANDIN = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.220 (Claude Code)"; exit 0; fi
cat <<'JSON'
{"is_error":false,"result":"A stand-in answer.","modelUsage":{"m-1":{"outputTokens":11}}}
JSON
`;

const hasZsh = await fs.stat('/bin/zsh').then(() => true, () => false);

function runArm(args, binDir) {
  return new Promise((resolve) => {
    execFile('/bin/zsh', [RUN, ...args], {
      cwd: REPO, env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr }));
  });
}

async function scaffold(t, arm) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-run-'));
  const armDir = path.join(REPO, 'bench', 'out', arm);
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(armDir, { recursive: true, force: true }),
  ]));
  const binDir = path.join(root, 'bin');
  const prompts = path.join(root, 'prompts');
  await fs.mkdir(binDir);
  await fs.mkdir(prompts);
  await fs.writeFile(path.join(binDir, 'claude'), STANDIN, { mode: 0o755 });
  await fs.writeFile(path.join(prompts, 'pr-1-r1.txt'), 'Say something.\n');
  return { armDir, binDir, prompts };
}

test('a fresh arm directory runs clean, and writes a sample, a sidecar and a manifest',
  { skip: hasZsh ? false : 'zsh is not installed, and bench/run.sh is zsh' }, async (t) => {
    const arm = 'test-fresh-arm';
    const { armDir, binDir, prompts } = await scaffold(t, arm);
    const run = await runArm([arm, '--prompts', prompts, '--reps', '2'], binDir);
    assert.equal(run.code, 0, run.stderr);
    // The failure this test exists for. It printed here and the run carried on,
    // so the arm read as broken to the person watching it.
    assert.ok(!run.stderr.includes('no matches found'), run.stderr);
    const held = (await fs.readdir(armDir)).sort();
    assert.deepEqual(held, [
      'arm-manifest.json',
      'pr-1-r1-1.txt', 'pr-1-r1-1.txt.meta',
      'pr-1-r1-2.txt', 'pr-1-r1-2.txt.meta',
    ]);
  });

test('an arm resumed under a changed configuration is still refused',
  { skip: hasZsh ? false : 'zsh is not installed, and bench/run.sh is zsh' }, async (t) => {
    // The refusal the glob was asking for. A fresh directory must not reach it,
    // and a collected one must, or an arm silently holds two conditions.
    const arm = 'test-resume-arm';
    const { binDir, prompts } = await scaffold(t, arm);
    assert.equal((await runArm([arm, '--prompts', prompts, '--reps', '2'], binDir)).code, 0);
    const again = await runArm(
      [arm, '--prompts', prompts, '--reps', '2', '--system', 'bench/review-contract.md'], binDir);
    assert.equal(again.code, 2);
    assert.match(again.stderr, /Use a new arm name/);
  });
