#!/usr/bin/env node
/**
 * Run one isolation probe and write its record.
 *
 *   node bench/collect-probe.mjs --skill NAME --pathway claude:user [options]
 *
 * The measurement design, section 4.2, makes this probe a blocking prerequisite
 * for installed delivery. Its acceptance test: an installed skill is
 * discoverable under the acceptance flag set, plus at most the trace flag, in a
 * redirected home the harness fully respects. That set is the probe's own —
 * `-p`, the model alias, `--setting-sources user`, `--strict-mcp-config`,
 * `--output-format json` — and it lives in `probe.mjs`, next to the check that
 * enforces it, because a second copy is a second thing to drift.
 *
 * It DIVERGES from `bench/run.sh` on one flag, deliberately. `run.sh` selects
 * `--setting-sources ''` for its no-guidance control, because that control runs
 * in the operator's real home and the empty spelling is what suppresses their
 * CLAUDE.md and their settings. A probe arm's home is a throwaway empty one, so
 * there is nothing there to suppress, and the empty spelling suppressed the
 * user SKILL directory too — which switched off the very thing under test.
 * Measured 2026-08-07, ADR-0024. Reconciling the two spellings reintroduces
 * that fault.
 *
 * What it does, in order: install the skill into a throwaway redirected home
 * through one real pathway, plant a nonce in the installed copy, ask both that
 * home and an identical empty one to repeat the nonce, and write both answers
 * verbatim with the identity tuple and the date.
 *
 * **What this measures, and what it does not.** Amended 2026-08-07, ADR-0024.
 * The nonce goes in the skill's frontmatter DESCRIPTION, which is what the
 * harness puts in front of the model: skills arrive as an attachment of names
 * and descriptions, and a SKILL.md body loads only when the model invokes the
 * skill. So this probe measures the ATTACHMENT SURFACE — can this harness, on
 * this build, through this pathway, surface an installed skill at all — which
 * is the job section 4.1 gives it, in those words.
 *
 * It deliberately does NOT measure invocation, selection, or loading. Those are
 * section 4.2's territory, and section 4.2 keeps them entangled on purpose. The
 * nonce used to sit in the body, which made this probe measure invocation with
 * section 4.1's apparatus: a FAIL could not be attributed, because a body that
 * never loads and a skill that was never discovered produce the same answer.
 * One did, and it took four call pairs to tell the two apart.
 *
 * What it never does: say whether the probe passed. `probe.mjs` derives that
 * from these bytes, and `npm run check:probes` prints what it derived.
 *
 * The nonce is planted in a throwaway install and never in the tree a study
 * measures, which is the second of the two options section 4.1 allows. Nothing
 * a study measures is touched.
 *
 * Options:
 *   --skill NAME          the skill to install. Required.
 *   --pathway P:S         platform and scope, such as claude:user. Required.
 *   --model ALIAS         the model alias the arms run under. Default: opus.
 *   --dry-run             prepare both homes, print the plan, call no model.
 *
 * The environment class is always `empty-home`: two empty homes, each handed
 * one credential from the environment and nothing else (ADR-0017). Either route
 * builds the same environment, so the class is named for the home rather than
 * for the credential. A representative stack needs a protocol that builds the
 * stack, and this collector does not have one, so it never labels a record with
 * that class.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installSkills } from '../src/install.js';
import { resolveTarget, PLATFORMS, SCOPES } from '../src/targets.js';
import { destinationState, ensureDir, isBelow, walk } from '../src/tree.js';
import { armAnswered, TRACE_FLAG } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

/**
 * Which harness reads a pathway's tree. A probe that installed into
 * `.codex/skills` and then asked Claude Code about it would attribute one
 * harness's answer to the other pathway, and would normally record a failure
 * that says nothing about Codex.
 *
 * `cowork` resolves to the Claude directory, and `agents` is a cross-agent
 * convention that Claude reads, so both are probed with `claude`. Codex needs
 * its own runner, and this collector does not have one.
 */
export const HARNESS_FOR = { claude: 'claude', cowork: 'claude', agents: 'claude' };

