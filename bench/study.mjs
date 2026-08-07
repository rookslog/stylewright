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
 *
 * The retained scorer output was the one promoted artifact no digest covered,
 * and every figure derives from it. Measured on this branch: a single table
 * cell edited from 45 to 12 left the check exiting zero with the figure derived
 * audited. So this check RE-RUNS each retained command over the promoted bytes
 * and compares its output to the retained bytes. The manifest already pins the
 * scorer, its digest, the command, and the arm digests, which is what makes the
 * re-run the same run. That is why this file spawns, where the probe check does
 * not: it reads no clock and takes no argument from a record it has not first
 * checked, and re-running is the only way "a reader recomputes every one of
 * them" is true of the check itself.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationState, isBelow } from '../src/tree.js';
import {
  armState, collectFiles, digestBytes, fileProblems, manifestProblems, readManifest,
} from './arm-manifest.mjs';
import { looksLikeCredential, redact } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

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
      // The runner's own line, repeated so a reader sees it without opening the
      // arm. It is `null` for an arm that covered its plan, and the key is
      // never absent, because absent and null read the same on the way in and
      // an absent key would let a promotion drop an abort silently.
      if (!Object.hasOwn(arm ?? {}, 'abort') || (arm.abort !== null && !isText(arm.abort))) {
        say('each arm repeats its manifest\'s abort, or carries null.');
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
      const [, audit, column, statistic, rest] = row;
      const values = rest.split('\t');
      // `-` is the scorer's spelling for a set it did not group, and `all` is
      // what a reader can cite. The arm travels ALONGSIDE the identifier rather
      // than only inside it, so a caller that has to disqualify an arm's figures
      // never has to parse the identifier back apart.
      const arm = column === '-' || column === '' ? 'all' : column;
      header.forEach((metric, i) => {
        const value = values[i];
        if (value === undefined || value === '') return;
        const id = `${analysis.scenario}.${arm}.${statistic.toLowerCase()}.${metric}`;
        results[id] = {
          value,
          audited: audit === 'audited',
          scenario: analysis.scenario,
          arm,
          statistic: statistic.toLowerCase(),
          metric,
        };
      });
    }
  }
  return results;
}

/**
 * Every figure an arm the runner did not finish had a hand in, marked
 * unaudited, with the reason riding on the figure itself.
 *
 * `armState` derived whether an arm covered its plan and nothing read it, so an
 * arm whose manifest recorded an abort promoted and then derived figures marked
 * audited. Gating promotion would be the wrong repair — the design retains a
 * failed attempt on purpose — so the state propagates into the figures instead.
 *
 * The reason rides on each result rather than sitting once in a summary, which
 * is ADR-0023's own rule for the audit status and the reason the scorer stamps
 * every row it prints. An ungrouped `all` figure is disqualified by ANY unfit
 * arm, because a set the scorer did not group pooled all of them.
 */
export function disqualify(results, reasons) {
  if (!Object.keys(reasons).length) return results;
  const anyReason = Object.entries(reasons).map(([arm, why]) => `${arm} ${why}`).join('; ');
  const out = {};
  for (const [id, result] of Object.entries(results)) {
    const why = result.arm === 'all' ? anyReason : reasons[result.arm];
    out[id] = why ? { ...result, audited: false, reason: why } : result;
  }
  return out;
}

/** Flags a retained scorer command may carry, and which of them take a path. */
const SCORER_FLAGS = { '--compare': false, '--unaudited': false, '--prompt': true };

/**
 * Everything wrong with a retained command, before anything re-runs it.
 *
 * A command is the author's own line like every other field, so it is checked
 * before it is trusted, and the check is containment. A command rewired to name
 * files outside the study would re-run cleanly and reproduce its retained
 * output from bytes the study does not hold, which is the same hole `arms[]`
 * and `prompts[]` had one field over.
 */
