// The isolation probe's record, and what a reader may derive from it.
//
// Two properties carry the design's claims, and each has cases here. A record
// never states its own outcome, so `checkRecord` refuses one and `deriveOutcome`
// computes it from the retained bytes. And the probe runs a probe arm's exact
// flag set, so a record collected under any other flags fails the acceptance
// test in section 4.2 of the measurement design.

import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TUPLE, ENV_CLASSES, armAnswered, checkRecord, deriveOutcome, isolationProblems, checkDirectory,
  describe, redact, summarise, traceProblems, loadCounts, traceAgrees, traceReading,
  managedSeen, sourceCount, TRACE_LINE_LIMIT,
  REQUIRED_FLAGS, FIXED_VALUES, FLAGS_TAKING_A_VALUE, TRACE_FLAG, flagShapeProblems,
} from '../bench/probe.mjs';
import {
  armEnv, armFlags, authRoute, buildRecord, chainProblems, openFailure, parseArgs, unmodelledCredentials,
  parsePathway, plantFlags, plantInDescription, plantNonce, plantedSentence, readRun, recordName,
  servingBuild, skillTraceLines, readTrace, debugPath, runArms,
  treeDigest, tupleModel, writeRecord, ASK, AUTH_ROUTES,
} from '../bench/collect-probe.mjs';

const NONCE = 'sw-probe-0123456789abcdef';

/**
 * Can this machine create a symbolic link at all? Windows refuses one to an
 * unprivileged account, so the two link tests below would fail there for a
 * reason that has nothing to do with what they check.
 */
const canSymlink = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-caps-'));
  try {
    await fs.writeFile(path.join(dir, 'target'), 'x');
    await fs.symlink(path.join(dir, 'target'), path.join(dir, 'link'));
    return true;
  } catch {
    return false;
  }
};
const NO_SYMLINKS = 'this machine refuses to create a symbolic link, so the swap cannot be set up';

