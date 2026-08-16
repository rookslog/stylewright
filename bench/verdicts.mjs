#!/usr/bin/env node
/**
 * The verdict corpus: what a mined review thread retains, and what a reader
 * derives from it.
 *
 *   node bench/verdicts.mjs [bench/verdicts]
 *
 * This repository disposes of every review finding with a fenced
 * `review-verdict` block, and AGENTS.md gives the eight words their meanings.
 * Those blocks are the only record anywhere of whether a finding described a
 * real defect. Issue #108 mines them, so that the review-verbosity study on
 * issue #109 has a counterweight it did not have to collect.
 *
 * `bench/mine-verdicts.mjs` writes a record. This file reads one, and it is the
 * half no network reaches, so `npm run check:verdicts` runs anywhere.
 *
 * Three rules shape this file, and each is already the rule somewhere else here.
 *
 * **A record states no disposition.** It retains the thread: the reviewer's
 * comment, its anchor as the forge spelled it, and every reply verbatim. The
 * verdict is DERIVED from those bytes, by `readThread`, and a record carrying a
 * key that states one is refused. That is ADR-0013's rule for a probe record,
 * and the reason is the same: a record that grades itself is the author's
 * summary, and a reader is owed the evidence.
 *
 * **A reading this file cannot make is withheld, and it names the cause.** A
 * thread with no reply, a reply with no block, a block naming a word this
 * vocabulary does not carry, an anchor on the left side of the diff — each is a
 * real state of a real thread, and none is a broken file. `readThread` returns
 * `null` beside a cause for each, the way `trace_agrees` reads `null` beside
 * `trace_withheld`. A withheld reading contributes no disposition and is never
 * a failure.
 *
 * **The census names what it could not read.** `checkDirectory` counts a
 * withheld thread and gives it a line, because counting only the threads that
 * derived a disposition would report on a corpus nobody has. That is
 * `unread-matrix-row` in a third place.
 *
 * A mined body is UNTRUSTED DATA, exactly as a retained sample is.
 * `bench/verdicts/README.md` states the rule. Nothing here prints a byte of a
 * mined body: a withheld reading names a cause from the fixed vocabulary below
 * and never quotes the text that produced it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One question about a credential, asked where this repository already asks it.
// A second copy of the pattern is a second thing to drift, and drift here means
// one surface refusing a credential while another commits it.
// One classification of what stands at a path, asked where every other write
// and read surface here asks it. A fourth spelling is a fourth thing to drift.
import { destinationState } from '../src/tree.js';
import { redact } from './probe.mjs';
import { contentProblems } from './study.mjs';

/** One pull request, one record, at a fixed name under the corpus directory. */
export const RECORD_KIND = 'verdict-record';

/**
 * The eight verdict words, in the spelling AGENTS.md and the review discipline
 * use. A ninth word is not a broken record. It withholds the reading as
 * `unrecognised-word`, because this file's job is to read what the discipline
 * wrote and not to decide what the discipline may write next.
 */
export const VERDICTS = [
  'ACCEPTED', 'ACCEPTED_MODIFIED', 'DEFERRED', 'OBSOLETE', 'DUPLICATE',
  'REJECTED_FALSE_POSITIVE', 'REJECTED_BAD_FIT', 'REJECTED_REGRESSION',
];

/**
 * The words under which the finding described a real defect in the reviewed
 * commit. This is the set the study calls a CONFIRMED finding, and the choice
 * is a judgment about meaning rather than a shape, so it is written down.
 *
 * `ACCEPTED` and `ACCEPTED_MODIFIED` say the defect was real and a fix landed.
 * `DEFERRED` says, in the discipline's own words, that the issue is real and
 * was not fixed here, so the finding was correct and the arm reviewing that
 * commit should still find it.
 *
 * Three words are outside the set, and each for its own reason. `OBSOLETE`
 * says an earlier commit had already resolved it, so the defect was not in the
 * commit the arm reads. `DUPLICATE` says the disposition lives on another
 * thread, and counting both would count one defect twice. Every `REJECTED_*`
 * word says the finding was wrong.
 */
export const CONFIRMS = ['ACCEPTED', 'ACCEPTED_MODIFIED', 'DEFERRED'];

