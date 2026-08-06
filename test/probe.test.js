// The isolation probe's record, and what a reader may derive from it.
//
// Two properties carry the design's claims, and each has cases here. A record
// never states its own outcome, so `checkRecord` refuses one and `deriveOutcome`
// computes it from the retained bytes. And the probe runs the control arm's
// exact flag set, so a record collected under any other flags fails the
// acceptance test in section 4.2 of the measurement design.

import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TUPLE, ENV_CLASSES, armAnswered, checkRecord, deriveOutcome, isolationProblems, checkDirectory,
  describe, redact,
} from '../bench/probe.mjs';
import {
  armEnv, armFlags, authRoute, buildRecord, chainProblems, openFailure, parseArgs, unmodelledCredentials,
  parsePathway, plantFlags, plantNonce, plantedText, readRun, recordName, servingBuild,
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
test('a credential-shaped value in any message is redacted at emission', () => {
  const leaky = record({
    flags: ['-p', '--model', 'opus', '--setting-sources', 'sk-ant-oat01-LEAKEDCREDENTIAL0123',
      '--strict-mcp-config', '--output-format', 'json'],
  });
  const problems = checkRecord(leaky).join(' ');
  assert.equal(problems.includes('LEAKEDCREDENTIAL'), false, 'no message may quote it');
  assert.match(problems, /\[credential redacted\]/);
  assert.equal(redact('a sk-ant-api03-AAAABBBBCCCC b'), 'a [credential redacted] b');
  // A credential the surgical pass cannot see costs the whole message, because
  // a pattern loose enough to catch it also eats whatever follows it.
  assert.equal(redact('a sk-ant-oat\n01-DDDDEEEEFFFF b').includes('DDDDEEEEFFFF'), false);
  assert.match(redact('a sk-ant-oat\n01-DDDDEEEEFFFF b'), /withheld/);
  assert.equal(redact('nothing to see here'), 'nothing to see here');
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

test('a record that cannot be parsed reports no bytes from the file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-torn-'));
  await fs.writeFile(path.join(dir, 'torn.json'), '{ "leak": "sk-ant-api03-AAAABBBBCCCC"');
  const { problems } = await checkDirectory(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not readable as JSON/);
  assert.equal(problems[0].includes('sk-ant'), false);
  assert.equal(problems[0].includes('leak'), false);
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
  await fs.writeFile(path.join(skill, 'SKILL.md'), '# A skill\n');
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
