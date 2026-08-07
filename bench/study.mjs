#!/usr/bin/env node
/**
 * The promoted study: what a retained directory under `bench/samples/` must
 * carry, and what a reader derives from it.
 *
 *   node bench/study.mjs [bench/samples]
 *
 * The measurement design, section 3, defines the study. It is not a directory
 * of samples. It is a record that reproduces an analysis, so a reader re-runs
 * the named command against the named files, or knows exactly why the figure
 * moved. `bench/retain.mjs` writes one. This file only reads them, so it spawns
 * nothing, reads no clock, and runs anywhere Node runs.
 *
 * Two rules shape this file, and they are the two the probe record already
 * obeys.
 *
 * **A figure is derived, never declared.** The manifest retains the scorer's
 * command and the scorer's output verbatim. `deriveResults` reads the numbers
 * out of that output, so `bench-study:<study>#<result>` resolves to a figure a
 * reader recomputes from retained bytes rather than to a number the author
 * typed beside them. A manifest that carried its own figures would be the
 * author's summary, and the design promises a reader who never has to trust
 * one. ADR-0023 records the decision.
 *
 * **Promoted evidence is tamper-evident, not immutable.** An editor or a commit
 * can still change the bytes. The digests are what make the change visible, so
 * this check recomputes every one of them: each arm against its own manifest,
 * the arm manifests against the study, and every retained prompt against the
 * digest the study recorded.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectFiles, digestBytes, fileProblems, manifestProblems, readManifest,
} from './arm-manifest.mjs';
import { looksLikeCredential, redact } from './probe.mjs';

/** One study, one manifest, at a fixed name in the study's own directory. */
export const STUDY_MANIFEST = 'study.json';

/**
 * Operator configuration, in the shapes a retained file could carry it.
 *
 * This is a BACKSTOP, and it is written down as one. The mechanism is the
 * refusal in `bench/retain.mjs`: an arm collected under `--rules user` never
 * enters the tree, because its sidecars record the operator's private rule
 * filenames and hashes and its samples may quote the rules themselves. What
 * this pattern adds is a second look at the bytes, for the case where a sample
 * quotes a path or a settings file that no sidecar field names.
 *
 * The residue is stated rather than implied. Operator configuration is
 * arbitrary text, so no pattern recognises all of it, and this one recognises
 * two families: a path inside somebody's home directory, and the names of the
 * files the harness reads its rules from. Content that is neither passes.
 *
 * A false refusal costs a promotion that a person then has to look at. Missing
 * a real one publishes it. ADR-0016 already settled which way this repository
 * leans when a check cannot model everything.
 */
export const OPERATOR_CONFIG = [
  {
    what: 'a path inside a home directory, which names the operator\'s filesystem',
    pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[A-Za-z0-9._-]+[/\\]/,
  },
  {
    what: 'a file the harness reads operator rules from',
    pattern: /(?:~[/\\]\.claude|\.claude[/\\](?:settings(?:\.local)?\.json|CLAUDE\.md))/,
  },
];

/**
 * What is wrong with these bytes, as reasons, or an empty list.
 *
 * The text is never quoted back. A refusal that printed the match would put the
 * very content the check exists to keep out of the tree into a log, and the
 * credential half would put it there twice over.
 */
export function contentProblems(text) {
  const found = [];
  if (looksLikeCredential(text)) {
    found.push('something here looks like a credential, and a retained file is committed.');
  }
  for (const { what, pattern } of OPERATOR_CONFIG) {
    if (pattern.test(text)) found.push(`it carries ${what}.`);
  }
  return found;
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const HEX = /^[0-9a-f]{64}$/;
/** A study directory is dated and slugged, like every other dated artefact here. */
export const STUDY_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

/**
 * Words a study manifest may not carry as a key. Each one states an outcome,
 * and the outcome is the reader's to compute from the retained scorer output.
 * The probe record refuses the same list for the same reason.
 */
const ASSERTED = ['median', 'range', 'figure', 'finding', 'conclusion', 'verdict', 'audited'];

function keyPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    const at = prefix ? `${prefix}.${k}` : k;
    out.push(at);
    out.push(...keyPaths(v, at));
  }
  return out;
}