/**
 * How far from a mined anchor an arm's own line may fall and still count as the
 * same finding, in lines.
 *
 * The corpus pins the commit the reviewer reviewed, so this window absorbs no
 * version drift at all. What it absorbs is one writer anchoring on the line
 * that shows the symptom while another anchors on the line that carries the
 * fix. Ten lines is a paragraph of code.
 *
 * The window is what makes both derived counts BOUNDS rather than
 * identifications, and ADR-0032 states that rather than leaving it to be
 * discovered. Two accepted findings less than twenty lines apart in one file
 * are not separable here, and pull request #119 is that case: its two threads
 * anchor at 437 and at 437 through 445 of one file, so a single stated line
 * near 440 matches both. `confirmed` is therefore a ceiling on agreement, and
 * `missed` is a floor on what an arm dropped.
 */
export const MATCH_WINDOW = 10;

/** A scenario is one review ROUND of one pull request. */
export const scenarioOf = (pr, round) => `pr-${pr}-r${round}`;

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const SHA = /^[0-9a-f]{40}$/;
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const isInt = (v) => Number.isInteger(v);
const isIntOrNull = (v) => v === null || Number.isInteger(v);
const isTextOrNull = (v) => v === null || isText(v);
const isShaOrNull = (v) => v === null || SHA.test(String(v));

/**
 * Words a record may not carry as a key, at any depth. Each one states a
 * reading this file makes, and a record that made it would be the author's
 * summary standing where the evidence goes. The probe record refuses its own
 * list for the same reason.
 *
 * The plural `verdicts` is absent on purpose. A record never carries it, and
 * the study manifest DOES, where it names retained bytes rather than a state.
 */
const ASSERTED = ['verdict', 'disposition', 'outcome', 'confirmed', 'missed',
  'accepted', 'rejected', 'finding', 'result'];

function keyPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    const at = prefix ? `${prefix}.${k}` : k;
    out.push(at);
    out.push(...keyPaths(v, at));
  }
  return out;
}

/**
 * Every fenced verdict block in one comment body, in the order they stand.
 *
 * The block is what the review discipline writes: a fence whose info string is
 * `review-verdict`, or `review-verdict-reconsidered` for a later reply that
 * supersedes an earlier disposition. Every `verdict:` line inside one is
 * collected, because a block stating two words is a real thing a hand can
 * write and the reading has to see both to refuse them.
 *
 * The fence is read the way CommonMark closes one: a run of at least three of
 * the same character, closed by a run at least as long carrying no info string.
 * `bench/probe.mjs` and `scripts/check-editorial.mjs` both read a fence this
 * way, and a shorter closing line reopening the file is the defect the length
 * comparison exists for.
 *
 * **A fence is indented at most three spaces, which is CommonMark's own
 * bound.** Past that a reader sees an indented code block — an EXAMPLE of the
 * form, with its backticks visible — and this reader saw a real disposition.
 * Measured through `micromark`, which the render test already uses: a reply
 * carrying a real `ACCEPTED` block and then a four-space-indented
 * `review-verdict` example renders the second as `<pre><code>` holding the
 * literal fence, while `verdictBlocks` read two blocks and the last-block rule
 * below made the example the current verdict.
 *
 * So this is `row-indented` in a third place. An indented matrix row and an
 * indented table are both refused for exactly this reason, and the bound is the
 * parser's rather than a house guess. `test/gfm-render.test.js` pins it.
 */
export function verdictBlocks(body) {
  const blocks = [];
  const lines = String(body ?? '').split('\n');
  let open = null;
  let kind = null;
  let words = [];
  for (const line of lines) {
    // ` {0,3}` and not `\s*`. A tab counts as four columns of indentation to
    // CommonMark, so it opens no fence either, and matching `\s*` admitted both.
    const fence = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*?)[ \t]*$/.exec(line);
    if (open === null) {
      if (fence && /^review-verdict(-reconsidered)?$/.test(fence[2])) {
        open = fence[1];
        kind = fence[2];
        words = [];
      }
      continue;
    }
    if (fence && fence[1][0] === open[0] && fence[1].length >= open.length && !fence[2]) {
      blocks.push({ kind, verdicts: words });
      open = null;
      continue;
    }
    const stated = /^\s*verdict:\s*(\S+)\s*$/.exec(line);
    if (stated) words.push(stated[1]);
  }
  // An unclosed block is still a block a reader sees, because the fence runs to
  // the end of the comment. Dropping it would lose a disposition to a missing
  // line, which is the reading this file exists to make rather than to skip.
  if (open !== null) blocks.push({ kind, verdicts: words });
  return blocks;
}

