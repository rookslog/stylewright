// The isolation probe's record, and what a reader may derive from it.
//
// Two properties carry the design's claims, and each has cases here. A record
// never states its own outcome, so `checkRecord` refuses one and `deriveOutcome`
// computes it from the retained bytes. And the probe runs the control arm's
// exact flag set, so a record collected under any other flags fails the
// acceptance test in section 4.2 of the measurement design.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TUPLE, armAnswered, checkRecord, deriveOutcome, isolationProblems, checkDirectory, describe,
} from '../bench/probe.mjs';
import {
  armFlags, parseArgs, parsePathway, plantNonce, plantedText, recordName, servingBuild,
  treeDigest, tupleModel, writeRecord, ASK,
} from '../bench/collect-probe.mjs';

const NONCE = 'sw-probe-0123456789abcdef';

const record = (over = {}) => ({
  kind: 'isolation-probe',
  date: '2026-08-06',
  skill: 'compressed-deliberation',
  nonce: NONCE,
  ask: ASK,
  flags: armFlags('opus'),
  identity: {
    harness_build: '2.1.220',
    model: 'claude-opus-4-6-20260514',
    platform: 'darwin-arm64',
    pathway: 'claude:user',
    environment_class: 'api-key-empty-home',
    stack_digest: null,
  },
  installed: {
    answer: NONCE, model_id: 'claude-opus-4-6-20260514', is_error: false,
    home: '/tmp/a/home', tree_digest: 'abc123', trace: null,
  },
  control: {
    answer: 'NONE', model_id: 'claude-opus-4-6-20260514', is_error: false,
    home: '/tmp/b/home', trace: null,
  },
  ...over,
});

// One predicate, three consumers. Three review rounds each found the same
// defect at a different consumer — an unserved control, an errored arm, an arm
// with a build and no answer text — because each carried its own idea of what
// a served arm was. These cases are the definition.
test('an arm answered when a build is named, no error was reported, and text came back', () => {
  const answered = {
    model_id: 'claude-opus-4-6-20260514', is_error: false, answer: 'NONE',
  };
  assert.equal(armAnswered(answered), true);
  assert.equal(armAnswered({ ...answered, model_id: '' }), false);
  assert.equal(armAnswered({ ...answered, is_error: true }), false);
  assert.equal(armAnswered({ ...answered, answer: '' }), false);
  assert.equal(armAnswered({ ...answered, answer: '   ' }), false);
  // Absent is not the same as false, and a record missing the byte is refused
  // by `checkRecord` rather than read as a successful run here.
  assert.equal(armAnswered({ model_id: 'x', answer: 'y' }), false);
  assert.equal(armAnswered(undefined), false);
});

// The shape `extract.mjs` already calls a failed run: no error, a build, and
// no result text. It made a control look clean by saying nothing at all.
test('an arm with a build and no answer text cannot clean the control', () => {
  const silent = record();
  silent.control.answer = '';
  assert.equal(deriveOutcome(silent).control_served, false);
  assert.equal(deriveOutcome(silent).control_clean, false);
  assert.equal(deriveOutcome(silent).passes, false);
});

test('the tuple model comes from an arm that answered, never from an errored one', () => {
  const answered = { model_id: 'served-build', is_error: false, answer: 'NONE' };
  const errored = { model_id: 'errored-build', is_error: true, answer: 'boom' };
  assert.equal(tupleModel(errored, answered), 'served-build');
  assert.equal(tupleModel(answered, errored), 'served-build');
  assert.equal(tupleModel(errored, errored), '');
});

test('a record whose only build came from an errored arm names no build', () => {
  const both = record();
  both.installed.is_error = true;
  both.control.is_error = true;
  both.identity.model = 'claude-opus-4-6-20260514';
  assert.match(checkRecord(both).join(' '), /identity.model names a build, and no arm reports one/);
});

test('a well-formed record passes and derives a pass', () => {
  assert.deepEqual(checkRecord(record()), []);
  assert.deepEqual(deriveOutcome(record()), {
    installed_served: true,
    control_served: true,
    discovered: true,
    control_clean: true,
    isolated: true,
    passes: true,
  });
});

test('every element of the identity tuple is required', () => {
  for (const field of TUPLE) {
    if (field === 'stack_digest') continue;
    const identity = { ...record().identity, [field]: '' };
    assert.match(checkRecord(record({ identity })).join(' '), new RegExp(`identity.${field}`));
  }
});

test('a representative stack carries its digest, and an empty home carries none', () => {
  const rep = record({ identity: { ...record().identity, environment_class: 'representative' } });
  assert.match(checkRecord(rep).join(' '), /representative stack records its committed stack digest/);
  const ok = record({
    identity: { ...record().identity, environment_class: 'representative', stack_digest: 'd00d' },
  });
  assert.deepEqual(checkRecord(ok), []);
  const pristine = record({ identity: { ...record().identity, stack_digest: 'd00d' } });
  assert.match(checkRecord(pristine).join(' '), /only a representative stack/);
});

