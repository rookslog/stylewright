#!/usr/bin/env node
/**
 * The review arms: build the scenario set for issue #109, and print the two
 * invocations that collect it.
 *
 *   node bench/review-arms.mjs --pr 112 --pr 118 --plan
 *   node bench/review-arms.mjs --pr 112 --pr 118 --write
 *
 * **A run names its pull requests, and the corpus rule only says which ones it
 * MAY name.** Eligibility is ADR-0032's sentence: merged, and disposed of in
 * fenced verdict blocks. Selection is this flag, per run, because the arms cost
 * live calls and the operator decides how many to buy before reading anything.
 * `--pr` naming a pull request the corpus does not hold is refused rather than
 * skipped, so a typo cannot quietly shrink a run to a size nobody chose.
 *
 * **This file spends nothing.** It reads the mined corpus, reconstructs the
 * diff each reviewer read, writes one scenario file per round, and prints the
 * commands. Collecting the arms is `bench/run.sh`, which a person runs, because
 * the arms cost live model calls and no program here decides to spend them.
 *
 * A SCENARIO is one review round: the diff from the pull request's base to the
 * commit the reviewer reviewed. That commit is what makes the mined anchors
 * usable. A reviewer wrote `bench/probe.mjs:437` against that tree, so an arm
 * reading that tree names lines from the same file, and the matching rule in
 * `bench/verdicts.mjs` has no version drift to absorb. Reviewing the MERGED
 * diff would have been the obvious choice and the wrong one twice over: the
 * accepted defects are fixed in it, so the ground truth is not there to find,
 * and the anchors point at line numbers that moved. ADR-0032 records it.
 *
 * The two arms differ by one thing. The baseline runs the scenario with no
 * injected guidance. The treatment runs the same scenario with
 * `bench/review-contract.md` appended to the system prompt, which is how this
 * bench has delivered every treatment it has ever measured. `bench/README.md`
 * already states what that costs: these figures measure injection, and never
 * installation.
 *
 * **This file starts one child process, and it is `git`.** The environment is
 * built by name through the allowlist `bench/study.mjs` already exports, so no
 * credential and no home directory reaches it, and it is killed at a deadline.
 * ADR-0023 states that rule for the two spawns that shipped before this one,
 * and a rule that holds in two files and not the third is a rule the next
 * reader applies to whichever file they opened.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationState, ensureDir, isBelow } from '../src/tree.js';
import { chainProblems } from './collect-probe.mjs';
// `commandPath` is the one-separator rule, imported rather than spelled again.
// A second copy is a second thing to drift, and drift here means one surface
// printing a command a shell can read and the other printing one it cannot.
import { commandPath, contentProblems, rerunEnv } from './study.mjs';
import {
  corpusProblems, deriveDispositions, readRecords, recordProblems,
} from './verdicts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

/** The arm-name stems. A run appends its selection tag to each. */
export const BASELINE_ARM = 'review-baseline';
export const TREATMENT_ARM = 'review-compact';

/**
 * The tag that makes a scenario set and its arms belong to ONE selection.
 *
 * Every run used to write into one `review-prompts` directory and plan the same
 * two arm names. Traced: after `--pr 112 --write` then `--pr 118 --write`, that
 * directory holds `pr-112-r1.txt` AND `pr-118-r1.txt`, so `run.sh` derives both
 * scenarios from it, skips the samples the first run already collected, and
 * writes one arm covering both. The arm covers its plan, so it is complete and
 * scorable, and `retain.mjs` then promotes a study larger than the selection —
 * which is precisely the run of a size nobody chose that `--pr` exists to stop.
 *
 * ADR-0032 claimed `armState` caught this, and that claim was wrong: the
 * accumulating prompt directory makes the second run's larger plan legitimate,
 * so nothing is ever unexpected. The tag is the repair, and the ADR now says so.
 *
 * It is the sorted pull-request numbers, so re-running the SAME selection still
 * resumes an interrupted arm, which is the half of resuming worth keeping.
 */
export const selectionTag = (prs) => [...new Set(prs)].sort((a, b) => a - b).join('-');

/** The treatment, at a fixed path, so the printed command cannot drift from it. */
export const CONTRACT = 'bench/review-contract.md';

