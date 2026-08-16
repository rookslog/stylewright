// Every case here encodes a sentence from bench/README.md's metrics table.
//
// The scorer shipped without tests, and a cross-vendor review then found six
// places where it did not measure what that table says it measures. Each one is
// below, red before the fix. A metric with no test is a number nobody has
// checked, which is the failure this whole protocol exists to avoid.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  score, auditable, readMeta, digest, reviewMetrics, signatures, SIGNATURE, HEDGE,
} from '../bench/score.mjs';

const s = (text) => score(text, null, false);

test('words counts visible prose, and fence delimiters are not words', () => {
  assert.equal(s('```js\nconst a = 1;\n```').words, 4);
  assert.equal(s('one two three').words, 3);
});

test('scaffold counts headings the writer imposed, not headings inside code', () => {
  assert.equal(s('# Real heading\n\ntext').scaffold, 1);
  assert.equal(s('text\n\n```md\n# H1\n## H2\n```\n\nmore').scaffold, 0);
});

test('scaffold counts a standalone bold label, which acts as a heading', () => {
  assert.equal(s('**What I verified:**\n\ntext').scaffold, 1);
});

test('a bold-led bullet is both scaffold and a bullet, and the table says so', () => {
  const r = s('- **Result:** done');
  assert.equal(r.scaffold, 1);
  assert.equal(r.bullets, 1);
});

test('bullets and lists are not counted inside a fence', () => {
  assert.equal(s('```\n- a\n- b\n```').bullets, 0);
});

test('hedges counts each phrase once, not once per overlapping pattern', () => {
  assert.equal(s('It is worth noting that x.').hedges, 1);
  assert.equal(s('Worth noting: x. That said, y.').hedges, 2);
});

test('menus counts offers, not the number of patterns that matched', () => {
  assert.equal(s('Options: a\nOptions: b\nOptions: c').menus, 3);
});

test('menus does not fire on a direct answer containing either/or', () => {
  assert.equal(s('You can call it either before or after the guard.').menus, 0);
  assert.equal(s('Let me know if you want the other shape.').menus, 1);
});

// `signatures` ships empty, so its cases inject a list. An empty list makes
// every assertion about counting vacuous, and a vacuous test is how a metric
// arrives with no definition anybody has checked. ADR-0021 decides the shape:
// the list lives here and never in a skill, and an entry carries a reference
// distribution before it counts against anything.

test('signatures ships empty, so the metric reads zero on any sample', () => {
  assert.deepEqual(SIGNATURE, []);
  assert.equal(s('Delve into the rich tapestry of it.').signatures, 0);
});

test('signatures counts occurrences, not the number of entries that matched', () => {
  assert.equal(signatures('delve, delve, and delve again', ['delve']), 3);
  assert.equal(signatures('delve into the tapestry', ['delve', 'tapestry']), 2);
});

test('a longer signature consumes a shorter one inside it', () => {
  // The same consuming split `hedges` needs, for the same reason: scored
  // unsorted, one phrase counted twice.
  assert.equal(signatures('a rich tapestry of detail', ['rich tapestry', 'tapestry']), 1);
});

test('signatures is case-blind, as every phrase metric here is', () => {
  assert.equal(signatures('Delve and DELVE', ['delve']), 2);
});

// "Longest first" is what both lists say about themselves, and it is not the
// property that matters. `for completeness` (16) sits after `i didn't check`
// (14) in the shipped HEDGE list, so a strict length ordering is already
// violated twice and nothing has ever gone wrong. What the consuming split
// actually needs is that no entry is CONTAINED in a later one. Asserting the
// wrong invariant here would fail a correct list and teach the next author to
// reorder for the test rather than for the count.
const containment = (list) => list.flatMap(
  (a, i) => list.slice(i + 1).filter((b) => b.includes(a)).map((b) => [a, b]));

test('no listed phrase is contained in a later one, in either list', () => {
  assert.deepEqual(containment(HEDGE), [],
    'a phrase that contains an earlier one must come first, or the earlier one eats it');
  assert.deepEqual(containment(SIGNATURE), []);
});

test('signatures reads prose, so a phrase inside a fence is not counted', () => {
  // The shipped list is the one `score` reads, so filling it is the only way
  // to exercise the wiring. Restored in `finally`, because the next test in
  // this file asserts the list is empty.
  SIGNATURE.push('delve');
  try {
    assert.equal(s('We delve.').signatures, 1);
    assert.equal(s('```md\ndelve\n```').signatures, 0);
  } finally {
    SIGNATURE.length = 0;
  }
});

