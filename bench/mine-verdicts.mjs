#!/usr/bin/env node
/**
 * The verdict miner: read this repository's own review threads, and retain the
 * bytes a disposition derives from.
 *
 *   GH_TOKEN="$(gh auth token)" node bench/mine-verdicts.mjs \
 *     --repo rookslog/stylewright --pr 119 --pr 118
 *
 * Issue #108. The review discipline in AGENTS.md disposes of every finding with
 * a fenced `review-verdict` block, so this repository already holds a labelled
 * corpus of findings and their dispositions. Nothing here collects anything new,
 * and nothing here spends a model call.
 *
 * **This file starts no child process.** It talks to one host over HTTPS and
 * writes files. `bench/study.mjs` spends four paragraphs on why its one spawn is
 * safe, and the cheapest way to owe none of that argument is to have no spawn:
 * the forge speaks JSON over a socket, and `fetch` reaches it without handing a
 * credential, a home directory, or a shell to anything.
 *
 * **It authenticates from the environment, and its record holds no
 * credential.** ADR-0017 settled that shape for a probe arm and it is the same
 * shape here: the token arrives in `GH_TOKEN` or `GITHUB_TOKEN`, it reaches one
 * request header, and it enters no file. A run with neither variable is refused
 * by name rather than falling back to an unauthenticated request, because an
 * anonymous read of a public repository succeeds until the rate limit and then
 * mines a partial thread that looks like a complete one.
 *
 * **A record states no disposition.** It retains the reviewer's comment, the
 * anchor as the forge spelled it, and every reply verbatim.
 * `bench/verdicts.mjs` derives the verdict, and `npm run check:verdicts` prints
 * what it derived. That is ADR-0013's rule for a probe record, and ADR-0032
 * records why it governs this corpus too.
 *
 * Mined bodies are UNTRUSTED DATA. They are third-party text about this
 * repository's code, and some of them were written by an automated reviewer. No
 * message this file prints quotes one, and `bench/verdicts/README.md` states the
 * rule for anyone reading the tree.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationState, ensureDir, isBelow } from '../src/tree.js';
// The chain question, asked where `bench/retain.mjs` already asks it. Both this
// file and that one write into a committed tree, and a second copy would mean
// one surface refusing a symbolic link while the other writes through it.
import { chainProblems } from './collect-probe.mjs';
import { contentProblems } from './study.mjs';
import {
  RECORD_KIND, deriveDispositions, readingsOf, recordName, recordProblems, scenarioOf,
} from './verdicts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The one host this file talks to, as a literal, for the reason `SCORER` is one. */
export const API = 'https://api.github.com';

/** The variables a token may arrive in, in the order they win. */
export const TOKEN_VARS = ['GH_TOKEN', 'GITHUB_TOKEN'];

export function tokenFrom(env) {
  for (const name of TOKEN_VARS) {
    if (typeof env[name] === 'string' && env[name].trim()) return env[name].trim();
  }
  return null;
}

/**
 * One paginated read of the forge, as JSON.
 *
 * It is a parameter everywhere below, so the whole miner runs against a fixture
 * transport in a test and reaches no network. `runArms` in the probe collector
 * sits outside `main` for the same reason: a sequence a test cannot reach is a
 * sequence nobody has watched refuse anything.
 */
export function githubFetch(token, impl = fetch) {
  return async function read(url) {
    const pages = [];
    let next = url.startsWith('http') ? url : `${API}${url}`;
    while (next) {
      const res = await impl(next, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'stylewright-verdict-miner',
        },
      });
      if (!res.ok) throw new Error(`${next.replace(API, '')} answered ${res.status}.`);
      const body = await res.json();
      if (!Array.isArray(body)) return body;
      pages.push(...body);
      // The `Link` header is the forge's own statement about what is left, and
      // reading it beats guessing from a page size that the API may change.
      next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
    }
    return pages;
  };
}

/**
 * A record, assembled from what the forge returned. Pure, and separate from
 * the transport, because everything a later reader depends on is decided here.
 *
 * A ROUND is a reviewed commit, and not a review. Two reviews against one
 * commit read one diff, so they are one scenario. The arm reads
 * `git diff <base_sha>...<review_commit>`, which is the diff the reviewer saw,
 * and that is what makes the anchors in these threads point at lines the arm
 * can name. ADR-0032 records the choice.
 */