/** `claude:user` into its two halves, refusing anything this collector cannot probe. */
export function parsePathway(pathway) {
  const parts = String(pathway ?? '').split(':');
  // Exactly two. Destructuring ignored anything after the second, so
  // `claude:user:sub/record` installed and paid for two live calls as
  // `claude:user` while the record kept the malformed string — which then
  // wrote the file below a nested directory the check never scans, or under a
  // colon-bearing name Windows cannot check out.
  if (parts.length !== 2) {
    throw new Error(`A pathway is <platform>:<scope>, and "${pathway}" is not.`);
  }
  const [platform, scope] = parts;
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unknown platform "${platform}". Known: ${PLATFORMS.join(', ')}`);
  }
  if (!SCOPES.includes(scope)) {
    throw new Error(`Unknown scope "${scope}". Known: ${SCOPES.join(', ')}`);
  }
  const harness = HARNESS_FOR[platform];
  if (!harness) {
    throw new Error(
      `This collector drives ${[...new Set(Object.values(HARNESS_FOR))].join(', ')}, and `
      + `"${platform}" needs its own runner. Probing it with another harness would `
      + 'attribute that harness\'s answer to this pathway.');
  }
  return { platform, scope, harness };
}

/**
 * The flag set both arms run. It is a probe arm's, defined by `REQUIRED_FLAGS`
 * and `FIXED_VALUES` in `probe.mjs`, with the model alias substituted.
 * `probe.mjs` refuses anything else.
 *
 * It is not `bench/run.sh`'s. That file selects `--setting-sources ''` for a
 * no-guidance control in the operator's real home, and here the same spelling
 * suppresses the user skill directory in a home that has nothing else in it.
 * The divergence is the whole point rather than a drift, and the file header
 * carries the argument.
 *
 * `debugFile` adds the one allowed extra, `--debug-file`, which retains the
 * harness trace section 4.1 asks a record to carry. Omit it and the arm runs
 * the acceptance set alone.
 */
export function armFlags(model, debugFile = null) {
  const flags = ['-p', '--model', model, '--setting-sources', 'user', '--strict-mcp-config',
    '--output-format', 'json'];
  return debugFile ? [...flags, TRACE_FLAG, debugFile] : flags;
}

/**
 * The build the tuple names: the one an arm that ANSWERED reports.
 *
 * It reads the same predicate the check and the derived outcome read. Taking
 * the first arm with a `model_id` named an errored arm's build, which bound a
 * recorded failure to an identity that never served it — and an errored arm
 * deliberately keeps its `model_id`, so the value is there to be taken.
 */
export function tupleModel(installedArm, controlArm) {
  if (armAnswered(installedArm)) return installedArm.model_id;
  if (armAnswered(controlArm)) return controlArm.model_id;
  return '';
}

/** The sentence the nonce rides into the frontmatter description. */
export function plantedSentence(nonce) {
  return `The stylewright probe nonce is ${nonce}.`;
}

/**
 * The installed `SKILL.md`, with the nonce woven into the frontmatter
 * DESCRIPTION. Pure, so the rewrite is testable without a filesystem.
 *
 * The description is where the plant belongs, because the description is what
 * the harness puts in front of the model. Measured 2026-08-07: the harness
 * sends skills as an attachment of names and descriptions, and a SKILL.md BODY
 * loads only when the model invokes the skill. The nonce used to go in the
 * body, so a probe could return NONE with the skill perfectly discovered, and
 * did. ADR-0024 records the move.
 *
 * The rewrite refuses rather than guesses. A file with no frontmatter, or a
 * frontmatter with no `description`, is not a skill this probe can plant in,
 * and a plant that silently did nothing would read as a failed probe.
 *
 * It refuses four YAML value shapes for the same reason, because appending to
 * the line CORRUPTS each of them rather than extending it. A quoted scalar puts
 * the sentence outside the closing quote, which is a parse error or a second
 * value. A block scalar, `|` or `>`, opens on the next lines, so the sentence
 * lands on the header where it is not part of the value at all. Every skill
 * this repository ships writes a plain scalar, so the refusal costs nothing
 * today and stops a silent miscollection the day one does not. Handling these
 * needs a YAML writer, and a probe that mis-plants pays two live calls to
 * report a failure about itself.
 */
const UNPLANTABLE = {
  '"': 'a double-quoted scalar',
  "'": 'a single-quoted scalar',
  '|': 'a literal block scalar',
  '>': 'a folded block scalar',
};

export function plantInDescription(text, nonce) {
  const lines = String(text).split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('The installed SKILL.md opens with no frontmatter, so the nonce has '
      + 'nowhere to go that the harness would read.');
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) {
    throw new Error('The installed SKILL.md has frontmatter that never closes.');
  }
  // The FIRST description line inside the frontmatter, and only there. A later
  // `description:` in the body is prose about descriptions.
  const at = lines.findIndex((l, i) => i > 0 && i < close && /^description:\s*/.test(l));
  if (at === -1) {
    throw new Error('The installed SKILL.md frontmatter carries no description, and the '
      + 'description is the surface this probe measures.');
  }
  const value = lines[at].replace(/^description:\s*/, '');
  const shape = UNPLANTABLE[value[0]];
  if (shape) {
    throw new Error(`The installed SKILL.md writes its description as ${shape}, and appending `
      + 'to that line changes the value into something the harness never reads. Planting '
      + 'there would buy a probe that failed about itself.');
  }
  lines[at] = `${lines[at].replace(/\s+$/, '')} ${plantedSentence(nonce)}`;
  return lines.join('\n');
}

/**
 * The question both arms answer. It never carries the nonce, because a harness
 * handed the nonce repeats it without reading anything, and that record would
 * look exactly like a pass.
 */
export const ASK = 'What is the stylewright probe nonce? Reply with the nonce string '
  + 'and nothing else. If you cannot find one, reply with the single word NONE.';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * A digest over the installed tree: every relative path with the digest of its
 * bytes. It names the contents, so a file swapped for another of the same
 * length moves it.
 */
export async function treeDigest(dir) {
  const rels = await walk(dir);
  const lines = [];
  for (const rel of rels) lines.push(`${rel} ${sha(await fs.readFile(path.join(dir, rel)))}`);
  return sha(lines.join('\n'));
}

/**
 * The open flags a plant uses. `noFollow` is a parameter so a test can build
 * the word a platform without `O_NOFOLLOW` produces, and measure what that
 * platform actually permits rather than taking a docstring's word for it.
 */
export function plantFlags(noFollow = constants.O_NOFOLLOW ?? 0) {
  // `O_RDWR`, because the plant now REWRITES a frontmatter line rather than
  // appending a section. One handle still does the whole job, so the file the
  // read saw is the file the write lands on.
  return constants.O_RDWR | noFollow;
}

/**
 * Every ancestor between `baseDir` and `dir`, including `baseDir` itself, that
 * is not a plain directory. `dir` may be `baseDir`, which is the ordinary case
 * for a record written directly into the probe directory.
 *
 * Containment is asserted rather than assumed. The walk splits a relative path,
 * so a `dir` ABOVE the base produced `..` components, and `path.join` collapsed
 * them into a walk back up the tree that reported nothing — the caller learned
 * the chain was clean about directories it never asked about. A project-scope
 * pathway produces exactly that relative path. Safety survived on
 * normalisation, which is an accident, and this makes it a decision.
 *
 * Both write surfaces in this file read it, before and after they write. A
 * check and the call it guards are two steps, so the answer is re-read
 * afterwards: creating or classifying a chain narrows the window and does not
 * close it, and Node offers no way to open a path relative to a directory it
 * has already checked. Detection after the fact is the honest end of what this
 * can do.
 */
export async function chainProblems(baseDir, dir) {
  const same = path.resolve(baseDir) === path.resolve(dir);
  if (!same && !isBelow(baseDir, dir)) {
    return [`${dir} is not under ${baseDir}, so the chain between them is not a chain.`];
  }
  const problems = [];
  if (await destinationState(baseDir) !== 'directory') {
    problems.push(`${baseDir} is not a directory.`);
  }
  let cur = baseDir;
  for (const part of path.relative(baseDir, dir).split(path.sep).filter((p) => p && p !== '.')) {
    cur = path.join(cur, part);
    if (await destinationState(cur) !== 'directory') problems.push(`${cur} is not a directory.`);
  }
  return problems;
}

/**
 * What an open refused with, said in this repository's terms.
 *
 * Separate and exported because the branch is otherwise unreachable: the
 * classification above refuses a link before the open ever runs, so only a swap
 * between the two steps reaches this, and no deterministic test can arrange
 * that. Testing the mapping directly is what anchors it.
 */
export function openFailure(err, target) {
  if (err.code === 'ELOOP' || err.code === 'EMLINK') {
    return new Error(`${target} became a symbolic link, and nothing is written through one.`);
  }
  return err;
}

/**
 * Plant the nonce in the installed skill, without following anything.
 *
 * This is a write surface like any other, so it inherits the tree discipline
 * rather than repeating the defect the rest of this repository already fixed
 * twice. `appendFile` resolves the WHOLE path, so two different swaps sent the
 * nonce outside the throwaway tree: a `SKILL.md` replaced by a symbolic link,
 * and the skill directory itself replaced by one. The leaf is checked here and
 * the chain is checked from `baseDir`, before and after the write.
 *
 * One residue, stated rather than papered over. `O_NOFOLLOW` is POSIX, and it
 * reads as zero where a platform does not define it, which includes Windows.
 * There, the classification is all there is, so a leaf swapped for a link to a
 * regular file between the classification and the open is followed, and
 * `fstat` on the handle reports a plain file because it is one. Measured, not
 * reasoned: `test/probe.test.js` builds both flag words and records that the
 * POSIX word refuses the swap and the Windows word permits it. The chain
 * re-read after the write is what still catches a swapped ancestor there.
 *
 * `afterWrite` is injected for the same reason `installSkills` takes its clock:
 * the check that follows a write is unreachable by any deterministic test
 * unless something can act in the window it guards. A test passes an
 * `afterWrite` that moves the tree. Production passes nothing.
 *
 * It runs after the handle CLOSES, which is both the more faithful staging and
 * the only portable one. Windows refuses to rename or remove a directory
 * holding an open handle, so staging a swap while the handle was open died with
 * EPERM before the guard it exists to exercise ever ran.
 */
export async function plantNonce(skillDir, nonce, {
  baseDir = path.dirname(skillDir),
  flags = plantFlags(),
  afterWrite = () => {},
} = {}) {
  const before = await chainProblems(baseDir, skillDir);
  if (before.length) {
    throw new Error(`The installed tree moved before the nonce was planted. ${before.join(' ')}`);
  }
  const target = path.join(skillDir, 'SKILL.md');
  const state = await destinationState(target);
  if (state !== 'file') {
    throw new Error(`The installed SKILL.md is ${state === 'absent' ? 'missing' : `a ${state}`}, `
      + 'so the nonce has nowhere to go.');
  }
  const fh = await fs.open(target, flags).catch((err) => { throw openFailure(err, target); });
  try {
    const st = await fh.stat();
    if (!st.isFile()) {
      throw new Error(`${target} is not a plain file, and nothing is written through it.`);
    }
    // Read, rewrite, write back, all on the ONE handle the checks above
    // classified. Re-opening by path between the read and the write would put
    // the whole swap window back that this function exists to close.
    const planted = plantInDescription(await fh.readFile('utf8'), nonce);
    await fh.truncate(0);
    await fh.write(planted, 0);
  } finally {
    await fh.close();
  }
  await afterWrite();
  const after = await chainProblems(baseDir, skillDir);
  if (after.length) {
    throw new Error('The installed tree moved while the nonce was planted, so the nonce may '
      + `have gone somewhere else. ${after.join(' ')}`);
  }
}

/**
 * The record, assembled from what the run produced.
 *
 * Pure, and separate from `main`, because everything a reader depends on is
 * decided here: which arm names the tuple's model, which route authenticated,
 * and which environment class the collector actually built. Inside `main` none
 * of it could be tested without paying for two live calls.
 */
export function buildRecord({
  date, skill, nonce, pathway, flags, route, build, installedArm, controlArm, treeDigest: digest,
}) {
  return {
    kind: 'isolation-probe',
    date,
    skill,
    nonce,
    nonce_plant: 'the frontmatter description line of SKILL.md, rewritten in a throwaway '
      + 'install, which no study measures',
    ask: ASK,
    flags,
    // Provenance, not identity. The route names how the arm authenticated, and
    // ADR-0017 states why it sits outside the tuple.
    auth_route: route,
    identity: {
      harness_build: build,
      model: tupleModel(installedArm, controlArm),
      platform: `${process.platform}-${process.arch}`,
      pathway,
      // Named for the home, never for the route. Both routes build the same
      // environment, so naming it for one carried the route into the tuple,
      // falsely, on every run of the other. A representative stack is a
      // different protocol, and labelling this one with that class would let
      // an empty-home probe cover a study that ran under an operator's own
      // configuration.
      environment_class: 'empty-home',
      stack_digest: null,
    },
    installed: { ...installedArm, tree_digest: digest, trace: installedArm.trace ?? null },
    control: { ...controlArm, trace: controlArm.trace ?? null },
  };
}

/**
 * The record's filename. One probe, one file, named for what it covers.
 *
 * Built from the PARSED pathway, never from the string an operator typed, so
 * no separator an operator supplies can reach the filename.
 */
export function recordName({ date, pathway, nonce }) {
  const { platform, scope } = parsePathway(pathway);
  return `${date}-${platform}-${scope}-${nonce.slice(-8)}.json`;
}

/**
 * The build that emitted the answer, or an empty string when no single build
 * can be named.
 *
 * A tie is refused rather than resolved. `bench/extract.mjs` already refuses
 * one, for the reason that applies here twice over: the identity tuple binds a
 * probe to a served model, and guessing binds a passing probe to the wrong
 * one, which then matches or excludes a study on a model it never ran.
 */
export function servingBuild(modelUsage) {
  const usage = Object.entries(modelUsage ?? {})
    .map(([id, u]) => [id, u.outputTokens ?? u.output_tokens ?? 0])
    .sort((a, b) => b[1] - a[1]);
  if (!usage.length) return '';
  if (usage.length > 1 && usage[0][1] === usage[1][1]) return '';
  return usage[0][0];
}

/**
 * One harness run's output, as an arm.
 *
 * Pure, and separate from the spawn, because everything worth checking about a
 * run lives here: whether the JSON parsed, which build answered, and whether
 * the harness called it a failure. Inside the close handler none of it could be
 * tested.
 *
 * The answer text is kept even when the run reported an error, because that
 * text is the evidence — the refusal this probe first recorded was an errored
 * run whose result said the harness was not logged in. The failure byte travels
 * beside it, and the derived outcome refuses to count an errored arm as served.
 *
 * `is_error` is read as TRUTHY, the way `bench/extract.mjs` reads the same
 * field. Testing for exactly `true` made a non-boolean a failed run to the
 * extractor and a clean run to this collector, and that disagreement would have
 * been baked into the record before anything could check it.
 */
export function readRun({ raw, err = '', home }) {
  const failed = (why) => ({
    answer: '', model_id: '', is_error: true,
    stderr: `${err}\n${why}:\n${String(raw).slice(0, 400)}`, home,
  });
  let run;
  try {
    run = JSON.parse(raw);
  } catch {
    return failed('not JSON');
  }
  // JSON that parses and is not a run. `null` threw a TypeError out of the
  // collector, after both live calls were paid for and before any record
  // existed, and a bare number reported a clean run with nothing in it.
  // `extract.mjs` exits non-zero on both.
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    return failed('JSON, but not a run');
  }
  return {
    answer: typeof run.result === 'string' ? run.result : '',
    model_id: servingBuild(run.modelUsage),
    is_error: Boolean(run.is_error),
    stderr: err,
    home,
  };
}

/**
 * The two routes a probe arm can authenticate by, in precedence order.
 *
 * A subscription token wins when both are set, by owner directive on #77. The
 * order of this list IS the precedence, so there is one place to read it.
 */
export const AUTH_ROUTES = [
  { route: 'subscription', variable: 'CLAUDE_CODE_OAUTH_TOKEN' },
  { route: 'api-key', variable: 'ANTHROPIC_API_KEY' },
];

/**
 * Which route this environment authenticates by, or null for neither.
 *
 * Presence, never the value. Nothing in this repository reads, prints, or
 * records what either variable holds — the route NAME is what a record carries.
 *
 * The answer is only true of an arm built by `armEnv`, which hands the harness
 * one credential and nothing else. Asked of a raw shell it describes that
 * shell's first supported route and says nothing about the others, which is
 * why `unmodelledCredentials` exists beside it.
 */
export function authRoute(env) {
  for (const { route, variable } of AUTH_ROUTES) {
    if (env[variable]) return route;
  }
  return null;
}

/**
 * Variables the harness reads for credentials, endpoints, or headers, beyond
 * the two routes this collector models.
 *
 * The list is this repository's reading of one CLI build, so it is a statement
 * about a moving target and it will go stale. That is exactly why it is not
 * load-bearing: `armEnv` builds an arm from an ALLOWLIST, so a variable nobody
 * here has heard of never reaches the harness. This list drives a refusal
 * instead — an operator whose shell configures a route the probe does not
 * model gets told so, rather than getting a record that names one route while
 * the shell meant another.
 */
export const UNMODELLED_CREDENTIAL_VARS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_AUTH_TOKEN',
  'ANTHROPIC_AWS_API_KEY',
  'AWS_BEARER_TOKEN_BEDROCK',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'CLAUDE_CODE_HOST_AUTH_ENV_VAR',
  'CLAUDE_BG_AUTH_SNAPSHOT_PATH',
];

/** The names, never the values, of unmodelled credential variables that are set. */
export function unmodelledCredentials(env) {
  return UNMODELLED_CREDENTIAL_VARS.filter((name) => env[name]);
}

/**
 * The variables an arm inherits, besides its credential and its home.
 *
 * An ALLOWLIST, because the arm's environment is part of the treatment. The
 * first version subtracted a handful of names it knew about, and a review
 * measured what survived: an auth token, a base URL, and a Bedrock credential
 * all reached the harness while the record named the API key. Correctness by
 * enumeration decays with every CLI release, which is the same reason this
 * repository refuses an unrecorded install path rather than listing the ones it
 * knows.
 *
 * What is missing is deliberate. `APPDATA` and `LOCALAPPDATA` point into the
 * real profile and would undo the redirected home on Windows. A proxy, a
 * certificate bundle, and `NODE_OPTIONS` all change how the harness talks or
 * what it loads. A variable this list omits and the harness needs shows up as a
 * probe that failed, in a committed record, which is the outcome this design
 * prefers to a silent difference.
 */
export const INHERITED_VARS = [
  'PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM',
  'SHELL', 'USER', 'LOGNAME',
  'SystemRoot', 'windir', 'COMSPEC', 'PATHEXT', 'SystemDrive',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
];

/**
 * The environment one arm runs under: the allowlist, one credential, and a
 * redirected home.
 *
 * Precedence is delivered by handing over the winner alone rather than by
 * asking the harness to prefer one. The arm therefore holds exactly one
 * credential, and the route a record names is the route that served it.
 *
 * Windows environment names are case-insensitive, so the allowlist is matched
 * that way. Comparing exactly would have dropped `Path` and left an arm unable
 * to find the harness at all.
 */
export function armEnv(parent, home) {
  const wanted = new Map(INHERITED_VARS.map((name) => [name.toLowerCase(), true]));
  const env = {};
  for (const [name, value] of Object.entries(parent)) {
    if (wanted.has(name.toLowerCase())) env[name] = value;
  }
  const winner = AUTH_ROUTES.find(({ route }) => route === authRoute(parent));
  if (winner) env[winner.variable] = parent[winner.variable];
  env.HOME = home;
  env.USERPROFILE = home;
  return env;
}

/**
 * The trace lines a record keeps, and the only ones.
 *
 * Section 4.1 asks a probe to record "the harness trace where one exists", and
 * says a trace naming the loaded file is better evidence than either answer.
 * This is the selector that decides which lines those are: the harness's own
 * statements about where it looked for skills and how many it loaded. Four
 * documents in this repository quote those lines as the warrant for the flag
 * amendment, and until now no artifact retained one.
 *
 * The rest of a debug log is not kept. It runs to megabytes, most of it about
 * transport and tool wiring, and a record is committed — so retaining the whole
 * thing would bury the evidence and widen every surface a credential could
 * reach. `TRACE_LINE_LIMIT` bounds even the kept set, because the log repeats
 * these lines per session and a record is read by a person.
 *
 * The lines are kept VERBATIM, in the harness's words, never summarised. A
 * summary of a trace is the author's word about the evidence, which is the one
 * thing this protocol refuses everywhere else.
 */
export const TRACE_PATTERNS = [/Loading skills from/i, /Loaded \d+ unique skills/i];
export const TRACE_LINE_LIMIT = 40;

export function skillTraceLines(text) {
  return String(text).split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => TRACE_PATTERNS.some((pattern) => pattern.test(line)))
    .slice(0, TRACE_LINE_LIMIT);
}

/**
 * The trace for one arm, or `null` when the harness left none.
 *
 * The two states are different and the record keeps them apart. An empty list
 * says a debug log was written and named no skill loading, which is itself a
 * reading. `null` says no log reached this collector at all — the harness
 * refused before it wrote one, or no `--debug-file` was asked for. Collapsing
 * the two would let a missing file read as a harness that loaded nothing.
 */
export async function readTrace(file) {
  if (!file) return null;
  try {
    return skillTraceLines(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * One harness run, with the home redirected. Returns the answer verbatim and
 * the build that served it, or the reason neither exists.
 *
 * The environment carries one credential through, and that is how the harness
 * authenticates over an empty home (ADR-0017). Nothing here reads its value,
 * and nothing writes it anywhere.
 */
export function runArm({ harness, flags, cwd, home, ask }) {
  const env = armEnv(process.env, home);
  return new Promise((resolve) => {
    const child = spawn(harness, [...flags, ask], {
      cwd, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Buffers, concatenated once at the end. Decoding each chunk on arrival
    // splits a multibyte character across a chunk boundary and substitutes a
    // replacement character, so the retained answer would differ from the bytes
    // the harness emitted, and JSON that was valid could arrive damaged.
    const out = [];
    const errs = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => errs.push(d));
    const text = (chunks) => Buffer.concat(chunks).toString('utf8');
    child.on('error', (e) => resolve({
      answer: '', model_id: '', is_error: true, stderr: `${text(errs)}${e.message}`, home,
    }));
    child.on('close', () => resolve(readRun({ raw: text(out), err: text(errs), home })));
  });
}

/** The harness build, as `bench/run.sh` reads it: the first field of --version. */
export function harnessBuild(harness) {
  return new Promise((resolve) => {
    const child = spawn(harness, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const out = [];
    child.stdout.on('data', (d) => out.push(d));
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(
      Buffer.concat(out).toString('utf8').split('\n')[0]?.trim().split(/\s+/)[0] ?? ''));
  });
}

/**
 * Writes the record, through the same tree discipline as every other write
 * surface in this repository: a contained destination, no symbolic link, and
 * exclusive creation, so an existing record is refused rather than replaced.
 */
export async function writeRecord(outPath, record, baseDir, { afterWrite = () => {} } = {}) {
  if (!isBelow(baseDir, outPath)) {
    throw new Error(`A probe record is written under ${baseDir}, not at ${outPath}.`);
  }
  // The base directory ITSELF is classified, the way `reachability` classifies
  // its own base. `ensureDir` compares paths below the base and never the base,
  // so a symlinked `probes/` was walked through rather than refused, and the
  // exclusive write then landed in whatever the link pointed at.
  const baseState = await destinationState(baseDir);
  if (baseState !== 'absent' && baseState !== 'directory') {
    throw new Error(`${baseDir} is a ${baseState}, and a record is never written through one.`);
  }
  await ensureDir(path.dirname(outPath), baseDir);

  // Identity comes from the HANDLE that created the file, not from the path
  // afterwards. `wx` protects the leaf alone, so a link appearing at an
  // ancestor between the classification and the call sends the write outside
  // the tree, and a path sampled after the write can name a file another
  // process swapped in. The scaffold learned all of this first.
  // `wx` IS the refusal, and the classification only explains it. Asking first
  // and opening second left the answer stale by the time the call ran.
  const fh = await fs.open(outPath, 'wx').catch(async (err) => {
    if (err.code !== 'EEXIST') throw err;
    const state = await destinationState(outPath);
    throw new Error(`${outPath} already holds a ${state}. A probe record is never replaced.`);
  });
  let identity;
  try {
    identity = await fh.stat();
    await fh.writeFile(`${JSON.stringify(record, null, 2)}\n`);
  } finally {
    await fh.close();
  }
  // Injected for the same reason the plant's is, and in the same place: after
  // the handle closes, in the window the checks below guard.
  await afterWrite();

  // Re-read the chain after the write. Creating it level by level narrows the
  // window and does not close it, and Node offers no way to open a path
  // relative to a directory it has already checked, so detection after the
  // fact is the honest end of what this can do.
  const problems = await chainProblems(baseDir, path.dirname(outPath));
  const now = await fs.lstat(outPath).catch(() => null);
  if (!now?.isFile() || now.dev !== identity.dev || now.ino !== identity.ino) {
    problems.push(`${outPath} no longer names the file this call created.`);
  } else if (problems.length) {
    // Ours by identity, so removing it destroys nothing another process made.
    await fs.rm(outPath, { force: true });
  }
  if (problems.length) {
    throw new Error(`The record was not written where it was meant to go. ${problems.join(' ')}`);
  }
}

export function parseArgs(argv) {
  const opts = { model: 'opus', dryRun: false };
  const keys = {
    '--skill': 'skill',
    '--pathway': 'pathway',
    '--model': 'model',
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') { opts.dryRun = true; continue; }
    const key = keys[argv[i]];
    if (!key) throw new Error(`unknown flag: ${argv[i]}`);
    const value = argv[i + 1];
    // A flag in a value position is a missing value, not a value. `--model
    // --dry-run` consumed the safety flag as the model alias and then ran both
    // live calls, which is the opposite of what the operator asked for.
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${argv[i]} needs a value, and "${value ?? ''}" is another flag.`);
    }
    opts[key] = value;
    i += 1;
  }
  if (!opts.skill) throw new Error('--skill is required.');
  if (!opts.pathway) throw new Error('--pathway is required.');
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const { platform, scope, harness } = parsePathway(opts.pathway);
  // The date the collection happened, and nothing else. An operator-supplied
  // date can post-date a record that cadence and staleness are computed from,
  // so this reads the clock rather than an argument.
  const date = new Date().toISOString().slice(0, 10);
  const nonce = `sw-probe-${crypto.randomBytes(8).toString('hex')}`;

  // ADR-0017: the harness authenticates from the environment, over an empty
  // home. Without a credential both arms answer that they are not logged in,
  // and the probe never reaches its question. Presence is all that is read.
  const route = authRoute(process.env);
  if (!opts.dryRun && !route) {
    throw new Error(
      `Set one of ${AUTH_ROUTES.map((r) => r.variable).join(' or ')} in this shell. `
      + 'The probe runs over an empty home, so the harness has nothing else to '
      + 'authenticate with. `claude setup-token` issues a subscription token, and '
      + 'the subscription route wins when both are set.');
  }
  // Refuse rather than guess. The allowlist above already keeps these away from
  // the arm, so the run would be well defined — but it would not be the run the
  // operator's shell describes, and a record naming one route while the shell
  // configured another is the failure the route field exists to prevent. Names
  // only, never values.
  const unmodelled = unmodelledCredentials(process.env);
  if (!opts.dryRun && unmodelled.length) {
    throw new Error(
      `This shell sets ${unmodelled.join(', ')}, and the probe models two routes `
      + `only: ${AUTH_ROUTES.map((r) => r.variable).join(' and ')}. An arm never `
      + 'inherits those variables, so the run would not be the one this shell '
      + 'describes. Unset them, or run the probe from a shell without them.');
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-probe-'));
  const arms = {};
  for (const arm of ['installed', 'control']) {
    const home = path.join(root, arm, 'home');
    const cwd = path.join(root, arm, 'work');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    arms[arm] = { home, cwd };
  }

  const targetDir = resolveTarget({ platform, scope, home: arms.installed.home, cwd: arms.installed.cwd });
  const { installed, skipped } = await installSkills({
    repoRoot: REPO, targetDir, names: [opts.skill], pathway: opts.pathway, now: `${date}T00:00:00Z`,
  });
  if (!installed.length) {
    throw new Error(`the install refused ${opts.skill}: ${JSON.stringify(skipped)}`);
  }

  const skillDir = path.join(targetDir, opts.skill);
  // The whole chain from the throwaway home down, not just the skill's parent,
  // because a link anywhere along it sends the plant outside the tree.
  await plantNonce(skillDir, nonce, { baseDir: arms.installed.home });
  const digest = await treeDigest(skillDir);

  // ONE debug path, and the arms run one after the other through it. Two paths
  // would put a different `--debug-file` value in each arm's invocation, and
  // the record carries ONE flag set — which would then be true of neither arm.
  // The trace is read and the file removed before the next arm starts, so
  // attribution rests on the sequencing below and not on a guess about which
  // lines came from where.
  const debugFile = path.join(root, 'harness-debug.log');
  const flags = armFlags(opts.model, debugFile);
  if (opts.dryRun) {
    process.stdout.write(`installed tree: ${skillDir}\n`);
    process.stdout.write(`control home:   ${arms.control.home}\n`);
    process.stdout.write(`tree digest:    ${digest}\n`);
    process.stdout.write(`nonce:          ${nonce}\n`);
    process.stdout.write(`flags:          ${flags.map((f) => (f === '' ? "''" : f)).join(' ')}\n`);
    process.stdout.write(`ask:            ${ASK}\n`);
    process.stdout.write('dry run, so no model was called and no record was written.\n');
    return 0;
  }

  const build = await harnessBuild(harness);
  const installedArm = await runArm({
    harness, flags, cwd: arms.installed.cwd, home: arms.installed.home, ask: ASK,
  });
  installedArm.trace = await readTrace(debugFile);
  await fs.rm(debugFile, { force: true });
  const controlArm = await runArm({
    harness, flags, cwd: arms.control.cwd, home: arms.control.home, ask: ASK,
  });
  controlArm.trace = await readTrace(debugFile);

  const record = buildRecord({
    date, skill: opts.skill, nonce, pathway: opts.pathway, flags, route, build,
    installedArm, controlArm, treeDigest: digest,
  });

  // One directory, always. A record written anywhere else is not committed, and
  // an uncommitted probe record is the retention gap in miniature. It also
  // keeps the containment check below load-bearing: a caller-supplied path
  // checked against its own parent can never fail.
  const probes = path.join(HERE, 'probes');
  const outPath = path.join(probes, recordName({ date, pathway: opts.pathway, nonce }));
  await writeRecord(outPath, record, probes);
  process.stdout.write(`${outPath}\n`);
  process.stdout.write('Run `npm run check:probes` to read what these bytes derive.\n');
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