/**
 * The framing both arms read, above the diff.
 *
 * It is deliberately bare. It is the control's ENTIRE guidance, so anything
 * more here is guidance the treatment would then be measured on top of, and the
 * one-variable rule would be gone before the first call. The shape belongs to
 * the treatment and to nothing else.
 */
export const FRAMING = 'Review this diff for defects.\n\n';

/** How long `git` may take on one diff before it is killed, in milliseconds. */
export const GIT_TIMEOUT_MS = 60_000;

/**
 * One `git` run, with its environment built by name and a deadline on it.
 *
 * The shape is `rerun` in `bench/study.mjs`, and the allowlist is that file's,
 * imported rather than copied. `git diff` between two commits reads the object
 * store and nothing else, so `PATH` is the whole of what it needs here.
 */
export function runGit(args, { cwd = REPO, timeoutMs = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd, env: rerunEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const errs = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref?.();
    const done = (result) => {
      clearTimeout(timer);
      resolve({ timed_out: timedOut, ...result });
    };
    const text = (chunks) => Buffer.concat(chunks).toString('utf8');
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => errs.push(d));
    child.on('error', (e) => done({ exit_code: -1, stdout: '', stderr: e.message }));
    child.on('close', (code) => done({
      exit_code: code ?? -1, stdout: text(out), stderr: text(errs),
    }));
  });
}

/**
 * The scenarios a corpus supports, with the two kinds of bad news kept apart.
 *
 * `problems` is a corpus this file cannot read. `check:verdicts` would refuse
 * the same bytes, so nothing is built at all and a person fixes the corpus.
 *
 * `refusals` are per SCENARIO, and they are ordinary. A round whose objects are
 * not in this clone, and a diff carrying something this repository will not
 * commit, are both corpus decisions rather than faults — so the rest are built
 * and the refusal is named. `bench/mine-verdicts.mjs` disposes of a pull request
 * the same way, and for the same reason: a refusal an operator can read is
 * worth more than a run that stops at the first one.
 *
 * `git` is a parameter so a test drives the whole sequence without an object
 * store. `runArms` in the probe collector is shaped this way for the same
 * reason: a sequence a test cannot reach is a sequence nobody has watched
 * refuse anything.
 */
export async function buildScenarios(records, git = runGit, select = null) {
  const scenarios = [];
  const problems = [];
  const refusals = [];
  const wanted = select ? new Set(select) : null;
  const seen = new Set();
  // The set-level problems, asked here too. A duplicated or misnamed record
  // makes the ground truth wrong for every scenario built from it, and this
  // file selects commits and writes prompts from the same bytes the scorer
  // will later score against.
  problems.push(...corpusProblems(records));
  for (const { name, record, unreadable, state } of records) {
    if (unreadable) {
      problems.push(state && state !== 'file'
        ? `${name}: is a ${state}, and a record is a plain file.`
        : `${name}: not readable as JSON.`);
      continue;
    }
    const found = recordProblems(record, name);
    if (found.length) {
      problems.push(...found);
      continue;
    }
    seen.add(record.identity.pr);
    // The selection is applied AFTER the record checks out, so a corpus this
    // file cannot read is reported whether or not the run asked for it. A
    // broken record nobody selected is still a broken corpus.
    if (wanted && !wanted.has(record.identity.pr)) continue;
    const confirmed = new Map();
    for (const d of deriveDispositions(record)) {
      if (d.confirms) confirmed.set(d.scenario, (confirmed.get(d.scenario) ?? 0) + 1);
    }
    for (const round of record.rounds) {
      const range = `${record.identity.base_sha}...${round.review_commit}`;
      const run = await git(['diff', range]);
      if (run.timed_out) {
        refusals.push(`${round.scenario}: git diff ${range} did not finish inside `
          + `${GIT_TIMEOUT_MS}ms, so it was killed.`);
        continue;
      }
      if (run.exit_code !== 0 || !run.stdout.trim()) {
        // The commit the reviewer read is on a branch the merge may have left
        // unreachable, so a clone that never fetched the pull request ref has
        // the record and not the objects. Naming the fetch is the difference
        // between a refusal a person can act on and one they have to diagnose.
        refusals.push(`${round.scenario}: git could not diff ${range}. Fetch the pull `
          + `request first: git fetch origin refs/pull/${record.identity.pr}/head`);
        continue;
      }
      const prompt = `${FRAMING}${run.stdout}`;
      // The scenario file is promoted into a committed study, so it answers to
      // the scan every other retained byte answers to, before it is written
      // rather than after a person has paid for the arm.
      //
      // Measured on this corpus, and it is not a hypothetical: three of five
      // rounds are refused here, because the diffs under study are this
      // repository's own and they carry the FIXTURES of this very scan —
      // `sk-ant-oat01-LEAKEDCREDENTIAL0123` in one test, `/Users/someone/` in
      // another. The scan is right and the corpus is smaller. ADR-0032 records
      // it, and redaction is the exit the measurement design already names and
      // nothing here builds.
      const carried = contentProblems(prompt);
      if (carried.length) {
        for (const c of carried) refusals.push(`${round.scenario}: this diff ${c}`);
        continue;
      }
      scenarios.push({
        scenario: round.scenario,
        pr: record.identity.pr,
        range,
        prompt,
        confirmed: confirmed.get(round.scenario) ?? 0,
      });
    }
  }
  for (const pr of wanted ?? []) {
    if (!seen.has(pr)) {
      problems.push(`--pr ${pr} names a pull request this corpus does not hold. Mine it first, `
        + 'or drop it from the run. A named pull request that silently went missing is a run '
        + 'of a size nobody chose.');
    }
  }
  return { scenarios, problems, refusals };
}