test('noise reports what it removed rather than cleaning silently', () => {
  const r = score('Warning: no stdin data received\nThe answer.', null, true);
  assert.equal(r.words, 2);
  assert.ok(r.noise > 0);
});

test('denoising never touches a sample that could not need it', () => {
  // `^hook: ` is a legitimate opening for a reply in this repository, and
  // stripping it from a current sample would silently delete real content.
  const reply = 'hook: SessionStart fires before the prompt is read.';
  assert.equal(score(reply, null, false).words, 8);
  assert.equal(score(reply, null, false).noise, 0);
  assert.equal(score(reply, null, true).words, 0);
});

// The audit is the half that four of this protocol's own defects slipped past.
// It is not a formatting check: it is the difference between a comparison and
// two unknowns placed side by side.

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'score-'));
}

async function sample(dir, name, text, meta) {
  const f = path.join(dir, name);
  await fs.writeFile(f, text);
  if (meta) await fs.writeFile(`${f}.meta`, meta);
  return f;
}

test('a sample with no .meta cannot be scored as a comparison', async () => {
  const dir = await tmpdir();
  const f = await sample(dir, 'a.txt', 'text', null);
  const reasons = await auditable([f], [await readMeta(f)]);
  assert.match(reasons.join(' '), /no \.meta sidecar/);
});

test('a treatment that changed mid-arm is caught by its hash', async () => {
  const dir = await tmpdir();
  const a = await sample(dir, 'a.txt', 'text', 'system_sha=aaa model_id=m prompt_sha=p user_rules_sha=u');
  const b = await sample(dir, 'b.txt', 'text', 'system_sha=bbb model_id=m prompt_sha=p user_rules_sha=u');
  const reasons = await auditable([a, b], [await readMeta(a), await readMeta(b)]);
  assert.match(reasons.join(' '), /system_sha differs/);
});

test('two different model builds in one set is not a comparison', async () => {
  const dir = await tmpdir();
  const a = await sample(dir, 'a.txt', 'text', 'system_sha=s model_id=claude-opus-5 prompt_sha=p user_rules_sha=u');
  const b = await sample(dir, 'b.txt', 'text', 'system_sha=s model_id=claude-opus-4 prompt_sha=p user_rules_sha=u');
  const reasons = await auditable([a, b], [await readMeta(a), await readMeta(b)]);
  assert.match(reasons.join(' '), /model_id differs/);
});

test('a non-empty .err beside a sample makes that sample suspect', async () => {
  const dir = await tmpdir();
  const a = await sample(dir, 'a.txt', 'text', 'system_sha=s model_id=m prompt_sha=p user_rules_sha=u');
  await fs.writeFile(`${a}.err`, 'Warning: something\n');
  const reasons = await auditable([a], [await readMeta(a)]);
  assert.match(reasons.join(' '), /non-empty \.err/);
});

test('a clean and complete cell produces no reasons at all', async () => {
  const dir = await tmpdir();
  const base = 'arm=a scenario=report reps=5 system_sha=s model_id=m prompt_sha=p'
    + ' user_rules_sha=u cli=v';
  const fs_ = [];
  for (let r = 1; r <= 5; r += 1) {
    fs_.push(await sample(dir, `a-${r}.txt`, 'text', `${base} rep=${r}`));
  }
  const reasons = await auditable(fs_, await Promise.all(fs_.map(readMeta)));
  assert.deepEqual(reasons, []);
});

// Round 3. Every case below is a hole a reviewer found in the audit that round 2
// added — the audit checked that values AGREED and never that they EXISTED, and
// checked within a cell while the whole point is comparing cells.

const META = 'arm=a scenario=report rep=1 reps=5 prompt_sha=p system_sha=s user_rules_sha=u model_id=m cli=v';
const cell = (over = {}) => Object.entries({ ...Object.fromEntries(
  META.split(' ').map((kv) => kv.split('='))), ...over }).map(([k, v]) => `${k}=${v}`).join(' ');

async function five(dir, arm, over = {}) {
  await fs.mkdir(dir, { recursive: true });
  const out = [];
  for (let r = 1; r <= 5; r += 1) {
    out.push(await sample(dir, `${arm}-${r}.txt`, 'text', cell({ arm, rep: r, ...over })));
  }
  return out;
}
const audit = async (fs_) => auditable(fs_, await Promise.all(fs_.map(readMeta)));

test('a field absent from every sidecar is caught, not skipped as agreeing', async () => {
  const dir = await tmpdir();
  const fs_ = await five(dir, 'a', { model_id: '' });
  assert.match((await audit(fs_)).join(' '), /have no model_id/);
});

