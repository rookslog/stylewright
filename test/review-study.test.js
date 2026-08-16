// A promoted review study, end to end.
//
// The review columns are only worth having if a study can retain what they
// scored against and a stranger can recompute them. `check:studies` re-runs the
// retained command over the promoted bytes, so the ground truth has to be
// inside the study — a `--review` naming the live corpus is refused by
// `commandProblems`, and if it were not, the re-run would reproduce a figure
// from bytes the study does not hold.
//
// These build a study the way an operator builds one, then break exactly one
// thing in it. `test/bench-helpers.js` does the same for a style study.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildManifest, collectFiles, writeArmManifest } from '../bench/arm-manifest.mjs';
import { digest } from '../bench/score.mjs';
import { checkStudy } from '../bench/study.mjs';
import { LICENSE, repoRoot, retain, run } from './bench-helpers.js';

const SCENARIO = 'pr-118-r1';
const REPS = 5;

/**
 * One review arm, its scenario file, and a corpus holding the record that
 * labels it. The corpus is a copy of a committed record, so the ground truth
 * these tests score against is the ground truth the repository ships.
 */
async function reviewArm(t, { arm = 'review-baseline', tokens = '400', reply = null } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-review-study-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const from = path.join(root, 'out');
  const out = path.join(root, 'samples');
  const prompts = path.join(root, 'prompts');
  const verdicts = path.join(root, 'verdicts');
  const dir = path.join(from, arm);
  for (const d of [dir, out, prompts, verdicts]) await fs.mkdir(d, { recursive: true });

  const promptText = 'Review this diff for defects.\n\ndiff --git a/x b/x\n+ a line\n';
  await fs.writeFile(path.join(prompts, `${SCENARIO}.txt`), promptText);
  await fs.copyFile(path.join(repoRoot, 'bench', 'verdicts', 'pr-118.json'),
    path.join(verdicts, 'pr-118.json'));

  const promptSha = digest(Buffer.from(promptText));
  for (let rep = 1; rep <= REPS; rep += 1) {
    const sample = `${SCENARIO}-${rep}.txt`;
    await fs.writeFile(path.join(dir, sample),
      reply ?? 'src/ground.js:1965 — high confirmed — the row is read from a broken table.\n');
    await fs.writeFile(path.join(dir, `${sample}.meta`), `${[
      `arm=${arm}`, `scenario=${SCENARIO}`, `rep=${rep}`, `reps=${REPS}`,
      'rules=', 'system=none', 'system_sha=none', 'user_rules_sha=none', 'user_rules=none',
      `prompt_sha=${promptSha}`, 'model_id=claude-demo-1', `output_tokens=${tokens}`,
      'cli=2.1.220', 'at=2026-08-16T00:00:00Z',
    ].join(' ')}\n`);
  }
  await writeArmManifest(dir, buildManifest({
    arm, scenarios: [SCENARIO], reps: REPS, at: '2026-08-16T00:00:00Z',
    files: await collectFiles(dir),
  }), from);
  return { root, from, out, prompts, verdicts, dir, arm };
}

const promote = (a, study, extra = []) => run(retain, [
  '--study', study, '--arm', a.arm, '--from', a.from, '--out', a.out,
  '--prompts', a.prompts, '--license-check', LICENSE, ...extra,
]);