/**
 * Writes one scenario file, through the tree discipline every write surface
 * here inherits. An existing file is refused rather than replaced, because a
 * scenario file a live arm has already answered is the prompt that arm's
 * sidecars are hashed against.
 */
export async function writeScenario(baseDir, outPath, text) {
  if (!isBelow(baseDir, outPath)) {
    throw new Error(`A scenario is written under ${baseDir}, not at ${outPath}.`);
  }
  const baseState = await destinationState(baseDir);
  if (baseState !== 'absent' && baseState !== 'directory') {
    throw new Error(`${baseDir} is a ${baseState}, and nothing is written through one.`);
  }
  await ensureDir(path.dirname(outPath), baseDir);
  const fh = await fs.open(outPath, 'wx').catch(async (err) => {
    if (err.code !== 'EEXIST') throw err;
    const state = await destinationState(outPath);
    throw new Error(`${outPath} already holds a ${state}. A scenario an arm may already have `
      + 'answered is never replaced, because its digest is in that arm\'s sidecars.');
  });
  let identity;
  try {
    identity = await fh.stat();
    await fh.writeFile(text);
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
    throw new Error(`A scenario did not go where it was meant to. ${problems.join(' ')}`);
  }
}

/**
 * The commands that collect and promote these arms, as lines.
 *
 * They are printed rather than run. Every one of them spends the operator's
 * usage or writes into the committed tree, and this file decides neither.
 */
export function plan({ promptsRel, verdictsRel, reps, tag }) {
  // Both the arm names and the scenario directory carry the selection, so a
  // second selection cannot resume the first one's arms or inherit its
  // scenarios. A NAME is letters, digits, dashes and underscores, which the
  // tag satisfies by being numbers joined with dashes.
  const baseline = `${BASELINE_ARM}-${tag}`;
  const treatment = `${TREATMENT_ARM}-${tag}`;
  return [
    `bench/run.sh ${baseline} --prompts ${promptsRel} --reps ${reps}`,
    `bench/run.sh ${treatment} --prompts ${promptsRel} --reps ${reps} --system ${CONTRACT}`,
    `node bench/retain.mjs --study <date>-review-verbosity \\`,
    `  --arm ${baseline} --arm ${treatment} \\`,
    `  --prompts ${promptsRel} --verdicts ${verdictsRel} \\`,
    '  --license-check "what you checked, and against what"',
    'npm run check:studies',
  ];
}