test('a subset of an arm is not a cell', async () => {
  const dir = await tmpdir();
  const fs_ = await five(dir, 'a');
  assert.match((await audit(fs_.slice(0, 4))).join(' '), /only 4 of them are here/);
});

test('an undersized arm is refused even when complete', async () => {
  const dir = await tmpdir();
  const one = [await sample(dir, 'a-1.txt', 'text', cell({ reps: 1 }))];
  assert.match((await audit(one)).join(' '), /below the documented five-run floor/);
});

test('--prompt must be the prompt the samples answered', async () => {
  const dir = await tmpdir();
  const fs_ = await five(dir, 'a');
  const metas = await Promise.all(fs_.map(readMeta));
  assert.match((await auditable(fs_, metas, { promptSha: 'WRONG' })).join(' '),
    /--prompt does not match/);
  assert.deepEqual(await auditable(fs_, metas, { promptSha: 'p' }), []);
});

test('digest reproduces the runner shasum', () => {
  // `printf x | shasum | cut -c1-12`
  assert.equal(digest(Buffer.from('x')), '11f6ad8ec52a');
});

test('two arms are refused by default and permitted under compare', async () => {
  const dir = await tmpdir();
  const both = [...await five(dir, 'ctl', { system_sha: 'none' }),
    ...await five(dir, 'skill', { system_sha: 'S1' })];
  const metas = await Promise.all(both.map(readMeta));
  assert.match((await auditable(both, metas)).join(' '), /system_sha differs/);
  assert.deepEqual(await auditable(both, metas, { compare: true }), []);
});

test('compare refuses two arms that carry the same treatment', async () => {
  const dir = await tmpdir();
  const same = [...await five(dir, 'x'), ...await five(dir, 'y')];
  const metas = await Promise.all(same.map(readMeta));
  assert.match((await auditable(same, metas, { compare: true })).join(' '),
    /same treatment, so this is not a contrast/);
});

test('compare still refuses a different model or prompt across arms', async () => {
  const dir = await tmpdir();
  const mixed = [...await five(dir, 'ctl', { system_sha: 'none' }),
    ...await five(dir, 'skill', { system_sha: 'S1', model_id: 'other' })];
  const metas = await Promise.all(mixed.map(readMeta));
  assert.match((await auditable(mixed, metas, { compare: true })).join(' '), /model_id differs/);
});

test('echo reads prose, so quoted code does not supply the overlap', () => {
  const prompt = 'fix the guard\n```js\nif (raw === "") throw new Error("empty");\n```';
  const quoting = 'Here it is.\n```js\nif (raw === "") throw new Error("empty");\n```';
  assert.equal(score(quoting, prompt, false).echo, 0);
});

// Self-review before round 4. Adding `cli` and `reps` to the comparison without
// adding them to REQUIRED reintroduced, for two new fields, the exact defect
// round 3 had just fixed for `model_id`. A field that is compared but not
// required is skipped when absent.

test('every field a check reads is required, not merely compared', async () => {
  const dir = await tmpdir();
  for (const gone of ['cli', 'reps']) {
    const fs_ = await five(dir + gone, 'a', { [gone]: '' });
    assert.match((await audit(fs_)).join(' '), new RegExp(`have no ${gone}`),
      `a missing ${gone} must be a reason`);
  }
});

test('an arm that disagrees with itself about its size is caught', async () => {
  const dir = await tmpdir();
  const a = await sample(dir, 'a-1.txt', 'text', cell({ rep: 1, reps: 5 }));
  const b = await sample(dir, 'a-2.txt', 'text', cell({ rep: 2, reps: 3 }));
  assert.match((await audit([a, b])).join(' '), /disagrees with itself about its size/);
});

// The scorer is a command as well as a module, and nothing in CI ran it as one
// until promotion did. Its entry guard compared `import.meta.url` against a
// URL glued together from `process.argv[1]`, which can never match on Windows,
// so `node bench/score.mjs` printed nothing there. A promoted study then
// derived no figure from a run that had reported success.

test('the scorer runs as a command, and prints its table', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const dir = await tmpdir();
  const file = await sample(dir, 'a-1.txt', 'a short reply\n', cell({ rep: 1, reps: 5 }));
  const scorer = path.join(path.dirname(import.meta.dirname), 'bench', 'score.mjs');
  const { stdout } = await promisify(execFile)(process.execPath, [scorer, '--unaudited', file]);
  assert.match(stdout, /^audit\tarm\tfile\t/m);
  assert.match(stdout, /\tMEDIAN\t/);
});