const record = (over = {}) => ({
  kind: 'isolation-probe',
  date: '2026-08-06',
  skill: 'compressed-deliberation',
  nonce: NONCE,
  ask: ASK,
  flags: armFlags('opus'),
  auth_route: 'api-key',
  identity: {
    harness_build: '2.1.220',
    model: 'claude-opus-4-6-20260514',
    platform: 'darwin-arm64',
    pathway: 'claude:user',
    environment_class: 'empty-home',
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

// The predicate's third condition narrowed this check when it was first
// introduced: an installed arm on one build and a control on another that
// returned no text reported nothing, and the record committed a tuple naming
// one of the two builds that ran. Build disagreement is about which builds
// touched the probe, not about which ones answered.
test('two builds are reported even when one of the arms returned no text', () => {
  const mixed = record();
  mixed.control.model_id = 'claude-sonnet-4-6-20260514';
  mixed.control.answer = '';
  const problems = checkRecord(mixed).join(' ');
  assert.match(problems, /the arms ran on different builds/);
  assert.match(problems, /claude-sonnet-4-6-20260514/);
});

test('an errored arm does not raise a build disagreement on its own', () => {
  const errored = record();
  errored.control.model_id = 'claude-sonnet-4-6-20260514';
  errored.control.is_error = true;
  assert.deepEqual(checkRecord(errored), []);
});

test('a record whose only build came from an errored arm names no build', () => {
  const both = record();
  both.installed.is_error = true;
  both.control.is_error = true;
  both.identity.model = 'claude-opus-4-6-20260514';
  const problems = checkRecord(both).join(' ');
  assert.match(problems, /no arm answered, so nothing served this probe/);
  assert.match(problems, /Drop the element rather than editing the arms/);
});

test('a well-formed record passes and derives a pass', () => {
  assert.deepEqual(checkRecord(record()), []);
  assert.deepEqual(deriveOutcome(record()), {
    installed_served: true,
    control_served: true,
    discovered: true,
    control_clean: true,
    isolated: true,
    // No trace, so no reading. Absence is a state, and it is the state every
    // record written before 2026-08-07 carries. `trace_withheld` names it, so a
    // reader tells it from a reading this check refused to certify.
    trace_agrees: null,
    trace_withheld: 'absent',
    managed_seen: null,
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
  assert.match(checkRecord(split).join(' '), /the arms ran on different builds/);
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

test('a record naming a build no arm answered is refused', () => {
  const bad = record();
  bad.installed.model_id = '';
  bad.control.model_id = '';
  assert.match(checkRecord(bad).join(' '), /no arm answered, so nothing served this probe/);
});

test('the control installs nothing, so it records no tree', () => {
  const bad = record();
  bad.control.tree_digest = 'abc123';
  assert.match(checkRecord(bad).join(' '), /control installs nothing/);
});

// The flag set moved on 2026-08-07, on measurement. `--setting-sources ''`
// suppresses the user SKILL directory as well as the settings, so the old
// acceptance test asked its question in a configuration with skills switched
// off. A probe home is a throwaway empty one, so `user` admits nothing but the
// installed tree. ADR-0024.
test('the flags are the probe arm\'s, and any other surface is refused', () => {
  assert.deepEqual(isolationProblems(armFlags('opus')), []);
  assert.ok(armFlags('opus').includes('user'));
  // The old spelling is now the refused one, in both directions.
  assert.match(
    isolationProblems(['-p', '--setting-sources', '', '--strict-mcp-config']).join(' '),
    /--setting-sources carried ""/);
  assert.match(
    isolationProblems(['-p', '--setting-sources', 'user', '--strict-mcp-config',
      '--dangerously-skip-permissions']).join(' '),
    /--dangerously-skip-permissions is not a flag a probe arm runs/);
  assert.match(isolationProblems(['-p', '--setting-sources', 'user']).join(' '),
    /omit --strict-mcp-config/);
});

// The harness obeys the LAST spelling of a repeated flag, so a check reading
// the first one accepts a record whose arm ran with the operator's config open.
test('a repeated flag is refused, and every occurrence is read', () => {
  // The dangerous direction inverted with the flag set. It is now a record that
  // opens with the probe's spelling and repeats it as `''`, whose arm therefore
  // ran with the user skill source switched off.
  const twice = ['-p', '--setting-sources', 'user', '--strict-mcp-config',
    '--setting-sources', ''];
  const problems = isolationProblems(twice).join(' ');
  assert.match(problems, /--setting-sources appears twice/);
  assert.match(problems, /--setting-sources carried ""/);
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
    /"extra-prompt" at position 1 is not part of a probe arm's invocation/);
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

// Fake-shaped strings only. No real credential is ever handled here, and the
// refusal must not quote back whatever it matched.
test('a record carrying anything shaped like a credential is refused, by either route', () => {
  for (const fake of ['sk-ant-api03-AAAABBBBCCCC', 'sk-ant-oat01-DDDDEEEEFFFF']) {
    const leaked = record();
    leaked.installed.stderr = `the environment held ${fake}`;
    const problems = checkRecord(leaked).join(' ');
    assert.match(problems, /looks like a credential/);
    assert.equal(problems.includes(fake), false, 'the refusal must not quote the match');
  }
});

// The collector's own side of the route. The check requiring `auth_route` says
// nothing about whether anything writes it, and the assembly lived where no
// test could reach it without paying for two live calls.
test('the assembled record carries the route that served it', () => {
  const arm = (over = {}) => ({
    answer: 'NONE', model_id: 'claude-opus-4-6-20260514', is_error: false,
    home: '/tmp/h', stderr: '', ...over,
  });
  const built = buildRecord({
    date: '2026-08-06',
    skill: 'compressed-deliberation',
    nonce: NONCE,
    pathway: 'claude:user',
    flags: armFlags('opus'),
    route: 'subscription',
    build: '2.1.222',
    installedArm: arm({ answer: NONCE }),
    controlArm: arm(),
    treeDigest: 'abc123',
  });
  assert.equal(built.auth_route, 'subscription');
  assert.deepEqual(checkRecord(built), []);
  assert.equal(deriveOutcome(built).passes, true);
  // The credential itself is not among the bytes, whatever the route.
  assert.equal(/sk-ant-/.test(JSON.stringify(built)), false);
});

test('a record names the route it authenticated by', () => {
  assert.deepEqual(checkRecord(record({ auth_route: 'subscription' })), []);
  assert.match(checkRecord(record({ auth_route: 'oauth' })).join(' '), /auth_route names how/);
  const silent = record();
  delete silent.auth_route;
  assert.match(checkRecord(silent).join(' '), /auth_route names how/);
});

// Presence decides the route. The value is never read, so these use strings
// that could not be credentials.
test('the subscription route wins when both variables are set', () => {
  const both = { CLAUDE_CODE_OAUTH_TOKEN: 'fake-token', ANTHROPIC_API_KEY: 'fake-key' };
  assert.equal(authRoute(both), 'subscription');
  assert.equal(authRoute({ ANTHROPIC_API_KEY: 'fake-key' }), 'api-key');
  assert.equal(authRoute({ CLAUDE_CODE_OAUTH_TOKEN: 'fake-token' }), 'subscription');
  assert.equal(authRoute({}), null);
  assert.equal(authRoute({ ANTHROPIC_API_KEY: '' }), null);
});

// Precedence is delivered by removing the loser, so the arm holds exactly one
// credential and the recorded route is the one that served it.
test('an arm is handed one credential, and the loser is removed', () => {
  const both = { CLAUDE_CODE_OAUTH_TOKEN: 'fake-token', ANTHROPIC_API_KEY: 'fake-key' };
  const env = armEnv(both, '/tmp/home');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'fake-token');
  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.HOME, '/tmp/home');
  assert.equal(env.USERPROFILE, '/tmp/home');

  const keyOnly = armEnv({ ANTHROPIC_API_KEY: 'fake-key' }, '/tmp/home');
  assert.equal(keyOnly.ANTHROPIC_API_KEY, 'fake-key');
  assert.equal('CLAUDE_CODE_OAUTH_TOKEN' in keyOnly, false);
});

// Subtraction enumerated two variables and let five through. A wire capture
// measured an auth token and an API key reaching one request while the record
// named the API key. An allowlist is the shape that does not decay.
test('an arm inherits only what the allowlist names, and one credential', () => {
  const shell = {
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: 'fake-key',
    ANTHROPIC_AUTH_TOKEN: 'fake-auth',
    ANTHROPIC_BASE_URL: 'http://elsewhere.invalid',
    ANTHROPIC_CUSTOM_HEADERS: 'x-thing: 1',
    CLAUDE_CODE_USE_BEDROCK: '1',
    AWS_BEARER_TOKEN_BEDROCK: 'fake-bedrock',
    CLAUDE_CODE_HOST_AUTH_ENV_VAR: 'SOMETHING_ELSE',
    SOMETHING_ELSE: 'fake-host-auth',
    NODE_OPTIONS: '--require /tmp/evil.js',
    HTTPS_PROXY: 'http://proxy.invalid',
  };
  const env = armEnv(shell, '/tmp/home');
  assert.deepEqual(Object.keys(env).sort(),
    ['ANTHROPIC_API_KEY', 'HOME', 'PATH', 'USERPROFILE']);
});

test('a variable the allowlist names is inherited whatever its case', () => {
  const env = armEnv({ Path: 'C:\\\\bin', SystemRoot: 'C:\\\\Windows' }, 'C:\\\\home');
  assert.equal(env.Path, 'C:\\\\bin');
  assert.equal(env.SystemRoot, 'C:\\\\Windows');
});

test('an unmodelled credential variable is named, and never its value', () => {
  const found = unmodelledCredentials({
    ANTHROPIC_BASE_URL: 'http://elsewhere.invalid',
    AWS_BEARER_TOKEN_BEDROCK: 'fake-bedrock',
    ANTHROPIC_API_KEY: 'fake-key',
  });
  assert.deepEqual(found, ['ANTHROPIC_BASE_URL', 'AWS_BEARER_TOKEN_BEDROCK']);
  assert.deepEqual(unmodelledCredentials({ ANTHROPIC_API_KEY: 'fake-key' }), []);
  assert.deepEqual(unmodelledCredentials({}), []);
});

test('an arm never inherits a configuration directory that outlives the redirected home', () => {
  const env = armEnv({
    CLAUDE_CONFIG_DIR: '/home/me/.claude',
    XDG_CONFIG_HOME: '/home/me/.config',
    CLAUDE_HOME: '/home/me/.claude',
    ANTHROPIC_API_KEY: 'fake-key',
  }, '/tmp/home');
  for (const key of ['CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'CLAUDE_HOME']) {
    assert.equal(key in env, false, `${key} must not reach an arm`);
  }
});

// The class named one route, so every run of the OTHER route was labelled
// wrongly and the check said nothing — the route was inside the tuple after all.
test('the environment class names the home, not the route', () => {
  assert.deepEqual(ENV_CLASSES, ['empty-home', 'representative']);
  const subscription = record({ auth_route: 'subscription' });
  assert.deepEqual(checkRecord(subscription), []);
  const routed = record();
  routed.identity.environment_class = 'api-key-empty-home';
  assert.match(checkRecord(routed).join(' '), /environment_class must be one of/);
});

// The refusal below the flag check promises nothing is quoted. The flag check
// above it quoted its value verbatim, so a credential-shaped flag leaked.
test('a credential-shaped value in any message is withheld at emission', () => {
  // A stray positional is quoted back by the refusal that names it, so it is
  // the shape that proves redaction happens at emission. The refusal for a
  // fixed-value flag used to quote too, and no longer does: `checkRecord` reads
  // the flag SHAPE now and leaves the values to the acceptance test.
  const leaky = record({
    flags: ['-p', '--model', 'opus', '--setting-sources', 'user',
      'sk-ant-oat01-LEAKEDCREDENTIAL0123', '--strict-mcp-config', '--output-format', 'json'],
  });
  const problems = checkRecord(leaky, 'r.json');
  const joined = problems.join(' ');
  assert.equal(joined.includes('LEAKEDCREDENTIAL'), false, 'no message may quote it');
  assert.match(joined, /withheld/);
  // A withheld line still says which record it came from.
  assert.ok(problems.every((line) => line.startsWith('r.json: ')),
    'attribution belongs outside the withheld region');
});

test('a credential in a flag value is refused without being quoted', () => {
  // The value reading no longer runs inside `checkRecord`, so nothing quotes
  // this one. The whole-record scan is what still catches it, and it names
  // nothing it matched.
  const leaky = record({
    flags: ['-p', '--model', 'opus', '--setting-sources', 'sk-ant-oat01-LEAKEDCREDENTIAL0123',
      '--strict-mcp-config', '--output-format', 'json'],
  });
  const joined = checkRecord(leaky, 'r.json').join(' ');
  assert.equal(joined.includes('LEAKEDCREDENTIAL'), false, 'no message may quote it');
  assert.match(joined, /looks like a credential/);
});

// The first version replaced what it recognised and then asked whether anything
// was left. That order ate the HEAD of a wrapped credential and printed the
// tail, which is the half worth having. A log breaking a line at column eighty
// lands far past the eight characters that made the early case safe.
test('a wrapped credential never leaves its tail in the clear', () => {
  for (const wrapped of [
    'value was sk-ant-oat01-AAAA\nBBBBCCCCDDDD',
    'value was sk-ant-oat\n01-AAAABBBBCCCC',
    'value was sk-ant-oat01-AAAA,BBBBCCCCDDDD',
    // The separator lands INSIDE the first eight characters, so the head alone
    // is too short to recognise. Only stripping the comma catches this one.
    'value was sk-ant-oa,t01AAAABBBBCCCC',
    'value was sk-ant-oat01-AAAA"BBBBCCCCDDDD',
  ]) {
    const out = redact(wrapped);
    assert.match(out, /withheld/, `${JSON.stringify(wrapped)} must be withheld`);
    assert.equal(out.includes('BBBBCCCC'), false, 'no tail may survive');
    assert.equal(out.includes('AAAABBBB'), false, 'no tail may survive');
  }
});

test('a message carrying nothing credential-shaped is printed unchanged', () => {
  assert.equal(redact('nothing to see here'), 'nothing to see here');
  assert.equal(redact('the arms ran on different builds: build-A and build-B.'),
    'the arms ran on different builds: build-A and build-B.');
});

// `unwrap` glues, so asking the question of an assembled line let one field's
// tail meet the next field's head and withheld a clean run's whole line.
test('a clean record still prints its name, verdict and tuple', () => {
  const glued = record();
  glued.identity.pathway = 'claude:user-sk-ant-';
  glued.identity.harness_build = 'AAAABBBBCCCC';
  const line = describe('probe.json', glued);
  assert.match(line, /^probe\.json: derives PASS/);
  assert.match(line, /pathway=claude:user-sk-ant-/);
  for (const field of TUPLE) assert.match(line, new RegExp(`${field}=`));
});

// Measured evasions: case, a newline inside the first characters, and a JSON
// escape. Each passed check:probes end to end.
test('a credential survives no dressing the check can see through', () => {
  for (const dressed of [
    'SK-ANT-API03-AAAABBBBCCCC',
    'sk-ant-oat\n01-DDDDEEEEFFFF',
    'sk-ant-oat\\n01-DDDDEEEEFFFF',
    'sk-ant-oat"01"-DDDDEEEEFFFF',
  ]) {
    const leaked = record();
    leaked.installed.stderr = `the environment held ${dressed}`;
    assert.match(checkRecord(leaked).join(' '), /looks like a credential/,
      `${JSON.stringify(dressed)} must be caught`);
  }
});

// The fixture has to fail at position 0. V8 quotes the offending text only for
// that shape: a truncated object yields "Expected ',' or '}' ... at position
// 37" and carries no content at all, so an earlier version of this test passed
// whether the parser's message was repeated or not, and the mutation that was
// supposed to pin the rule measured nothing.
test('a record that cannot be parsed reports no bytes from the file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-torn-'));
  await fs.writeFile(path.join(dir, 'torn.json'),
    'NOTJSONMARKER sk-ant-api03-AAAABBBBCCCC and more');
  const { problems } = await checkDirectory(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^torn\.json: not readable as JSON\.$/);
  // V8 quotes the first ten characters. Neither the marker nor anything after
  // it may reach a printed line.
  assert.equal(problems[0].includes('NOTJSONMAR'), false);
  assert.equal(problems[0].includes('sk-ant'), false);
});

test('the routes are declared in precedence order, and name their variables', () => {
  assert.deepEqual(AUTH_ROUTES.map((r) => r.route), ['subscription', 'api-key']);
  assert.deepEqual(AUTH_ROUTES.map((r) => r.variable),
    ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);
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

// `extract.mjs` reads `is_error` as truthy. Reading it as exactly `true` here
// made a non-boolean a failed run to the extractor and a clean run to this
// collector, and the record would have carried the disagreement.
test('is_error is read as truthy, the way the extractor reads it', () => {
  const of = (obj) => readRun({ raw: JSON.stringify(obj), home: '/tmp/h' });
  assert.equal(of({ result: 'x', is_error: false, modelUsage: { b: { outputTokens: 1 } } })
    .is_error, false);
  assert.equal(of({ result: 'x', is_error: true, modelUsage: { b: { outputTokens: 1 } } })
    .is_error, true);
  assert.equal(of({ result: 'x', is_error: 1, modelUsage: { b: { outputTokens: 1 } } })
    .is_error, true);
  assert.equal(of({ result: 'x', is_error: 'yes', modelUsage: { b: { outputTokens: 1 } } })
    .is_error, true);
  assert.equal(of({ result: 'x', modelUsage: { b: { outputTokens: 1 } } }).is_error, false);
});

test('output that is not JSON is a failed run, and keeps what arrived', () => {
  const arm = readRun({ raw: 'harness exploded', err: 'boom', home: '/tmp/h' });
  assert.equal(arm.is_error, true);
  assert.equal(arm.model_id, '');
  assert.match(arm.stderr, /not JSON/);
});

// JSON that parses and is not a run. `null` threw out of the collector after
// both live calls were paid for, and a bare number reported a clean run with
// nothing in it. `extract.mjs` exits non-zero on both.
test('JSON that is not a run object is a failed run, not a crash', () => {
  for (const raw of ['null', '123', '"text"', '[]', 'true']) {
    const arm = readRun({ raw, home: '/tmp/h' });
    assert.equal(arm.is_error, true, `${raw} should be a failed run`);
    assert.equal(arm.answer, '');
    assert.equal(arm.model_id, '');
    assert.match(arm.stderr, /JSON, but not a run/);
  }
});

test('a tie in the model usage names no build, the way extract.mjs refuses one', () => {
  assert.equal(servingBuild({ a: { outputTokens: 9 }, b: { outputTokens: 4 } }), 'a');
  assert.equal(servingBuild({ a: { outputTokens: 9 }, b: { outputTokens: 9 } }), '');
  assert.equal(servingBuild({}), '');
});

test('the planted sentence carries the nonce, and the ask never does', () => {
  assert.match(plantedSentence(NONCE), new RegExp(NONCE));
  assert.equal(ASK.includes(NONCE), false);
});

// The plant site is the whole point of the instrument. Measured 2026-08-07:
// the harness attaches names and descriptions, and a body loads only on
// invocation, so a body-planted nonce measures invocation and returns NONE
// against a skill that was discovered perfectly. ADR-0024.
const SKILL_MD = '---\nname: demo\ndescription: Use when a reply runs long.\n---\n\n'
  + '# demo\n\n## Purpose\n\nSomething.\n';

test('the nonce lands in the frontmatter description, not the body', () => {
  const planted = plantInDescription(SKILL_MD, NONCE);
  const lines = planted.split('\n');
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const description = lines.find((l, i) => i > 0 && i < close && l.startsWith('description:'));
  assert.match(description, new RegExp(NONCE), 'the description must carry the nonce');
  // The body is untouched, so nothing depends on the model invoking the skill.
  assert.equal(planted.slice(planted.indexOf('# demo')).includes(NONCE), false);
  // The original description survives beside it.
  assert.match(description, /Use when a reply runs long\./);
});

test('a file the probe cannot plant in is refused rather than silently missed', () => {
  // Each of these would otherwise produce a probe that derives FAIL for a
  // reason that has nothing to do with the harness.
  assert.throws(() => plantInDescription('# A skill\n', NONCE), /opens with no frontmatter/);
  assert.throws(() => plantInDescription('---\nname: x\n', NONCE), /never closes/);
  assert.throws(() => plantInDescription('---\nname: x\n---\n\ndescription: not here\n', NONCE),
    /carries no description/);
});

test('the nonce lands in the installed SKILL.md', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  await fs.writeFile(path.join(dir, 'SKILL.md'), SKILL_MD);
  await plantNonce(dir, NONCE);
  const planted = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
  assert.match(planted, new RegExp(NONCE));
  // A rewrite, not an append: the file is truncated to exactly the new text, so
  // no tail of the old one survives past the end of the new.
  assert.equal(planted, plantInDescription(SKILL_MD, NONCE));
});

// `appendFile` resolves the path, so a SKILL.md swapped for a link between the
// install and the plant appended the nonce outside the throwaway tree.
test('a SKILL.md that is a symlink is refused, and its target is untouched', async (t) => {
  if (!await canSymlink()) return t.skip(NO_SYMLINKS);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  const skill = path.join(dir, 'skill');
  const outside = path.join(dir, 'outside.md');
  await fs.mkdir(skill);
  await fs.writeFile(outside, 'someone else\n');
  await fs.symlink(outside, path.join(skill, 'SKILL.md'));
  await assert.rejects(plantNonce(skill, NONCE), /symbolic link|is a symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'someone else\n');
});

// The check that FOLLOWS a write, which no test could reach until the write
// became injectable. It is the half that still catches a swapped ancestor on a
// platform without O_NOFOLLOW, so it is the half that most needs an anchor.
test('a tree that moves while the nonce is planted is reported', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  const home = path.join(root, 'home');
  const skill = path.join(home, 'skill');
  await fs.mkdir(skill, { recursive: true });
  await fs.writeFile(path.join(skill, 'SKILL.md'), SKILL_MD);
  await assert.rejects(
    plantNonce(skill, NONCE, {
      baseDir: home,
      // After the handle closes. Windows refuses to remove a directory holding
      // an open handle, so staging this while it was open died with ENOTEMPTY
      // before the guard ran.
      afterWrite: async () => {
        await fs.rm(skill, { recursive: true });
        await fs.writeFile(skill, 'not a directory any more\n');
      },
    }),
    /moved while the nonce was planted/);
});

// Unreachable through `plantNonce`, because the classification refuses a link
// before the open runs. Only a swap between the two steps reaches it, so the
// mapping is tested where it lives.
test('an open refused for following a link says so, and other failures pass through', () => {
  const loop = Object.assign(new Error('ELOOP'), { code: 'ELOOP' });
  assert.match(openFailure(loop, '/tmp/x/SKILL.md').message, /became a symbolic link/);
  const many = Object.assign(new Error('EMLINK'), { code: 'EMLINK' });
  assert.match(openFailure(many, '/tmp/x/SKILL.md').message, /became a symbolic link/);
  const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  assert.equal(openFailure(denied, '/tmp/x/SKILL.md'), denied);
});

test('a missing SKILL.md is refused rather than created', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  await assert.rejects(plantNonce(dir, NONCE), /SKILL.md is missing/);
});

// The leaf check alone let the whole directory be swapped. Measured: the nonce
// landed outside the tree with no error at all.
test('a skill directory that is a symlink is refused, and its target is untouched', async (t) => {
  if (!await canSymlink()) return t.skip(NO_SYMLINKS);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-plant-'));
  const home = path.join(root, 'home');
  const outside = path.join(root, 'outside');
  await fs.mkdir(home);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'SKILL.md'), 'someone else\n');
  await fs.symlink(outside, path.join(home, 'skill'), 'junction');
  await assert.rejects(
    plantNonce(path.join(home, 'skill'), NONCE, { baseDir: home }), /is not a directory/);
  assert.equal(await fs.readFile(path.join(outside, 'SKILL.md'), 'utf8'), 'someone else\n');
});

// The open branch, which the classify-time refusal above never reaches. This
// builds both flag words and records what each one permits, so the residue in
// `plantNonce`'s docstring is a measurement rather than a claim.
test('O_NOFOLLOW refuses a swapped leaf, and a platform without it does not', async (t) => {
  if (!await canSymlink()) return t.skip(NO_SYMLINKS);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-flags-'));
  const outside = path.join(dir, 'outside.md');
  const link = path.join(dir, 'SKILL.md');
  await fs.writeFile(outside, 'someone else\n');
  await fs.symlink(outside, link);

  // The word a platform without the flag produces. It follows the link to a
  // regular file, and the handle reports a plain file because it is one.
  const windows = await fs.open(link, plantFlags(0));
  try {
    assert.equal((await windows.stat()).isFile(), true);
  } finally {
    await windows.close();
  }

  if (constants.O_NOFOLLOW) {
    await assert.rejects(fs.open(link, plantFlags()), (err) => err.code === 'ELOOP');
  }
  assert.equal(await fs.readFile(outside, 'utf8'), 'someone else\n');
});

test('the tree digest names contents, so an edit inside the tree moves it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-tree-'));
  await fs.writeFile(path.join(dir, 'SKILL.md'), SKILL_MD);
  const before = await treeDigest(dir);
  await fs.writeFile(path.join(dir, 'SKILL.md'), plantInDescription(SKILL_MD, NONCE));
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

// The record writer's own post-write chain check, anchored so that ONLY it can
// fire. The ancestor becomes a symbolic link to the directory it already was,
// so the record still resolves to the same inode and the handle-identity check
// is satisfied. Deleting the chain check makes this record land quietly under a
// link, which is the whole defect.
test('an ancestor that becomes a link while the record is written is reported', async (t) => {
  if (!await canSymlink()) return t.skip(NO_SYMLINKS);
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-write-'));
  const outPath = path.join(base, 'a', 'b', 'r.json');
  await assert.rejects(
    writeRecord(outPath, record(), base, {
      // After the handle closes, or Windows refuses the rename with EPERM. The
      // link is a junction, which is the directory-link type Windows resolves
      // and POSIX ignores — without it the path would not resolve there, the
      // identity check would fire instead, and this test would pass while
      // anchoring the wrong branch.
      afterWrite: async () => {
        await fs.rename(path.join(base, 'a'), path.join(base, 'a-real'));
        await fs.symlink(path.join(base, 'a-real'), path.join(base, 'a'), 'junction');
      },
    }),
    /was not written where it was meant to go/);
  // The record is gone, and only through the path the check refused.
  assert.equal(await fs.readFile(outPath, 'utf8').catch(() => null), null);
});

// The walk splits a relative path, so a `dir` above the base produced `..`
// components and `path.join` collapsed them into a walk back up the tree that
// reported nothing. A project-scope pathway produces exactly that path.
test('a directory outside the base is refused rather than walked upward', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-chain-'));
  const base = path.join(root, 'home', '.claude', 'skills');
  const outside = path.join(root, 'work', '.claude', 'skills', 'mine');
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  const problems = await chainProblems(base, outside);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is not under/);
});