/**
 * What one thread says, derived, with each reading withheld on its own cause.
 *
 * The verdict and the anchor are two independent questions, and a thread can
 * answer one and not the other: a disposition posted on a file-level comment
 * carries a word and no line. Reporting one `null` for both would tell a reader
 * the wrong thing about whichever half was fine, which is the mistake
 * `trace_withheld` fixed one file over.
 */
export function readThread(thread) {
  return { ...verdictOf(thread), ...anchorOf(thread) };
}

function verdictOf(thread) {
  const replies = Array.isArray(thread?.replies) ? thread.replies : [];
  if (!replies.length) return { verdict: null, verdict_withheld: 'no-reply' };
  // Chronology comes from the forge's own identifiers, never from the order the
  // JSON happens to carry. The last block wins below, so an array a hand
  // reordered would make an older disposition the current one — and the reading
  // would be wrong rather than withheld, which is the outcome this file refuses
  // everywhere else. `recordProblems` refuses an out-of-order record as well,
  // because the collector always writes them sorted, and sorting here is what
  // keeps the derivation right for any caller that reaches it first.
  const blocks = [...replies]
    .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))
    .flatMap((reply) => verdictBlocks(reply?.body));
  if (!blocks.length) return { verdict: null, verdict_withheld: 'no-verdict-block' };
  // The LAST block wins. A `review-verdict-reconsidered` supersedes what stands
  // above it, and order is total, so the latest block is the current
  // disposition whichever kind it is. Every earlier block stays in the record.
  const last = blocks[blocks.length - 1];
  if (last.verdicts.length !== 1) {
    return { verdict: null, verdict_withheld: 'ambiguous-block' };
  }
  if (!VERDICTS.includes(last.verdicts[0])) {
    // The word itself is never printed. It came out of a mined body, and this
    // module prints no byte of one. A reader who wants the word opens the
    // record, where it stands verbatim.
    return { verdict: null, verdict_withheld: 'unrecognised-word' };
  }
  return { verdict: last.verdicts[0], verdict_withheld: null };
}

/**
 * The lines of the reviewed commit this thread points at.
 *
 * It reads `original_line` and `original_start_line`, never `line`. Those are
 * the forge's spelling of where the comment sat in the commit the reviewer
 * REVIEWED, which is the commit the corpus pins and the arm reads. `line`
 * tracks the pull request's current head, so it names a file the arm never
 * sees, and it goes null the moment the anchor falls out of the newest diff.
 * Both are retained; only one is read.
 */
function anchorOf(thread) {
  const withheld = (why) => ({ anchor: null, anchor_withheld: why });
  if (thread?.side !== 'RIGHT') return withheld('left-side');
  if (!isText(thread?.path)) return withheld('no-path');
  const to = thread.original_line;
  if (!Number.isInteger(to)) return withheld('no-line');
  const start = thread.original_start_line;
  const from = Number.isInteger(start) ? start : to;
  if (from > to) return withheld('inverted-range');
  return { anchor: { path: thread.path, from, to }, anchor_withheld: null };
}

