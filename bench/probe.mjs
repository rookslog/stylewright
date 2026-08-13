/**
 * The probe record: what one isolation probe leaves behind, and what makes it
 * readable by someone who was not there.
 *
 * The measurement design, section 4.1, defines the probe. Section 4.2 makes the
 * isolation probe a blocking prerequisite for installed delivery, with one
 * acceptance test: an installed skill is discoverable under the acceptance flag
 * set, plus at most the trace flag, in a redirected home the harness fully
 * respects.
 *
 * That flag set is this file's own, and it is NOT `bench/run.sh`'s. The two
 * diverge on `--setting-sources`, deliberately, and the reason is the home each
 * one runs in. `REQUIRED_FLAGS` below carries the argument.
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

// The scopes a pathway can install into, which are also the names the harness
// gives its own skill sources. One list, so the reading below cannot name a
// scope this tool cannot install into.
import { PLATFORMS, SCOPES } from '../src/targets.js';

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
 * The flags a probe arm runs under. Defined ONCE, here, beside the check that
 * enforces them, because a second copy is a second thing to drift.
 *
 * `--setting-sources user` is the isolation, and it reads backwards until you
 * know what the home is. Amended 2026-08-07, on measurement, and ADR-0024
 * carries the reasoning.
 *
 * This spelling was `''` until a diagnostic pair measured what that does. With
 * `''` the harness logged `Loaded 0 unique skills (user: 0)` over an installed
 * tree it was watching, and with `user` it logged `Loaded 1` over the same
 * tree. The empty spelling suppresses the user SKILL directory along with the
 * settings, so the old acceptance test asked whether an installed skill is
 * discoverable in a configuration where skills are switched off. It can only
 * ever answer no.
 *
 * Isolation survives the change because a probe arm's home is a THROWAWAY
 * EMPTY one. There is no operator CLAUDE.md and no operator settings in it to
 * suppress, so `user` admits nothing but the tree the probe installed. Measured
 * on the same pair: the empty-home control under `user` loaded zero skills, so
 * the arms differ by the installed skill and nothing else, and the one-variable
 * rule holds.
 *
 * One residue in that argument: the harness also consults a machine-global
 * managed skills path that `HOME` does not redirect, so `environment_class`
 * names the home and never the machine.
 *
 * `bench/run.sh` does NOT follow this change, and the difference is the home.
 * It SELECTS a spelling from `--rules`: `none` gives its no-guidance control
 * `''`, and `user` gives its treatment arm `user`. Both of those run in the
 * operator's REAL home, where `''` is what suppresses their CLAUDE.md and their
 * settings for the control. The two files now spell the flag differently on
 * purpose, and the reason is the environment each one runs in rather than a
 * drift between them.
 *
 * `--strict-mcp-config` suppresses the servers, unchanged.
 */
export const REQUIRED_FLAGS = [
  '-p', '--model', '--setting-sources', '--strict-mcp-config', '--output-format',
];

/**
 * The one flag an arm may add, and the only one.
 *
 * Section 4.1 asks a probe to record "the harness trace where one exists", and
 * calls a trace naming the loaded file better evidence than either answer. This
 * harness offers one through `--debug-file`, so retaining it is the design's
 * instruction rather than an extra.
 *
 * It is ALLOWED and not REQUIRED, and it carries no fixed value, because the
 * path is a throwaway one. It opens no configuration surface: it redirects
 * diagnostic output to a file and changes nothing about settings, skills, MCP,
 * or the model. `--debug` would have done the same job through stderr, and it
 * takes an OPTIONAL argument, so it swallowed the prompt and cost a call pair
 * that produced nothing. ADR-0024 records the decision.
 *
 * Its VALUE is checked, and that is the hardening the trace flag buys back.
 * Accepting any path would let a run write its trace under a real `.claude`
 * directory, which reaches into the configuration a redirected home exists to
 * exclude — and that record would derive PASS, because nothing else in it shows
 * the path. A `.claude` segment is refused on either separator, and at the
 * START of a relative path as well: requiring a separator in FRONT admitted
 * `.claude/trace.log`, which an operator running from their own home resolves
 * straight into the configuration tree this guard exists to keep out. The
 * collector builds its own path under a throwaway root and never produces one,
 * so this closes a cell only a later caller or a hand-written record could
 * reach.
 */