test('a record that states its own outcome is refused, at any depth', () => {
  assert.match(checkRecord(record({ outcome: 'pass' })).join(' '), /outcome states an outcome/);
  const nested = record();
  nested.installed.verdict = 'discovered';
  assert.match(checkRecord(nested).join(' '), /installed.verdict states an outcome/);
});

test('an outcome inside an array is refused too, one container further down', () => {
  const listed = record({ attempts: [{ at: '2026-08-06', pass: true }] });
  assert.match(checkRecord(listed).join(' '), /states an outcome/);
});

test('an ask carrying the nonce is refused, because a repeat would prove nothing', () => {
  const bad = record({ ask: `Repeat ${NONCE} back to me.` });
  assert.match(checkRecord(bad).join(' '), /the ask carries the nonce/);
});

test('the arms must be served by the same build, and by the one the tuple names', () => {
  const split = record();
  split.control.model_id = 'claude-sonnet-4-6-20260514';
  assert.match(checkRecord(split).join(' '), /served by different builds/);
  const wrong = record({ identity: { ...record().identity, model: 'claude-haiku-4-6' } });
  assert.match(checkRecord(wrong).join(' '), /identity.model disagrees/);
});

// Observed on 2026-08-06: a redirected home carries no credentials, so the
// harness answered "Not logged in · Please run /login" on both arms and named
// no build. That is a probe that failed, and the design keeps a failure as a
// result. A check that refused the record would lose it.
test('a probe the harness never served is a valid record that derives a failure', () => {
  const refused = record({ identity: { ...record().identity, model: '' } });
  refused.installed.answer = 'Not logged in · Please run /login';
  refused.installed.model_id = '';
  refused.control.answer = 'Not logged in · Please run /login';
  refused.control.model_id = '';
  assert.deepEqual(checkRecord(refused), []);
  assert.equal(deriveOutcome(refused).discovered, false);
  assert.equal(deriveOutcome(refused).passes, false);
});

// The installed arm can fail while the control succeeds. The tuple element
// comes from whichever arm a build served, so that ordinary failed probe stays
// the valid failure result the protocol keeps.
test('a failed installed arm beside a served control is still a valid record', () => {
  const half = record();
  half.installed.answer = '';
  half.installed.model_id = '';
  half.installed.is_error = true;
  assert.deepEqual(checkRecord(half), []);
  assert.equal(deriveOutcome(half).installed_served, false);
  assert.equal(deriveOutcome(half).control_served, true);
  assert.equal(deriveOutcome(half).passes, false);
});

test('a record naming a build no arm reports is refused', () => {
  const bad = record();
  bad.installed.model_id = '';
  bad.control.model_id = '';
  assert.match(checkRecord(bad).join(' '), /identity.model names a build, and no arm reports one/);
});

test('the control installs nothing, so it records no tree', () => {
  const bad = record();
  bad.control.tree_digest = 'abc123';
  assert.match(checkRecord(bad).join(' '), /control installs nothing/);
});

test('the flags are the control arm\'s, and any other surface is refused', () => {
  assert.deepEqual(isolationProblems(armFlags('opus')), []);
  assert.match(
    isolationProblems(['-p', '--setting-sources', 'user', '--strict-mcp-config']).join(' '),
    /--setting-sources carried "user"/);
  assert.match(
    isolationProblems(['-p', '--setting-sources', '', '--strict-mcp-config',
      '--dangerously-skip-permissions']).join(' '),
    /--dangerously-skip-permissions is not a flag the control arm runs/);
  assert.match(isolationProblems(['-p', '--setting-sources', '']).join(' '),
    /omit --strict-mcp-config/);
});

// The harness obeys the LAST spelling of a repeated flag, so a check reading
// the first one accepts a record whose arm ran with the operator's config open.
test('a repeated flag is refused, and every occurrence is read', () => {
  const twice = ['-p', '--setting-sources', '', '--strict-mcp-config',
    '--setting-sources', 'user'];
  const problems = isolationProblems(twice).join(' ');
  assert.match(problems, /--setting-sources appears twice/);
  assert.match(problems, /--setting-sources carried "user"/);
  assert.equal(deriveOutcome({ nonce: 'x', flags: twice }).isolated, false);
});

