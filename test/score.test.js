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

import { score, auditable, readMeta } from '../bench/score.mjs';

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

test('a clean set produces no reasons at all', async () => {
  const dir = await tmpdir();
  const meta = 'system_sha=s model_id=m prompt_sha=p user_rules_sha=u';
  const a = await sample(dir, 'a.txt', 'text', meta);
  const b = await sample(dir, 'b.txt', 'text', meta);
  const reasons = await auditable([a, b], [await readMeta(a), await readMeta(b)]);
  assert.deepEqual(reasons, []);
});