test('a base equal to the directory is the ordinary case, not an escape', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-chain-'));
  assert.deepEqual(await chainProblems(dir, dir), []);
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
test('a symlinked record directory is refused, and nothing is written through it', async (t) => {
  if (!await canSymlink()) return t.skip(NO_SYMLINKS);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-link-'));
  const real = path.join(root, 'elsewhere');
  const link = path.join(root, 'probes');
  await fs.mkdir(real);
  await fs.symlink(real, link, 'junction');
  await assert.rejects(
    writeRecord(path.join(link, 'r.json'), record(), link), /never written through one/);
  assert.deepEqual(await fs.readdir(real), []);
});

// The lane split, pinned by name. `checkRecord` reads the flag SHAPE and
// `deriveOutcome` reads the VALUES, and the two questions must stay apart.
//
// This case is written against a record collected under the old spelling,
// which is the record that already sits in `bench/probes/`. Fold the two
// readings back into one and it fails in the direction that matters: the
// record becomes malformed, so the repository cannot keep the evidence its own
// amendment rests on. ADR-0024.
test('a record under the old flag spelling is well formed, and derives a failure', () => {
  const old = record({
    flags: ['-p', '--model', 'opus', '--setting-sources', '', '--strict-mcp-config',
      '--output-format', 'json'],
  });
  assert.deepEqual(checkRecord(old), [],
    'a wrong-flag record is a failed probe, and checkRecord reads shape alone');
  assert.equal(deriveOutcome(old).isolated, false,
    'the acceptance test reads the value, so the old spelling is not isolated');
  assert.equal(deriveOutcome(old).passes, false);
});

// The trace, which section 4.1 asks for and no record carried until now.
test('a trace is null or the harness\'s own lines, and nothing else', () => {
  assert.deepEqual(traceProblems(null), []);
  assert.deepEqual(traceProblems(undefined), []);
  assert.deepEqual(traceProblems([]), []);
  assert.deepEqual(traceProblems(['Loaded 1 unique skills']), []);
  assert.match(traceProblems('Loaded 1 unique skills').join(' '), /list of strings/);
  assert.match(traceProblems([{ line: 'x' }]).join(' '), /list of strings/);
  assert.match(traceProblems({ lines: [] }).join(' '), /list of strings/);
});

test('a record retaining its trace passes the check, and a summarised one does not', () => {
  const withTrace = record();
  withTrace.installed.trace = ['Loading skills from /tmp/a/home/.claude/skills',
    'Loaded 1 unique skills (user: 1, project: 0)'];
  withTrace.control.trace = ['Loaded 0 unique skills (user: 0, project: 0)'];
  assert.deepEqual(checkRecord(withTrace), []);

  const summarised = record();
  summarised.installed.trace = 'the harness loaded one skill';
  assert.match(checkRecord(summarised).join(' '), /installed.trace is null/);
});

test('the trace keeps the skill-loading lines verbatim, and drops the rest', () => {
  const log = [
    '2026-08-07 [DEBUG] Loading skills from /tmp/home/.claude/skills   ',
    '2026-08-07 [DEBUG] connecting to the transport',
    '2026-08-07 [DEBUG] Loaded 1 unique skills (builtin: 0, user: 1, project: 0)',
    '2026-08-07 [DEBUG] a line about something else entirely',
  ].join('\n');
  assert.deepEqual(skillTraceLines(log), [
    '2026-08-07 [DEBUG] Loading skills from /tmp/home/.claude/skills',
    '2026-08-07 [DEBUG] Loaded 1 unique skills (builtin: 0, user: 1, project: 0)',
  ]);
  // A log naming no skill loading is an empty list, and that is a reading.
  assert.deepEqual(skillTraceLines('nothing here\n'), []);
});

test('the trace is bounded, because a record is read by a person', () => {
  const many = Array.from({ length: TRACE_LINE_LIMIT + 20 }, () => 'Loaded 1 unique skills');
  assert.equal(skillTraceLines(many.join('\n')).length, TRACE_LINE_LIMIT);
});

// An absent log and a log naming nothing are different states, and the record
// keeps them apart. Collapsing them lets a harness that never wrote a log read
// as one that loaded no skills.
test('a missing debug log is no trace, and an empty one is a trace of nothing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-trace-'));
  assert.equal(await readTrace(null), null);
  assert.equal(await readTrace(path.join(dir, 'absent.log')), null);
  const written = path.join(dir, 'quiet.log');
  await fs.writeFile(written, 'nothing about skills\n');
  assert.deepEqual(await readTrace(written), []);
});

