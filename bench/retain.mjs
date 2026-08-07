#!/usr/bin/env node
/**
 * Promotion: copy whole arms out of `bench/out/` and into a committed study
 * under `bench/samples/`.
 *
 *   node bench/retain.mjs --study 2026-08-06-slug --arm control --arm with-skill \
 *                         --license-check "what you checked, and against what"
 *
 * The retention gap this closes is the one `bench/README.md` still carries in
 * every figure: `.gitignore` excludes the whole of `bench/out/`, so no sample
 * behind a published number survived. The store is `bench/samples/`, committed,
 * one directory per study, decided by the owner on 2026-08-04 and recorded in
 * ADR-0006. `bench/out/` stays excluded, and publication requires promotion.
 *
 * Promotion is a reviewed act, never a glob. The measurement design, section 3,
 * gives it named refusals, and each one is a refusal here:
 *
 * - An arm with no manifest is live or dead, and both are unpromotable.
 * - An arm whose files disagree with its manifest is refused. Promoted evidence
 *   is tamper-evident, and the digests are the mechanism.
 * - An arm collected under `--rules user` is refused. Its sidecars record the
 *   operator's private rule filenames and hashes, and its samples may quote the
 *   rules themselves. Redaction is the design's other option and it is not
 *   built here, so this pass refuses outright and ADR-0021 says so.
 * - Every retained file is scanned for operator configuration and for anything
 *   credential-shaped, and a hit refuses the promotion.
 * - A license check is recorded, in the study manifest, or nothing is promoted.
 *
 * It is Node and not shell, so it uses the same tree discipline as the engine:
 * contained names only, no symbolic links, exclusive creation, and refusal to
 * touch an existing study.
 *
 * The scorer runs AFTER the copy, over the promoted bytes, so every figure a
 * reader derives comes from exactly the files the tree holds. Its command and
 * its output are retained verbatim, and `bench/study.mjs` derives the figures
 * from them. This file states no result.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationState, ensureDir, isBelow, walk } from '../src/tree.js';
// `chainProblems` is read from the collector rather than copied. Both files ask
// the same question of a chain of directories before and after a write, and a
// second copy is a second thing to drift — which here would mean one write
// surface refusing a symbolic link and the other writing through it.
import { chainProblems } from './collect-probe.mjs';
import {
  MANIFEST_NAME, collectFiles, digestBytes, fileProblems, manifestProblems, readManifest,
} from './arm-manifest.mjs';
import { digest as sidecarDigest, readMeta } from './score.mjs';
import { STUDY_MANIFEST, STUDY_NAME, checkStudy, contentProblems } from './study.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

/**
 * The section 4.2 provenance a study is asked to carry, and the sidecar field
 * that carries it today.
 *
 * A field with no carrier is a gap, and the study manifest names it rather than
 * inventing a value. The installed-delivery runner is what fills these, and it
 * does not exist: every arm `bench/run.sh` collects is an injected arm in
 * whatever environment the operator's shell happened to be. Naming the absence
 * is what stops a reader taking an injected figure for an installed one.
 */
export const PROVENANCE = [
  { field: 'canonical content digest of the treatment', sidecar: 'system_sha' },
  { field: 'prompt digest', sidecar: 'prompt_sha' },
  { field: 'served model build', sidecar: 'model_id' },
  { field: 'CLI version', sidecar: 'cli' },
  { field: 'platform', sidecar: null },
  { field: 'environment class', sidecar: null },
  { field: 'committed stack digest', sidecar: null },
  { field: 'delivery mode', sidecar: null },
  { field: 'installed pathway and tree digest', sidecar: null },
];

/** Which of those fields no retained record carries, as sentences. */
export function provenanceGaps(metas) {
  const gaps = [];
  for (const { field, sidecar } of PROVENANCE) {
    if (!sidecar) {
      gaps.push(`${field}: no sidecar records it, and the runner does not collect it.`);
    } else if (!metas.length || metas.some((m) => !m?.[sidecar])) {
      gaps.push(`${field}: a sidecar in this study has no ${sidecar}.`);
    }
  }
  return gaps;
}

/**
 * Why this arm's sidecars keep it out of the tree, as reasons.
 *
 * Two signals, and both name the same risk from different ends. `rules=user`
 * is what the runner was told. `user_rules` is what it then hashed, which is a
 * list of the operator's own rule filenames, so a sidecar carrying anything but
 * `none` there publishes the operator's configuration whatever the flag said.
 *
 * The third is the system prompt's path. `run.sh` records it, and an absolute
 * path names the operator's filesystem. The runner now records a contained path
 * instead, so this refuses an arm collected before that and any arm whose
 * treatment sat outside the repository.
 */