export const TRACE_FLAG = '--debug-file';
export const TRACE_PATH_REFUSED = /(^|[/\\])\.claude[/\\]/;
export const ALLOWED_FLAGS = [...REQUIRED_FLAGS, TRACE_FLAG];
export const FLAGS_TAKING_A_VALUE = [
  '--model', '--setting-sources', '--output-format', TRACE_FLAG,
];
/** Values a flag must carry, where the probe arm fixes one. */
export const FIXED_VALUES = { '--setting-sources': 'user', '--output-format': 'json' };

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

/**
 * Text with the noise a credential can hide behind removed, for matching only.
 *
 * A record is JSON, and JSON wraps and escapes. A value carrying a newline
 * inside its first characters, or a `\n` escape, or quotes from a nested
 * encoding, read straight past a pattern that expects adjacency — measured, and
 * such a record passed `check:probes` end to end. The stderr field carries
 * hundreds of raw bytes of harness output, so the wrapping is realistic rather
 * than theoretical.
 *
 * The class covers what a log or a JSON encoder inserts: whitespace, quotes,
 * backslashes, and the comma a list format adds. It stops there, and the
 * residue is stated rather than implied — a credential split by some other
 * separator, or encoded so its characters are not adjacent at all, is outside
 * what this sees. Widening it to every non-credential character would glue the
 * whole record into one string and refuse records that carry no credential.
 */
