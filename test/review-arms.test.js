// The review arms, built without buying one.
//
// `bench/review-arms.mjs` spends nothing: it rebuilds the diff each reviewer
// read, writes a scenario file, and prints the commands a person then runs.
// `git` is injected here, so the whole sequence runs against a fixture and no
// object store. That is the shape `runArms` already uses in the probe
// collector, and for the same reason — a sequence a test cannot reach is a
// sequence nobody has watched refuse anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NAME } from '../bench/arm-manifest.mjs';
import {
  BASELINE_ARM, CONTRACT, FRAMING, TREATMENT_ARM, buildScenarios, parseArgs, plan,
  selectionTag, writeScenario,
} from '../bench/review-arms.mjs';

const SHA = 'a'.repeat(40);

const thread = (over = {}) => ({
  id: 1,
  path: 'bench/probe.mjs',
  side: 'RIGHT',
  line: null,
  original_line: 437,
  start_line: null,
  original_start_line: null,
  commit_id: SHA,
  original_commit_id: SHA,
  author: 'a-reviewer',
  body: 'The flag is read before the duplicate.',
  replies: [{ id: 2, author: 'maintainer', body: '```review-verdict\nverdict: ACCEPTED\n```\n' }],
  ...over,
});

const record = (pr = 118, over = {}) => ({
  kind: 'verdict-record',
  identity: {
    repo: 'rookslog/stylewright',
    pr,
    base_sha: 'b'.repeat(40),
    head_sha: 'c'.repeat(40),
    merge_commit_sha: 'd'.repeat(40),
    merged_at: '2026-08-14T22:01:43Z',
  },
  mined_at: '2026-08-16T00:00:00Z',
  rounds: [{ round: 1, scenario: `pr-${pr}-r1`, review_commit: SHA, threads: [thread()] }],
  ...over,
});

const held = (pr = 118) => [{ name: `pr-${pr}.json`, record: record(pr) }];

const gitReturning = (stdout, over = {}) => async () => ({
  timed_out: false, exit_code: 0, stdout, stderr: '', ...over,
});

const DIFF = 'diff --git a/bench/probe.mjs b/bench/probe.mjs\n+  const seen = new Set();\n';

test('a scenario is the framing above the diff of the commit the reviewer read', async () => {
  const calls = [];
  const git = async (args) => {
    calls.push(args);
    return { timed_out: false, exit_code: 0, stdout: DIFF, stderr: '' };
  };
  const { scenarios, problems, refusals } = await buildScenarios(held(), git);
  assert.deepEqual(problems, []);
  assert.deepEqual(refusals, []);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].scenario, 'pr-118-r1');
  assert.equal(scenarios[0].prompt, `${FRAMING}${DIFF}`);
  assert.equal(scenarios[0].confirmed, 1);
  // Three dots, so git computes the merge base and reproduces the pull
  // request's own diff rather than a two-commit comparison.
  assert.deepEqual(calls, [['diff', `${'b'.repeat(40)}...${SHA}`]]);
});

test('the framing is bare, because it is the control arm\'s entire guidance', () => {
  assert.equal(FRAMING.trim(), 'Review this diff for defects.');
});

test('a clone missing the reviewed commit is refused, and the fetch is named', async () => {
  const { scenarios, refusals } = await buildScenarios(held(),
    gitReturning('', { exit_code: 128, stderr: 'bad object' }));
  assert.equal(scenarios.length, 0);
  assert.match(refusals.join(' '), /git fetch origin refs\/pull\/118\/head/);
});

test('a git run that never returns is killed and refused by name', async () => {
  const { refusals } = await buildScenarios(held(), gitReturning('', { timed_out: true }));
  assert.match(refusals.join(' '), /did not finish inside/);
});

test('a diff carrying operator configuration is refused before anything is paid for', async () => {
  // Measured on the real corpus: three of five rounds refuse here, because the
  // diffs under study carry this scan's own test fixtures. ADR-0032 records it.
  const { scenarios, refusals } = await buildScenarios(held(),
    gitReturning('+  const home = "/Users/someone/notes.md";\n'));
  assert.equal(scenarios.length, 0);
  assert.match(refusals.join(' '), /home directory/);
});

test('a diff carrying a credential is refused, and the bytes are not quoted back', async () => {
  const { refusals } = await buildScenarios(held(),
    gitReturning('+  const key = "sk-ant-oat01-abcdefghijkl";\n'));
  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /credential/);
  assert.ok(!refusals[0].includes('abcdefghijkl'));
});

test('a refused round is separate from a corpus this file cannot read', async () => {
  // One is a corpus decision and the rest still build. The other is a corpus
  // `check:verdicts` would refuse too, so nothing is built at all.
  const bad = [{ name: 'pr-1.json', record: { kind: 'probe' } }];
  const { scenarios, problems, refusals } = await buildScenarios(bad, gitReturning(DIFF));
  assert.equal(scenarios.length, 0);
  assert.equal(refusals.length, 0);
  assert.match(problems.join(' '), /kind must be "verdict-record"/);
});