// A control that never ran and a control that ran clean have the same empty
// answer. Reading the second from the first hands a passing probe the very
// comparison it exists to make.
// A run can report an error and still carry answer text and a serving build.
// Two failed invocations then read as a comparison, and if the failed installed
// text happened to hold the nonce the probe derived a pass.
test('an arm the harness reported as failed is not a served arm', () => {
  const errored = record();
  errored.installed.is_error = true;
  assert.deepEqual(checkRecord(errored), []);
  assert.equal(deriveOutcome(errored).installed_served, false);
  assert.equal(deriveOutcome(errored).discovered, false);
  assert.equal(deriveOutcome(errored).passes, false);
  const both = record();
  both.installed.is_error = true;
  both.control.is_error = true;
  assert.equal(deriveOutcome(both).control_clean, false);
});

test('a record with no failure byte is refused, because the byte is the evidence', () => {
  const silent = record();
  delete silent.installed.is_error;
  assert.match(checkRecord(silent).join(' '), /installed.is_error records whether/);
});

test('a stray positional is refused, not skipped', () => {
  const stray = ['-p', 'extra-prompt', '--model', 'opus', '--setting-sources', '',
    '--strict-mcp-config', '--output-format', 'json'];
  assert.match(isolationProblems(stray).join(' '),
    /"extra-prompt" at position 1 is not part of the control arm's invocation/);
  assert.equal(deriveOutcome({ ...record(), flags: stray }).isolated, false);
});

test('a value-taking flag with no value is refused', () => {
  assert.match(isolationProblems(['-p', '--model', '--setting-sources', '',
    '--strict-mcp-config', '--output-format', 'json']).join(' '), /--model carries no value/);
  assert.match(isolationProblems(['-p', '--model', 'opus', '--setting-sources', '',
    '--strict-mcp-config', '--output-format']).join(' '), /--output-format carries no value/);
});

test('a control that no build served does not count as a clean control', () => {
  const dead = record();
  dead.control.answer = '';
  dead.control.model_id = '';
  const outcome = deriveOutcome(dead);
  assert.equal(outcome.control_served, false);
  assert.equal(outcome.control_clean, false);
  assert.equal(outcome.passes, false);
  assert.match(describe('r.json', dead), /control_served=false/);
});

test('an installed arm that no build served has discovered nothing', () => {
  const dead = record();
  dead.installed.answer = NONCE;
  dead.installed.model_id = '';
  dead.control.model_id = '';
  assert.equal(deriveOutcome(dead).discovered, false);
});

test('the flag set must be complete, not merely free of strangers', () => {
  assert.match(isolationProblems(['-p', '--setting-sources', '', '--strict-mcp-config',
    '--output-format', 'json']).join(' '), /flags omit --model/);
  assert.match(isolationProblems(['-p', '--model', 'opus', '--setting-sources', '',
    '--strict-mcp-config']).join(' '), /flags omit --output-format/);
  assert.match(isolationProblems(['-p', '--model', 'opus', '--setting-sources', '',
    '--strict-mcp-config', '--output-format', 'text']).join(' '),
  /--output-format carried "text"/);
});

test('a record carrying anything shaped like an api key is refused', () => {
  const leaked = record();
  leaked.installed.stderr = 'env had sk-ant-api03-AAAABBBBCCCC';
  const problems = checkRecord(leaked).join(' ');
  assert.match(problems, /looks like an API key/);
  assert.equal(problems.includes('sk-ant-api03-AAAABBBBCCCC'), false);
});

test('a probe run outside the isolation flags derives a failure', () => {
  const loose = record({ flags: ['-p', '--setting-sources', 'user', '--strict-mcp-config'] });
  const outcome = deriveOutcome(loose);
  assert.equal(outcome.isolated, false);
  assert.equal(outcome.passes, false);
  assert.equal(outcome.discovered, true);
});

test('a control that repeats the nonce derives a failure, whatever the installed arm said', () => {
  const leaky = record();
  leaky.control.answer = `The nonce is ${NONCE}.`;
  const outcome = deriveOutcome(leaky);
  assert.equal(outcome.control_clean, false);
  assert.equal(outcome.passes, false);
});

test('an installed arm that never repeats the nonce derives a failure', () => {
  const quiet = record();
  quiet.installed.answer = 'NONE';
  assert.equal(deriveOutcome(quiet).discovered, false);
  assert.equal(deriveOutcome(quiet).passes, false);
});

test('the derived line names the whole tuple, so a reader can match a study to it', () => {
  const line = describe('probe.json', record());
  for (const field of TUPLE) assert.match(line, new RegExp(`${field}=`));
  assert.match(line, /derives PASS/);
});

test('a directory of records reports every problem in one pass', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-probes-'));
  await fs.writeFile(path.join(dir, 'good.json'), JSON.stringify(record()));
  await fs.writeFile(path.join(dir, 'bad.json'), JSON.stringify(record({ date: 'today' })));
  await fs.writeFile(path.join(dir, 'torn.json'), '{ not json');
  const { problems, lines } = await checkDirectory(dir);
  assert.equal(lines.length, 1);
  assert.match(problems.join(' '), /bad.json: date is YYYY-MM-DD/);
  assert.match(problems.join(' '), /torn.json: not readable as JSON/);
});