export function commandProblems(command, { scorerPath, studyDir, repoRoot = REPO }) {
  const problems = [];
  if (!Array.isArray(command) || command.length < 3) return ['is not a scorer command.'];
  if (command[0] !== 'node') problems.push('does not run node.');
  if (command[1] !== scorerPath) {
    problems.push(`runs ${command[1]} and the study records the scorer as ${scorerPath}.`);
  }
  let expectPath = false;
  for (const arg of command.slice(2)) {
    if (!expectPath && Object.hasOwn(SCORER_FLAGS, arg)) {
      expectPath = SCORER_FLAGS[arg];
      continue;
    }
    if (!expectPath && arg.startsWith('-')) {
      problems.push(`carries ${arg}, which the promotion never passes.`);
      continue;
    }
    expectPath = false;
    if (!isBelow(studyDir, path.resolve(repoRoot, arg))) {
      problems.push(`names ${arg}, which is not inside this study.`);
    }
  }
  if (expectPath) problems.push('ends on a flag that needs a path.');
  return problems;
}

/** One recorded command, run again. Nothing here reads the numbers. */
export function rerun(command, cwd = REPO) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, command.slice(1), {
      cwd, stdio: ['ignore', 'pipe', 'pipe'],
    });
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

/**
 * Everything wrong with one promoted study on disk, and what it derives.
 *
 * Returns `{ problems, results, summary }`. Every digest is recomputed, because
 * a digest nobody recomputes records nothing, and every retained figure is
 * recomputed by re-running the command that produced it.
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

  // Every path the manifest names is joined only after it is shown to land
  // inside the study. `path.join` collapses `..` silently, so a rewired
  // `arms[].path` of `../../out/leak` credited bytes the study does not hold and
  // the scan never reached them. `isBelow` is the same predicate `src/tree.js`
  // gives every write surface here.
  const inside = (rel, field) => {
    if (!isText(rel)) return null;
    const abs = path.resolve(dir, rel);
    if (!isBelow(dir, abs)) {
      say(`${field} names ${rel}, which is outside this study.`);
      return null;
    }
    return abs;
  };

  // Every retained byte, checked for what must never be committed. This runs
  // over the study as it stands rather than over what promotion saw, because a
  // later commit can put content into a file promotion already cleared.
  const { files: retained, problems: walkFound } = await walkStudy(dir);
  for (const p of walkFound) say(p);
  for (const rel of retained) {
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
  const armPaths = [];
  // Why each arm's figures cannot be read as confirmatory, keyed by arm name.
  // Empty is the ordinary case, and `disqualify` then changes nothing.
  const unfit = {};
  for (const entry of Array.isArray(manifest.arms) ? manifest.arms : []) {
    const armDir = inside(entry?.path, 'arms[].path');
    if (!armDir) continue;
    armPaths.push(entry.path);
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
    const armFiles = await collectFiles(armDir);
    for (const p of fileProblems(armManifest, armFiles)) say(`${entry.path}: ${p}`);
    // The study repeats the runner's own abort line, so a reader sees it in
    // `study.json` without opening the arm. It is checked against the arm
    // manifest, because a repeated field nobody compares is a second thing to
    // drift.
    if ((entry.abort ?? null) !== (armManifest.abort ?? null)) {
      say(`${entry.path}'s recorded abort disagrees with its arm manifest.`);
    }
    const state = armState(armManifest, armFiles);
    if (!state.scorable) {
      unfit[entry.arm] = armManifest.abort
        ? `stopped: ${armManifest.abort}`
        : `did not finish cleanly (${state.missing.length} missing, `
          + `${state.unexpected.length} unexpected, ${state.errored.length} error file(s))`;
    }
  }
  const armsDigest = digestBytes(armDigests.slice().sort().join('\n'));
  if (armDigests.length && armsDigest !== manifest.arms_digest) {
    say('arms_digest does not match the arm manifests this study holds.');
  }

  const promptPaths = [];
  for (const prompt of Array.isArray(manifest.prompts) ? manifest.prompts : []) {
    const abs = inside(prompt?.path, 'prompts[].path');
    if (!abs) continue;
    promptPaths.push(prompt.path);
    const bytes = await fs.readFile(abs).catch(() => null);
    if (!bytes) say(`${prompt.path} is named by the study and is not here.`);
    else if (digestBytes(bytes) !== prompt.digest) {
      say(`${prompt.path} does not match its recorded digest.`);
    }
  }

  // Every file that is actually here is accounted for. Scanning a file's
  // contents says nothing about whether the study claims to hold it, so an
  // unaccounted file could sit in a promoted tree indefinitely.
  for (const rel of retained) {
    const accounted = rel === STUDY_MANIFEST
      || promptPaths.includes(rel)
      || armPaths.some((p) => rel === p || rel.startsWith(`${p}/`));
    if (!accounted) say(`${rel} is here and the study does not account for it.`);
  }

  // The scorer's digest is recorded and was never recomputed, against this
  // file's own promise. It is doubly load-bearing now: a re-run under a
  // different scorer is not the run the study describes, so a drift refuses the
  // re-run rather than quietly replacing the comparison.
  let scorerFit = false;
  if (isText(manifest.scorer?.path)) {
    const scorerAbs = path.resolve(REPO, manifest.scorer.path);
    const bytes = await fs.readFile(scorerAbs).catch(() => null);
    if (!bytes) {
      say(`the scorer at ${manifest.scorer.path} is not here, so nothing can re-run this study.`);
    } else {
      const now = digestBytes(bytes);
      if (now !== manifest.scorer.digest) {
        say(`${manifest.scorer.path} is now ${now} and this study was scored under `
          + `${manifest.scorer.digest}. A re-run would not be the run this study describes.`);
      } else scorerFit = true;
    }
  }

  // Re-run every retained command over the promoted bytes. The retained output
  // was the one promoted artifact no digest covered, and every figure derives
  // from it, so a single edited cell used to pass this check outright.
  for (const analysis of Array.isArray(manifest.analyses) ? manifest.analyses : []) {
    const found = commandProblems(analysis?.command, {
      scorerPath: manifest.scorer?.path, studyDir: dir,
    });
    for (const p of found) say(`the ${analysis?.scenario} command ${p}`);
    if (found.length || !scorerFit) continue;
    const again = await rerun(analysis.command);
    if (again.stdout !== analysis.stdout) {
      say(`re-running the ${analysis.scenario} command produced different output from the `
        + 'bytes this study retains, so a figure derived from them is not reproducible.');
    }
    if (again.exit_code !== analysis.exit_code) {
      say(`re-running the ${analysis.scenario} command exited ${again.exit_code} and the `
        + `study records ${analysis.exit_code}.`);
    }
  }

  const results = disqualify(deriveResults(manifest.analyses), unfit);
  // An empty set is not an audited set. `every` over nothing is true, so a study
  // whose scorer refused to score it would have reported the same word as one
  // that scored clean, and that word is the one a citation check reads.
  const count = Object.keys(results).length;
  const audit = count === 0
    ? 'no figure derives from it'
    : (Object.values(results).every((r) => r.audited) ? 'audited' : 'UNAUDITED');
  const stopped = Object.entries(unfit).map(([arm, why]) => `${arm} ${why}`);
  return {
    problems,
    results,
    summary: `${name}: ${count} result(s) derived, ${audit}, arms: `
      + `${(manifest.arms ?? []).map((a) => a?.arm).join(', ') || 'none'}`
      + (stopped.length ? `. Not scorable: ${stopped.join('; ')}` : ''),
  };
}

/**
 * Every file under a study, and every entry that is not one.
 *
 * The classification comes from `destinationState`, the same answer
 * `bench/retain.mjs` asks of a source file before it copies one. Filtering on
 * `isFile()` and dropping the rest let a symbolic link inside a promoted study
 * escape the scan entirely, and a link's target string is committed content
 * like any other byte. So an entry that is neither a directory nor a plain file
 * is REFUSED by name rather than skipped.
 */
export async function walkStudy(dir, base = '') {
  const files = [];
  const problems = [];
  let names;
  try {
    names = (await fs.readdir(dir)).sort();
  } catch {
    return { files, problems };
  }
  for (const nm of names) {
    const rel = base ? `${base}/${nm}` : nm;
    const state = await destinationState(path.join(dir, nm));
    if (state === 'directory') {
      const below = await walkStudy(path.join(dir, nm), rel);
      files.push(...below.files);
      problems.push(...below.problems);
    } else if (state === 'file') {
      files.push(rel);
    } else {
      problems.push(`${rel} is a ${state}, and a study holds only plain files.`);
    }
  }
  return { files: files.sort(), problems };
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