/** Everything wrong with the shape of one mined record, as a list. */
export function recordProblems(record, name = 'record') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [`${name}: not a JSON object.`];
  }
  const problems = [];
  // Every message goes through `redact` at the point of emission, the way
  // `bench/probe.mjs` does it, because a refusal that quotes the value it
  // refused is how the first leak happened there.
  const say = (p) => problems.push(`${name}: ${redact(p)}`);

  if (record.kind !== RECORD_KIND) say(`kind must be "${RECORD_KIND}".`);
  const id = record.identity;
  if (!id || typeof id !== 'object' || Array.isArray(id)) {
    say('identity names the pull request this record mines.');
  } else {
    if (!REPO_NAME.test(String(id.repo))) say('identity.repo is owner/name.');
    if (!isInt(id.pr) || id.pr < 1) say('identity.pr is the pull request number.');
    if (!SHA.test(String(id.base_sha))) say('identity.base_sha pins the base of the diff.');
    if (!SHA.test(String(id.merge_commit_sha))) say('identity.merge_commit_sha pins the merge.');
    if (!isText(id.merged_at)) say('identity.merged_at is the forge\'s own merge moment.');
  }
  if (!isText(record.mined_at)) say('mined_at records when the miner ran.');

  if (!Array.isArray(record.rounds) || !record.rounds.length) {
    say('rounds lists at least one review round. A record with none mines nothing.');
  } else {
    const seen = new Set();
    record.rounds.forEach((round, i) => {
      const at = `rounds[${i}]`;
      if (!isInt(round?.round) || round.round < 1) say(`${at}.round is the round ordinal.`);
      if (!SHA.test(String(round?.review_commit))) {
        say(`${at}.review_commit pins the commit the reviewer read.`);
      }
      const want = scenarioOf(id?.pr, round?.round);
      if (round?.scenario !== want) {
        say(`${at}.scenario is ${want}, and a scenario name that does not follow the `
          + 'record is a scenario the scorer cannot find ground truth for.');
      }
      if (seen.has(round?.review_commit)) {
        say(`${at} repeats a review commit. A round IS a reviewed commit, so two rounds `
          + 'naming one commit describe one round twice.');
      }
      seen.add(round?.review_commit);
      if (!Array.isArray(round?.threads) || !round.threads.length) {
        say(`${at}.threads lists the review threads of this round.`);
        return;
      }
      round.threads.forEach((thread, j) => threadProblems(
        thread, `${at}.threads[${j}]`, say, round.review_commit));
    });
  }

  for (const at of keyPaths(record)) {
    const leaf = at.split('.').pop().replace(/\[\d+\]$/, '');
    if (ASSERTED.includes(leaf)) {
      say(`${at} states a disposition, and a reader derives every disposition from the `
        + 'retained bodies.');
    }
  }

  // The bodies are third-party text, so they answer to the scan every other
  // byte this repository commits answers to, and the finding never quotes them.
  // `contentProblems` asks the credential question as well as the operator
  // configuration one, and asking it twice here reported one hit as two.
  for (const found of contentProblems(JSON.stringify(record))) say(found);
  return problems;
}

function threadProblems(thread, at, say, reviewCommit) {
  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) {
    say(`${at} is not a thread object.`);
    return;
  }
  if (!isInt(thread.id)) say(`${at}.id is the forge's comment identifier.`);
  if (!isTextOrNull(thread.path)) say(`${at}.path is the file the comment sits on, or null.`);
  if (!isTextOrNull(thread.side)) say(`${at}.side is the diff side, or null.`);
  for (const field of ['line', 'original_line', 'start_line', 'original_start_line']) {
    if (!isIntOrNull(thread[field])) say(`${at}.${field} is a line number, or null.`);
  }
  if (!isShaOrNull(thread.commit_id)) say(`${at}.commit_id is a commit, or null.`);
  // A ROUND IS a reviewed commit, so a thread inside one names that commit and
  // no other. `anchorOf` reads `original_line`, which is a line number in the
  // tree of `original_commit_id`, and `bench/review-arms.mjs` builds the diff of
  // `round.review_commit` — so a thread naming a third commit anchors its
  // ground truth in a tree no arm ever reads, and `confirmed` and `missed` both
  // describe the wrong file. `buildRecord` groups rounds BY this field and can
  // never produce the mismatch, which is exactly why the check has to: a
  // committed record is edited by hand or it is not edited at all.
  //
  // `null` is refused here rather than admitted, for the same reason. A thread
  // whose reviewed commit is unknown has an anchor nothing can place.
  if (!SHA.test(String(thread.original_commit_id))) {
    say(`${at}.original_commit_id names the commit the reviewer read.`);
  } else if (reviewCommit && thread.original_commit_id !== reviewCommit) {
    say(`${at} names a different reviewed commit from its round. A round IS a reviewed `
      + 'commit, so an anchor from another one points into a tree no arm reads.');
  }
  // The collector sorts replies by forge identifier, and `verdictOf` derives the
  // current disposition from the LAST block. An out-of-order array is a record
  // this tool could not have written, so it is a shape refusal rather than a
  // reading — the identity-fact half of ADR-0024's split.
  const ids = (Array.isArray(thread.replies) ? thread.replies : [])
    .map((r) => r?.id).filter(Number.isInteger);
  if (ids.some((id, i) => i > 0 && id < ids[i - 1])) {
    say(`${at}.replies are out of forge order, and the collector writes them sorted. `
      + 'The last block states the current disposition, so the order decides which one that is.');
  }
  if (!isText(thread.author)) say(`${at}.author names who wrote the finding.`);
  if (typeof thread.body !== 'string') say(`${at}.body retains the finding verbatim.`);
  if (!Array.isArray(thread.replies)) {
    say(`${at}.replies is the list of replies, and an empty list is a thread nobody answered.`);
    return;
  }
  thread.replies.forEach((reply, k) => {
    if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
      say(`${at}.replies[${k}] is not a reply object.`);
      return;
    }
    if (!isInt(reply.id)) say(`${at}.replies[${k}].id is the forge's comment identifier.`);
    if (!isText(reply.author)) say(`${at}.replies[${k}].author names who disposed of it.`);
    if (typeof reply.body !== 'string') say(`${at}.replies[${k}].body retains the reply verbatim.`);
  });
}

