import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDoc, checkCorpus } from '../scripts/check-docs-meta.mjs';

const fm = (lines) => `---\n${lines.join('\n')}\n---\n\n# Title\n\nBody.\n`;

test('a well-formed spec passes', () => {
  const text = fm(['type: spec', 'status: draft', 'issues: [21, 43]']);
  assert.deepEqual(checkDoc('docs/specs/2026-08-04-measurement-design.md', text), []);
});

test('a file with no front matter is refused', () => {
  const problems = checkDoc('docs/specs/2026-08-04-a.md', '# Title\n\nBody.\n');
  assert.match(problems.join(' '), /no front matter/);
});

test('an author key is refused as unknown', () => {
  const text = fm(['type: spec', 'status: draft', 'author: someone']);
  assert.match(checkDoc('docs/specs/2026-08-04-a.md', text).join(' '), /unknown front matter key "author"/);
});

test('a status outside the enum is refused', () => {
  const text = fm(['type: spec', 'status: pending']);
  assert.match(checkDoc('docs/specs/2026-08-04-a.md', text).join(' '), /status "pending"/);
});

test('a spec in the plans directory is refused', () => {
  const text = fm(['type: spec', 'status: draft']);
  assert.match(checkDoc('docs/plans/2026-08-04-a.md', text).join(' '), /lives under docs\/specs/);
});

test('a spec without a dated filename is refused', () => {
  const text = fm(['type: spec', 'status: draft']);
  assert.match(checkDoc('docs/specs/measurement.md', text).join(' '), /YYYY-MM-DD-slug/);
});

test('an adr must say when it was decided, and only an adr may', () => {
  const undated = fm(['type: adr', 'status: accepted']);
  assert.match(checkDoc('docs/adr/0001-a.md', undated).join(' '), /when it was decided/);
  const datedSpec = fm(['type: spec', 'status: draft', 'decided: 2026-08-05']);
  assert.match(checkDoc('docs/specs/2026-08-05-a.md', datedSpec).join(' '), /only an adr/);
});

test('superseded status and superseded-by require each other', () => {
  const noSuccessor = fm(['type: spec', 'status: superseded']);
  assert.match(checkDoc('docs/specs/2026-08-04-a.md', noSuccessor).join(' '), /names its successor/);
  const notSuperseded = fm(['type: spec', 'status: draft', 'superseded-by: docs/specs/2026-08-05-b.md']);
  assert.match(checkDoc('docs/specs/2026-08-04-a.md', notSuperseded).join(' '), /requires status: superseded/);
});

test('a supersede link must hold at both ends', () => {
  const oneEnded = new Map([
    ['docs/specs/2026-08-05-b.md',
      fm(['type: spec', 'status: draft', 'supersedes: docs/specs/2026-08-04-a.md'])],
    ['docs/specs/2026-08-04-a.md',
      fm(['type: spec', 'status: superseded', 'superseded-by: docs/specs/2026-08-05-c.md'])],
  ]);
  assert.match(checkCorpus(oneEnded).join(' '), /does not point back|does not exist/);

  const twoEnded = new Map([
    ['docs/specs/2026-08-05-b.md',
      fm(['type: spec', 'status: draft', 'supersedes: docs/specs/2026-08-04-a.md'])],
    ['docs/specs/2026-08-04-a.md',
      fm(['type: spec', 'status: superseded', 'superseded-by: docs/specs/2026-08-05-b.md'])],
  ]);
  assert.deepEqual(checkCorpus(twoEnded), []);
});

test('a supersede target that does not exist is refused', () => {
  const docs = new Map([
    ['docs/specs/2026-08-05-b.md',
      fm(['type: spec', 'status: draft', 'supersedes: docs/specs/2026-01-01-gone.md'])],
  ]);
  assert.match(checkCorpus(docs).join(' '), /does not exist/);
});
