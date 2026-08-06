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

/** The environment classes the design names, and the one that needs a digest. */
export const ENV_CLASSES = ['pristine', 'representative'];
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
export const REQUIRED_FLAGS = ['-p', '--strict-mcp-config'];
export const ALLOWED_FLAGS = [
  '-p', '--model', '--setting-sources', '--strict-mcp-config', '--output-format',
];
const FLAGS_TAKING_A_VALUE = ['--model', '--setting-sources', '--output-format'];

/**
 * Words a record may not carry. Each one states an outcome, and the outcome is
 * the checker's to compute. This is a denylist over the record's own keys, at
 * every depth, because a nested `installed.pass` is the same assertion one level
 * down.
 */
const ASSERTED = ['outcome', 'pass', 'passed', 'fail', 'failed', 'verdict', 'result', 'status'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARMS = ['installed', 'control'];

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** Every key in the record, at every depth, with the path that reaches it. */
function keyPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
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
  for (const required of REQUIRED_FLAGS) {
    if (!flags.includes(required)) problems.push(`flags omit ${required}.`);
  }
  const sources = flags.indexOf('--setting-sources');
  if (sources === -1) {
    problems.push('flags omit --setting-sources, so nothing suppressed the operator config.');
  } else if (flags[sources + 1] !== '') {
    problems.push(
      `--setting-sources carried "${flags[sources + 1]}", and the control arm passes an `
      + 'empty value.');
  }
  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    if (typeof flag !== 'string' || !flag.startsWith('-')) continue;
    if (!ALLOWED_FLAGS.includes(flag)) {
      problems.push(`${flag} is not a flag the control arm runs.`);
      continue;
    }
    if (FLAGS_TAKING_A_VALUE.includes(flag)) i += 1;
  }
  return problems;
}

/**
 * Everything wrong with one record. It returns a list rather than throwing, so
 * a run reports every record in one pass.
 */
export function checkRecord(record, name = 'record') {
  const problems = [];
  const say = (p) => problems.push(`${name}: ${p}`);
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
  // model does not exist when the harness never answered, and that record is a
  // recorded failure rather than a malformed one — the design keeps a failed
  // probe as a result, so the check has to admit it.
  const served = ARMS.map((arm) => record[arm]?.model_id).filter(isText);
  for (const field of TUPLE) {
    if (field === 'stack_digest') continue;
    if (field === 'model' && !served.length) continue;
    if (!isText(identity[field])) say(`identity.${field} is missing, and the tuple needs it.`);
  }
  if (!served.length && isText(identity.model)) {
    say('identity.model names a build, and no arm reports one.');
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
  if (served.length === ARMS.length && new Set(served).size !== 1) {
    say(`the arms were served by different builds: ${served.join(' and ')}.`);
  }
  if (served.length && isText(identity.model) && served.some((m) => m !== identity.model)) {
    say('identity.model disagrees with the build that served an arm.');
  }

  for (const p of isolationProblems(record.flags)) say(p);

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
  const discovered = Boolean(nonce) && (record?.installed?.answer ?? '').includes(nonce);
  const controlClean = Boolean(nonce) && !(record?.control?.answer ?? '').includes(nonce);
  const isolated = isolationProblems(record?.flags).length === 0;
  return {
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
  return `${name}: ${o.passes ? 'derives PASS' : 'derives FAIL'} `
    + `(discovered=${o.discovered} control_clean=${o.control_clean} isolated=${o.isolated}) ${tuple}`;
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
    } catch (err) {
      records.push({ name, record: null, unreadable: err.message });
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
      problems.push(`${name}: not readable as JSON. ${unreadable}`);
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