/** Everything wrong with the shape of one study manifest. */
export function studyProblems(manifest, name = STUDY_MANIFEST) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [`${name}: not a JSON object.`];
  }
  const problems = [];
  const say = (p) => problems.push(`${name}: ${redact(p)}`);
  if (manifest.kind !== 'study') say('kind must be "study".');
  if (!isText(manifest.study)) say('study names the study directory.');
  if (!isText(manifest.promoted)) say('promoted records when the promotion ran.');
  if (!isText(manifest.package_version)) say('package_version records the revision promoted.');
  if (!isText(manifest.scorer?.path) || !HEX.test(String(manifest.scorer?.digest))) {
    say('scorer names the scorer and the digest of the revision that ran.');
  }
  // The named refusal, recorded. A promotion that skipped it leaves no trace
  // otherwise, and section 3 requires the check in the manifest rather than in
  // somebody's memory.
  if (!isText(manifest.license_check?.checked)) {
    say('license_check records what was checked for reproduced source text.');
  }
  if (!Array.isArray(manifest.arms) || !manifest.arms.length) {
    say('arms lists at least one promoted arm. A null study holds exactly one.');
  } else {
    for (const arm of manifest.arms) {
      if (!isText(arm?.arm) || !isText(arm?.path) || !HEX.test(String(arm?.manifest_digest))) {
        say('each arm names itself, its path, and the digest of its arm manifest.');
      }
    }
  }
  if (!HEX.test(String(manifest.arms_digest))) {
    say('arms_digest is the digest over the arm manifests.');
  }
  if (!Array.isArray(manifest.prompts)) say('prompts lists the prompt files the study retains.');
  else {
    for (const p of manifest.prompts) {
      if (!isText(p?.scenario) || !isText(p?.path) || !HEX.test(String(p?.digest))) {
        say('each prompt names its scenario, its path, and its digest.');
      }
    }
  }
  if (!Array.isArray(manifest.analyses)) {
    say('analyses retains the scorer command and its output, per scenario.');
  } else {
    for (const a of manifest.analyses) {
      if (!isText(a?.scenario) || !Array.isArray(a?.command) || !a.command.every(isText)
        || typeof a?.stdout !== 'string' || typeof a?.stderr !== 'string'
        || !Number.isInteger(a?.exit_code)) {
        say('each analysis retains its scenario, command, exit code, stdout and stderr.');
      }
    }
  }
  // Gaps are named rather than filled. Section 4.2 asks a study to carry the
  // platform, the environment class and the stack digest, and the current runner
  // records none of them, so a promotion states the absence instead of inventing
  // a value. An empty list is a study that claims to carry everything.
  if (!Array.isArray(manifest.provenance_gaps) || !manifest.provenance_gaps.every(isText)) {
    say('provenance_gaps names each field section 4.2 asks for that no record carries.');
  }
  for (const at of keyPaths(manifest)) {
    const leaf = at.split('.').pop().replace(/\[\d+\]$/, '');
    if (ASSERTED.includes(leaf)) {
      say(`${at} states a figure, and a reader derives every figure from the retained output.`);
    }
  }
  return problems;
}

const METRIC_ROW = /^(audited|UNAUDITED)\t([^\t]*)\t(MEDIAN|RANGE)\t(.*)$/;

/**
 * The figures this study supports, derived from the scorer's own output.
 *
 * An identifier is `<scenario>.<arm>.<statistic>.<metric>`, which is what the
 * scorer's own table already names: a row per arm, a column per metric, and the
 * two summary rows the scorer prints under every group. A `-` in the arm column
 * is the scorer's spelling for a set it did not group, and it reads as `all`.
 *
 * Per-sample rows are deliberately not results. A figure published in
 * `bench/README.md` is a median or a range, and an identifier per sample would
 * multiply the namespace by the repetition count while naming nothing anybody
 * cites.
 *
 * `audited` rides on every derived figure, because the scorer puts its own
 * audit status on every row it prints for exactly that reason: a status written
 * once at the top is lost the moment anyone quotes a row.
 */
export function deriveResults(analyses) {
  const results = {};
  for (const analysis of analyses ?? []) {
    const lines = String(analysis?.stdout ?? '').split('\n');
    const header = lines.find((l) => l.startsWith('audit\t'))?.split('\t').slice(3) ?? [];
    for (const line of lines) {
      const row = METRIC_ROW.exec(line);
      if (!row) continue;
      const [, audit, arm, statistic, rest] = row;
      const values = rest.split('\t');
      header.forEach((metric, i) => {
        const value = values[i];
        if (value === undefined || value === '') return;
        const id = `${analysis.scenario}.${arm === '-' || arm === '' ? 'all' : arm}`
          + `.${statistic.toLowerCase()}.${metric}`;
        results[id] = { value, audited: audit === 'audited' };
      });
    }
  }
  return results;
}

/**
 * Everything wrong with one promoted study on disk, and what it derives.
 *
 * Returns `{ problems, results, summary }`. Every digest is recomputed, because
 * a digest nobody recomputes records nothing.
 */