/**
 * Every thread of a record, read, with the scenario it belongs to.
 *
 * This is the census unit. A thread that derives no disposition is here too,
 * carrying the causes, because the count has to describe the corpus rather than
 * the part of it that worked.
 */
export function readingsOf(record) {
  const out = [];
  for (const round of Array.isArray(record?.rounds) ? record.rounds : []) {
    for (const thread of Array.isArray(round?.threads) ? round.threads : []) {
      out.push({ scenario: round.scenario, id: thread?.id ?? null, ...readThread(thread) });
    }
  }
  return out;
}

/**
 * The dispositions a record supports: one per thread that answered both
 * questions. A thread missing either reading contributes nothing here and is
 * still counted by the census.
 */
export function deriveDispositions(record) {
  return readingsOf(record)
    .filter((r) => r.verdict && r.anchor)
    .map((r) => ({
      scenario: r.scenario,
      id: r.id,
      path: r.anchor.path,
      from: r.anchor.from,
      to: r.anchor.to,
      verdict: r.verdict,
      confirms: CONFIRMS.includes(r.verdict),
    }));
}

/**
 * The `<path>:<line>` anchors a piece of review output states, each once.
 *
 * This reads BOTH arms, and it has to: the treatment fixes a per-finding shape
 * and the baseline fixes nothing, so a metric that parsed the treatment's shape
 * would measure the two arms with two instruments. A path and a line is what
 * every review names however it is laid out.
 *
 * The form is stated rather than the exclusions listed, which is ADR-0016's
 * rule one directory over. An anchor is a path whose last segment carries an
 * extension, then a colon, then a line number, with an optional `L` in front of
 * the number because that is how a forge permalink spells it. A finding that
 * names a file and no line states no anchor here, and the count is lower by
 * exactly that. A path with no extension, such as a Makefile, is outside the
 * form. ADR-0032 names both as limits rather than leaving them to be found.
 */
