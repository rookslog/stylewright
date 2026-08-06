/**
 * The probe record: what one isolation probe leaves behind, and what makes it
 * readable by someone who was not there.
 *
 * The measurement design, section 4.1, defines the probe. Section 4.2 makes the
 * isolation probe a blocking prerequisite for installed delivery, with one
 * acceptance test: an installed skill is discoverable under the exact flag set
 * the control arm runs, in a redirected home the harness fully respects.
 *
 * Two rules shape everything here.
 *
 * The outcome is DERIVED, never declared. `deriveOutcome` computes it from the
 * bytes the record retains, and `checkRecord` refuses a record that carries an
 * outcome of its own. A record that says "pass" beside its own evidence is the
 * author's summary, and the design promises a reader who never has to trust one.
 *
 * The identity tuple is the design's, in one place. Section 4.1 defines it once
 * — harness build, served model, platform, pathway, environment class, and the
 * committed stack digest where the class is a representative stack — because
 * three review rounds each caught one re-listing site missing one element. This
 * file re-lists nothing. It reads TUPLE and STACK_CLASS below.
 *
 * `collect-probe.mjs` writes records. This file only reads them, so it spawns
 * nothing, reads no clock, and runs anywhere Node runs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The identity tuple, from the measurement design, section 4.1. */
export const TUPLE = [
  'harness_build', 'model', 'platform', 'pathway', 'environment_class', 'stack_digest',
];

/**
 * The environment classes, and the one that needs a digest.
 *
 * `empty-home` is the pristine class as the owner settled it on 2026-08-06, in
 * ADR-0017. The home is empty and the harness authenticates from the
 * environment, so nothing of the operator's own configuration reaches either
 * arm.
 *
 * The class is named for the HOME, never for the credential. Two routes
 * authenticate into the same empty home, and a class named for one of them put
 * the route inside the identity tuple by the back door: every subscription run
 * was labelled `api-key-empty-home`, and the check said nothing. A home that
 * HELD a credential would be a different environment and would need its own
 * name.
 */
export const ENV_CLASSES = ['empty-home', 'representative'];
export const STACK_CLASS = 'representative';

/**
 * The flags the control arm runs under, as `bench/run.sh` invokes them. The
 * probe's acceptance test is about these and nothing else: a probe that had to
 * enable a configuration surface the control suppresses has answered the
 * question with a no.
 *
 * `--setting-sources ''` is the isolation. It suppresses the operator's
 * settings and their CLAUDE.md together, which is what makes a true no-guidance
 * control possible. `--strict-mcp-config` suppresses the servers.
 */
export const REQUIRED_FLAGS = [
  '-p', '--model', '--setting-sources', '--strict-mcp-config', '--output-format',
];
export const ALLOWED_FLAGS = REQUIRED_FLAGS;
const FLAGS_TAKING_A_VALUE = ['--model', '--setting-sources', '--output-format'];
/** Values a flag must carry, where the control arm fixes one. */
const FIXED_VALUES = { '--setting-sources': '', '--output-format': 'json' };

/**
 * Words a record may not carry. Each one states an outcome, and the outcome is
 * the checker's to compute. This is a denylist over the record's own keys, at
 * every depth, because a nested `installed.pass` is the same assertion one level
 * down.
 */
