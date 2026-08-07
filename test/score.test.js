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

import { score, auditable, readMeta, digest } from '../bench/score.mjs';

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

/** Modules that run unconditionally as scripts, so they have no guard to carry. */
const UNGUARDED = { 'bench/extract.mjs': 'runs top to bottom as a script, with no main to guard' };

test('every entry point guards itself the one way that works on both platforms', async () => {
  const root = path.dirname(import.meta.dirname);
  const found = [];
  for (const sub of ['bench', 'scripts']) {
    for (const name of (await fs.readdir(path.join(root, sub))).filter((n) => n.endsWith('.mjs'))) {
      found.push(`${sub}/${name}`);
    }
  }
  assert.equal(found.length, 9, `the entry-point inventory moved: ${found.sort().join(', ')}`);
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
