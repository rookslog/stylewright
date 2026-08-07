#!/usr/bin/env node
/**
 * The arm manifest: what one arm was meant to hold, what it holds, and the
 * digest of every file in it.
 *
 *   node bench/arm-manifest.mjs <arm-directory> --scenarios a,b --reps N
 *                               [--abort "where the run stopped"]
 *
 * The measurement design, section 3, gives the runner one duty. When an arm
 * finishes, it writes a manifest naming every expected scenario, repetition,
 * sample, sidecar and error file, with a content digest for each. Without one
 * the scorer groups by whatever files a glob matched, so a partial arm scores
 * clean, and promotion cannot tell a finished cell from wreckage.
 *
 * Two rules shape this file, and both are the repository's rules elsewhere.
 *
 * The manifest states no outcome. It carries the expected set, the files that
 * exist, and their digests, and whether the arm finished is DERIVED from those
 * bytes by `armState`. The design speaks of a completion manifest and a failure
 * manifest, and these are the two shapes one writer produces: the failure shape
 * is the one whose expected set is not covered, and `abort` records the fact
 * and point of a stop that the files alone cannot show.
 *
 * The manifest is the author's own file. Section 5 of the design names that
 * floor: `at` and `abort` are readable, and neither is evidence of anything the
 * forge did not record.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationState, isBelow, walk } from '../src/tree.js';

/** One arm, one manifest, at a fixed name inside the arm's own directory. */
export const MANIFEST_NAME = 'arm-manifest.json';

/** sha256 over bytes. The digest names contents, so a swap of equal length moves it. */
export const digestBytes = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Every file the runner was meant to produce, sorted.
 *
 * A sample and its sidecar, per scenario, per repetition. An error file is not
 * expected: `run.sh` writes one only when the harness said something on stderr
 * and removes it when it is empty, so an `.err` is a fact about the run rather
 * than part of the plan. `collectFiles` records one when it exists.
 */
export function expectedFiles(scenarios, reps) {
  const out = [];
  for (const scenario of scenarios) {
    for (let rep = 1; rep <= reps; rep += 1) {
      out.push(`${scenario}-${rep}.txt`, `${scenario}-${rep}.txt.meta`);
    }
  }
  return out.sort();
}

/**
 * Every file in the arm directory with the digest of its bytes, as a plain
 * object sorted by name.
 *
 * The manifest itself is excluded, because a file cannot digest itself, and a
 * manifest that named itself would be stale the moment it was written.
 *
 * Built through a `Map` and `Object.fromEntries`, the way `src/manifest.js`
 * builds its own record. A sample could be named `__proto__.txt`, and assigning
 * that key on an ordinary object invokes the inherited setter rather than
 * creating a property, so the manifest would silently omit a file it digested.
 */