export async function checkStudy(dir, name = path.basename(dir)) {
  const problems = [];
  const say = (p) => problems.push(`${name}: ${redact(p)}`);
  if (!STUDY_NAME.test(name)) say('a study directory is named <date>-<slug>.');

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, STUDY_MANIFEST), 'utf8'));
  } catch (err) {
    say(err.code === 'ENOENT'
      ? `${STUDY_MANIFEST} is missing, and a directory of samples is not a study.`
      : `${STUDY_MANIFEST} is not readable as JSON.`);
    return { problems, results: {}, summary: null };
  }
  problems.push(...studyProblems(manifest, name));

  // Every retained byte, checked for what must never be committed. This runs
  // over the study as it stands rather than over what promotion saw, because a
  // later commit can put content into a file promotion already cleared.
  for (const rel of await walkStudy(dir)) {
    // A file that cannot be read is reported, never skipped. Treating an
    // unreadable file as empty would let the one file nobody can open be the
    // one that carries what this scan exists to refuse.
    const text = await fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
    if (text === null) {
      say(`${rel} cannot be read, so nothing here can say what it carries.`);
      continue;
    }
    for (const found of contentProblems(text)) say(`${rel}: ${found}`);
  }

  const armDigests = [];
  for (const entry of Array.isArray(manifest.arms) ? manifest.arms : []) {
    if (!isText(entry?.path)) continue;
    const armDir = path.join(dir, entry.path);
    const armManifest = await readManifest(armDir);
    if (!armManifest) {
      say(`${entry.path} carries no arm manifest, so it is live or dead and neither is a study.`);
      continue;
    }
    if (armManifest.unreadable) {
      say(`${entry.path} has an arm manifest that is not readable as JSON.`);
      continue;
    }
    problems.push(...manifestProblems(armManifest, `${name}: ${entry.path}`));
    const raw = await fs.readFile(path.join(armDir, 'arm-manifest.json'));
    const digest = digestBytes(raw);
    armDigests.push(digest);
    if (digest !== entry.manifest_digest) {
      say(`${entry.path}'s arm manifest does not match the digest the study recorded.`);
    }
    for (const p of fileProblems(armManifest, await collectFiles(armDir))) {
      say(`${entry.path}: ${p}`);
    }
  }
  const armsDigest = digestBytes(armDigests.slice().sort().join('\n'));
  if (armDigests.length && armsDigest !== manifest.arms_digest) {
    say('arms_digest does not match the arm manifests this study holds.');
  }

  for (const prompt of Array.isArray(manifest.prompts) ? manifest.prompts : []) {
    if (!isText(prompt?.path)) continue;
    const bytes = await fs.readFile(path.join(dir, prompt.path)).catch(() => null);
    if (!bytes) say(`${prompt.path} is named by the study and is not here.`);
    else if (digestBytes(bytes) !== prompt.digest) {
      say(`${prompt.path} does not match its recorded digest.`);
    }
  }

  const results = deriveResults(manifest.analyses);
  // An empty set is not an audited set. `every` over nothing is true, so a study
  // whose scorer refused to score it would have reported the same word as one
  // that scored clean, and that word is the one a citation check reads.
  const count = Object.keys(results).length;
  const audit = count === 0
    ? 'no figure derives from it'
    : (Object.values(results).every((r) => r.audited) ? 'audited' : 'UNAUDITED');
  return {
    problems,
    results,
    summary: `${name}: ${count} result(s) derived, ${audit}, arms: `
      + `${(manifest.arms ?? []).map((a) => a?.arm).join(', ') || 'none'}`,
  };
}

/** Every file under a study, as relative paths. A missing study holds nothing. */
async function walkStudy(dir, base = '') {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walkStudy(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * Reads every study under `dir`. A directory with no studies is the state this
 * repository is in until the first promotion, and it is not a failure.
 */
export async function checkDirectory(dir) {
  let names;
  try {
    names = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return { problems: [], lines: [] };
    throw err;
  }
  const problems = [];
  const lines = [];
  for (const name of names) {
    const { problems: found, summary } = await checkStudy(path.join(dir, name), name);
    problems.push(...found);
    if (!found.length && summary) lines.push(summary);
  }
  return { problems, lines };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = process.argv[2] ?? path.join(here, 'samples');
  const { problems, lines } = await checkDirectory(dir);
  for (const line of lines) process.stdout.write(`${line}\n`);
  for (const p of problems) process.stderr.write(`${p}\n`);
  if (problems.length) process.exit(1);
  process.stdout.write(lines.length
    ? `Promoted studies clean. ${lines.length} checked.\n`
    : 'No promoted studies yet. Retention is a manual protocol, through bench/retain.mjs.\n');
}
