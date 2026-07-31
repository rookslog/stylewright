import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseMatrix, checkSkill, checkAll } from '../src/ground.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');

const SKILL = `---
name: s
description: d
---

# S

## Rules

- Use no more than 20 words in a sentence.
- Do not use semicolons.
`;

const MATRIX = `# Grounding: s

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | Part 1, Section 5 |
| G-02 | Do not use semicolons. | Rules | Rule 8.1 | Part 1, Section 8 |
`;

test('parses rows and skips the separator', () => {
  const rows = parseMatrix(MATRIX);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'G-01');
  assert.equal(rows[0].anchor, 'Rules');
  assert.equal(rows[1].rule, 'Rule 8.1');
});

test('a matching skill and matrix produce no findings', () => {
  assert.deepEqual(checkSkill({ skillText: SKILL, matrixText: MATRIX }), []);
});

test('detects a quote that no longer appears in the skill', () => {
  const drifted = SKILL.replace('Do not use semicolons.', 'Avoid semicolons.');
  const found = checkSkill({ skillText: drifted, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'missing-quote'));
});

test('detects a quote under the wrong anchor', () => {
  const moved = MATRIX.replace('| Rules | Rule 8.1', '| Nowhere | Rule 8.1');
  const found = checkSkill({ skillText: SKILL, matrixText: moved });
  assert.ok(found.some((f) => f.code === 'wrong-anchor'));
});

test('detects a skill statement with no row', () => {
  const extra = `${SKILL}- Write one idea in each sentence.\n`;
  const found = checkSkill({ skillText: extra, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'uncovered-statement'));
});

test('a G row must carry a rule and an E row must not', () => {
  const gNoRule = MATRIX.replace('| Rule 5.1 |', '|  |');
  assert.ok(checkSkill({ skillText: SKILL, matrixText: gNoRule })
    .some((f) => f.code === 'g-row-no-rule'));

  const eWithRule = MATRIX.replace('| G-01 |', '| E-01 |');
  assert.ok(checkSkill({ skillText: SKILL, matrixText: eWithRule })
    .some((f) => f.code === 'e-row-has-rule'));
});

// The checker used to see one shape: a `-` bullet on a single line. Everything
// below entered a shipped standards skill unclassified while `ground --check`
// reported clean, under a sentence claiming every statement was traced. Each
// case is the shape that slipped, and each fails against the old extractor.

const uncovered = (text) => checkSkill({ skillText: `${SKILL}\n${text}\n`, matrixText: MATRIX })
  .filter((f) => f.code === 'uncovered-statement').map((f) => f.message).join(' ');

test('a numbered item is a statement', () => {
  assert.match(uncovered('1. Preserve technical meaning and safety.'),
    /Preserve technical meaning/);
});

test('a prose paragraph is a statement', () => {
  assert.match(uncovered('For strict compliance, check every word.'),
    /For strict compliance/);
});

test('a wrapped paragraph is ONE statement, joined', () => {
  const found = uncovered('Check every general word\nagainst the dictionary.');
  assert.match(found, /Check every general word against the dictionary\./);
  assert.equal(found.split('has no grounding row').length - 1, 1);
});

test('a wrapped list item is ONE statement, and its tail is not invisible', () => {
  // Reading the first line alone let the rest of an item change without the
  // matrix noticing — the same defect one level down.
  const found = uncovered('- Do not use a semicolon,\n  because it joins two ideas.');
  assert.match(found, /Do not use a semicolon, because it joins two ideas\./);
  assert.equal(found.split('has no grounding row').length - 1, 1);
});

test('a heading, a table row, and fenced code assert nothing', () => {
  assert.equal(uncovered('## Later\n\n| a | b |\n|---|---|\n| c | d |'), '');
  assert.equal(uncovered('```js\nconst x = 1;\n```'), '');
});

test('an N row carries no rule, and an unknown prefix is refused', () => {
  const narrative = `${SKILL}\nThis guide does not replace the standard.\n`;
  const withN = `${MATRIX}| N-01 | This guide does not replace the standard. | Rules |  | Framing |\n`;
  assert.deepEqual(checkSkill({ skillText: narrative, matrixText: withN }), []);

  const nWithRule = withN.replace('| Rules |  | Framing |', '| Rules | Rule 1.1 | Framing |');
  assert.ok(checkSkill({ skillText: narrative, matrixText: nWithRule })
    .some((f) => f.code === 'e-row-has-rule'));

  const bogus = withN.replace('| N-01 |', '| X-01 |');
  assert.ok(checkSkill({ skillText: narrative, matrixText: bogus })
    .some((f) => f.code === 'unknown-row-kind'));
});

test('checkAll covers every skill in the repository', async () => {
  const all = await checkAll(REPO);
  assert.ok('demo-standard' in all);
  assert.deepEqual(all['demo-standard'], []);
  assert.ok(all['demo-craft'].some((f) => f.code === 'no-matrix'));
});
