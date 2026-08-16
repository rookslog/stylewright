import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NAME } from '../bench/arm-manifest.mjs';

/**
 * The runner itself, driven end to end over a stand-in `claude`.
 *
 * Everything else that touches an arm builds one by writing the FILES an arm
 * holds — `test/bench-helpers.js` does exactly that, and so the runner that
 * produces them had no exercise anywhere. The first real review arm on issue
 * #109 then printed `no matches found` on its first line of work, from a
 * resume check asking a glob about a fresh directory zsh answers NOMATCH for.
 * That arm was healthy and finished every sample hours later. Nobody could say
 * so at the time, which is what the hole actually cost: with the runner
 * unexercised, a slow run and a dead one produce the same evidence, and the
 * benign reading is the one that goes unconsidered.
 *
 * The stand-in echoes one fixed JSON run, so this costs no model call. It is
 * the same trick `bench/review-arms.mjs` gets from an injected `git`.
 *
 * A host with zsh runs this and a host without one skips it, which is the
 * disposition `bench/README.md` already gives every command in that directory.
 * zsh is asked for by name through `PATH` rather than at `/bin/zsh`, because
 * that path is macOS's and Linux keeps it elsewhere — testing the wrong one
 * skips the whole file on a host that could have run it.
 */

const REPO = path.dirname(import.meta.dirname);
const RUN = path.join(REPO, 'bench', 'run.sh');

const STANDIN = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.220 (Claude Code)"; exit 0; fi
cat <<'JSON'
{"is_error":false,"result":"A stand-in answer.","modelUsage":{"m-1":{"outputTokens":11}}}
JSON
`;

const hasZsh = await new Promise((resolve) => {
  execFile('zsh', ['-c', ':'], (err) => resolve(!err));
});

function runArm(args, binDir) {
  return new Promise((resolve) => {
    execFile('zsh', [RUN, ...args], {
      cwd: REPO, env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr }));
  });
}

/**
 * The arm name comes from the temporary directory, because the arm directory
 * does not.
 *
 * `run.sh` writes under its own `bench/out/`, and that is the operator's tree
 * where real samples live. A name written here as a literal is a name this
 * test would resume if anything already stood at it, and then delete on the
 * way out — two processes sharing one checkout is enough to produce it. The
 * name `mkdtemp` gives is unique to this run and is already a name
 * `arm-manifest.mjs` accepts.
 */
async function scaffold(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-run-'));
  const arm = path.basename(root);
  assert.ok(NAME.test(arm), `${arm} must be a name the arm manifest accepts`);
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
  return { arm, armDir, binDir, prompts };
}

test('a fresh arm directory runs clean, and writes a sample, a sidecar and a manifest',
  { skip: hasZsh ? false : 'zsh is not installed, and bench/run.sh is zsh' }, async (t) => {
    const { arm, armDir, binDir, prompts } = await scaffold(t);
    const run = await runArm([arm, '--prompts', prompts, '--reps', '2'], binDir);
    assert.equal(run.code, 0, run.stderr);
    // The line this test exists for. The run carried on correctly under it,
    // which is why a passing check has to be silent: the operator has nothing
    // but the output to tell a working arm from a stopped one.
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
    const { arm, binDir, prompts } = await scaffold(t);
    assert.equal((await runArm([arm, '--prompts', prompts, '--reps', '2'], binDir)).code, 0);
    const again = await runArm(
      [arm, '--prompts', prompts, '--reps', '2', '--system', 'bench/review-contract.md'], binDir);
    assert.equal(again.code, 2);
    assert.match(again.stderr, /Use a new arm name/);
  });
