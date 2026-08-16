// The verdict corpus, and what a reader derives from it.
//
// Every case here encodes a sentence from ADR-0032 or from
// `bench/verdicts/README.md`. The corpus is the counterweight for issue #109,
// so a defect in the reading moves a published figure — and the reading is the
// only thing standing between a mined thread and a number.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CONFIRMS, MATCH_WINDOW, VERDICTS, anchorsIn, checkDirectory, deriveDispositions,
  loadCorpus, matchDispositions, readThread, readingsOf, recordProblems, scenarioOf,
  summarise, verdictBlocks,
} from '../bench/verdicts.mjs';

const SHA = 'a'.repeat(40);
const block = (word, kind = 'review-verdict') => `\`\`\`${kind}\nverdict: ${word}\n`
  + 'commit: abc1234\n```\n';

function thread(over = {}) {
  return {
    id: 1,
    path: 'src/ground.js',
    side: 'RIGHT',
    line: 2133,
    original_line: 1965,
    start_line: null,
    original_start_line: null,
    commit_id: SHA,
    original_commit_id: SHA,
    author: 'a-reviewer',
    body: 'The audit table is hidden in raw HTML.',
    replies: [{ id: 2, review_id: 3, author: 'maintainer', body: block('ACCEPTED') }],
    ...over,
  };
}

function record(over = {}, threads = [thread()]) {
  return {
    kind: 'verdict-record',
    identity: {
      repo: 'rookslog/stylewright',
      pr: 118,
      base_sha: 'b'.repeat(40),
      head_sha: 'c'.repeat(40),
      merge_commit_sha: 'd'.repeat(40),
      merged_at: '2026-08-14T22:01:43Z',
    },
    mined_at: '2026-08-16T00:00:00Z',
    rounds: [{ round: 1, scenario: 'pr-118-r1', review_commit: SHA, threads }],
    ...over,
  };
}

// --- the block reader -------------------------------------------------------

test('a fenced verdict block is read, and its word comes off the verdict line', () => {
  assert.deepEqual(verdictBlocks(block('ACCEPTED')), [
    { kind: 'review-verdict', verdicts: ['ACCEPTED'] }]);
});

test('prose around the block is not read, and neither is a fence of another kind', () => {
  assert.deepEqual(verdictBlocks('**ACCEPTED** — applied verbatim.'), []);
  assert.deepEqual(verdictBlocks('```js\nverdict: ACCEPTED\n```\n'), []);
});

test('a reconsidered block is read, and it is the same shape', () => {
  const found = verdictBlocks(block('DEFERRED', 'review-verdict-reconsidered'));
  assert.equal(found[0].kind, 'review-verdict-reconsidered');
  assert.deepEqual(found[0].verdicts, ['DEFERRED']);
});

test('a closing fence shorter than the opener does not close it', () => {
  // `scripts/check-editorial.mjs` learned this one: a shorter line reopened the
  // file and a table below it bound.
  const body = '````review-verdict\nverdict: ACCEPTED\n```\nverdict: OBSOLETE\n````\n';
  assert.deepEqual(verdictBlocks(body), [
    { kind: 'review-verdict', verdicts: ['ACCEPTED', 'OBSOLETE'] }]);
});

test('an unclosed block is still a block, because the fence runs to the end', () => {
  assert.deepEqual(verdictBlocks('```review-verdict\nverdict: OBSOLETE\n'), [
    { kind: 'review-verdict', verdicts: ['OBSOLETE'] }]);
});

// --- the two readings -------------------------------------------------------

test('the last block wins, so a reconsidered reply supersedes what stands above it', () => {
  const r = readThread(thread({
    replies: [
      { id: 2, author: 'm', body: block('REJECTED_BAD_FIT') },
      { id: 3, author: 'm', body: block('ACCEPTED_MODIFIED', 'review-verdict-reconsidered') },
    ],
  }));
  assert.equal(r.verdict, 'ACCEPTED_MODIFIED');
  assert.equal(r.verdict_withheld, null);
});

