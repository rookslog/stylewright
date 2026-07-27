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

test('checkAll covers every skill in the repository', async () => {
  const all = await checkAll(REPO);
  assert.ok('demo-standard' in all);
  assert.deepEqual(all['demo-standard'], []);
  assert.ok(all['demo-craft'].some((f) => f.code === 'no-matrix'));
});