test('the trace flag is the one allowed extra, and it carries a path', () => {
  const traced = armFlags('opus', '/tmp/debug.log');
  assert.deepEqual(isolationProblems(traced), []);
  assert.deepEqual(traced.slice(-2), [TRACE_FLAG, '/tmp/debug.log']);
  // Still not REQUIRED, so an untraced record is not a failed probe.
  assert.deepEqual(isolationProblems(armFlags('opus')), []);
  // And it is a flag like any other: a missing value is refused.
  assert.match(isolationProblems([...armFlags('opus'), TRACE_FLAG]).join(' '),
    /--debug-file carries no value/);
});

// The summary answers what the records DERIVED. "Clean" said only that they
// were well formed, and a reader took it for a green probe.
test('the summary names the derived outcomes, never a bare verdict', () => {
  assert.match(summarise({ pass: 1, fail: 1 }), /2 checked: 1 derives PASS, 1 derives FAIL/);
  assert.match(summarise({ pass: 0, fail: 2 }), /2 checked: 2 derives FAIL/);
  assert.doesNotMatch(summarise({ pass: 0, fail: 2 }), /PASS/);
  assert.match(summarise({ pass: 0, fail: 0 }), /No probe records yet/);
});

test('a directory of records reports what each one derived', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-probe-dir-'));
  await fs.writeFile(path.join(dir, 'pass.json'), JSON.stringify(record()));
  await fs.writeFile(path.join(dir, 'fail.json'), JSON.stringify(record({
    control: {
      answer: NONCE, model_id: 'claude-opus-4-6-20260514', is_error: false,
      home: '/tmp/b/home', trace: null,
    },
  })));
  const { outcomes } = await checkDirectory(dir);
  assert.deepEqual(outcomes, { pass: 1, fail: 1 });
});