export function buildRecord({ repo, pull, comments, minedAt }) {
  const problems = [];
  const roots = comments.filter((c) => c.in_reply_to_id === null
    || c.in_reply_to_id === undefined);
  const repliesFor = new Map();
  for (const c of comments) {
    const to = c.in_reply_to_id;
    if (to === null || to === undefined) continue;
    if (!repliesFor.has(to)) repliesFor.set(to, []);
    repliesFor.get(to).push(c);
  }

  const order = [];
  const byCommit = new Map();
  for (const root of roots.slice().sort((a, b) => a.id - b.id)) {
    const commit = root.original_commit_id;
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
      // The round IS the reviewed commit, so a comment that names none cannot
      // be placed in one. Refusing names it rather than dropping it into
      // whichever round happened to be first.
      problems.push(`comment ${root.id} names no reviewed commit, so no round holds it.`);
      continue;
    }
    if (!byCommit.has(commit)) {
      byCommit.set(commit, []);
      order.push(commit);
    }
    byCommit.get(commit).push({
      id: root.id,
      review_id: root.pull_request_review_id ?? null,
      path: root.path ?? null,
      side: root.side ?? null,
      line: root.line ?? null,
      original_line: root.original_line ?? null,
      start_line: root.start_line ?? null,
      original_start_line: root.original_start_line ?? null,
      commit_id: root.commit_id ?? null,
      original_commit_id: commit,
      author: root.user?.login ?? 'unknown',
      body: String(root.body ?? ''),
      replies: (repliesFor.get(root.id) ?? [])
        .slice().sort((a, b) => a.id - b.id)
        .map((r) => ({
          id: r.id,
          review_id: r.pull_request_review_id ?? null,
          author: r.user?.login ?? 'unknown',
          body: String(r.body ?? ''),
        })),
    });
  }

  const record = {
    kind: RECORD_KIND,
    identity: {
      repo,
      pr: pull.number,
      base_sha: pull.base?.sha ?? null,
      head_sha: pull.head?.sha ?? null,
      merge_commit_sha: pull.merge_commit_sha ?? null,
      merged_at: pull.merged_at ?? null,
    },
    mined_at: minedAt,
    rounds: order.map((commit, i) => ({
      round: i + 1,
      scenario: scenarioOf(pull.number, i + 1),
      review_commit: commit,
      threads: byCommit.get(commit),
    })),
  };
  return { record, problems };
}

/**
 * Why this pull request does not belong in the corpus, as reasons.
 *
 * The corpus rule is one sentence, and these are its clauses. A pull request
 * qualifies when the forge merged it, when its threads carry at least one
 * parseable verdict block, and when no retained byte is something this
 * repository refuses to commit.
 */
export function corpusProblems(record) {
  const problems = [];
  const id = record.identity;
  if (!id.merged_at || !id.merge_commit_sha) {
    problems.push('this pull request is not merged. The corpus pins a merged diff, because '
      + 'an open branch moves under the study.');
  }
  if (!record.rounds.length) {
    problems.push('this pull request carries no review thread, so it labels no finding.');
  }
  if (record.rounds.length && !deriveDispositions(record).length) {
    // The census, at the refusal. A bare "derives nothing" sent a reader looking
    // for a broken record when the real answer is that this pull request was
    // disposed of before the fenced block existed: every reply here states its
    // verdict in bold prose, and `verdictBlocks` reads one form. ADR-0032 states
    // that limit and its flip condition, and naming the causes is what makes the
    // limit visible from the command line rather than only in the ADR.
    const withheld = new Map();
    for (const r of readingsOf(record)) {
      for (const why of [r.verdict_withheld, r.anchor_withheld].filter(Boolean)) {
        withheld.set(why, (withheld.get(why) ?? 0) + 1);
      }
    }
    problems.push('no thread here derives a disposition, so this pull request labels no '
      + `finding. Withheld: ${[...withheld.entries()].sort()
        .map(([k, v]) => `${k}=${v}`).join(' ')}.`);
  }
  // Every retained byte, asked the questions this repository asks of anything
  // it commits. The finding never quotes what it found, because the bytes are
  // exactly what the scan exists to keep out of a printed line. Redaction is
  // the design's other option and nothing here builds it, so a hit refuses the
  // pull request whole. `contentProblems` asks both questions, and asking the
  // credential one again beside it would report one hit as two.
  for (const found of contentProblems(JSON.stringify(record))) {
    problems.push(`a mined body: ${found}`);
  }
  return problems;
}

/**
 * One pull request, mined. Returns the record and every reason it is refused.
 *
 * `read` is the transport, injected, so the whole sequence runs in a test
 * against fixture pages.
 */
export async function mine({ repo, pr, read, minedAt }) {
  const pull = await read(`/repos/${repo}/pulls/${pr}`);
  const comments = await read(`/repos/${repo}/pulls/${pr}/comments?per_page=100`);
  const { record, problems } = buildRecord({ repo, pull, comments, minedAt });
  problems.push(...corpusProblems(record));
  // The shape the checker will apply, applied here, so a record that would fail
  // `check:verdicts` never reaches the tree in the first place.
  problems.push(...recordProblems(record, `pr-${pr}`));
  return { record, problems };
}

/**
 * Writes one record, through the tree discipline every write surface here
 * inherits: a contained destination, no symbolic link on the chain, and
 * exclusive creation, so a record already in the corpus is never replaced.
 *
 * A correction is a fresh mine into an empty name, never an edit, for the
 * reason a promoted study is never edited: the bytes are the evidence.
 */