export function parseArgs(argv) {
  const opts = { verdicts: null, out: null, reps: 5, write: false, prs: null };
  const keys = { '--verdicts': 'verdicts', '--out': 'out' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') continue;
    if (arg === '--write') {
      opts.write = true;
      continue;
    }
    if (arg !== '--reps' && arg !== '--pr' && !keys[arg]) throw new Error(`unknown flag: ${arg}`);
    const value = argv[i + 1];
    // A flag in a value position is a missing value, not a value.
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${arg} needs a value, and "${value ?? ''}" is another flag.`);
    }
    i += 1;
    if (arg === '--reps') opts.reps = Number(value);
    else if (arg === '--pr') (opts.prs ??= []).push(Number(value));
    else opts[keys[arg]] = value;
  }
  if (!Number.isInteger(opts.reps) || opts.reps < 1) {
    throw new Error('--reps is the repetition count, as a positive integer.');
  }
  if (opts.prs) {
    if (opts.prs.some((n) => !Number.isInteger(n) || n < 1)) {
      throw new Error('--pr is a pull request number.');
    }
    if (new Set(opts.prs).size !== opts.prs.length) {
      throw new Error('a pull request is selected once, and one was named twice.');
    }
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const verdictsDir = path.resolve(opts.verdicts ?? path.join(HERE, 'verdicts'));
  const outDir = path.resolve(opts.out ?? path.join(HERE, 'review-prompts'));
  const { scenarios, problems, refusals } = await buildScenarios(
    await readRecords(verdictsDir), runGit, opts.prs);
  if (problems.length) {
    process.stderr.write('the verdict corpus does not check out, so nothing is built:\n');
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    return 1;
  }
  for (const r of refusals) process.stderr.write(`refusing ${r}\n`);
  if (!scenarios.length) {
    process.stderr.write(`no scenarios: ${verdictsDir} holds no round this clone can build. `
      + 'Mine one with bench/mine-verdicts.mjs.\n');
    return 1;
  }

  // The tag comes from the pull requests actually BUILT, not from `--pr`. A
  // whole-corpus run carries one too, and a selection whose rounds were refused
  // gets the tag of what it holds rather than of what it asked for — so the
  // directory and the arms always describe the scenarios in them.
  const tag = selectionTag(scenarios.map((s) => s.pr));
  const selectionDir = path.join(outDir, tag);

  // The selection is printed, because it is what the run's size answers to and
  // the plan below spends money proportional to it.
  process.stdout.write(opts.prs
    ? `selection: ${opts.prs.length} pull request(s) named — ${opts.prs.join(', ')}\n`
    : 'selection: every pull request the corpus holds. Name a subset with --pr.\n');
  let bytes = 0;
  for (const s of scenarios) {
    bytes += Buffer.byteLength(s.prompt);
    process.stdout.write(`${s.scenario}: ${Buffer.byteLength(s.prompt)} bytes of diff `
      + `(${s.range}), ${s.confirmed} confirmed finding(s) as ground truth\n`);
    if (opts.write) {
      await writeScenario(outDir, path.join(selectionDir, `${s.scenario}.txt`), s.prompt);
    }
  }
  // The size is printed because the operator is about to pay for it, twice per
  // repetition per arm, and a number in front of that decision is cheaper than
  // a refusal this file would have had to invent a threshold for.
  process.stdout.write(`${scenarios.length} scenario(s), ${bytes} bytes of prompt in total. `
    + `Two arms at ${opts.reps} repetitions is ${scenarios.length * opts.reps * 2} live calls.\n`);
  if (!opts.write) process.stdout.write('Nothing written. Add --write to materialise them.\n');
  process.stdout.write('\n');
  // Spelled with `/` for the reason a retained command is. These lines are
  // commands a person pastes, and `bench/run.sh` is zsh, which reads a
  // backslash as an escape rather than as a separator.
  for (const line of plan({
    tag,
    promptsRel: commandPath(selectionDir),
    verdictsRel: commandPath(verdictsDir),
    reps: opts.reps,
  })) process.stdout.write(`${line}\n`);
  // A refused round is a corpus decision, and the exit status says so rather
  // than letting a shorter scenario set pass as the whole of what was mined.
  if (refusals.length) {
    process.stderr.write(`\n${refusals.length} round(s) refused, and ${scenarios.length} `
      + 'built. A refusal is a corpus decision, not a failure to fix.\n');
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