// A description this probe cannot extend by appending to its line. Every skill
// here writes a plain scalar, so the refusal costs nothing today and stops a
// silent miscollection the day one does not.
test('a description shape the plant would corrupt is refused, one shape at a time', () => {
  const withValue = (value) => `---\nname: demo\ndescription: ${value}\n---\n\n# demo\n`;
  assert.throws(() => plantInDescription(withValue('"Use when a reply runs long."'), NONCE),
    /double-quoted scalar/);
  assert.throws(() => plantInDescription(withValue("'Use when a reply runs long.'"), NONCE),
    /single-quoted scalar/);
  assert.throws(() => plantInDescription(withValue('|'), NONCE), /literal block scalar/);
  assert.throws(() => plantInDescription(withValue('>'), NONCE), /folded block scalar/);
  // The plain scalar every skill here writes still plants.
  assert.match(plantInDescription(withValue('Use when a reply runs long.'), NONCE),
    new RegExp(NONCE));
});

// The README spells the flag set out for a reader. `bench/probe.mjs` claims to
// hold one copy of it, so the spelled-out one is held to the constants rather
// than trusted to stay in step by hand.
//
// `includes` was the whole check, and it asks whether the file carries the
// right spelling SOMEWHERE. A second copy that had gone stale sat beside a
// correct one and the check stayed green, which is the residue MINOR-6 left.
// So the file is asked how many arm invocations it spells, and the answer is
// one. A line counts as one when it names the two flags that carry no value,
// which is a shape no prose sentence about a single flag can reach.
const armInvocations = (readme) => readme.split('\n')
  .filter((line) => line.includes('-p ')
    && line.includes('--strict-mcp-config') && line.includes('--output-format'));