const ASSERTED = ['outcome', 'pass', 'passed', 'fail', 'failed', 'verdict', 'result', 'status'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARMS = ['installed', 'control'];
/**
 * A credential, in the shapes this vendor issues.
 *
 * Both routes are covered: an API key and a subscription token from
 * `claude setup-token` share the `sk-ant-` family and differ in the segment
 * that follows, so the pattern is written over the family. It is
 * case-insensitive, because `SK-ANT-` is the same credential and read past an
 * exact-case pattern.
 *
 * Two residues, both stated rather than papered over. A credential encoded so
 * that its characters are not adjacent — base64, or split across fields — is
 * out of scope, because catching that needs a decoder for every encoding and
 * the result would still be a guess. And a credential of some other shape
 * entirely would pass. This is a BACKSTOP. The mechanism is that nothing writes
 * a credential into a record, and `armEnv` hands an arm one credential it never
 * reads.
 */
const SECRET = /sk-ant-[a-z0-9_-]{8,}/i;
const SECRET_ALL = /sk-ant-[a-z0-9_-]{8,}/gi;

/**
 * Text with the noise a credential can hide behind removed, for matching only.
 *
 * A record is JSON, and JSON wraps and escapes. A value carrying a newline
 * inside its first characters, or a `\n` escape, or quotes from a nested
 * encoding, read straight past a pattern that expects adjacency — measured, and
 * such a record passed `check:probes` end to end. The stderr field carries
 * hundreds of raw bytes of harness output, so the wrapping is realistic rather
 * than theoretical.
 */
function unwrap(text) {
  return String(text).replace(/[\s"'\\]/g, '');
}

/**
 * Text safe to print, with anything credential-shaped replaced.
 *
 * EVERY message this module emits goes through it, at the point of emission
 * rather than per message. Redacting message by message is how the leak
 * happened: the refusal for a bad flag quoted the flag's value verbatim, one
 * line above the refusal that promises nothing is quoted. A message written
 * next month would have had to remember the rule on its own.
 *
 * Two passes, because one cannot do both jobs. The first replaces a credential
 * sitting in the text as the vendor issues it, surgically, leaving the rest of
 * the message readable. The second asks whether what remains still looks like a
 * credential once wrapping and escaping are removed, and withholds the WHOLE
 * message if it does. A single pattern loose enough to catch a wrapped
 * credential also eats whatever follows it, because a space and then a letter
 * is indistinguishable from a credential split across a line.
 */
export function redact(text) {
  const surgical = String(text).replace(SECRET_ALL, '[credential redacted]');
  if (SECRET.test(unwrap(surgical))) {
    return '[a message here carried something credential-shaped, so it is withheld]';
  }
  return surgical;
}

/** The auth routes a record may name, from `bench/collect-probe.mjs`. */
export const AUTH_ROUTE_NAMES = ['subscription', 'api-key'];

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Did this arm answer?
 *
 * ONE definition, and every consumer reads it: the derived outcome, the record
 * check, and the collector choosing which arm names the tuple's model. Three
 * review rounds each found the same defect at a different one of those three
 * sites — an unserved control, then an errored arm, then an arm with a build
 * and no answer text — because each site carried its own idea of what a served
 * arm was and each round patched one of them. A fourth site would have
 * repeated it, so the predicate is stated here and nowhere else.
 *
 * Three conditions, and each one was a finding:
 *
 * 1. A build is named. An arm nothing served did not answer, and its empty
 *    answer reads identically to a control that ran and stayed clean.
 * 2. The harness reported no error. A failed run can still carry answer text
 *    and a serving build, so two failed invocations read as a comparison.
 * 3. The answer carries text. A run reporting no error, naming a build, and
 *    returning an empty result is the shape `bench/extract.mjs` already
 *    classifies as failed, and it made a control look clean by saying nothing.
 */
export function armAnswered(arm) {
  return isText(arm?.model_id) && arm?.is_error === false && isText(arm?.answer);
}

/**
 * Every key in the record, at every depth, with the path that reaches it.
 *
 * An array is walked as well as an object. Stopping at one let a list of
 * entries carry a `pass` on each element, which is the assertion this list
 * exists to find, one container further down.
 */
function keyPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  }
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    const at = prefix ? `${prefix}.${k}` : k;
    out.push(at);
    out.push(...keyPaths(v, at));
  }
  return out;
}

/**
 * Problems with the flag set the probe ran under. An unknown flag is refused
 * rather than ignored, because the acceptance test is that the probe ran the
 * control's flags EXACTLY. A flag the control never passes is a configuration
 * surface the control never opened, and a probe that needed one has failed the
 * test it exists to run.
 */