// Forbidding the one broken spelling was the weaker test: it says nothing about
// a module that grows a `main` and guards it some third way, and nothing about
// one that loses its guard entirely. So every entry point is named, and each is
// asserted to carry the guard verbatim. A new module under `bench/` or
// `scripts/` fails here until somebody puts it on one of the two lists, which
// is the point — the list is the inventory.

/** The one spelling that works on every platform. */
const GUARD = 'if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {';

/**
 * Modules that run unconditionally as scripts, so they have no guard to carry.
 *
 * `scripts/check-resident.mjs` arrived with #86 and this test caught it, which
 * is what the inventory is for. It is unguarded on purpose, like the extractor:
 * nothing imports either one, and both do their work at the top level. The
 * assertion below is what keeps that classification honest — a module listed
 * here that starts reading `process.argv[1]` has grown a main and needs a
 * guard, not an exemption.
 */
const UNGUARDED = {
  'bench/extract.mjs': 'runs top to bottom as a script, with no main to guard',
  'scripts/check-resident.mjs': 'runs top to bottom as a script, with no main to guard',
};

test('every entry point guards itself the one way that works on both platforms', async () => {
  const root = path.dirname(import.meta.dirname);
  const found = [];
  for (const sub of ['bench', 'scripts']) {
    for (const name of (await fs.readdir(path.join(root, sub))).filter((n) => n.endsWith('.mjs'))) {
      found.push(`${sub}/${name}`);
    }
  }
  assert.equal(found.length, 14, `the entry-point inventory moved: ${found.sort().join(', ')}`);
  for (const rel of found) {
    const text = await fs.readFile(path.join(root, rel), 'utf8');
    if (Object.hasOwn(UNGUARDED, rel)) {
      assert.ok(!text.includes('process.argv[1]'),
        `${rel} is listed as unguarded because it ${UNGUARDED[rel]}, and it reads argv[1]`);
      continue;
    }
    // A URL built by hand out of a Windows path never equals `import.meta.url`,
    // so a module guarded that way runs as a command on one platform and does
    // nothing on the other.
    assert.ok(text.includes(GUARD), `${rel} does not carry the entry guard verbatim`);
  }
});

// The review cells, from issue #109. Each case encodes a sentence from
// ADR-0032. They are a second family beside the shape metrics, and they measure
// a reply against a ground truth rather than against nothing, so a defect here
// moves a published figure the way a shape defect would.

const finding = (over = {}) => ({
  id: 1, path: 'bench/probe.mjs', from: 437, to: 437, verdict: 'ACCEPTED', confirms: true, ...over,
});

test('confirmed counts the findings an anchor reached, and missed is the rest', () => {
  const truth = [finding({ id: 1 }), finding({ id: 2, from: 900, to: 900 })];
  const r = reviewMetrics('bench/probe.mjs:437 — high confirmed — the flag is read late.',
    { output_tokens: '250' }, truth);
  assert.equal(r.anchors, 1);
  assert.equal(r.confirmed, 1);
  assert.equal(r.missed, 1);
  // The two always sum to the ground truth, so a reader never has to hold a
  // third number to know what the denominator was.
  assert.equal(r.confirmed + r.missed, truth.length);
});

test('a duplicated ground truth does not report a matched finding as dropped', () => {
  // `matchDispositions` deduplicates by identifier while `missed` counted array
  // entries, so a corpus holding one pull request twice read {confirmed:1,
  // missed:1} where the truth is {confirmed:1, missed:0}. That inflates the
  // counterweight — the direction that makes the compressed arm look worse.
  // `corpusProblems` refuses such a corpus, and this keeps the invariant true
  // whatever the function is handed.
  const twice = [finding({ id: 1 }), finding({ id: 1 })];
  const r = reviewMetrics('bench/probe.mjs:437', { output_tokens: '1000' }, twice);
  assert.equal(r.confirmed, 1);
  assert.equal(r.missed, 0);
  assert.equal(r.perKtok, 1);
});

test('perKtok is confirmed per thousand output tokens', () => {
  const r = reviewMetrics('bench/probe.mjs:437 is wrong', { output_tokens: '500' }, [finding()]);
  assert.equal(r.outTokens, 500);
  assert.equal(r.perKtok, 2);
});