test('the probes README spells the flag set the constants define, exactly once', async () => {
  const readme = await fs.readFile(
    new URL('../bench/probes/README.md', import.meta.url), 'utf8');
  const expected = REQUIRED_FLAGS.flatMap((flag) => {
    if (!FLAGS_TAKING_A_VALUE.includes(flag)) return [flag];
    return [flag, FIXED_VALUES[flag] ?? `<${flag === '--model' ? 'alias' : 'value'}>`];
  }).join(' ');
  const found = armInvocations(readme);
  assert.equal(found.length, 1,
    `the README spells a probe arm's invocation once, and it spells ${found.length}`);
  assert.equal(found[0].trim(), expected,
    `the README must spell the flag set as: ${expected}`);
});

// The block omits the trace flag, and that omission is a claim: `--debug-file`
// is allowed and never required, so a record collected without it is a probe
// like any other. Nothing held the block to it, so the flag could drift into
// the block and read as required to every reader of this file.
test('the README block omits the trace flag, and the prose beside it does not', async () => {
  const readme = await fs.readFile(
    new URL('../bench/probes/README.md', import.meta.url), 'utf8');
  const [block] = armInvocations(readme);
  assert.equal(block.includes(TRACE_FLAG), false,
    `${TRACE_FLAG} is allowed and never required, so the required set omits it`);
  // Omitted from the block and named in the file, or a reader learns nothing
  // about the one flag an arm may add.
  assert.ok(readme.includes(TRACE_FLAG),
    `the README names ${TRACE_FLAG} as the one flag an arm may add`);
});

// The trace flag's value is the one place a probe arm could reach into a real
// configuration tree and still derive PASS, because nothing else in the record
// shows the path. It is refused on either separator.
test('a trace path inside a .claude directory is refused, and never quoted back', () => {
  const inside = (p) => [...armFlags('opus'), TRACE_FLAG, p];
  for (const p of ['/Users/someone/.claude/debug.log',
    'C:\\Users\\someone\\.claude\\debug.log',
    '/var/tmp/x/.claude/nested/debug.log']) {
    const problems = isolationProblems(inside(p)).join(' ');
    assert.match(problems, /writes into a .claude directory/, `refused: ${p}`);
    assert.equal(problems.includes('someone'), false, 'the path is never quoted back');
  }
  // A throwaway path, which is what the collector builds, still passes.
  assert.deepEqual(isolationProblems(inside('/tmp/sw-probe-ab12/harness-debug.log')), []);
  // A directory merely NAMED .claude-something is not a .claude segment.
  assert.deepEqual(isolationProblems(inside('/tmp/.claude-probe/debug.log')), []);
  // The VALUE reading owns this, so such a record is a failed probe and not a
  // broken file, the way every other wrong value is.
  assert.deepEqual(flagShapeProblems(inside('/Users/someone/.claude/debug.log')), []);
});

// The trace, consulted. Section 4.1 calls a trace naming the loaded file better
// evidence than either answer, and until issue #94 the derivation read the
// answers and the flags alone. A record whose control trace said `Loaded 1
// unique skills` derived PASS on the strength of an answer that said nothing.
const traced = (installed, control) => {
  const r = record();
  r.installed.trace = installed;
  r.control.trace = control;
  return r;
};
const LOADED_ONE = '2026-08-07T07:21:09Z [DEBUG] Loaded 1 unique skills '
  + '(1 unconditional, 0 conditional, managed: 0, user: 1, project: 0, additional: 0)';
const LOADED_NONE = '2026-08-07T07:21:13Z [DEBUG] Loaded 0 unique skills '
  + '(0 unconditional, 0 conditional, managed: 0, user: 0, project: 0, additional: 0)';

test('every count comes off the one harness line that states them', () => {
  assert.deepEqual(loadCounts([LOADED_ONE]), {
    truncated: false,
    lines: [{ total: 1, managed: 0, scopes: { user: 1, project: 0 } }],
  });
  // The `Loading skills from:` line names the managed PATH and no count, so
  // nothing is read off it.
  assert.deepEqual(loadCounts(['Loading skills from: managed=/Library/x, user=/tmp/y']),
    { truncated: false, lines: [] });
  // A trace that is present and names no loading holds no lines, and a trace
  // that is absent is no reading at all.
  assert.deepEqual(loadCounts([]), { truncated: false, lines: [] });
  assert.equal(loadCounts(null), null);
  assert.equal(loadCounts(undefined), null);
  // A malformed trace is a broken record, and `checkRecord` says so. Reading it
  // here as a failed probe would answer the wrong question.
  assert.equal(loadCounts('Loaded 1 unique skills'), null);
});