export const ANCHOR = /(?<![\w./-])((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+):L?(\d+)/g;

export function anchorsIn(text) {
  const seen = new Map();
  for (const [, file, line] of String(text ?? '').matchAll(ANCHOR)) {
    seen.set(`${file}:${line}`, { path: file, line: Number(line) });
  }
  return [...seen.values()];
}

/**
 * Which dispositions this output reached, by thread identifier.
 *
 * A disposition is matched once however many anchors fall inside its window, so
 * the numerator cannot be inflated by a reply that states one line five times.
 * The window is the whole of the inexactness, and `MATCH_WINDOW` says what it
 * buys and what it costs.
 */
export function matchDispositions(anchors, dispositions, window = MATCH_WINDOW) {
  const matched = new Set();
  for (const d of dispositions) {
    const hit = anchors.some((a) => a.path === d.path
      && a.line >= d.from - window && a.line <= d.to + window);
    if (hit) matched.add(d.id);
  }
  return matched;
}

/**
 * The ground truth one corpus directory supports, as a map from scenario name
 * to the confirmed dispositions of that round.
 *
 * `problems` is not empty for a record this file refuses, and the caller
 * decides what that means. `bench/score.mjs` refuses to score against a corpus
 * it cannot read, because a denominator assembled from half a corpus is a
 * number about a corpus nobody has.
 */
export async function loadCorpus(dir) {
  const problems = [];
  const confirmed = new Map();
  const entries = await readRecords(dir);
  problems.push(...corpusProblems(entries));
  for (const { name, record, unreadable, state } of entries) {
    if (unreadable) {
      problems.push(state && state !== 'file'
        ? `${name}: is a ${state}, and a record is a plain file.`
        : `${name}: not readable as JSON.`);
      continue;
    }
    const found = recordProblems(record, name);
    problems.push(...found);
    if (found.length) continue;
    for (const d of deriveDispositions(record)) {
      if (!d.confirms) continue;
      if (!confirmed.has(d.scenario)) confirmed.set(d.scenario, []);
      confirmed.get(d.scenario).push(d);
    }
    // A round with no confirmed disposition is still a scenario the corpus
    // covers, and its ground truth is the empty set. Leaving it out of the map
    // would make it indistinguishable from a scenario nobody mined, and the
    // scorer refuses the second while scoring the first.
    for (const round of record.rounds) {
      if (!confirmed.has(round.scenario)) confirmed.set(round.scenario, []);
    }
  }
  return { confirmed, problems };
}

/** One line per record, for a person reading the check's output. */
export function describe(name, record) {
  const readings = readingsOf(record);
  const derived = readings.filter((r) => r.verdict && r.anchor);
  const tally = new Map();
  for (const r of derived) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1);
  const withheld = new Map();
  for (const r of readings) {
    if (r.verdict && r.anchor) continue;
    for (const why of [r.verdict_withheld, r.anchor_withheld].filter(Boolean)) {
      withheld.set(why, (withheld.get(why) ?? 0) + 1);
    }
  }
  const spell = (m) => [...m.entries()].sort().map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  // The record's own identity is our number and the forge's, so it carries
  // nothing to withhold. No mined byte reaches this line at all.
  return `${name}: ${derived.length} of ${readings.length} thread(s) derive a disposition `
    + `(${spell(tally)}), confirmed=${derived.filter((r) => CONFIRMS.includes(r.verdict)).length}, `
    + `withheld: ${spell(withheld)}, rounds: `
    + `${record.rounds.map((r) => r.scenario).join(', ')}`;
}

/**
 * The name a record of one pull request must have.
 *
 * The identity sits in the PATH, which is ADR-0030's rule for a grounding
 * matrix arriving in a second corpus. A record whose filename does not follow
 * its own `identity.pr` can be copied under a second name, and then one pull
 * request labels a scenario twice.
 */
export const recordName = (pr) => `pr-${pr}.json`;

/**
 * What is wrong with a corpus as a SET, rather than with any record in it.
 *
 * One pull request, one record. Two copies of a valid record both pass
 * `recordProblems`, and `loadCorpus` then appends both sets of dispositions to
 * one scenario. Measured: `matchDispositions` deduplicates by thread
 * identifier while `missed` counted array entries, so a duplicated corpus
 * reported a finding the arm HAD matched as dropped — `{confirmed:1, missed:1}`
 * where the truth is `{confirmed:1, missed:0}`. That inflates the counterweight,
 * which is the direction that makes the compressed arm look worse than it is.
 *
 * Both halves ship. This refuses the duplicate, and `reviewMetrics` counts
 * distinct dispositions so the invariant holds whatever it is handed.
 */
