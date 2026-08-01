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
| N-01 | S | S |  | Section title |
| N-02 | Rules | Rules |  | Section title |
| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | Part 1, Section 5 |
| G-02 | Do not use semicolons. | Rules | Rule 8.1 | Part 1, Section 8 |
`;

test('parses rows and skips the separator', () => {
  const rows = parseMatrix(MATRIX);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].id, 'G-01');
  assert.equal(rows[2].anchor, 'Rules');
  assert.equal(rows[3].rule, 'Rule 8.1');
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

test('a table and a fenced block need a row, under a designator', () => {
  // The first draft of this change exempted both. A rule written as a table is
  // still a rule, so exempting one shape was the original defect renamed.
  assert.match(uncovered('## Later\n\n| a | b |\n|---|---|\n| c | d |'), /\[table [0-9a-f]{8}\]/);
  assert.match(uncovered('```js\nconst x = 1;\n```'), /\[code [0-9a-f]{8}\]/);
});

test('a designator names the block contents, not its position', () => {
  // An ordinal named a POSITION, so a table could be rewritten entirely while
  // the matrix stayed clean, and inserting a block rebound every row after it.
  const one = uncovered('```js\nconst x = 1;\n```');
  const two = uncovered('```js\nconst x = 2;\n```');
  assert.notEqual(one, two);

  // Two blocks: the second keeps its identity when the first changes.
  const both = (first) => uncovered(`\`\`\`js\n${first}\n\`\`\`\n\n\`\`\`js\nlast\n\`\`\``);
  const tail = (s) => s.match(/\[code [0-9a-f]{8}\]/g).at(-1);
  assert.equal(tail(both('a')), tail(both('b')));
});

test('prose cannot impersonate a block designator', () => {
  const found = checkSkill({ skillText: `${SKILL}\n[table 0123abcd]\n`, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'reserved-designator'));
});

test('a heading is a unit, and so is anything before the first heading', () => {
  // `## Always preserve safety` with an empty matrix used to pass, and so did
  // an instruction written above the title.
  const withHead = checkSkill({
    skillText: `${SKILL}\n## Always preserve safety\n`, matrixText: MATRIX,
  });
  assert.ok(withHead.some((f) => f.code === 'uncovered-statement'
    && /Always preserve safety/.test(f.message)));

  const before = checkSkill({
    skillText: SKILL.replace('# S', 'Always preserve safety.\n\n# S'), matrixText: MATRIX,
  });
  assert.ok(before.some((f) => f.code === 'uncovered-statement'
    && /before the first heading/.test(f.message)));
});

test('a section named Source grades like any other', () => {
  // Five heading names were exempt, so an instruction under any of them was
  // never disposed of by a row.
  const hidden = checkSkill({ skillText: `${SKILL}\n## Source\n\nAlways preserve safety.\n`,
    matrixText: MATRIX });
  assert.ok(hidden.some((f) => f.code === 'uncovered-statement'
    && /Always preserve safety/.test(f.message)));
});

test('pairing does not depend on the order of the rows', () => {
  // A row naming the wrong anchor could consume the occurrence a later correct
  // row needed, so the same two rows in the other order gave different findings.
  const rows = (a, b) => `${MATRIX}${a}${b}`;
  const wrong = '| G-03 | Do not use semicolons. | Nowhere | Rule 8.1 | s |\n';
  const right = '| G-04 | Do not use semicolons. | Rules | Rule 8.1 | s |\n';
  const twice = `${SKILL}- Do not use semicolons.\n`;
  const codes = (m) => checkSkill({ skillText: twice, matrixText: m })
    .map((f) => f.code).sort();
  assert.deepEqual(codes(rows(wrong, right)), codes(rows(right, wrong)));
  // Three rows claim two occurrences. The row refused is the one whose anchor
  // is wrong, in either order, because every exact match is reserved first.
  const refused = (m) => checkSkill({ skillText: twice, matrixText: m })
    .map((f) => `${f.code} ${f.message.split(':')[0]}`);
  assert.deepEqual(refused(rows(wrong, right)), ['duplicate-row G-03']);
  assert.deepEqual(refused(rows(right, wrong)), ['duplicate-row G-03']);
});

test('a heading inside a fence does not open a section', () => {
  // Splitting there put the rest of the block under a heading nobody wrote,
  // and the lint reads the same sections.
  const found = uncovered('```sh\n# not a heading\nls\n```');
  assert.match(found, /\[code [0-9a-f]{8}\]/);
  assert.doesNotMatch(found, /not a heading/);
});

test('one row covers one occurrence, not every copy of a sentence', () => {
  const twice = `${SKILL}- Do not use semicolons.\n`;
  const found = checkSkill({ skillText: twice, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'uncovered-statement'
    && /Do not use semicolons/.test(f.message)));

  const spare = `${MATRIX}| G-03 | Do not use semicolons. | Rules | Rule 8.1 | Part 1, Section 8 |\n`;
  assert.deepEqual(checkSkill({ skillText: twice, matrixText: spare }), []);
  assert.ok(checkSkill({ skillText: SKILL, matrixText: spare })
    .some((f) => f.code === 'duplicate-row'));
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