test('a missing probe directory holds no records and reports no problem', async () => {
  const { problems, lines } = await checkDirectory(path.join(os.tmpdir(), 'sw-absent-probes'));
  assert.deepEqual(problems, []);
  assert.deepEqual(lines, []);
});

test('a pathway names a platform and a scope, and the harness that reads it', () => {
  assert.deepEqual(parsePathway('claude:user'),
    { platform: 'claude', scope: 'user', harness: 'claude' });
  assert.throws(() => parsePathway('claude'), /A pathway is <platform>:<scope>/);
  assert.throws(() => parsePathway('claude:sideways'), /Unknown scope/);
  assert.throws(() => parsePathway('emacs:user'), /Unknown platform/);
  // A third component installed and paid for two live calls as `claude:user`
  // while the record kept the malformed string.
  assert.throws(() => parsePathway('claude:user:sub/record'),
    /A pathway is <platform>:<scope>/);
  // Installing into `.codex/skills` and then asking Claude Code about it would
  // attribute one harness's answer to the other pathway.
  assert.throws(() => parsePathway('codex:user'), /needs its own runner/);
});

test('a flag in a value position is a missing value, not a value', () => {
  assert.throws(() => parseArgs(['--skill', '--dry-run', '--pathway', 'claude:user']),
    /--skill needs a value/);
  assert.throws(() => parseArgs(['--skill', 'a', '--pathway']), /--pathway needs a value/);
  assert.deepEqual(parseArgs(['--skill', 'a', '--pathway', 'claude:user', '--dry-run']),
    { model: 'opus', dryRun: true, skill: 'a', pathway: 'claude:user' });
});

test('a tie in the model usage names no build, the way extract.mjs refuses one', () => {
  assert.equal(servingBuild({ a: { outputTokens: 9 }, b: { outputTokens: 4 } }), 'a');
  assert.equal(servingBuild({ a: { outputTokens: 9 }, b: { outputTokens: 9 } }), '');
  assert.equal(servingBuild({}), '');
});

test('the planted text carries the nonce, and the ask never does', () => {
  assert.match(plantedText(NONCE), new RegExp(NONCE));
  assert.equal(ASK.includes(NONCE), false);
});

test('the nonce lands in the installed SKILL.md', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  await fs.writeFile(path.join(dir, 'SKILL.md'), '# A skill\n');
  await plantNonce(dir, NONCE);
  assert.match(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'), new RegExp(NONCE));
});

// `appendFile` resolves the path, so a SKILL.md swapped for a link between the
// install and the plant appended the nonce outside the throwaway tree.
test('a SKILL.md that is a symlink is refused, and its target is untouched', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  const skill = path.join(dir, 'skill');
  const outside = path.join(dir, 'outside.md');
  await fs.mkdir(skill);
  await fs.writeFile(outside, 'someone else\n');
  await fs.symlink(outside, path.join(skill, 'SKILL.md'));
  await assert.rejects(plantNonce(skill, NONCE), /symbolic link|is a symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'someone else\n');
});

test('a missing SKILL.md is refused rather than created', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  await assert.rejects(plantNonce(dir, NONCE), /SKILL.md is missing/);
});

test('the tree digest names contents, so an edit inside the tree moves it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-tree-'));
  await fs.writeFile(path.join(dir, 'SKILL.md'), '# A skill\n');
  const before = await treeDigest(dir);
  await fs.appendFile(path.join(dir, 'SKILL.md'), plantedText(NONCE));
  assert.notEqual(await treeDigest(dir), before);
});

test('a record is written once, and never over an existing file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-write-'));
  const name = recordName({ date: '2026-08-06', pathway: 'claude:user', nonce: NONCE });
  const out = path.join(dir, name);
  await writeRecord(out, record(), dir);
  assert.deepEqual(checkRecord(JSON.parse(await fs.readFile(out, 'utf8'))), []);
  await assert.rejects(writeRecord(out, record(), dir), /never replaced/);
});

test('a record path outside the probe directory is refused', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-write-'));
  await assert.rejects(
    writeRecord(path.join(dir, '..', 'escape.json'), record(), dir),
    /written under/);
});

// `ensureDir` compares paths BELOW the base and never the base itself, so a
// symlinked probe directory was walked through rather than refused, and the
// exclusive write landed in whatever the link pointed at.
test('a symlinked record directory is refused, and nothing is written through it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-link-'));
  const real = path.join(root, 'elsewhere');
  const link = path.join(root, 'probes');
  await fs.mkdir(real);
  await fs.symlink(real, link);
  await assert.rejects(
    writeRecord(path.join(link, 'r.json'), record(), link), /never written through one/);
  assert.deepEqual(await fs.readdir(real), []);
});