export async function writeRecord(baseDir, outPath, record) {
  if (!isBelow(baseDir, outPath)) {
    throw new Error(`A verdict record is written under ${baseDir}, not at ${outPath}.`);
  }
  const baseState = await destinationState(baseDir);
  if (baseState !== 'absent' && baseState !== 'directory') {
    throw new Error(`${baseDir} is a ${baseState}, and a record is never written through one.`);
  }
  await ensureDir(path.dirname(outPath), baseDir);
  const fh = await fs.open(outPath, 'wx').catch(async (err) => {
    if (err.code !== 'EEXIST') throw err;
    const state = await destinationState(outPath);
    throw new Error(`${outPath} already holds a ${state}. A verdict record is never replaced, `
      + 'because a correction is a fresh mine and the bytes are the evidence.');
  });
  let identity;
  try {
    identity = await fh.stat();
    await fh.writeFile(`${JSON.stringify(record, null, 2)}\n`);
  } finally {
    await fh.close();
  }
  // The chain is re-read after the write. Creating it level by level narrows the
  // window and does not close it, and Node offers no way to open a path relative
  // to a directory it has already checked.
  const problems = await chainProblems(baseDir, path.dirname(outPath));
  const now = await fs.lstat(outPath).catch(() => null);
  if (!now?.isFile() || now.dev !== identity.dev || now.ino !== identity.ino) {
    problems.push(`${outPath} no longer names the file this call created.`);
  } else if (problems.length) {
    await fs.rm(outPath, { force: true }); // Ours by identity, so this destroys nothing else.
  }
  if (problems.length) {
    throw new Error(`The record was not written where it was meant to go. ${problems.join(' ')}`);
  }
}

export function parseArgs(argv) {
  const opts = { repo: null, prs: [], out: null, dryRun: false };
  const keys = { '--repo': 'repo', '--out': 'out' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    // The flag is recognised BEFORE its value is demanded, the way
    // `bench/retain.mjs` recognises one: reading the next argument first reports
    // a missing value for a flag this file does not have.
    if (arg !== '--pr' && !keys[arg]) throw new Error(`unknown flag: ${arg}`);
    const value = argv[i + 1];
    // A flag in a value position is a missing value, not a value. The probe
    // collector learned this after `--model --dry-run` paid for two live calls.
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${arg} needs a value, and "${value ?? ''}" is another flag.`);
    }
    i += 1;
    if (arg === '--pr') opts.prs.push(Number(value));
    else opts[keys[arg]] = value;
  }
  if (!opts.repo) throw new Error('--repo names the repository, as owner/name.');
  if (!opts.prs.length) throw new Error('--pr names a pull request to mine, and repeats.');
  if (opts.prs.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('--pr is a pull request number.');
  }
  if (new Set(opts.prs).size !== opts.prs.length) {
    throw new Error('a pull request is mined once, and one was named twice.');
  }
  return opts;
}

async function main(argv, env, now) {
  const opts = parseArgs(argv);
  const token = tokenFrom(env);
  if (!token) {
    throw new Error(`no token in ${TOKEN_VARS.join(' or ')}. This reads the forge as you, and `
      + 'an anonymous read succeeds until the rate limit and then mines a partial thread that '
      + 'looks like a whole one. Run it as GH_TOKEN="$(gh auth token)" node '
      + 'bench/mine-verdicts.mjs ...');
  }
  const outDir = path.resolve(opts.out ?? path.join(HERE, 'verdicts'));
  const read = githubFetch(token);

  let refused = 0;
  for (const pr of opts.prs) {
    const { record, problems } = await mine({ repo: opts.repo, pr, read, minedAt: now });
    if (problems.length) {
      refused += 1;
      process.stderr.write(`refusing pr-${pr}:\n`);
      for (const p of problems) process.stderr.write(`  - ${p}\n`);
      continue;
    }
    const derived = deriveDispositions(record);
    const line = `pr-${pr}: ${record.rounds.length} round(s), `
      + `${record.rounds.reduce((n, r) => n + r.threads.length, 0)} thread(s), `
      + `${derived.length} disposition(s), ${derived.filter((d) => d.confirms).length} confirmed`;
    if (opts.dryRun) {
      process.stdout.write(`${line} — dry run, nothing written\n`);
      continue;
    }
    // The reader's own spelling of the name, imported rather than repeated.
    // `corpusProblems` refuses a record whose filename does not follow its
    // `identity.pr`, so a second literal here is a second thing to drift into
    // a file this repository's own check would then refuse.
    const outPath = path.join(outDir, recordName(pr));
    await writeRecord(outDir, outPath, record);
    process.stdout.write(`${outPath}\n${line}\n`);
  }
  if (refused) {
    process.stderr.write(`${refused} of ${opts.prs.length} pull request(s) refused. `
      + 'A refusal is a corpus decision, not a failure to fix.\n');
    return 1;
  }
  process.stdout.write('Run `npm run check:verdicts` to read what these bytes derive.\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2), process.env, new Date().toISOString());
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
