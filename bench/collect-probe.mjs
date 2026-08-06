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
 *   --env-class CLASS     pristine or representative. Default: pristine.
 *   --stack-digest D      required when the class is representative.
 *   --date YYYY-MM-DD     the date recorded. Default: today, in UTC.
 *   --dry-run             prepare both homes, print the plan, call no model.
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

/** `claude:user` into its two halves, refusing anything the engine cannot install. */
export function parsePathway(pathway) {
  const [platform, scope] = String(pathway ?? '').split(':');
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unknown platform "${platform}". Known: ${PLATFORMS.join(', ')}`);
  }
  if (!SCOPES.includes(scope)) {
    throw new Error(`Unknown scope "${scope}". Known: ${SCOPES.join(', ')}`);
  }
  return { platform, scope };
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

/** The record's filename. One probe, one file, named for what it covers. */
export function recordName({ date, pathway, nonce }) {
  return `${date}-${pathway.replace(':', '-')}-${nonce.slice(-8)}.json`;
}

/**
 * One `claude --output-format json` run, with the home redirected. Returns the
 * answer verbatim and the build that served it, or the reason neither exists.
 *
 * The environment is rebuilt rather than extended, because a variable naming
 * the operator's own configuration directory survives a redirected HOME and
 * points the harness straight back at the tree the probe exists to exclude.
 */
export function runArm({ flags, cwd, home, ask }) {
  const env = { ...process.env };
  for (const key of ['CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'CLAUDE_HOME']) delete env[key];
  env.HOME = home;
  env.USERPROFILE = home;
  return new Promise((resolve) => {
    const child = spawn('claude', [...flags, ask], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({
      answer: '', model_id: '', stderr: `${err}${e.message}`, home,
    }));
    child.on('close', () => {
      let run;
      try {
        run = JSON.parse(out);
      } catch {
        resolve({
          answer: '', model_id: '', stderr: `${err}\nnot JSON:\n${out.slice(0, 400)}`, home,
        });
        return;
      }
      // The build that answered is the one that emitted the output tokens.
      // Claude Code bills a small auxiliary call alongside the answering one on
      // some prompts, so the largest is the answer's and not the only entry.
      const usage = Object.entries(run.modelUsage ?? {})
        .map(([id, u]) => [id, u.outputTokens ?? u.output_tokens ?? 0])
        .sort((a, b) => b[1] - a[1]);
      resolve({
        answer: typeof run.result === 'string' ? run.result : '',
        model_id: usage[0]?.[0] ?? '',
        stderr: err,
        home,
      });
    });
  });
}

/** The harness build, as `bench/run.sh` reads it: the first field of --version. */
export function harnessBuild() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out.split('\n')[0]?.trim().split(/\s+/)[0] ?? ''));
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
  await ensureDir(path.dirname(outPath), baseDir);
  const state = await destinationState(outPath);
  if (state !== 'absent') {
    throw new Error(`${outPath} already holds a ${state}. A probe record is never replaced.`);
  }
  await fs.writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
}

function parseArgs(argv) {
  const opts = { model: 'opus', envClass: 'pristine', dryRun: false };
  const keys = {
    '--skill': 'skill',
    '--pathway': 'pathway',
    '--model': 'model',
    '--env-class': 'envClass',
    '--stack-digest': 'stackDigest',
    '--date': 'date',
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') { opts.dryRun = true; continue; }
    const key = keys[argv[i]];
    if (!key) throw new Error(`unknown flag: ${argv[i]}`);
    opts[key] = argv[i + 1];
    i += 1;
  }
  if (!opts.skill) throw new Error('--skill is required.');
  if (!opts.pathway) throw new Error('--pathway is required.');
  if (opts.envClass === 'representative' && !opts.stackDigest) {
    throw new Error('a representative stack records --stack-digest.');
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const { platform, scope } = parsePathway(opts.pathway);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const nonce = `sw-probe-${crypto.randomBytes(8).toString('hex')}`;

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

  const build = await harnessBuild();
  const installedArm = await runArm({ flags, cwd: arms.installed.cwd, home: arms.installed.home, ask: ASK });
  const controlArm = await runArm({ flags, cwd: arms.control.cwd, home: arms.control.home, ask: ASK });

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
      model: installedArm.model_id,
      platform: `${process.platform}-${process.arch}`,
      pathway: opts.pathway,
      environment_class: opts.envClass,
      stack_digest: opts.envClass === 'representative' ? opts.stackDigest : null,
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