export function corpusProblems(entries) {
  const problems = [];
  const seen = new Map();
  for (const { name, record, unreadable } of entries) {
    if (unreadable || !record?.identity) continue;
    const pr = record.identity.pr;
    if (!Number.isInteger(pr)) continue;
    if (name !== recordName(pr)) {
      problems.push(`${name}: a record of pull request ${pr} is named ${recordName(pr)}. `
        + 'The identity sits in the path, so one name cannot hold two pull requests and one '
        + 'pull request cannot hold two names.');
    }
    if (seen.has(pr)) {
      problems.push(`${name}: pull request ${pr} is already mined as ${seen.get(pr)}. `
        + 'One pull request labels a scenario once, or its findings count twice.');
    } else seen.set(pr, name);
  }
  return problems;
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
    // The filesystem is asked what stands at the name, with `lstat`, before
    // anything reads it. `readFile` follows a symbolic link, so a link called
    // `pr-118.json` serves bytes from outside the corpus that can change while
    // the corpus entry does not — and `bench/review-arms.mjs` would then select
    // commits and build prompts from them. This is the disposition `walkStudy`
    // gives a study, the allowlist gives a skill directory, and `readMatrix`
    // gives a matrix, so it reads through the same predicate rather than a
    // fourth spelling of it.
    const state = await destinationState(path.join(dir, name));
    if (state !== 'file') {
      records.push({ name, record: null, unreadable: true, state });
      continue;
    }
    const text = await fs.readFile(path.join(dir, name), 'utf8');
    try {
      records.push({ name, record: JSON.parse(text) });
    } catch {
      // The parser's message is not repeated, for the reason `bench/probe.mjs`
      // gives: V8 truncates it to a few characters of the offending file, which
      // tells a reader nothing and puts a mined byte on a printed line.
      records.push({ name, record: null, unreadable: true });
    }
  }
  return records;
}

/**
 * Returns `{ problems, lines, counts }` over a directory of records.
 *
 * A record this file cannot read is NAMED and counted as `unread`, and so is a
 * thread whose reading is withheld. Counting only what derived cleanly is the
 * defect `unread-matrix-row` names for a grounding matrix and the probe census
 * names for a probe corpus, and it arrives here the same way.
 */
export async function checkDirectory(dir) {
  const problems = [];
  const lines = [];
  const counts = { records: 0, unread: 0, threads: 0, derived: 0, confirmed: 0, withheld: 0 };
  const entries = await readRecords(dir);
  // The set-level problems, before the per-record ones. A duplicate and a
  // misnamed record are properties of the corpus rather than of either file.
  problems.push(...corpusProblems(entries));
  for (const { name, record, unreadable, state } of entries) {
    counts.records += 1;
    if (unreadable) {
      const why = state && state !== 'file'
        ? `is a ${state}, and a record is a plain file`
        : 'not readable as JSON';
      problems.push(`${name}: ${why}.`);
      lines.push(`${name}: derives NOTHING (${why})`);
      counts.unread += 1;
      continue;
    }
    const found = recordProblems(record, name);
    problems.push(...found);
    if (found.length) {
      lines.push(`${name}: derives NOTHING (the record is malformed, so no disposition is `
        + 'computed from it)');
      counts.unread += 1;
      continue;
    }
    const readings = readingsOf(record);
    counts.threads += readings.length;
    for (const r of readings) {
      if (r.verdict && r.anchor) {
        counts.derived += 1;
        if (CONFIRMS.includes(r.verdict)) counts.confirmed += 1;
      } else counts.withheld += 1;
    }
    lines.push(describe(name, record));
  }
  return { problems, lines, counts };
}

/**
 * The summary line, which names what the corpus DERIVED.
 *
 * `confirmed` is the ground truth the study's counterweight rests on, so it is
 * printed rather than left to be recomputed. It is a note. Nothing here fails
 * on a count, for the reason `audit-coverage` fails on none: the number is the
 * answer to a green run over a corpus nobody has read, and an error would give
 * whoever wanted a green run a reason to shrink it.
 */
export function summarise({ records, unread, threads, derived, confirmed, withheld }) {
  if (!records) {
    return 'No verdict records yet. Mining is a manual protocol, through bench/mine-verdicts.mjs.';
  }
  return `verdict-corpus: ${records} record(s), ${unread} unread. `
    + `${threads} thread(s): ${derived} derive a disposition, ${withheld} withheld. `
    + `${confirmed} confirmed finding(s) stand as ground truth.`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = process.argv[2] ?? path.join(here, 'verdicts');
  const { problems, lines, counts } = await checkDirectory(dir);
  for (const line of lines) process.stdout.write(`${line}\n`);
  for (const p of problems) process.stderr.write(`${p}\n`);
  // The census prints BEFORE the exit status is decided, on every run. Every
  // branch that counts a record `unread` also files a problem, so exiting first
  // would make the denominator unreachable from the command line — which is the
  // census defect one step out, on the one run the census exists for.
  process.stdout.write(`${summarise(counts)}\n`);
  if (problems.length) process.exit(1);
}