function unwrap(text) {
  return String(text).replace(/[\s"',\\]/g, '');
}

/**
 * Text safe to print.
 *
 * EVERY message this module emits goes through it, at the point of emission
 * rather than per message. Redacting message by message is how the first leak
 * happened: the refusal for a bad flag quoted the flag's value verbatim, one
 * line above the refusal that promises nothing is quoted.
 *
 * ONE question, asked of the UNWRAPPED text, and the whole message is withheld
 * when the answer is yes. An earlier version asked a surgical question first —
 * replace what looks like a credential, then check what remains — and that
 * order leaked. The surgical pass ate the HEAD of a wrapped credential and left
 * the high-entropy tail standing, with nothing recognisable in front of it for
 * the second pass to catch. Measured: a wrap eight characters in printed
 * `[credential redacted]` followed by the rest of the token. A wrap that early
 * withheld safely, and a wrap at a column a real log breaks on did not, so the
 * realistic case was the leaking one.
 *
 * Withholding whole costs a readable message. That is the correct trade for a
 * checker whose messages are diagnostics and whose records must never carry a
 * credential at all. The caller keeps attribution outside this function, so a
 * withheld line still says which record it came from.
 */
export function redact(text) {
  if (looksLikeCredential(text)) {
    return '[a message here carried something credential-shaped, so it is withheld]';
  }
  return String(text);
}

/**
 * Does this text carry something credential-shaped?
 *
 * The one question, asked in one place, so the promotion path in
 * `bench/retain.mjs` and the study check in `bench/study.mjs` ask exactly what
 * this file asks. Both write or read committed bytes, and a second copy of the
 * pattern is a second thing to drift — which here would mean one surface
 * refusing a credential and another publishing it.
 */
export function looksLikeCredential(text) {
  return SECRET.test(unwrap(text));
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
 * acceptance flag set, plus at most the trace flag. A flag outside that is a
 * configuration surface the arm never opened, and a probe that needed one has
 * failed the test it exists to run.
 */
/**
 * The flag walk, in two readings.
 *
 * `isolationProblems` is the ACCEPTANCE TEST: it reads the values too, so a
 * record whose arm ran the wrong `--setting-sources` fails it. `deriveOutcome`
 * asks this one.
 *
 * `flagShapeProblems` is the RECORD CHECK: it reads the structure and leaves the
 * values alone. `checkRecord` asks this one, and the difference matters because
 * of what the two questions are for.
 *
 * Both were one function, and `checkRecord` asked the acceptance test. That made
 * a probe which ran the wrong flags a MALFORMED RECORD rather than a FAILED
 * PROBE — so the repository could not keep one, and the design's own rule that a
 * recorded failure is a result did not hold for the isolation failure. It became
 * visible when the acceptance flag set moved on 2026-08-07: the record of the
 * probe that motivated the move could not survive it. ADR-0024.
 *
 * Nothing is weakened. A record under the wrong flags still derives FAIL,
 * `check:probes` still prints it as one, and no such record can ever read as a
 * pass. What changed is that it reads as evidence rather than as a broken file.
 */
export function isolationProblems(flags) {
  return flagProblems(flags, true).problems;
}

export function flagShapeProblems(flags) {
  return flagProblems(flags, false).problems;
}

/**
 * Which flags the arm actually RAN, as the walk saw them.
 *
 * It comes off the same walk that reports the problems, rather than off
 * `includes`, because a flag sitting in a value position is not a flag the arm
 * ran. One walk answers both questions, so no second reading of an invocation
 * can drift from the one the acceptance test uses.
 */
export function flagsSeen(flags) {
  return flagProblems(flags, false).seen;
}

function flagProblems(flags, values) {
  if (!Array.isArray(flags) || !flags.length) {
    return { problems: ['flags is a non-empty array.'], seen: new Set() };
  }
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
        ? `${flag} is not a flag a probe arm runs.`
        : `"${flag}" at position ${i} is not part of a probe arm's invocation.`);
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
      // A flag whose value IS the acceptance test. The shape reading still
      // refuses a stray flag sitting in the value position, because that is
      // malformed however the acceptance test comes out.
      if (typeof value !== 'string' || value.startsWith('-')) {
        problems.push(`${flag} carries no value.`);
      } else if (values && value !== fixed) {
        problems.push(
          `${flag} carried "${value}", and a probe arm passes `
          + `${fixed === '' ? 'an empty value' : `"${fixed}"`}.`);
      }
    } else if (typeof value !== 'string' || value === '' || value.startsWith('-')) {
      problems.push(`${flag} carries no value.`);
    } else if (values && flag === TRACE_FLAG && TRACE_PATH_REFUSED.test(value)) {
      // The value, never quoted. A path is where an operator's own directory
      // names would appear, and this file quotes nothing it matched.
      problems.push(`${flag} writes into a .claude directory, and a probe arm `
        + 'touches no configuration tree.');
    }
    i += 2;
  }
  // Presence is read from what the walk SAW, not from `includes`. A flag
  // sitting in a value position is not a flag the arm ran.
  for (const required of REQUIRED_FLAGS) {
    if (!seen.has(required)) problems.push(`flags omit ${required}.`);
  }
  return { problems, seen };
}

/**
 * The trace field's shape, which is deliberately the smallest one that carries
 * the evidence.
 *
 * A trace is `null`, or a LIST OF LINES the harness wrote. Nothing more, because
 * a richer shape would invite a summary, and a summary of a trace is the
 * author's word again — the thing this whole protocol refuses. Lines are the
 * harness's own bytes, so a reader compares them against a run of their own.
 *
 * `null` stays legal, and it means the run kept no trace. Every record written
 * before 2026-08-07 carries that, and a harness offering no trace would too.
 * Section 4.1 asks for the trace "where one exists", so absence is a state and
 * not a defect.
 *
 * The bound lives HERE rather than beside the selector that applies it. The
 * collector cuts the kept set at `TRACE_LINE_LIMIT`, and the derivation below
 * has to know that a list of exactly that many lines may be a prefix of a
 * longer run.
 *
 * The bound decides a READING and never a record's validity. An earlier pass
 * refused a record carrying more lines than the collector would write, which
 * looked like pinning the coupling and was the ADR-0024 inversion one column
 * over: it made a probe a MALFORMED FILE rather than a failed or unreadable
 * one, and lowering a constant in this file would have retired committed
 * evidence and shrunk the derived census without anything saying so. Length is
 * now nothing but an input to `loadCounts`, where a trace at or past the bound
 * is withheld. Do not move it back.
 */