// --- the selection ----------------------------------------------------------

test('a run builds the pull requests it named, and no others', async () => {
  const records = [...held(112), ...held(118)];
  const { scenarios } = await buildScenarios(records, gitReturning(DIFF), [112]);
  assert.deepEqual(scenarios.map((s) => s.scenario), ['pr-112-r1']);
});

test('a named pull request the corpus does not hold is refused, never skipped', async () => {
  const { problems, scenarios } = await buildScenarios(held(118), gitReturning(DIFF), [118, 999]);
  assert.equal(scenarios.length, 1);
  assert.match(problems.join(' '), /--pr 999 names a pull request this corpus does not hold/);
});

test('a corpus that does not check out is reported whether or not the run asked for it', async () => {
  const records = [{ name: 'pr-1.json', record: { kind: 'probe' } }, ...held(118)];
  const { problems } = await buildScenarios(records, gitReturning(DIFF), [118]);
  assert.match(problems.join(' '), /kind must be "verdict-record"/);
});

test('the selection is a list of numbers, and each is named once', () => {
  assert.deepEqual(parseArgs(['--pr', '112', '--pr', '118']).prs, [112, 118]);
  assert.equal(parseArgs(['--plan']).prs, null);
  assert.throws(() => parseArgs(['--pr', '112', '--pr', '112']), /selected once/);
  assert.throws(() => parseArgs(['--pr', 'x']), /--pr is a pull request number/);
  // A flag in a value position is a missing value, not a value.
  assert.throws(() => parseArgs(['--pr', '--plan']), /needs a value/);
  assert.throws(() => parseArgs(['--nope', 'x']), /unknown flag/);
});

// --- the plan ---------------------------------------------------------------

const planFor = (tag = '112-118') => plan({
  tag, promptsRel: `bench/review-prompts/${tag}`, verdictsRel: 'bench/verdicts', reps: 5,
}).join('\n');

test('the plan names both arms, and only the treatment carries the contract', () => {
  const text = planFor();
  assert.match(text, new RegExp(`run\\.sh ${BASELINE_ARM}-112-118 `));
  assert.match(text, new RegExp(`run\\.sh ${TREATMENT_ARM}-112-118 .*--system ${CONTRACT}`));
  assert.ok(!new RegExp(`run\\.sh ${BASELINE_ARM}[^\\n]*--system`).test(text),
    'the baseline runs with no injected guidance, or the arms differ by nothing');
  // The promotion retains the ground truth inside the study, because the
  // re-run refuses a path outside it.
  assert.match(text, /--verdicts bench\/verdicts/);
});

test('every arm and directory a plan names carries its selection', () => {
  // Traced before this fix: two selections wrote into one prompt directory, so
  // the second run's plan covered both, the arm covered that larger plan
  // legitimately, and `armState` saw nothing unexpected. ADR-0032 carries the
  // correction. The tag is what keeps two selections apart.
  const first = planFor('112');
  const second = planFor('118');
  assert.match(first, /review-baseline-112 --prompts bench\/review-prompts\/112 /);
  assert.match(second, /review-baseline-118 --prompts bench\/review-prompts\/118 /);
  assert.ok(!first.includes('review-prompts/118') && !second.includes('review-prompts/112'),
    'neither selection can reach the other one\'s scenarios');
  for (const arm of [`${BASELINE_ARM}-112`, `${TREATMENT_ARM}-112`]) {
    assert.ok(NAME.test(arm), `${arm} must be a name the arm manifest accepts`);
  }
});

test('the tag is the sorted pull requests, so the same selection resumes', () => {
  assert.equal(selectionTag([118, 112]), '112-118');
  assert.equal(selectionTag([112, 118]), '112-118');
  assert.equal(selectionTag([118, 118, 112]), '112-118');
});

test('the contract this repository ships is the one the plan names', async () => {
  const root = path.dirname(import.meta.dirname);
  const text = await fs.readFile(path.join(root, CONTRACT), 'utf8');
  assert.match(text, /Findings are your entire output/);
  assert.match(text, /No findings above the bar/);
});

// --- the write --------------------------------------------------------------

test('a scenario an arm may already have answered is never replaced', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-review-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'pr-118-r1.txt');
  await writeScenario(dir, out, 'first');
  await assert.rejects(() => writeScenario(dir, out, 'second'), /never replaced/);
  assert.equal(await fs.readFile(out, 'utf8'), 'first');
});

test('a scenario is written under its own directory and nowhere else', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-review-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => writeScenario(dir, path.join(dir, '..', 'escape.txt'), 'x'),
    /is written under/);
});