export function sidecarProblems(file, meta) {
  const problems = [];
  if (!meta) return [`${file} has no .meta sidecar, so nothing records what produced it.`];
  if (meta.rules === 'user') {
    problems.push(`${file} was collected under --rules user. Promotion refuses it, because its `
      + 'sidecars record the operator\'s private rule filenames and hashes.');
  }
  if (meta.user_rules && meta.user_rules !== 'none') {
    problems.push(`${file} records the operator's own rule files in user_rules.`);
  }
  if (meta.system && meta.system !== 'none' && path.isAbsolute(meta.system)) {
    problems.push(`${file} records an absolute system-prompt path, which names the operator's `
      + 'filesystem. Collect the arm with a runner that records a contained path.');
  }
  return problems;
}

/**
 * One arm, read and checked, or the reasons it cannot be promoted.
 *
 * Every reason is collected rather than thrown, so one run tells an operator
 * everything wrong with a promotion instead of one thing per attempt. Live
 * calls are expensive, and so is discovering the second refusal after fixing
 * the first.
 */
export async function readArm(dir, name = path.basename(dir)) {
  const problems = [];
  const state = await destinationState(dir);
  if (state !== 'directory') {
    return {
      name,
      problems: [`${name}: ${state === 'absent' ? 'no such arm' : `is a ${state}`}.`],
    };
  }
  const manifest = await readManifest(dir);
  if (!manifest) {
    return {
      name,
      problems: [`${name}: has no ${MANIFEST_NAME}. An arm without one is live or dead, and `
        + 'both are unpromotable. Write one with bench/arm-manifest.mjs.'],
    };
  }
  if (manifest.unreadable) return { name, problems: [`${name}: ${MANIFEST_NAME} is not JSON.`] };
  problems.push(...manifestProblems(manifest, name));

  // A source file is classified before it is read. `walk` reports a symbolic
  // link as a file, and `readFile` then follows it out of the tree, so a link
  // planted in an arm would be copied into a committed study as whatever it
  // pointed at.
  const rels = await walk(dir);
  for (const rel of rels) {
    const at = await destinationState(path.join(dir, rel));
    if (at !== 'file') problems.push(`${name}: ${rel} is a ${at}, and only files are promoted.`);
  }
  if (problems.length) return { name, problems };

  const files = await collectFiles(dir);
  for (const p of fileProblems(manifest, files)) problems.push(`${name}: ${p}`);

  for (const rel of rels) {
    const bytes = await fs.readFile(path.join(dir, rel));
    for (const found of contentProblems(bytes.toString('utf8'))) {
      problems.push(`${name}: ${rel}: ${found}`);
    }
  }

  const samples = Object.keys(files).filter((rel) => rel.endsWith('.txt')).sort();
  const metas = [];
  for (const rel of samples) {
    const meta = await readMeta(path.join(dir, rel));
    metas.push(meta);
    for (const p of sidecarProblems(rel, meta)) problems.push(`${name}: ${p}`);
  }
  return { name, dir, manifest, files, rels, samples, metas, problems };
}

/**
 * Copies one file into the study, through the discipline every write surface
 * here inherits: a contained destination, no symbolic link on the chain, and
 * exclusive creation, so nothing already in a study is ever replaced.
 *
 * The chain is re-read after the write. Creating it level by level narrows the
 * window and does not close it, and Node offers no way to open a path relative
 * to a directory it has already checked, so detection after the fact is the
 * honest end of what this can do. `collect-probe.mjs` reached the same floor.
 */