export const TRACE_LINE_LIMIT = 40;

export function traceProblems(trace) {
  if (trace === null || trace === undefined) return [];
  if (!Array.isArray(trace) || trace.some((line) => typeof line !== 'string')) {
    return ['trace is null, or the harness\'s own lines as a list of strings.'];
  }
  return [];
}

/**
 * The numbers a harness states about skill loading, and where they come from.
 *
 * ONE line carries all of them. The harness writes `Loaded 1 unique skills (1
 * unconditional, 0 conditional, managed: 0, user: 1, project: 0, …)`, so the
 * total, the managed count and the per-scope counts are read in one pass. The
 * `Loading skills from:` line names the managed PATH and no count, so nothing
 * is read off it.
 *
 * The TOTAL is read and never used to decide agreement. It counts managed
 * skills, and a probe redirects `HOME` while the harness consults a
 * machine-global managed skills path that `HOME` does not move. So on a machine
 * carrying one managed skill the control's total is 1 rather than 0, and a
 * total-based reading would block a valid probe through exactly the path
 * `managed_seen` declares non-blocking. Codex reported that on pull request
 * #110 and it is real.
 *
 * Agreement therefore reads the count for the SCOPE the probe installed into,
 * which the record already names in `identity.pathway`. That excludes managed
 * by construction rather than by subtraction, and it stays right for a
 * project-scope pathway, where reading `user:` would be the same defect one
 * column over. `SCOPES` and the harness's own source names coincide, which is
 * what makes the lookup possible.
 */
export const LOADED_LINE = /Loaded\s+(\d+)\s+unique skills/i;
export const MANAGED_COUNT = /\bmanaged:\s*(\d+)/i;

/** The count one harness line states for one named source, or `null`. */
export function sourceCount(line, name) {
  const found = new RegExp(`\\b${name}:\\s*(\\d+)`, 'i').exec(String(line));
  return found ? Number(found[1]) : null;
}

/**
 * What one arm's trace states, or `null` where there is no trace to read.
 *
 * `null` in, `null` out. Absence is a state: every record written before
 * 2026-08-07 carries no trace, and so would a record from a harness that offers
 * none. A malformed trace reads as absent here too, because `checkRecord`
 * already refuses that record and a second refusal from this side would say the
 * probe failed rather than that the file is broken.
 *
 * `truncated` is the other half of the honesty. The collector cuts the kept set
 * at `TRACE_LINE_LIMIT`, so a list of exactly that length may be the prefix of
 * a longer run and the lines past the cut are gone. At the boundary a complete
 * run and a cut one are indistinguishable, so the boundary itself is reported
 * and the caller withholds.
 */
export function loadCounts(trace) {
  if (trace === null || trace === undefined) return null;
  if (traceProblems(trace).length) return null;
  const lines = [];
  for (const line of trace) {
    const found = LOADED_LINE.exec(line);
    if (!found) continue;
    const managed = MANAGED_COUNT.exec(line);
    lines.push({
      total: Number(found[1]),
      managed: managed ? Number(managed[1]) : null,
      scopes: Object.fromEntries(SCOPES.map((s) => [s, sourceCount(line, s)])),
    });
  }
  return { truncated: trace.length >= TRACE_LINE_LIMIT, lines };
}