test('each verdict cause withholds, names itself, and is not a failure', () => {
  const say = (over) => readThread(thread(over)).verdict_withheld;
  assert.equal(say({ replies: [] }), 'no-reply');
  assert.equal(say({ replies: [{ id: 2, author: 'm', body: 'looks right to me' }] }),
    'no-verdict-block');
  assert.equal(say({ replies: [{ id: 2, author: 'm', body: block('ACCEPTED_SOMEDAY') }] }),
    'unrecognised-word');
  assert.equal(say({
    replies: [{ id: 2, author: 'm', body: '```review-verdict\nverdict: ACCEPTED\n'
      + 'verdict: OBSOLETE\n```\n' }],
  }), 'ambiguous-block');
});

test('a word this vocabulary does not carry is never printed back', () => {
  // It came out of a mined body, and this module prints no byte of one.
  const r = readThread(thread({
    replies: [{ id: 2, author: 'm', body: block('ACCEPTED_SOMEDAY') }],
  }));
  assert.equal(r.verdict, null);
  assert.ok(!JSON.stringify(r).includes('ACCEPTED_SOMEDAY'));
});

test('the anchor reads original_line, because that is the commit the arm reads', () => {
  const r = readThread(thread({ line: 2133, original_line: 1965 }));
  assert.deepEqual(r.anchor, { path: 'src/ground.js', from: 1965, to: 1965 });
});

test('a range anchor keeps both ends', () => {
  const r = readThread(thread({ original_start_line: 437, original_line: 445 }));
  assert.deepEqual(r.anchor, { path: 'src/ground.js', from: 437, to: 445 });
});

test('each anchor cause withholds, and the verdict beside it still reads', () => {
  const say = (over) => readThread(thread(over));
  assert.equal(say({ side: 'LEFT' }).anchor_withheld, 'left-side');
  assert.equal(say({ path: null }).anchor_withheld, 'no-path');
  assert.equal(say({ original_line: null }).anchor_withheld, 'no-line');
  assert.equal(say({ original_start_line: 9999 }).anchor_withheld, 'inverted-range');
  // The point of splitting the two: a thread that answers one question and not
  // the other says so, rather than reading as broken.
  assert.equal(say({ original_line: null }).verdict, 'ACCEPTED');
});

test('a thread missing either reading contributes no disposition and is still counted', () => {
  const r = record({}, [thread({ original_line: null })]);
  assert.deepEqual(deriveDispositions(r), []);
  assert.equal(readingsOf(r).length, 1);
});

// --- what confirms ----------------------------------------------------------

test('the confirming words are the ones that say the defect was real', () => {
  assert.deepEqual(CONFIRMS, ['ACCEPTED', 'ACCEPTED_MODIFIED', 'DEFERRED']);
  for (const word of ['OBSOLETE', 'DUPLICATE', 'REJECTED_FALSE_POSITIVE', 'REJECTED_BAD_FIT',
    'REJECTED_REGRESSION']) {
    assert.ok(VERDICTS.includes(word), `${word} is a verdict this reader knows`);
    assert.ok(!CONFIRMS.includes(word), `${word} does not confirm a finding`);
  }
});

test('a disposition carries whether it confirms, derived from the word', () => {
  const found = deriveDispositions(record({}, [
    thread({ id: 1, replies: [{ id: 9, author: 'm', body: block('DEFERRED') }] }),
    thread({ id: 2, replies: [{ id: 8, author: 'm', body: block('OBSOLETE') }] }),
  ]));
  assert.deepEqual(found.map((d) => [d.verdict, d.confirms]),
    [['DEFERRED', true], ['OBSOLETE', false]]);
  assert.equal(found[0].scenario, 'pr-118-r1');
});

// --- the record shape -------------------------------------------------------

test('a well formed record passes, and each missing part is named', () => {
  assert.deepEqual(recordProblems(record()), []);
  const say = (over) => recordProblems(record(over)).join(' ');
  assert.match(say({ kind: 'probe' }), /kind must be "verdict-record"/);
  assert.match(say({ mined_at: '' }), /mined_at records when the miner ran/);
  assert.match(say({ rounds: [] }), /rounds lists at least one review round/);
  assert.match(say({ identity: { ...record().identity, repo: 'stylewright' } }),
    /identity\.repo is owner\/name/);
  assert.match(say({ identity: { ...record().identity, base_sha: 'short' } }),
    /base_sha pins the base of the diff/);
});

