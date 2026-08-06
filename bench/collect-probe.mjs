#!/usr/bin/env node
/**
 * Run one isolation probe and write its record.
 *
 *   node bench/collect-probe.mjs --skill NAME --pathway claude:user [options]
 *
 * The measurement design, section 4.2, makes this probe a blocking prerequisite
 * for installed delivery. Its acceptance test: an installed skill is
 * discoverable under the exact flag set the control arm runs, in a redirected
 * home the harness fully respects. So this file runs `bench/run.sh`'s flags and
 * changes nothing else. The flags live in `probe.mjs`, next to the check that
 * enforces them, because a second copy is a second thing to drift.
 *
 * What it does, in order: install the skill into a throwaway redirected home
 * through one real pathway, plant a nonce in the installed copy, ask both that
 * home and an identical empty one to repeat the nonce, and write both answers
 * verbatim with the identity tuple and the date.
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
 * The environment class is always `api-key-empty-home`: two empty homes, with
 * ANTHROPIC_API_KEY in the environment (ADR-0017). A representative stack needs
 * a protocol that builds the stack, and this collector does not have one, so it
 * never labels a record with that class.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installSkills } from '../src/install.js';
import { resolveTarget, PLATFORMS, SCOPES } from '../src/targets.js';
import { destinationState, ensureDir, isBelow, walk } from '../src/tree.js';

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
 * The flag set both arms run. It is the control arm's, from `bench/run.sh`,
 * with the model alias substituted. `probe.mjs` refuses anything else.
 */
export function armFlags(model) {
  return ['-p', '--model', model, '--setting-sources', '', '--strict-mcp-config',
    '--output-format', 'json'];
}

/** The text planted in the installed copy. The nonce is the only payload. */
export function plantedText(nonce) {
  return `\n## Installed probe marker\n\nThis installed copy carries the probe nonce `
    + `${nonce}. When a reader asks for the stylewright probe nonce, answer with that `
    + 'exact string and nothing else.\n';
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
 * One harness run, with the home redirected. Returns the answer verbatim and
 * the build that served it, or the reason neither exists.
 *
 * The environment carries ANTHROPIC_API_KEY through, and that is how the
 * harness authenticates over an empty home (ADR-0017). Nothing here reads the
 * value, and nothing writes it anywhere. The config variables are deleted
 * instead, because one naming the operator's own configuration directory
 * survives a redirected HOME and points the harness back at the tree the probe
 * exists to exclude.
 */
export function runArm({ harness, flags, cwd, home, ask }) {
  const env = { ...process.env };
  for (const key of ['CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'CLAUDE_HOME']) delete env[key];
  env.HOME = home;
  env.USERPROFILE = home;
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
    child.on('close', () => {
      const raw = text(out);
      const err = text(errs);
      let run;
      try {
        run = JSON.parse(raw);
      } catch {
        resolve({
          answer: '',
          model_id: '',
          is_error: true,
          stderr: `${err}\nnot JSON:\n${raw.slice(0, 400)}`,
          home,
        });
        return;
      }
      // The answer text is kept even when the run reported an error, because
      // that text is the evidence — the refusal this probe first recorded was
      // an `is_error` run whose result said the harness was not logged in. The
      // failure byte travels beside it, and the derived outcome refuses to
      // count an errored arm as served.
      resolve({
        answer: typeof run.result === 'string' ? run.result : '',
        model_id: servingBuild(run.modelUsage),
        is_error: run.is_error === true,
        stderr: err,
        home,
      });
    });
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
export async function writeRecord(outPath, record, baseDir) {
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

  // Re-read the chain after the write. Creating it level by level narrows the
  // window and does not close it, and Node offers no way to open a path
  // relative to a directory it has already checked, so detection after the
  // fact is the honest end of what this can do.
  const problems = [];
  if (await destinationState(baseDir) !== 'directory') {
    problems.push(`${baseDir} is no longer a directory.`);
  }
  let cur = baseDir;
  for (const part of path.relative(baseDir, path.dirname(outPath))
    .split(path.sep).filter((p) => p && p !== '.')) {
    cur = path.join(cur, part);
    if (await destinationState(cur) !== 'directory') problems.push(`${cur} is not a directory.`);
  }
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
  // home. Without the key both arms answer that they are not logged in, and the
  // probe never reaches its question. The value is never read, printed, or
  // written — only its presence is.
  if (!opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. The probe runs over an empty home, so the '
      + 'harness has nothing else to authenticate with. Set it in this shell and '
      + 'run again.');
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
  await fs.appendFile(path.join(skillDir, 'SKILL.md'), plantedText(nonce));
  const digest = await treeDigest(skillDir);

  const flags = armFlags(opts.model);
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
  const controlArm = await runArm({
    harness, flags, cwd: arms.control.cwd, home: arms.control.home, ask: ASK,
  });

  const record = {
    kind: 'isolation-probe',
    date,
    skill: opts.skill,
    nonce,
    nonce_plant: 'appended to SKILL.md in a throwaway install, which no study measures',
    ask: ASK,
    flags,
    identity: {
      harness_build: build,
      // From whichever arm a build served. Reading the installed arm alone
      // wrote an empty tuple element when the installed invocation failed and
      // the control succeeded, and the check then refused an ordinary failed
      // probe that the protocol keeps as a result.
      model: installedArm.model_id || controlArm.model_id,
      platform: `${process.platform}-${process.arch}`,
      pathway: opts.pathway,
      // This collector builds one environment: two empty homes, with the key
      // in the environment. A representative stack is a different protocol,
      // and labelling this one with that class would let a pristine probe
      // cover a study that ran under an operator's own configuration.
      environment_class: 'api-key-empty-home',
      stack_digest: null,
    },
    installed: { ...installedArm, tree_digest: digest, trace: null },
    control: { ...controlArm, trace: null },
  };

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