/**
 * The reading the trace supports, and the reason there is none where there is
 * none.
 *
 * `agrees` is `true`, `false`, or `null`. `withheld` names why a `null` came
 * about, because a reader cannot otherwise tell an old record from a record
 * whose evidence this check refused to certify. Three reasons, and each was a
 * finding rather than a shape somebody imagined:
 *
 * - `absent`. An arm kept no trace. This is every record before 2026-08-07.
 * - `truncated`. An arm's trace stands at `TRACE_LINE_LIMIT`, so a disagreeing
 *   line past the cut would have been dropped and the retained prefix would
 *   certify a pass on evidence nobody has. Codex's case on pull request #110:
 *   twenty sessions loading one skill, then a twenty-first loading zero.
 * - `unscoped`. A retained line does not name the count for the scope this
 *   probe installed into, so the only number available is the total, and the
 *   total counts managed skills the redirected home does not control.
 *
 * `false` is reserved for the one thing it should mean: the harness's own
 * numbers contradict what the answers claim. Withholding covers every case
 * where the record cannot answer, which corrects the earlier reading that
 * blocked on a trace naming no loading. Blocking there said the harness
 * disagreed when the truth was that the evidence was unreadable, and this
 * repository already answers an unreadable artifact by withholding the number
 * and naming the cause rather than by publishing a wrong one.
 *
 * The cost is stated rather than hidden. A harness that stops printing
 * per-scope counts makes every probe unreadable instead of failing, and a
 * `trace: []` record falls back to the answers, which is the state before this
 * reading existed. The exit for both is to move `TRACE_PATTERNS`, `LOADED_LINE`
 * and `sourceCount` onto the new wording.
 *
 * Every `Loaded` line is read, not the first. The harness repeats the line per
 * session, and a run whose installed arm loaded one skill once and none the
 * next time has corroborated nothing.
 */
export function traceReading(record) {
  const scope = String(record?.identity?.pathway ?? '').split(':')[1];
  const installed = loadCounts(record?.installed?.trace);
  const control = loadCounts(record?.control?.trace);
  // A trace beside a flag set that never asked for one. The arm's own recorded
  // invocation says no `--debug-file` was passed, so nothing in that run could
  // have written the lines the record carries, and certifying agreement from
  // them would read evidence the record itself says was never collected. This
  // is the `armAnswered` discipline on the trace side: a field is read only
  // where the record shows it could exist.
  if (ARMS.some((arm) => record?.[arm]?.trace != null)
    && !flagsSeen(record?.flags).has(TRACE_FLAG)) {
    return { agrees: null, withheld: 'unrequested' };
  }
  if (!installed || !control) return { agrees: null, withheld: 'absent' };
  if (installed.truncated || control.truncated) return { agrees: null, withheld: 'truncated' };
  if (!SCOPES.includes(scope)) return { agrees: null, withheld: 'unscoped' };
  const counted = (arm) => arm.lines.map((line) => line.scopes[scope]);
  const here = counted(installed);
  const there = counted(control);
  if (!here.length || !there.length || [...here, ...there].some((n) => n === null)) {
    return { agrees: null, withheld: 'unscoped' };
  }
  return {
    agrees: here.every((n) => n >= 1) && there.every((n) => n === 0),
    withheld: null,
  };
}

/** The reading's verdict alone, for a caller that wants the one field. */
export function traceAgrees(record) {
  return traceReading(record).agrees;
}

/**
 * The largest managed count either arm's trace states, or `null` where no trace
 * states one.
 *
 * It is a NOTE and it blocks nothing, for the reason `ground --check` prints
 * its counts without failing on them: whether a managed skill reaching an arm
 * spoils that arm is a judgment about what stood in that path, and a record
 * carries no way to ask. What the derivation owes a reader is the number, on
 * the line, so the question can be asked at all. `describe` prints it.
 *
 * It is read from a truncated trace too. A count that appeared is a count that
 * appeared, and the bound can only hide a larger one, so this number is a floor
 * and never an overstatement.
 */
export function managedSeen(record) {
  const counts = ARMS
    .flatMap((arm) => loadCounts(record?.[arm]?.trace)?.lines ?? [])
    .map((line) => line.managed)
    .filter((n) => n !== null);
  return counts.length ? Math.max(...counts) : null;
}

/**
 * Everything wrong with one record. It returns a list rather than throwing, so
 * a run reports every record in one pass.
 */