export function isolationProblems(flags) {
  if (!Array.isArray(flags) || !flags.length) return ['flags is a non-empty array.'];
  const problems = [];
  // EVERY element is consumed, as a flag or as the value of the flag before it.
  // Skipping anything that does not open with a dash left a stray positional
  // invisible, so an argv carrying an extra prompt read as the control arm's
  // exact invocation. And EVERY occurrence is read, not the first: a set that
  // opens with an empty `--setting-sources` and repeats it with `user` obeys
  // the later spelling, so a duplicate is refused outright.
  const seen = new Set();
  let i = 0;
  while (i < flags.length) {
    const flag = flags[i];
    if (typeof flag !== 'string') {
      problems.push(`the entry at position ${i} is not a string.`);
      i += 1;
      continue;
    }
    if (!ALLOWED_FLAGS.includes(flag)) {
      problems.push(flag.startsWith('-')
        ? `${flag} is not a flag the control arm runs.`
        : `"${flag}" at position ${i} is not part of the control arm's invocation.`);
      i += 1;
      continue;
    }
    if (seen.has(flag)) problems.push(`${flag} appears twice, so the arm's surface is unclear.`);
    seen.add(flag);
    if (!FLAGS_TAKING_A_VALUE.includes(flag)) {
      i += 1;
      continue;
    }
    const value = flags[i + 1];
    const fixed = FIXED_VALUES[flag];
    if (i + 1 >= flags.length) {
      problems.push(`${flag} carries no value.`);
    } else if (fixed !== undefined) {
      if (value !== fixed) {
        problems.push(
          `${flag} carried "${value}", and the control arm passes `
          + `${fixed === '' ? 'an empty value' : `"${fixed}"`}.`);
      }
    } else if (typeof value !== 'string' || value === '' || value.startsWith('-')) {
      problems.push(`${flag} carries no value.`);
    }
    i += 2;
  }
  // Presence is read from what the walk SAW, not from `includes`. A flag
  // sitting in a value position is not a flag the arm ran.
  for (const required of REQUIRED_FLAGS) {
    if (!seen.has(required)) problems.push(`flags omit ${required}.`);
  }
  return problems;
}

/**
 * Everything wrong with one record. It returns a list rather than throwing, so
 * a run reports every record in one pass.
 */