test('an absent token count withholds the rate rather than computing one', () => {
  // A rate over an unknown denominator is the wrong number, not a missing one,
  // and a withheld cell derives no figure at all.
  const r = reviewMetrics('bench/probe.mjs:437 is wrong', { output_tokens: 'absent' }, [finding()]);
  assert.equal(r.confirmed, 1);
  assert.equal(r.outTokens, '');
  assert.equal(r.perKtok, '');
});

test('a run that emitted no output tokens withholds the rate too', () => {
  const r = reviewMetrics('bench/probe.mjs:437', { output_tokens: '0' }, [finding()]);
  assert.equal(r.perKtok, '', 'dividing by zero prints Infinity into a table');
});

test('an arm that named nothing scores zero confirmed and misses everything', () => {
  const r = reviewMetrics('No findings above the bar.', { output_tokens: '20' }, [finding()]);
  assert.deepEqual([r.anchors, r.confirmed, r.missed, r.perKtok], [0, 0, 1, 0]);
});

test('--review requires the token field, and admits absent as its value', async () => {
  const dir = await tmpdir();
  const truth = { confirmed: new Map([['report', []]]), problems: [] };
  const say = async (files) => (await auditable(files,
    await Promise.all(files.map(readMeta)), { review: truth })).join(' ');
  assert.match(await say(await five(`${dir}no-tokens`, 'a')), /have no output_tokens/);
  assert.equal(await say(await five(`${dir}absent`, 'a', { output_tokens: 'absent' })), '');
});

test('a token value this collector could not have written is refused', async () => {
  // Presence alone let `garbage`, `-1` and `Infinity` withhold the primary
  // figure exactly as the supported `absent` does, while the run still read
  // audited. ADR-0024's split: `absent` is a protocol spelling and decides a
  // reading, and a value no collector writes is a structural refusal.
  const dir = await tmpdir();
  const truth = { confirmed: new Map([['report', []]]), problems: [] };
  const say = async (over) => {
    const files = await five(`${dir}${over.output_tokens}`, 'a', over);
    return (await auditable(files, await Promise.all(files.map(readMeta)),
      { review: truth })).join(' ');
  };
  for (const bad of ['garbage', '-1', 'Infinity', '1.5']) {
    assert.match(await say({ output_tokens: bad }), /could not have written/, `${bad} is refused`);
  }
  // Zero is a run that emitted nothing, which the collector does produce. It
  // stays valid and still withholds the rate.
  assert.equal(await say({ output_tokens: '0' }), '');
  assert.equal(reviewMetrics('x', { output_tokens: '0' }, []).perKtok, '');
});

test('a scenario no verdict record covers is refused, not scored against nothing', async () => {
  const dir = await tmpdir();
  const files = await five(`${dir}uncovered`, 'a', { output_tokens: '100' });
  const truth = { confirmed: new Map([['pr-118-r1', []]]), problems: [] };
  assert.match((await auditable(files, await Promise.all(files.map(readMeta)),
    { review: truth })).join(' '), /no verdict record covers report/);
});

test('a corpus that does not check out is a reason, not something to score around', async () => {
  const dir = await tmpdir();
  const files = await five(`${dir}badcorpus`, 'a', { output_tokens: '100' });
  const truth = { confirmed: new Map([['report', []]]), problems: ['pr-1.json: not JSON.'] };
  assert.match((await auditable(files, await Promise.all(files.map(readMeta)),
    { review: truth })).join(' '), /the verdict corpus does not check out/);
});

test('the table carries the review columns only when --review asks for them', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const root = path.dirname(import.meta.dirname);
  const scorer = path.join(root, 'bench', 'score.mjs');
  const run = (args) => promisify(execFile)(process.execPath, [scorer, ...args], { cwd: root });

  const dir = await tmpdir();
  const file = await sample(dir, 'a-1.txt', 'bench/probe.mjs:437 is wrong\n',
    cell({ rep: 1, reps: 5, scenario: 'pr-119-r1', output_tokens: '400' }));

  const plain = await run(['--unaudited', file]);
  assert.ok(!plain.stdout.includes('perKtok'), 'a style run prints no review column');

  const reviewed = await run(['--unaudited', '--review',
    path.join(root, 'bench', 'verdicts'), file]);
  assert.match(reviewed.stdout,
    /^audit\tarm\tfile\t.*\tanchors\tconfirmed\tmissed\toutTokens\tperKtok$/m);
  // pr-119-r1 confirms two findings, one anchored at 437 and one covering 437
  // through 445, so a single stated line reaches both. That is the bound
  // ADR-0032 states, measured here rather than asserted there.
  assert.match(reviewed.stdout, /\t1\t2\t0\t400\t5\n/);
});