test('a review study retains its ground truth and re-runs against it', async (t) => {
  const arm = await reviewArm(t);
  const study = '2026-08-16-review';
  const result = await promote(arm, study, ['--verdicts', arm.verdicts]);
  assert.equal(result.code, 0, result.stderr);

  const dir = path.join(arm.out, study);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'study.json'), 'utf8'));
  assert.deepEqual(manifest.verdicts.map((v) => v.path), ['verdicts/pr-118.json']);
  // The command names the PROMOTED copy, which is what makes the re-run read
  // the bytes this study holds.
  assert.match(manifest.analyses[0].command.join(' '),
    new RegExp(`--review [^ ]*${study}/verdicts`));

  // The check a stranger runs, over the promoted bytes, with the spawn it
  // implies. It re-runs the retained command and compares.
  const { problems, results } = await checkStudy(dir, study);
  assert.deepEqual(problems, [], problems.join('\n'));
  const perKtok = results[`${SCENARIO}.all.median.perKtok`];
  assert.ok(perKtok, `no perKtok figure derived: ${Object.keys(results).join(', ')}`);
  // ADR-0032's bound, measured on real ground truth rather than asserted. The
  // sample states ONE anchor, `src/ground.js:1965`. Three of pr-118's five
  // confirmed findings anchor in that file at 1965, 1966 and 1972, and all
  // three fall inside the ten-line window — so one stated line reaches three.
  // `confirmed` is a ceiling on agreement, `missed` is a floor on what was
  // dropped, and the two still sum to the ground truth.
  assert.equal(results[`${SCENARIO}.all.median.anchors`].value, '1');
  assert.equal(results[`${SCENARIO}.all.median.confirmed`].value, '3');
  assert.equal(results[`${SCENARIO}.all.median.missed`].value, '2');
  assert.equal(perKtok.value, '7.5'); // 3 findings over 400 output tokens.
});

test('an edited verdict record no longer matches the digest the study recorded', async (t) => {
  // Promoted evidence is tamper-evident rather than immutable, and the ground
  // truth is now part of what a study can be tampered with.
  const arm = await reviewArm(t);
  const study = '2026-08-16-tampered';
  assert.equal((await promote(arm, study, ['--verdicts', arm.verdicts])).code, 0);
  const dir = path.join(arm.out, study);
  const at = path.join(dir, 'verdicts', 'pr-118.json');
  const held = JSON.parse(await fs.readFile(at, 'utf8'));
  held.rounds[0].threads.pop();
  await fs.writeFile(at, `${JSON.stringify(held, null, 2)}\n`);
  const { problems } = await checkStudy(dir, study);
  assert.match(problems.join(' '), /verdicts\/pr-118\.json does not match its recorded digest/);
});

test('a study that retains no ground truth passes the review columns by not printing them', async (t) => {
  // A study promoted without `--verdicts` is an ordinary study. The key is
  // present and empty, so nothing can tell it from a study that dropped it.
  const arm = await reviewArm(t);
  const study = '2026-08-16-plain';
  assert.equal((await promote(arm, study)).code, 0);
  const dir = path.join(arm.out, study);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'study.json'), 'utf8'));
  assert.deepEqual(manifest.verdicts, []);
  assert.ok(!manifest.analyses[0].command.includes('--review'));
  const { problems, results } = await checkStudy(dir, study);
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(!Object.keys(results).some((id) => id.endsWith('.perKtok')));
});

test('a sidecar with no token count derives no rate, and the refusal is retained', async (t) => {
  const arm = await reviewArm(t, { tokens: '' });
  const study = '2026-08-16-no-tokens';
  // The promotion succeeds, because a study whose scorer would not score it is
  // a failed attempt and the design keeps those rather than letting them
  // disappear. What it does not do is derive a figure.
  assert.equal((await promote(arm, study, ['--verdicts', arm.verdicts])).code, 0);
  const dir = path.join(arm.out, study);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'study.json'), 'utf8'));
  assert.match(manifest.analyses[0].stderr, /have no output_tokens/);
  const { problems, results, summary } = await checkStudy(dir, study);
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.deepEqual(results, {});
  // An empty result set is not an audited set, and the summary says which.
  assert.match(summary, /no figure derives from it/);
});

test('an empty verdicts directory is refused rather than scored against nothing', async (t) => {
  const arm = await reviewArm(t);
  const empty = path.join(arm.root, 'nothing');
  await fs.mkdir(empty, { recursive: true });
  const result = await promote(arm, '2026-08-16-empty', ['--verdicts', empty]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /holds no verdict record/);
});