test('a scenario name that does not follow the record is refused', () => {
  const r = record({ rounds: [{ round: 1, scenario: 'pr-119-r1', review_commit: SHA,
    threads: [thread()] }] });
  assert.match(recordProblems(r).join(' '), /scenario is pr-118-r1/);
  assert.equal(scenarioOf(118, 1), 'pr-118-r1');
});

test('two rounds naming one commit describe one round twice', () => {
  const r = record({ rounds: [
    { round: 1, scenario: 'pr-118-r1', review_commit: SHA, threads: [thread()] },
    { round: 2, scenario: 'pr-118-r2', review_commit: SHA, threads: [thread()] },
  ] });
  assert.match(recordProblems(r).join(' '), /repeats a review commit/);
});

test('a record that states its own disposition is refused, at any depth', () => {
  assert.match(recordProblems(record({ verdict: 'ACCEPTED' })).join(' '),
    /states a disposition, and a reader derives every disposition/);
  const nested = record({}, [thread({ confirmed: true })]);
  assert.match(recordProblems(nested).join(' '), /states a disposition/);
});

test('a credential in a mined body is refused and never quoted back', () => {
  const found = recordProblems(record({}, [thread({ body: 'token sk-ant-oat01-abcdefghijkl' })]));
  assert.equal(found.length, 1);
  assert.match(found[0], /looks like a credential/);
  assert.ok(!found[0].includes('abcdefghijkl'));
});

test('a mined body carrying operator configuration is refused', () => {
  const found = recordProblems(record({}, [thread({ body: 'see /Users/someone/notes.md' })]));
  assert.match(found.join(' '), /home directory/);
});

// --- the anchors an arm states ----------------------------------------------

test('an anchor is a path with an extension and a line, and it is read once', () => {
  assert.deepEqual(anchorsIn('bench/probe.mjs:466 and again bench/probe.mjs:466'),
    [{ path: 'bench/probe.mjs', line: 466 }]);
});

test('a forge permalink spelling is read, and a plain number in prose is not', () => {
  assert.deepEqual(anchorsIn('AGENTS.md:L492 fails'), [{ path: 'AGENTS.md', line: 492 }]);
  assert.deepEqual(anchorsIn('the count went from 8 to 12'), []);
});

test('a finding that names no line, and a path with no extension, state no anchor', () => {
  // Stated as limits in ADR-0032 rather than left to be discovered. The count
  // is lower by exactly this, and nothing pretends otherwise.
  assert.deepEqual(anchorsIn('the guard in bench/probe.mjs is wrong'), []);
  assert.deepEqual(anchorsIn('Makefile:12 is wrong'), []);
});

// --- the matching rule ------------------------------------------------------

const disposition = (over = {}) => ({
  id: 1, path: 'bench/probe.mjs', from: 437, to: 437, verdict: 'ACCEPTED', confirms: true, ...over,
});

test('a line inside the window matches, and one outside it does not', () => {
  const d = [disposition()];
  const at = (line) => matchDispositions([{ path: 'bench/probe.mjs', line }], d).size;
  assert.equal(at(437 + MATCH_WINDOW), 1);
  assert.equal(at(437 - MATCH_WINDOW), 1);
  assert.equal(at(437 + MATCH_WINDOW + 1), 0);
  assert.equal(at(437 - MATCH_WINDOW - 1), 0);
});

test('another file at the same line does not match', () => {
  assert.equal(matchDispositions([{ path: 'src/ground.js', line: 437 }], [disposition()]).size, 0);
});

test('a disposition is matched once however many anchors reach it', () => {
  const anchors = [430, 435, 440].map((line) => ({ path: 'bench/probe.mjs', line }));
  assert.equal(matchDispositions(anchors, [disposition()]).size, 1);
});

test('the window cannot separate two findings close together, and that is the bound', () => {
  // Pull request #119 is this case: two threads anchor at 437 and at 437 to
  // 445 of one file, so one stated line near 440 matches both. `confirmed` is
  // therefore a ceiling and `missed` a floor. ADR-0032 states it.
  const two = [disposition({ id: 1 }), disposition({ id: 2, from: 437, to: 445 })];
  assert.equal(matchDispositions([{ path: 'bench/probe.mjs', line: 440 }], two).size, 2);
});