test('a named source count is read, and an unnamed one is null', () => {
  assert.equal(sourceCount(LOADED_ONE, 'user'), 1);
  assert.equal(sourceCount(LOADED_ONE, 'project'), 0);
  assert.equal(sourceCount(LOADED_ONE, 'managed'), 0);
  assert.equal(sourceCount('Loaded 1 unique skills', 'user'), null);
});

test('a trace agrees when the installed arm loaded a skill and the control loaded none', () => {
  assert.equal(traceAgrees(traced([LOADED_ONE], [LOADED_NONE])), true);
  // The reading issue #94 names: the control's own trace contradicts the
  // control's silent answer, and the record used to derive PASS anyway.
  assert.equal(traceAgrees(traced([LOADED_ONE], [LOADED_ONE])), false);
  assert.equal(traceAgrees(traced([LOADED_NONE], [LOADED_NONE])), false);
});

// Absence is a state, never a disagreement. Every record written before
// 2026-08-07 carries no trace, and grading those by an instrument they predate
// would fail them for what nobody could have retained.
test('a null trace reads as null, on either arm, and never as false', () => {
  assert.deepEqual(traceReading(record()), { agrees: null, withheld: 'absent' });
  assert.deepEqual(traceReading(traced([LOADED_ONE], null)), { agrees: null, withheld: 'absent' });
  assert.deepEqual(traceReading(traced(null, [LOADED_NONE])), { agrees: null, withheld: 'absent' });
  assert.equal(deriveOutcome(record()).trace_agrees, null);
  assert.equal(deriveOutcome(record()).passes, true);
});

// The harness repeats the line per session. A run that loaded one skill once
// and none the next time has corroborated nothing, so every line is read.
test('every loaded line is read, not the first', () => {
  assert.equal(traceAgrees(traced([LOADED_ONE, LOADED_NONE], [LOADED_NONE])), false);
  assert.equal(traceAgrees(traced([LOADED_ONE], [LOADED_NONE, LOADED_ONE])), false);
  assert.equal(traceAgrees(traced([LOADED_ONE, LOADED_ONE], [LOADED_NONE, LOADED_NONE])), true);
});

// A present trace naming no loading is withheld, not blocked. Corrected on the
// codex review of PR #110: blocking there said the harness disagreed, when the
// truth is that the evidence cannot answer. `false` is reserved for a real
// contradiction, and every unreadable state names itself instead.
test('a trace that names no loading is withheld, and never a disagreement', () => {
  assert.deepEqual(traceReading(traced([], [])), { agrees: null, withheld: 'unscoped' });
  assert.deepEqual(traceReading(traced(['connecting to the transport'], [LOADED_NONE])),
    { agrees: null, withheld: 'unscoped' });
  assert.equal(deriveOutcome(traced([], [])).passes, true);
});

// The decision this pass makes. Better evidence that contradicts the answers
// cannot sit beside a pass as a note. ADR-0024 carries the amendment.
test('a disagreeing trace blocks the pass, and a null one does not', () => {
  const contradicted = traced([LOADED_ONE], [LOADED_ONE]);
  const outcome = deriveOutcome(contradicted);
  assert.equal(outcome.discovered, true, 'the answers still read as a discovery');
  assert.equal(outcome.control_clean, true, 'and the control answer is still clean');
  assert.equal(outcome.isolated, true);
  assert.equal(outcome.trace_agrees, false);
  assert.equal(outcome.passes, false, 'the trace is the better evidence, so it blocks');
  assert.match(describe('probe.json', contradicted), /derives FAIL/);
});

// A redirected home does not move the machine-global managed skills path, so a
// non-zero count is the one thing in a record that would say something reached
// an arm from outside the home. Nothing looked until now.
test('the managed count is read, reported, and blocks nothing', () => {
  assert.equal(managedSeen(record()), null);
  assert.equal(managedSeen(traced([LOADED_ONE], [LOADED_NONE])), 0);
  const reached = LOADED_ONE.replace('managed: 0', 'managed: 2');
  const seen = traced([reached], [LOADED_NONE]);
  assert.equal(managedSeen(seen), 2);
  assert.equal(deriveOutcome(seen).managed_seen, 2);
  // A note, like `audit-coverage` beside a matrix. Whether a managed skill
  // spoils the arm is a judgment a record carries no way to ask.
  assert.equal(deriveOutcome(seen).passes, true);
  assert.match(describe('probe.json', seen), /managed_seen=2/);
});

test('the derived line carries every trace reading, including their absence', () => {
  const line = describe('probe.json', record());
  assert.match(line, /trace_agrees=null/);
  assert.match(line, /trace_withheld=absent/);
  assert.match(line, /managed_seen=null/);
});

// The three invariants ADR-0024 states as prose, and issue #95 reports as
// untested. Each one had a surviving mutation that produced a well-formed
// record deriving PASS with its evidence misattributed.
const twoHomes = (root) => ({
  installed: { home: path.join(root, 'installed', 'home'), cwd: path.join(root, 'installed') },
  control: { home: path.join(root, 'control', 'home'), cwd: path.join(root, 'control') },
});

/**
 * A harness that answers and writes a debug log, without spawning anything.
 * `logs` names what each call writes into the debug file, in order, and a
 * `null` entry writes nothing at all.
 */
const fakeHarness = (logs) => {
  const calls = [];
  let at = 0;
  const run = async ({ flags, home, cwd }) => {
    calls.push({ flags, home, cwd });
    const file = flags[flags.indexOf(TRACE_FLAG) + 1];
    const text = logs[at];
    at += 1;
    if (text !== null) await fs.writeFile(file, text);
    return { answer: 'NONE', model_id: 'build', is_error: false, stderr: '', home };
  };
  return { run, calls };
};

test('the debug path lands under the throwaway root, and nowhere else', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-arms-'));
  assert.equal(debugPath(root), path.join(root, 'harness-debug.log'));
  const { run } = fakeHarness([LOADED_ONE, LOADED_NONE]);
  const ran = await runArms({
    root, harness: 'claude', model: 'opus', ask: ASK, homes: twoHomes(root), run,
  });
  assert.equal(ran.debugFile, debugPath(root));
  // The flags the record commits are the flags the arms ran, so the path a
  // reader audits is the path the trace came from.
  assert.equal(ran.flags[ran.flags.indexOf(TRACE_FLAG) + 1], debugPath(root));
  // A path outside the root writes a harness trace into a tree the probe
  // neither built nor cleans up, and the record would still derive PASS.
  await assert.rejects(
    runArms({
      root, harness: 'claude', model: 'opus', ask: ASK, homes: twoHomes(root), run,
      debugFile: path.join(os.tmpdir(), 'sw-elsewhere.log'),
    }),
    /A harness trace is written under/);
});