export function checkRecord(record, name = 'record') {
  const problems = [];
  // Redaction at the point of emission, so no message has to remember the rule.
  const say = (p) => problems.push(redact(`${name}: ${p}`));
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [`${name}: not a JSON object.`];
  }

  if (record.kind !== 'isolation-probe') {
    say('kind must be "isolation-probe".');
  }
  if (!DATE.test(record.date ?? '')) say('date is YYYY-MM-DD.');
  if (!isText(record.skill)) say('skill names the skill the probe installed.');

  const identity = record.identity ?? {};
  // `model` and `stack_digest` are the two elements a record may leave empty,
  // and each for a stated reason. A stack digest belongs to one class. A served
  // model does not exist when no arm answered, and that record is a recorded
  // failure rather than a malformed one — the design keeps a failed probe as a
  // result, so the check has to admit it.
  //
  // Two sets, because two different questions are being asked.
  //
  // `answered` is the predicate: which arms produced an answer this probe can
  // read. The tuple's model comes from one of these.
  //
  // `ranClean` is broader on purpose: which builds ran without the harness
  // reporting an error, whatever text came back. Build DISAGREEMENT is about
  // which builds touched the probe, not about which ones said something. Asking
  // the narrow question here quietly relaxed the check — an installed arm on
  // build A and a control on build B that returned no text reported nothing at
  // all, and the record committed a tuple naming one of the two builds that
  // ran. `score.mjs` compares over the values that are present for the same
  // reason.
  const answered = ARMS.filter((arm) => armAnswered(record[arm]))
    .map((arm) => record[arm].model_id);
  const ranClean = ARMS
    .filter((arm) => isText(record[arm]?.model_id) && record[arm]?.is_error === false)
    .map((arm) => record[arm].model_id);
  for (const field of TUPLE) {
    if (field === 'stack_digest') continue;
    if (field === 'model' && !answered.length) continue;
    if (!isText(identity[field])) say(`identity.${field} is missing, and the tuple needs it.`);
  }
  // The old wording said no arm reported a build, which was false of the record
  // it most often fired on: both arms errored, both named a build, and the
  // tuple took one of them. The tuple's model means the build that SERVED the
  // probe, so the refusal is about answering, and it says so.
  if (!answered.length && isText(identity.model)) {
    say('identity.model names a build, and no arm answered, so nothing served this probe. '
      + 'Drop the element rather than editing the arms, because it was never true.');
  }
  if (identity.environment_class && !ENV_CLASSES.includes(identity.environment_class)) {
    say(`identity.environment_class must be one of: ${ENV_CLASSES.join(', ')}.`);
  }
  if (identity.environment_class === STACK_CLASS) {
    if (!isText(identity.stack_digest)) {
      say('a representative stack records its committed stack digest.');
    }
  } else if (identity.stack_digest != null) {
    say('only a representative stack carries a stack digest.');
  }

  // The ask must not carry the nonce. A harness handed the nonce can repeat it
  // without ever reading the installed tree, and the record would look exactly
  // like a pass.
  if (!isText(record.nonce) || record.nonce.trim().length < 8) {
    say('nonce is a string of at least eight characters.');
  }
  if (!isText(record.ask)) say('ask retains the question both arms answered.');
  // The route, never the credential. Two routes can bill and rate-limit
  // differently, so a record that stayed silent about which one served it would
  // leave a reader unable to ask whether that mattered.
  if (!AUTH_ROUTE_NAMES.includes(record.auth_route)) {
    say(`auth_route names how the arm authenticated: ${AUTH_ROUTE_NAMES.join(' or ')}.`);
  }
  if (isText(record.nonce) && isText(record.ask) && record.ask.includes(record.nonce)) {
    say('the ask carries the nonce, so a repeat proves nothing about the installed tree.');
  }

  for (const arm of ARMS) {
    const side = record[arm];
    if (!side || typeof side !== 'object') {
      say(`${arm} is missing, and a probe answers the same ask on both.`);
      continue;
    }
    if (typeof side.answer !== 'string') say(`${arm}.answer retains the answer verbatim.`);
    // The harness's own failure byte. A run that reported an error can still
    // carry answer text and a serving build, so without this the record keeps
    // no trace of the failure and the outcome reads two failed invocations as
    // a comparison.
    if (typeof side.is_error !== 'boolean') {
      say(`${arm}.is_error records whether the harness reported the run as failed.`);
    }
    // Empty when no build answered, which is a failed probe and not a broken
    // record. Absent is a different thing, and it is refused.
    if (typeof side.model_id !== 'string') {
      say(`${arm}.model_id names the build that served it, or is empty when none did.`);
    }
    if (!isText(side.home)) say(`${arm}.home records the redirected home.`);
  }
  if (record.installed && !isText(record.installed.tree_digest)) {
    say('installed.tree_digest records the tree the probe measured.');
  }
  if (record.control && record.control.tree_digest != null) {
    say('the control installs nothing, so it carries no tree digest.');
  }
  if (new Set(ranClean).size > 1) {
    say(`the arms ran on different builds: ${[...new Set(ranClean)].join(' and ')}.`);
  }
  if (answered.length && isText(identity.model) && answered.some((m) => m !== identity.model)) {
    say('identity.model disagrees with the build that served an arm.');
  }

  for (const p of isolationProblems(record.flags)) say(p);

  // The probe authenticates from a credential in the environment, by either
  // route, per ADR-0017, and neither form ever enters the tree. A record is
  // committed, so a credential that reached one would be published. Nothing
  // here quotes what it matched.
  if (SECRET.test(unwrap(JSON.stringify(record)))) {
    say('something in this record looks like a credential. Nothing here may carry one, '
      + 'by either route.');
  }

  for (const at of keyPaths(record)) {
    const leaf = at.split('.').pop();
    if (ASSERTED.includes(leaf)) {
      say(`${at} states an outcome, and a reader derives the outcome from the bytes.`);
    }
  }

  return problems;
}