// --- the corpus and its census ----------------------------------------------

async function corpusDir(t, files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-verdicts-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name),
      typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
  }
  return dir;
}

test('a round with no confirmed finding is still a scenario the corpus covers', async (t) => {
  // Otherwise it reads exactly like a scenario nobody mined, and the scorer
  // refuses the second while scoring the first.
  const dir = await corpusDir(t, {
    'pr-118.json': record({}, [thread({ replies: [{ id: 9, author: 'm',
      body: block('REJECTED_BAD_FIT') }] })]),
  });
  const { confirmed, problems } = await loadCorpus(dir);
  assert.deepEqual(problems, []);
  assert.deepEqual(confirmed.get('pr-118-r1'), []);
  assert.ok(confirmed.has('pr-118-r1'));
});

test('a corpus this reader cannot read whole reports it rather than scoring around it', async (t) => {
  const dir = await corpusDir(t, { 'pr-118.json': record({ kind: 'probe' }) });
  const { problems } = await loadCorpus(dir);
  assert.match(problems.join(' '), /kind must be "verdict-record"/);
});

test('a record the checker cannot read is named and counted, never dropped', async (t) => {
  const dir = await corpusDir(t, { 'pr-1.json': '{ not json', 'pr-118.json': record() });
  const { problems, lines, counts } = await checkDirectory(dir);
  assert.equal(counts.records, 2);
  assert.equal(counts.unread, 1);
  assert.equal(problems.length, 1);
  assert.match(lines.join('\n'), /pr-1\.json: derives NOTHING/);
  assert.match(summarise(counts), /2 record\(s\), 1 unread/);
});

test('the census counts a withheld thread beside the ones that derived', async (t) => {
  const dir = await corpusDir(t, {
    'pr-118.json': record({}, [thread({ id: 1 }), thread({ id: 2, replies: [] })]),
  });
  const { counts } = await checkDirectory(dir);
  assert.equal(counts.threads, 2);
  assert.equal(counts.derived, 1);
  assert.equal(counts.withheld, 1);
  assert.match(summarise(counts), /1 derive a disposition, 1 withheld/);
});

test('an empty corpus says so rather than reporting a green run over nothing', async (t) => {
  const dir = await corpusDir(t, {});
  const { counts } = await checkDirectory(dir);
  assert.match(summarise(counts), /No verdict records yet/);
});

// --- the committed corpus ---------------------------------------------------

/**
 * Each committed record, pinned to what it derives.
 *
 * `test/probe.test.js` holds every probe record to its whole derived tuple for
 * this reason: an edit to the reading, or to `MATCH_WINDOW`, silently re-grades
 * append-only evidence. A record added to the corpus fails this once, and a
 * person adds its row after reading what the check derived.
 */
const COMMITTED = {
  'pr-110.json': { rounds: ['pr-110-r1', 'pr-110-r2'], threads: 5, derived: 5, confirmed: 5 },
  'pr-112.json': { rounds: ['pr-112-r1'], threads: 1, derived: 1, confirmed: 1 },
  'pr-118.json': { rounds: ['pr-118-r1'], threads: 5, derived: 5, confirmed: 5 },
  'pr-119.json': { rounds: ['pr-119-r1'], threads: 2, derived: 2, confirmed: 2 },
};

test('every committed verdict record checks out and derives what it derived', async () => {
  const dir = path.join(path.dirname(import.meta.dirname), 'bench', 'verdicts');
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  assert.deepEqual(names, Object.keys(COMMITTED).sort(),
    'the committed corpus moved, and each record is pinned by hand after a person reads it');
  for (const name of names) {
    const held = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    assert.deepEqual(recordProblems(held, name), []);
    const readings = readingsOf(held);
    const derived = deriveDispositions(held);
    assert.deepEqual({
      rounds: held.rounds.map((r) => r.scenario),
      threads: readings.length,
      derived: derived.length,
      confirmed: derived.filter((d) => d.confirms).length,
    }, COMMITTED[name], `${name} derives something other than what was committed`);
  }
});