export function checkRecord(record, name = 'record') {
  const problems = [];
  // Redaction at the point of emission, so no message has to remember the rule.
  // The name sits OUTSIDE the redaction, so a withheld line still says which
  // record it came from. Redacting the whole line erased the attribution, and a
  // run over several records could not say which one was withheld.
  const say = (p) => problems.push(`${name}: ${redact(p)}`);
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
  // The pathway is asked what the WRITER asks it. `parsePathway` refuses
  // anything that is not `<platform>:<scope>` with both halves known, and this
  // check only asked `isText`, so the checker was looser than the collector on
  // the one field `traceReading` is keyed on. A typo then disabled the trace
  // reading permanently and reported the cause as `unscoped`, which names a
  // harness that printed no scope column — so the RECORD's defect was reported
  // as the HARNESS's. A misattributed cause is worse than a missing one.
  if (isText(identity.pathway)) {
    const parts = identity.pathway.split(':');
    if (parts.length !== 2 || !PLATFORMS.includes(parts[0]) || !SCOPES.includes(parts[1])) {
      say('identity.pathway is <platform>:<scope>, and both halves are known: '
        + `${PLATFORMS.join(', ')} and ${SCOPES.join(', ')}.`);
    }
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
    for (const p of traceProblems(side.trace)) say(`${arm}.${p}`);
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

  // The SHAPE, not the acceptance test. A record whose arm ran the wrong flags
  // is a probe that failed, and `deriveOutcome` says so through `isolated`.
  // Refusing it here made it a broken file instead, which is how the design's
  // "a recorded failure is a result" stopped holding for isolation failures.
  for (const p of flagShapeProblems(record.flags)) say(p);

  // The probe authenticates from a credential in the environment, by either
  // route, per ADR-0017, and neither form ever enters the tree. A record is
  // committed, so a credential that reached one would be published. Nothing
  // here quotes what it matched.
  //
  // This asks the question of the WHOLE record, so a credential split across
  // two fields is seen only when the key name between them survives unwrapping
  // at eight characters or more — the colon breaks the run otherwise. Which
  // seams that covers is an accident of what the keys are called, not a
  // property anything here decides. It sits inside the split-across-fields
  // residue the pattern already declares, and it is written down because an
  // accident that looks like coverage is worse than a stated gap.
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
 * the wrong reason. `isolated` is section 4.2's acceptance test. `trace_agrees`
 * is the harness's own account of the same run, and a caller that wants one
 * word reads `passes`.
 *
 * `trace_agrees` BLOCKS. Section 4.1 calls a trace naming the loaded file
 * better evidence than either answer, and evidence that is better and
 * contradicted cannot be a note beside a pass. It blocks on `false` alone,
 * which is the harness's own numbers contradicting the answers.
 *
 * `trace_withheld` names why a `null` came about, and it exists because two
 * different states used to spell themselves the same way. A record with no
 * trace and a record whose trace this check refused to certify both read
 * `null`, and a reader cannot act on the second without knowing which it has.
 * It is `absent`, `truncated`, `unscoped`, or `null` when a reading was made.
 *
 * `managed_seen` is the number and not a verdict, so it blocks nothing.
 *
 * ADR-0024 records the decisions and what would reopen each one.
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
  const reading = traceReading(record);
  return {
    installed_served: installedServed,
    control_served: controlServed,
    discovered,
    control_clean: controlClean,
    isolated,
    trace_agrees: reading.agrees,
    trace_withheld: reading.withheld,
    managed_seen: managedSeen(record),
    passes: discovered && controlClean && isolated && reading.agrees !== false,
  };
}

/** One line per record, for a person reading the check's output. */
export function describe(name, record) {
  const o = deriveOutcome(record);
  // Each VALUE is asked about on its own. Redacting the assembled line let
  // `unwrap` glue one field's tail to the next field's head and see a
  // credential that no field carried, which withheld the filename, the verdict
  // and the whole tuple from a run that was clean. A value is the unit a
  // credential could actually occupy, so it is the unit that gets the question.
  const tuple = TUPLE
    .map((f) => `${f}=${redact(String(record.identity?.[f] ?? '-'))}`)
    .join(' ');
  // `control_served` is printed beside `control_clean`, because a control that
  // never ran and a control that ran clean are opposite readings of the same
  // empty answer, and a line that showed only the second would hide the first.
  // The name and the derived flags are this module's own words, so they carry
  // nothing to redact and stay outside the question.
  // These three print their `null` verbatim, because `null` is a reading here
  // and not a missing value. Printing a dash would spell it the way an absent
  // tuple element is spelled, and those are different states. `trace_withheld`
  // rides beside `trace_agrees` rather than under it, because a withheld
  // reading printed without its cause is the wrong number one step removed.
  return `${name}: ${o.passes ? 'derives PASS' : 'derives FAIL'} `
    + `(installed_served=${o.installed_served} discovered=${o.discovered} `
    + `control_served=${o.control_served} control_clean=${o.control_clean} `
    + `isolated=${o.isolated} trace_agrees=${o.trace_agrees} `
    + `trace_withheld=${o.trace_withheld} managed_seen=${o.managed_seen}) ${tuple}`;
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

/**
 * Returns `{ problems, lines, outcomes }` over a directory of records.
 *
 * A record the checker cannot read is NAMED and counted as `unread`. It used to
 * be dropped, so the census described fewer records than the directory carried
 * — which is the `unread-matrix-row` defect this repository already names for
 * grounding matrices, reappearing in the probe corpus. It was reachable by
 * editing a constant: a lower `TRACE_LINE_LIMIT` made committed records
 * malformed and the denominator fell from three to two with nothing saying so.
 * That specific route is closed, and the census is counted this way regardless,
 * because a count that quietly omits its hard cases is the defect rather than
 * the route to it.
 */
export async function checkDirectory(dir) {
  const problems = [];
  const lines = [];
  const outcomes = { pass: 0, fail: 0, unread: 0 };
  for (const { name, record, unreadable } of await readRecords(dir)) {
    if (unreadable) {
      problems.push(`${name}: not readable as JSON.`);  // Our own words only.
      lines.push(`${name}: derives NOTHING (the file is not readable as JSON)`);
      outcomes.unread += 1;
      continue;
    }
    const found = checkRecord(record, name);
    problems.push(...found);
    if (found.length) {
      lines.push(`${name}: derives NOTHING (the record is malformed, so no `
        + 'outcome is computed from it)');
      outcomes.unread += 1;
      continue;
    }
    lines.push(describe(name, record));
    outcomes[deriveOutcome(record).passes ? 'pass' : 'fail'] += 1;
  }
  return { problems, lines, outcomes };
}

/**
 * The summary line, which names what the records DERIVED.
 *
 * "Clean" said only that every record was well formed, and a reader took it for
 * a green probe. The two are different questions, and this run answers the
 * second one out loud: a directory holding nothing but failures is clean and
 * says the probe failed.
 */
export function summarise({ pass, fail, unread = 0 }) {
  const total = pass + fail + unread;
  if (!total) return 'No probe records yet. The isolation probe is a manual protocol.';
  const derived = [];
  if (pass) derived.push(`${pass} derives PASS`);
  if (fail) derived.push(`${fail} derives FAIL`);
  // Named in the same breath as the other two, because a record the checker
  // could not read is a record the count has to carry rather than lose.
  if (unread) derived.push(`${unread} unread`);
  return `${unread ? 'Probe records checked' : 'Probe records well formed'}. `
    + `${total} checked: ${derived.join(', ')}.`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'probes');
  const { problems, lines, outcomes } = await checkDirectory(dir);
  for (const line of lines) process.stdout.write(`${line}\n`);
  for (const p of problems) process.stderr.write(`${p}\n`);
  if (problems.length) process.exit(1);
  process.stdout.write(`${summarise(outcomes)}\n`);
}
