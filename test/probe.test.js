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
  TUPLE, checkRecord, deriveOutcome, isolationProblems, checkDirectory, describe,
} from '../bench/probe.mjs';
import {
  armFlags, parsePathway, plantedText, recordName, treeDigest, writeRecord, ASK,
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
    environment_class: 'pristine',
    stack_digest: null,
  },
  installed: {
    answer: NONCE, model_id: 'claude-opus-4-6-20260514', home: '/tmp/a/home',
    tree_digest: 'abc123', trace: null,
  },
  control: {
    answer: 'NONE', model_id: 'claude-opus-4-6-20260514', home: '/tmp/b/home', trace: null,
  },
  ...over,
});

test('a well-formed record passes and derives a pass', () => {
  assert.deepEqual(checkRecord(record()), []);
  assert.deepEqual(deriveOutcome(record()), {
    discovered: true, control_clean: true, isolated: true, passes: true,
  });
});

test('every element of the identity tuple is required', () => {
  for (const field of TUPLE) {
    if (field === 'stack_digest') continue;
    const identity = { ...record().identity, [field]: '' };
    assert.match(checkRecord(record({ identity })).join(' '), new RegExp(`identity.${field}`));
  }
});

test('a representative stack carries its digest, and a pristine one carries none', () => {
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

test('a pathway names a platform and a scope the engine can install', () => {
  assert.deepEqual(parsePathway('claude:user'), { platform: 'claude', scope: 'user' });
  assert.throws(() => parsePathway('claude'), /Unknown scope/);
  assert.throws(() => parsePathway('emacs:user'), /Unknown platform/);
});

test('the planted text carries the nonce, and the ask never does', () => {
  assert.match(plantedText(NONCE), new RegExp(NONCE));
  assert.equal(ASK.includes(NONCE), false);
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
