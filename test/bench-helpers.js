import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildManifest, collectFiles, writeArmManifest } from '../bench/arm-manifest.mjs';
import { digest } from '../bench/score.mjs';

/**
 * A real arm, and a real promotion of it.
 *
 * Both the promotion tests and the study tests read from here. The study check
 * re-runs the scorer command a study retained, so a study fixture assembled by
 * hand could only ever be checked against a hand-written table. These build a
 * study the way an operator builds one, and each test then breaks exactly one
 * thing in it.
 */

export const repoRoot = path.dirname(import.meta.dirname);
export const retain = path.join(repoRoot, 'bench', 'retain.mjs');
export const SCENARIO = 'report';
export const REPS = 5;

export function run(script, args, cwd = repoRoot) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], { cwd }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr });
    });
  });
}

export function metaLine(over = {}) {
  const fields = {
    arm: 'control',
    scenario: SCENARIO,
    rep: '1',
    reps: String(REPS),
    rules: '',
    system: 'none',
    system_sha: 'none',
    user_rules_sha: 'none',
    user_rules: 'none',
    prompt_sha: 'PROMPT',
    model_id: 'claude-demo-1',
    cli: '2.1.220',
    at: '2026-08-06T00:00:00Z',
    ...over,
  };
  return `${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}\n`;
}

/** An arm promotion should accept, unless the caller breaks one thing in it. */
export async function tempArm(t, { name = 'control', meta = {}, samples = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-bench-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const from = path.join(root, 'out');
  const out = path.join(root, 'samples');
  const dir = path.join(from, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(out, { recursive: true });

  const promptSha = digest(
    await fs.readFile(path.join(repoRoot, 'bench', 'prompts', `${SCENARIO}.txt`)));
  for (let rep = 1; rep <= REPS; rep += 1) {
    const sample = `${SCENARIO}-${rep}.txt`;
    await fs.writeFile(path.join(dir, sample), samples[sample]
      ?? `The guard tests raw === '' so whitespace still throws. Fixed in rep ${rep}.\n`);
    await fs.writeFile(path.join(dir, `${sample}.meta`),
      metaLine({ arm: name, rep: String(rep), prompt_sha: promptSha, ...meta }));
  }
  return { root, from, out, dir, name, promptSha };
}

export async function writeManifest(dir, name, over = {}) {
  await writeArmManifest(dir, buildManifest({
    arm: name,
    scenarios: [SCENARIO],
    reps: REPS,
    at: '2026-08-06T00:00:00Z',
    files: await collectFiles(dir),
    ...over,
  }), path.dirname(dir));
}

export const LICENSE = 'no source text is reproduced in these samples or this prompt';

export function promote(arm, { study = '2026-08-06-demo', arms = [arm.name], extra = [] } = {}) {
  return run(retain, [
    '--study', study,
    ...arms.flatMap((a) => ['--arm', a]),
    '--from', arm.from, '--out', arm.out, '--license-check', LICENSE,
    ...extra,
  ]);
}

/** A promoted study that passes its own check, for a test to then break. */
export async function tempStudy(t, options = {}) {
  const arm = await tempArm(t, options);
  await writeManifest(arm.dir, arm.name, options.manifest ?? {});
  const study = options.study ?? '2026-08-06-demo';
  const result = await promote(arm, { study });
  return { arm, study, dir: path.join(arm.out, study), result };
}