/**
 * The outcome, computed from the record's own bytes.
 *
 * `discovered` is the evidence the installed text reached the context.
 * `control_clean` is the empty-home control that catches a probe passing for
 * the wrong reason. `isolated` is section 4.2's acceptance test. A probe passes
 * only on all three, and a caller that wants one word reads `passes`.
 */
export function deriveOutcome(record) {
  const nonce = record?.nonce ?? '';
  // An arm that no build served did not answer. Its empty answer contains no
  // nonce, which reads identically to a control that ran and stayed clean —
  // so a failed control invocation would hand a passing probe the very
  // comparison it exists to make. Both halves therefore require a served arm.
  const installedServed = armAnswered(record?.installed);
  const controlServed = armAnswered(record?.control);
  const discovered = installedServed && Boolean(nonce)
    && (record?.installed?.answer ?? '').includes(nonce);
  const controlClean = controlServed && Boolean(nonce)
    && !(record?.control?.answer ?? '').includes(nonce);
  const isolated = isolationProblems(record?.flags).length === 0;
  return {
    installed_served: installedServed,
    control_served: controlServed,
    discovered,
    control_clean: controlClean,
    isolated,
    passes: discovered && controlClean && isolated,
  };
}

/** One line per record, for a person reading the check's output. */
export function describe(name, record) {
  const o = deriveOutcome(record);
  const tuple = TUPLE.map((f) => `${f}=${record.identity?.[f] ?? '-'}`).join(' ');
  // `control_served` is printed beside `control_clean`, because a control that
  // never ran and a control that ran clean are opposite readings of the same
  // empty answer, and a line that showed only the second would hide the first.
  return redact(`${name}: ${o.passes ? 'derives PASS' : 'derives FAIL'} `
    + `(installed_served=${o.installed_served} discovered=${o.discovered} `
    + `control_served=${o.control_served} control_clean=${o.control_clean} `
    + `isolated=${o.isolated}) ${tuple}`);
}

/** Reads every record under `dir`. A missing directory holds no records. */
export async function readRecords(dir) {
  let names;
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const records = [];
  for (const name of names) {
    const text = await fs.readFile(path.join(dir, name), 'utf8');
    try {
      records.push({ name, record: JSON.parse(text) });
    } catch {
      // The parser's message is not repeated. V8 truncates it to a few
      // characters of the offending text, which tells a reader nothing and is
      // one more path for a byte from the file to reach a printed line.
      records.push({ name, record: null, unreadable: true });
    }
  }
  return records;
}

/** Returns `{ problems, lines }` over a directory of records. */
export async function checkDirectory(dir) {
  const problems = [];
  const lines = [];
  for (const { name, record, unreadable } of await readRecords(dir)) {
    if (unreadable) {
      problems.push(`${name}: not readable as JSON.`);
      continue;
    }
    const found = checkRecord(record, name);
    problems.push(...found);
    if (!found.length) lines.push(describe(name, record));
  }
  return { problems, lines };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'probes');
  const { problems, lines } = await checkDirectory(dir);
  for (const line of lines) process.stdout.write(`${line}\n`);
  for (const p of problems) process.stderr.write(`${p}\n`);
  if (problems.length) process.exit(1);
  process.stdout.write(
    lines.length
      ? `Probe records clean. ${lines.length} checked.\n`
      : 'No probe records yet. The isolation probe is a manual protocol.\n');
}