// Skip the removal and the control reads the installed arm's lines, so the
// record shows a skill loaded on both arms and derives a stronger pass than the
// run earned. Under the derivation this pass adds, it derives FAIL instead.
test('the debug file goes between the arms, so no trace outlives its arm', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-arms-'));
  // The installed arm writes a log. The control writes none, so whatever its
  // trace carries came from the file the first arm left behind.
  const { run } = fakeHarness([LOADED_ONE, null]);
  const ran = await runArms({
    root, harness: 'claude', model: 'opus', ask: ASK, homes: twoHomes(root), run,
  });
  assert.deepEqual(ran.installed.trace, [LOADED_ONE]);
  assert.equal(ran.control.trace, null, 'the control inherited the installed arm\'s trace');
  // And the file is gone when the run ends, on the last arm as on the first.
  assert.equal(await readTrace(debugPath(root)), null);
});

test('both arms run one flag set, so the record\'s flags are true of each', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-arms-'));
  const homes = twoHomes(root);
  const { run, calls } = fakeHarness([LOADED_ONE, LOADED_NONE]);
  const ran = await runArms({ root, harness: 'claude', model: 'opus', ask: ASK, homes, run });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].flags, calls[1].flags, 'a second flag set is true of neither arm');
  assert.deepEqual(ran.flags, calls[0].flags);
  // The homes still differ, which is the one variable the probe changes.
  assert.equal(calls[0].home, homes.installed.home);
  assert.equal(calls[1].home, homes.control.home);
  // And the set is a probe arm's, so an arm sequence cannot open a surface the
  // acceptance test closes.
  assert.deepEqual(isolationProblems(ran.flags), []);
});

// The record these arms produce is the one the derivation reads, so the
// sequence and the reading are held together rather than each against a fixture.
test('the arms produce a record whose trace agrees with the run', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-arms-'));
  const { run } = fakeHarness([LOADED_ONE, LOADED_NONE]);
  const ran = await runArms({
    root, harness: 'claude', model: 'opus', ask: ASK, homes: twoHomes(root), run,
  });
  const built = buildRecord({
    date: '2026-08-13', skill: 'de-slop', nonce: NONCE, pathway: 'claude:user',
    flags: ran.flags, route: 'api-key', build: '2.1.222',
    installedArm: { ...ran.installed, answer: NONCE }, controlArm: ran.control,
    treeDigest: 'abc123',
  });
  assert.deepEqual(checkRecord(built), []);
  const outcome = deriveOutcome(built);
  assert.equal(outcome.trace_agrees, true);
  assert.equal(outcome.managed_seen, 0);
  assert.equal(outcome.passes, true);
});

// Codex, PR #110, P1. `skillTraceLines` cuts the kept set at
// `TRACE_LINE_LIMIT`, and the first version of this reading treated the
// retained prefix as the whole trace. Twenty sessions loading one skill
// followed by a twenty-first loading zero produced a full prefix that read as
// agreement, so a cut certified a pass over lines nobody has.
test('a trace standing at the limit is withheld, because its tail may be gone', () => {
  const full = Array.from({ length: TRACE_LINE_LIMIT }, () => LOADED_ONE);
  const cut = traced(full, [LOADED_NONE]);
  assert.deepEqual(traceReading(cut), { agrees: null, withheld: 'truncated' });
  // Withheld, so it neither certifies nor blocks. The answers decide.
  assert.equal(deriveOutcome(cut).passes, true);
  assert.match(describe('probe.json', cut), /trace_withheld=truncated/);
  // The control side is read the same way, and one line short of the bound is
  // a complete trace that reads normally.
  assert.equal(traceReading(traced([LOADED_ONE], full.map(() => LOADED_NONE))).withheld,
    'truncated');
  assert.deepEqual(traceReading(traced(full.slice(1), [LOADED_NONE])),
    { agrees: true, withheld: null });
});

// The bound is the reader's constant, so a record may never carry more lines
// than the collector would write. Without this the cut is not the only place a
// reading is lost, and the boundary test above stops meaning anything.
test('a record carrying more lines than the bound is refused', () => {
  const over = Array.from({ length: TRACE_LINE_LIMIT + 1 }, () => LOADED_ONE);
  assert.match(traceProblems(over).join(' '), /at most 40 lines/);
  const record = traced(over, [LOADED_NONE]);
  assert.match(checkRecord(record).join(' '), /installed.trace keeps at most/);
  assert.deepEqual(traceProblems(over.slice(1)), []);
});

// Codex, PR #110, P1. The total counts managed skills, and a redirected home
// does not move the machine-global managed path. Reading the total blocked a
// valid probe on a machine carrying one managed skill, through exactly the path
// `managed_seen` declares non-blocking.
test('a managed skill on the machine does not block the probe', () => {
  const managed = (total, user) => `[DEBUG] Loaded ${total} unique skills `
    + `(${total} unconditional, 0 conditional, managed: 1, user: ${user}, project: 0)`;
  // Installed loads the managed skill and its own. The control loads the
  // managed skill alone, so its TOTAL is 1 and its user count is 0.
  const seen = traced([managed(2, 1)], [managed(1, 0)]);
  assert.deepEqual(traceReading(seen), { agrees: true, withheld: null });
  assert.equal(deriveOutcome(seen).passes, true);
  // The count is still reported, because it is the one thing that says
  // something reached an arm from outside the redirected home.
  assert.equal(deriveOutcome(seen).managed_seen, 1);
  // And a control that loaded a skill in the probe's own scope still blocks.
  assert.equal(traceAgrees(traced([managed(2, 1)], [managed(2, 1)])), false);
});

// The scope comes from the pathway the record names, so a project-scope probe
// is read on its own count. Reading `user:` for every pathway would be the
// managed defect one column over.
test('the reading follows the scope the probe installed into', () => {
  const line = (user, project) => `[DEBUG] Loaded 1 unique skills `
    + `(managed: 0, user: ${user}, project: ${project})`;
  const project = (installed, control) => {
    const r = traced(installed, control);
    r.identity.pathway = 'claude:project';
    return r;
  };
  assert.equal(traceAgrees(project([line(0, 1)], [line(0, 0)])), true);
  assert.equal(traceAgrees(project([line(0, 1)], [line(0, 1)])), false);
  // The same traces under a user-scope pathway read the user column, and there
  // the installed arm loaded nothing.
  assert.equal(traceAgrees(traced([line(0, 1)], [line(0, 0)])), false);
});

// A line that names no per-scope count leaves only the total, and the total
// counts managed skills. Withheld rather than read, and the residue is stated:
// a harness that stops printing the column makes every probe unreadable.
test('a line without the scope count is withheld, never read off the total', () => {
  const bare = '[DEBUG] Loaded 1 unique skills';
  assert.deepEqual(traceReading(traced([bare], ['[DEBUG] Loaded 0 unique skills'])),
    { agrees: null, withheld: 'unscoped' });
  // A pathway the record does not name leaves no column to read either.
  const noPathway = traced([LOADED_ONE], [LOADED_NONE]);
  noPathway.identity.pathway = '';
  assert.deepEqual(traceReading(noPathway), { agrees: null, withheld: 'unscoped' });
});