export async function writeContained(baseDir, outPath, bytes) {
  if (!isBelow(baseDir, outPath)) {
    throw new Error(`A study file is written under ${baseDir}, not at ${outPath}.`);
  }
  const baseState = await destinationState(baseDir);
  if (baseState !== 'absent' && baseState !== 'directory') {
    throw new Error(`${baseDir} is a ${baseState}, and nothing is written through one.`);
  }
  // `ensureDir` clears anything of another type below the base as it walks. It
  // is safe here and nowhere else in this file: the study directory was created
  // by the exclusive `mkdir` above, so nothing this run did not put there can
  // stand inside it.
  await ensureDir(path.dirname(outPath), baseDir);
  const fh = await fs.open(outPath, 'wx').catch(async (err) => {
    if (err.code !== 'EEXIST') throw err;
    const state = await destinationState(outPath);
    throw new Error(`${outPath} already holds a ${state}. A promoted file is never replaced.`);
  });
  let identity;
  try {
    identity = await fh.stat();
    await fh.writeFile(bytes);
  } finally {
    await fh.close();
  }
  const problems = await chainProblems(baseDir, path.dirname(outPath));
  const now = await fs.lstat(outPath).catch(() => null);
  if (!now?.isFile() || now.dev !== identity.dev || now.ino !== identity.ino) {
    problems.push(`${outPath} no longer names the file this call created.`);
  } else if (problems.length) {
    await fs.rm(outPath, { force: true }); // Ours by identity, so this destroys nothing else.
  }
  if (problems.length) {
    throw new Error(`A promoted file did not go where it was meant to. ${problems.join(' ')}`);
  }
}

/** One scorer run, as its own bytes. Nothing here reads the numbers. */
export function runScorer(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const errs = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => errs.push(d));
    const text = (chunks) => Buffer.concat(chunks).toString('utf8');
    child.on('error', (e) => resolve({ exit_code: -1, stdout: '', stderr: e.message }));
    child.on('close', (code) => resolve({
      exit_code: code ?? -1, stdout: text(out), stderr: text(errs),
    }));
  });
}