export async function collectFiles(dir) {
  // The manifest and its staging name are both excluded. A file cannot digest
  // itself, and a staging file a killed run left behind is this writer's
  // wreckage rather than the arm's, so counting it would report a finished arm
  // as one holding a file its plan never named.
  const rels = (await walk(dir)).filter((rel) => !rel.startsWith(MANIFEST_NAME));
  const entries = new Map();
  for (const rel of rels) {
    entries.set(rel, digestBytes(await fs.readFile(path.join(dir, rel))));
  }
  return Object.fromEntries([...entries.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * The manifest, assembled from what the run produced.
 *
 * Pure and separate from the writer, because everything a later reader depends
 * on is decided here.
 */
/**
 * Names a result identifier can carry.
 *
 * A derived figure is `<scenario>.<arm>.<statistic>.<metric>`, so a dot inside
 * an arm or a scenario name makes the identifier ambiguous the moment anybody
 * splits it. The refusal sits here, where the name first becomes a record,
 * rather than in the check that would have to live with it.
 */
export const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function buildManifest({ arm, scenarios, reps, at, abort = null, files }) {
  for (const [what, value] of [['arm', arm], ...scenarios.map((s) => ['scenario', s])]) {
    if (!NAME.test(String(value))) {
      throw new Error(`"${value}" is not a ${what} name. A dot makes a derived result `
        + 'identifier ambiguous, so a name is letters, digits, dashes and underscores.');
    }
  }
  return {
    kind: 'arm-manifest',
    arm,
    scenarios: [...scenarios].sort(),
    reps,
    // The runner's own timestamp, readable and never load-bearing. Section 5 of
    // the measurement design settles ordering on push time, because an
    // author-written moment can be post-dated past any push.
    at,
    // Present only when the runner stopped before the plan was covered. Which
    // files are missing is visible from `expected` and `files`, and the point of
    // the stop is the one thing they cannot show.
    abort,
    expected: expectedFiles(scenarios, reps),
    files,
  };
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const HEX = /^[0-9a-f]{64}$/;

/** Everything wrong with one manifest, as a list, so a run reports all of it. */
export function manifestProblems(manifest, name = 'arm manifest') {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [`${name}: not a JSON object.`];
  }
  const problems = [];
  const say = (p) => problems.push(`${name}: ${p}`);
  if (manifest.kind !== 'arm-manifest') say('kind must be "arm-manifest".');
  // The same names the builder refuses, checked again on the way in, because a
  // manifest read off disk was not necessarily written by the builder.
  if (!NAME.test(String(manifest.arm))) say('arm names the arm this manifest covers.');
  if (!Array.isArray(manifest.scenarios) || !manifest.scenarios.length
    || !manifest.scenarios.every((s) => NAME.test(String(s)))) {
    say('scenarios is a non-empty list of scenario names.');
  }
  if (!Number.isInteger(manifest.reps) || manifest.reps < 1) {
    say('reps is the repetition count the arm was collected with.');
  }
  if (!isText(manifest.at)) say('at records when the runner wrote this.');
  if (manifest.abort != null && !isText(manifest.abort)) {
    say('abort is absent, or it says where the run stopped.');
  }
  if (!Array.isArray(manifest.expected) || !manifest.expected.every(isText)) {
    say('expected lists every file the run planned to produce.');
  }
  const files = manifest.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    say('files maps each retained file to the digest of its bytes.');
  } else {
    for (const [rel, digest] of Object.entries(files)) {
      if (!HEX.test(String(digest))) say(`files["${rel}"] is not a sha256 digest.`);
    }
  }
  return problems;
}

/**
 * What the bytes say about this arm, derived and never declared.
 *
 * `missing` is the expected set the files do not cover, and an arm with any is
 * the failure shape whatever `abort` says. `unexpected` is a sample or sidecar
 * the plan never named, which means the arm holds more than one configuration
 * or a stray file. `errored` names the error files that carry text, because the
 * design retains an arm whose error files are non-empty as a failed attempt.
 *
 * `complete` is the conjunction, and it is the only thing a caller should read
 * to decide whether an arm finished. `scorable` is narrower still: a finished
 * arm that reported nothing on stderr.
 */
export function armState(manifest, files = manifest?.files ?? {}) {
  const expected = new Set(manifest?.expected ?? []);
  const present = new Set(Object.keys(files));
  const missing = [...expected].filter((rel) => !present.has(rel)).sort();
  const unexpected = [...present]
    .filter((rel) => !expected.has(rel) && !rel.endsWith('.err'))
    .sort();
  const errored = [...present].filter((rel) => rel.endsWith('.err')).sort();
  const complete = missing.length === 0 && unexpected.length === 0 && !manifest?.abort;
  return { missing, unexpected, errored, complete, scorable: complete && errored.length === 0 };
}

/**
 * How the arm on disk differs from the manifest that describes it.
 *
 * This is the check promotion runs, and later the check a reader runs over a
 * promoted study. A digest that no longer matches is the whole point: promoted
 * evidence is tamper-evident rather than immutable, and an editor or a commit
 * can still change bytes.
 */
export function fileProblems(manifest, files) {
  const problems = [];
  const recorded = manifest?.files ?? {};
  for (const [rel, digest] of Object.entries(recorded)) {
    if (!(rel in files)) problems.push(`${rel} is named by the manifest and is not here.`);
    else if (files[rel] !== digest) problems.push(`${rel} does not match its recorded digest.`);
  }
  for (const rel of Object.keys(files)) {
    if (!(rel in recorded)) problems.push(`${rel} is here and the manifest does not name it.`);
  }
  return problems.sort();
}

/** Reads one arm's manifest. A missing file is a result, not an exception. */
export async function readManifest(dir) {
  let text;
  try {
    text = await fs.readFile(path.join(dir, MANIFEST_NAME), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message is not repeated, for the reason `bench/probe.mjs`
    // gives: V8 truncates it to a few characters of the offending file.
    return { unreadable: true };
  }
}

/**
 * Writes the manifest into the arm directory, through the tree discipline every
 * other write surface here inherits: a contained destination, no symbolic link,
 * and exclusive creation at the staging name.
 *
 * A manifest here IS replaced, and that is deliberate. `run.sh` resumes an
 * interrupted arm, so an arm that aborted and then finished needs a record of
 * where it ended up rather than where it once stopped. Replacing is safe
 * because nothing is edited: every field is recomputed from the files on disk.
 * A PROMOTED manifest is a different thing and is never touched, because
 * promotion refuses a study directory that already exists.
 *
 * The file is staged beside its destination and renamed over it, which is this
 * repository's rule for every file it replaces. A partial write at the
 * destination would be a manifest nothing could identify afterwards.
 */
export async function writeArmManifest(dir, manifest, baseDir) {
  const outPath = path.join(dir, MANIFEST_NAME);
  const partPath = `${outPath}.part`;
  if (!isBelow(baseDir, outPath)) {
    throw new Error(`An arm manifest is written under ${baseDir}, not at ${outPath}.`);
  }
  const state = await destinationState(dir);
  if (state !== 'directory') {
    throw new Error(`${dir} is ${state === 'absent' ? 'missing' : `a ${state}`}, `
      + 'so it holds no arm to describe.');
  }
  // The destination is classified, so a link planted at the name is refused
  // rather than written through. `rename` replaces a plain file and would
  // otherwise replace the link, which is the quieter half of the same defect.
  const at = await destinationState(outPath);
  if (at !== 'absent' && at !== 'file') {
    throw new Error(`${outPath} is a ${at}, and a manifest is never written through one.`);
  }
  // `wx` IS the refusal at the staging name, and it does not follow a link. A
  // file standing there is named and never cleared: holding this directory
  // proves no run is working now, and it does not prove who wrote that file.
  const fh = await fs.open(partPath, 'wx').catch((err) => {
    if (err.code !== 'EEXIST') throw err;
    throw new Error(`${partPath} already stands there. A killed run leaves it, and a person `
      + 'removes it, because nothing here can prove who wrote it.');
  });
  try {
    await fh.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await fh.close();
  }
  await fs.rename(partPath, outPath);
  return outPath;
}

export function parseArgs(argv) {
  const opts = { dir: null, scenarios: [], reps: null, abort: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      if (opts.dir) throw new Error(`only one arm directory, and "${arg}" is a second.`);
      opts.dir = arg;
      continue;
    }
    const value = argv[i + 1];
    // A flag in a value position is a missing value, not a value. The collector
    // learned this after `--model --dry-run` paid for two live calls.
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${arg} needs a value, and "${value ?? ''}" is another flag.`);
    }
    i += 1;
    if (arg === '--scenarios') opts.scenarios = value.split(',').filter(Boolean);
    else if (arg === '--reps') opts.reps = Number(value);
    else if (arg === '--abort') opts.abort = value;
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (!opts.dir) throw new Error('name the arm directory.');
  if (!opts.scenarios.length) throw new Error('--scenarios lists the scenarios the arm ran.');
  if (!Number.isInteger(opts.reps) || opts.reps < 1) {
    throw new Error('--reps is the repetition count, as a positive integer.');
  }
  return opts;
}

async function main(argv, now) {
  const opts = parseArgs(argv);
  const dir = path.resolve(opts.dir);
  const files = await collectFiles(dir);
  const manifest = buildManifest({
    arm: path.basename(dir),
    scenarios: opts.scenarios,
    reps: opts.reps,
    at: now,
    abort: opts.abort,
    files,
  });
  const outPath = await writeArmManifest(dir, manifest, path.dirname(dir));
  const state = armState(manifest);
  process.stdout.write(`${outPath}\n`);
  process.stdout.write(state.complete
    ? `arm ${manifest.arm}: covers its plan, ${Object.keys(files).length} files.\n`
    : `arm ${manifest.arm}: does NOT cover its plan. `
      + `${state.missing.length} missing, ${state.unexpected.length} unexpected.\n`);
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
