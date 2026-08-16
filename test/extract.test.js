// bench/extract.mjs decides whether a run counts as a sample at all.
//
// It is the guard that stops a failed invocation being kept as a successful
// short one, which matters because every treatment in the protocol is meant to
// move samples shorter. A guard with no tests is a guard nobody has watched
// refuse anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const EXTRACT = fileURLToPath(new URL('../bench/extract.mjs', import.meta.url));

async function extract(payload) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-'));
  const raw = path.join(dir, 'raw.json');
  const out = path.join(dir, 'sample.txt');
  await fs.writeFile(raw, typeof payload === 'string' ? payload : JSON.stringify(payload));
  try {
    const { stdout } = await run(process.execPath, [EXTRACT, raw, out]);
    // Two whitespace-separated fields: the build, and the output tokens or the
    // word `absent`. `bench/run.sh` splits them the same way.
    const [model, tokens] = stdout.split(' ');
    return { ok: true, model, tokens, text: await fs.readFile(out, 'utf8') };
  } catch (e) {
    let wrote = true;
    try { await fs.access(out); } catch { wrote = false; }
    return { ok: false, stderr: e.stderr, wrote };
  }
}

const good = {
  is_error: false,
  result: 'The answer.',
  modelUsage: { 'claude-opus-5': { outputTokens: 40 } },
};

test('a successful run yields its text and the build that served it', async () => {
  const r = await extract(good);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'The answer.');
  assert.equal(r.model, 'claude-opus-5');
  assert.equal(r.tokens, '40');
});

// Issue #109 divides by this number, so an absent field must not arrive as a
// zero. A zero is a run that emitted nothing, and `absent` is a harness that
// reported nothing, and the two license different readings.
test('an absent output-token count is reported as absent, never as zero', async () => {
  const r = await extract({ ...good, modelUsage: { 'claude-opus-5': { inputTokens: 10 } } });
  assert.equal(r.ok, true);
  assert.equal(r.model, 'claude-opus-5');
  assert.equal(r.tokens, 'absent');
});

test('the snake_case spelling of the token count is read as well', async () => {
  const r = await extract({ ...good, modelUsage: { 'claude-opus-5': { output_tokens: 7 } } });
  assert.equal(r.tokens, '7');
});

test('a run that emitted no output tokens reports zero, which is not absent', async () => {
  const r = await extract({ ...good, modelUsage: { 'claude-opus-5': { outputTokens: 0 } } });
  assert.equal(r.tokens, '0');
});

test('an auxiliary model billed beside the answer does not defeat the run', async () => {
  const r = await extract({
    ...good,
    modelUsage: {
      'claude-haiku-4-5-20251001': { outputTokens: 3 },
      'claude-opus-5': { outputTokens: 40 },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.model, 'claude-opus-5');
});

test('a run reporting is_error is refused, and writes no sample', async () => {
  const r = await extract({ ...good, is_error: true, subtype: 'auth' });
  assert.equal(r.ok, false);
  assert.equal(r.wrote, false);
  assert.match(r.stderr, /is_error/);
});

test('a run with no result text is refused even when it reports no error', async () => {
  const r = await extract({ ...good, result: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.wrote, false);
});

test('output that is not JSON at all is refused', async () => {
  const r = await extract('Failed to authenticate. API Error: 401');
  assert.equal(r.ok, false);
  assert.equal(r.wrote, false);
  assert.match(r.stderr, /did not complete/);
});

test('a tie between models is refused rather than guessed', async () => {
  const r = await extract({
    ...good,
    modelUsage: { 'model-a': { outputTokens: 40 }, 'model-b': { outputTokens: 40 } },
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /cannot tell which model answered/);
});

test('missing modelUsage is refused, because the build would be unknown', async () => {
  const r = await extract({ is_error: false, result: 'text' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /serving build is unknown/);
});