export function parseArgs(argv) {
  const opts = { study: null, arms: [], licenseCheck: null, from: null, out: null };
  const keys = {
    '--study': 'study', '--license-check': 'licenseCheck', '--from': 'from', '--out': 'out',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // The flag is recognised BEFORE its value is demanded. Reading the next
    // argument first reported a missing value for a flag this file does not
    // have, which sent an operator looking for the wrong mistake.
    if (arg !== '--arm' && !keys[arg]) throw new Error(`unknown flag: ${arg}`);
    const value = argv[i + 1];
    // A flag in a value position is a missing value, not a value.
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${arg} needs a value, and "${value ?? ''}" is another flag.`);
    }
    i += 1;
    if (arg === '--arm') opts.arms.push(value);
    else opts[keys[arg]] = value;
  }
  if (!opts.study) throw new Error('--study names the study directory, as <date>-<slug>.');
  if (!STUDY_NAME.test(opts.study)) {
    throw new Error(`--study is <date>-<slug>, and "${opts.study}" is not.`);
  }
  if (!opts.arms.length) throw new Error('--arm names an arm to promote, and repeats.');
  if (new Set(opts.arms).size !== opts.arms.length) {
    throw new Error('an arm is promoted once, and one was named twice.');
  }
  // The named refusal is a recorded check, so there is nothing to promote
  // without it. A default would turn the rule off for whoever forgot the flag,
  // which is the reason `checkSkill` refuses a missing day rather than guessing.
  if (!opts.licenseCheck) {
    throw new Error('--license-check states what you checked for reproduced source text, and '
      + 'against what. It is recorded in the study manifest. Section 3 of the measurement '
      + 'design requires it over every retained file, samples and prompts alike.');
  }
  return opts;
}

async function main(argv, now) {
  const opts = parseArgs(argv);
  const fromDir = path.resolve(opts.from ?? path.join(HERE, 'out'));
  const outDir = path.resolve(opts.out ?? path.join(HERE, 'samples'));
  const studyDir = path.join(outDir, opts.study);

  const arms = [];
  const problems = [];
  for (const name of opts.arms) {
    const arm = await readArm(path.join(fromDir, name), name);
    problems.push(...arm.problems);
    arms.push(arm);
  }

  // The prompt files the study retains, checked against the samples that
  // answered them. A study retaining a prompt nobody answered is the failure
  // `score.mjs --prompt` already refuses at scoring time, one step earlier.
  const scenarios = [...new Set(arms.flatMap((a) => a.manifest?.scenarios ?? []))].sort();
  const prompts = [];
  for (const scenario of scenarios) {
    const src = path.join(HERE, 'prompts', `${scenario}.txt`);
    const bytes = await fs.readFile(src).catch(() => null);
    if (!bytes) {
      problems.push(`prompts/${scenario}.txt is missing, and the study cannot retain it.`);
      continue;
    }
    const sha = sidecarDigest(bytes);
    const disagree = arms.flatMap((a) => (a.metas ?? [])
      .filter((m) => m?.scenario === scenario && m.prompt_sha && m.prompt_sha !== sha));
    if (disagree.length) {
      problems.push(`prompts/${scenario}.txt has changed since these samples answered it `
        + `(${sha} against ${[...new Set(disagree.map((m) => m.prompt_sha))].join(', ')}).`);
    }
    for (const found of contentProblems(bytes.toString('utf8'))) {
      problems.push(`prompts/${scenario}.txt: ${found}`);
    }
    prompts.push({ scenario, bytes, digest: digestBytes(bytes) });
  }

  if (problems.length) {
    process.stderr.write('refusing to promote:\n');
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    return 1;
  }

  // A study is never touched twice. `mkdir` without `recursive` IS the refusal,
  // and it does not follow a link, so an existing directory and a link planted
  // at the name are refused by the same call.
  await ensureDir(outDir, path.dirname(outDir));
  await fs.mkdir(studyDir).catch((err) => {
    if (err.code !== 'EEXIST') throw err;
    throw new Error(`${studyDir} already exists. A correction is a new study, never an edit.`);
  });

  const armRecords = [];
  const armDigests = [];
  for (const arm of arms) {
    const rel = `arms/${arm.name}`;
    for (const file of [...arm.rels].sort()) {
      await writeContained(studyDir, path.join(studyDir, rel, file),
        await fs.readFile(path.join(arm.dir, file)));
    }
    const manifestBytes = await fs.readFile(path.join(arm.dir, MANIFEST_NAME));
    const manifestDigest = digestBytes(manifestBytes);
    armDigests.push(manifestDigest);
    armRecords.push({ arm: arm.name, path: rel, manifest_digest: manifestDigest });
  }
  for (const prompt of prompts) {
    await writeContained(studyDir, path.join(studyDir, 'prompts', `${prompt.scenario}.txt`),
      prompt.bytes);
  }

  // Score the PROMOTED bytes, one scenario at a time. A median across a
  // correction and a report is not a number, which is why `score.mjs` refuses a
  // set whose prompt digests differ, and `--compare` is what reads two arms
  // together without pooling them.
  const scorer = path.join(HERE, 'score.mjs');
  const scorerDigest = digestBytes(await fs.readFile(scorer));
  const analyses = [];
  for (const prompt of prompts) {
    const files = arms.flatMap((arm) => arm.samples
      .filter((rel) => rel.startsWith(`${prompt.scenario}-`))
      .map((rel) => path.relative(REPO, path.join(studyDir, `arms/${arm.name}`, rel))))
      .sort();
    if (!files.length) continue;
    const args = [
      path.relative(REPO, scorer),
      '--prompt', path.relative(REPO, path.join(studyDir, 'prompts', `${prompt.scenario}.txt`)),
      ...(arms.length > 1 ? ['--compare'] : []),
      ...files,
    ];
    const run = await runScorer(args, REPO);
    // A refusal is retained, not repaired. A study whose scorer would not score
    // it is a failed attempt, and the design keeps those rather than letting
    // them disappear. No figure derives from it, because the scorer printed none.
    analyses.push({ scenario: prompt.scenario, command: ['node', ...args], ...run });
  }

  const pkg = JSON.parse(await fs.readFile(path.join(REPO, 'package.json'), 'utf8'));
  const manifest = {
    kind: 'study',
    study: opts.study,
    promoted: now,
    package_version: pkg.version,
    scorer: { path: path.relative(REPO, scorer), digest: scorerDigest },
    license_check: { checked: opts.licenseCheck, at: now },
    arms: armRecords,
    arms_digest: digestBytes(armDigests.slice().sort().join('\n')),
    prompts: prompts.map((p) => ({
      scenario: p.scenario, path: `prompts/${p.scenario}.txt`, digest: p.digest,
    })),
    analyses,
    provenance_gaps: provenanceGaps(arms.flatMap((a) => a.metas)),
  };
  await writeContained(studyDir, path.join(studyDir, STUDY_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`);

  // The promotion reads its own work with the check a stranger will run. A
  // study that fails it is left standing rather than removed, because the bytes
  // are the evidence and a person decides what to do with them.
  const { problems: after, summary } = await checkStudy(studyDir, opts.study);
  process.stdout.write(`${studyDir}\n`);
  if (after.length) {
    process.stderr.write('the promoted study does not pass its own check:\n');
    for (const p of after) process.stderr.write(`  - ${p}\n`);
    return 1;
  }
  process.stdout.write(`${summary}\n`);
  process.stdout.write('Run `npm run check:studies` to read what these bytes derive.\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2), new Date().toISOString());
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
