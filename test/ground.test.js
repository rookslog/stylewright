import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  parseMatrix, checkSkill, checkAll, contentUnits, unmodelled, AT_COLUMN_ZERO, rowDigest, InvalidMoment, readMatrix,
} from '../src/ground.js';
import { sections } from '../src/markdown.js';

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

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| N-01 | S | S |  |  | Section title |  |
| N-02 | Rules | Rules |  |  | Section title |  |
| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | unquoted | Part 1, Section 5 | unaudited |
| G-02 | Do not use semicolons. | Rules | Rule 8.1 | "Do not use a semicolon." | Part 1, Section 8 | unaudited |
`;

/**
 * The findings that decide the exit code. `audit-coverage` is a note, and it
 * appears beside every matrix that carries a G row, so a test asserting "no
 * findings" would now be asserting that the coverage line is absent.
 */
const errors = (findings) => findings.filter((f) => f.level !== 'note');

/**
 * The day the check runs on, injected. `src/` reads no clock, so an audit
 * dated after today is refused against a moment the caller hands in.
 */
const NOW = '2026-08-06T12:00:00.000Z';
const check = (args) => checkSkill({ now: NOW, ...args });

test('parses rows and skips the separator', () => {
  const rows = parseMatrix(MATRIX);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].id, 'G-01');
  assert.equal(rows[2].anchor, 'Rules');
  assert.equal(rows[3].rule, 'Rule 8.1');
});

test('a matching skill and matrix produce no errors', () => {
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: MATRIX })), []);
});

test('detects a quote that no longer appears in the skill', () => {
  const drifted = SKILL.replace('Do not use semicolons.', 'Avoid semicolons.');
  const found = check({ skillText: drifted, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'missing-quote'));
});

test('detects a quote under the wrong anchor', () => {
  const moved = MATRIX.replace('| Rules | Rule 8.1', '| Nowhere | Rule 8.1');
  const found = check({ skillText: SKILL, matrixText: moved });
  assert.ok(found.some((f) => f.code === 'wrong-anchor'));
});

test('detects a skill statement with no row', () => {
  const extra = `${SKILL}- Write one idea in each sentence.\n`;
  const found = check({ skillText: extra, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'uncovered-statement'));
});

test('a G row must carry a rule and an E row must not', () => {
  const gNoRule = MATRIX.replace('| Rule 5.1 |', '|  |');
  assert.ok(check({ skillText: SKILL, matrixText: gNoRule })
    .some((f) => f.code === 'g-row-no-rule'));

  const eWithRule = MATRIX.replace('| G-01 |', '| E-01 |');
  assert.ok(check({ skillText: SKILL, matrixText: eWithRule })
    .some((f) => f.code === 'e-row-has-rule'));
});

// The audit column. No program here opens ASD-STE100 or the plain language
// guidelines, so no program can say whether a `G` row reads its rule
// correctly. `ground --check` confirmed that a rule was cited and printed
// "Grounding clean.", and a reader had nothing to tell that apart from an
// audited matrix. These tests hold the record that closes the difference.

const audited = (row) => MATRIX.replace(
  '| Part 1, Section 5 | unaudited |',
  `| Part 1, Section 5 | ${row} |`,
);

const CURRENT = rowDigest(parseMatrix(MATRIX).find((r) => r.id === 'G-01'));

test('a G row records its audit and a row of another kind does not', () => {
  const silent = MATRIX.replace('| Part 1, Section 5 | unaudited |', '| Part 1, Section 5 |  |');
  const found = check({ skillText: SKILL, matrixText: silent });
  assert.ok(found.some((f) => f.code === 'g-row-no-audit' && f.message.startsWith('G-01:')));
  // The remedy names the digest to write, because a contributor cannot compute
  // one by hand and would otherwise guess or write `unaudited` to be rid of it.
  assert.ok(found.some((f) => f.code === 'g-row-no-audit' && f.message.includes(CURRENT)));

  const narrated = MATRIX.replace('| Section title |  |', '| Section title | unaudited |');
  assert.ok(check({ skillText: SKILL, matrixText: narrated })
    .some((f) => f.code === 'e-row-has-audit'));
});

test('an audit is a real date and a digest, or it is nothing', () => {
  const refused = (cell) => check({ skillText: SKILL, matrixText: audited(cell) })
    .filter((f) => f.code === 'audit-malformed').length;
  assert.equal(refused('checked'), 1);
  assert.equal(refused('2026-08-06'), 1, 'a date with no digest names no words');
  assert.equal(refused(`2026-8-6 ${CURRENT}`), 1, 'a date the pattern cannot sort is refused');
  // A day that never happened is not a record of anybody reading anything.
  assert.equal(refused(`2026-02-31 ${CURRENT}`), 1);
  assert.equal(refused(`2027-02-29 ${CURRENT}`), 1);
  assert.equal(refused(`2028-02-29 ${CURRENT}`), 0, '2028 is a leap year');
  assert.equal(refused(`2026-08-06 ${CURRENT}`), 0);
});

test('an audit cannot be dated after the day the check runs', () => {
  // `9999-12-31` passed every other rule and the coverage note counted the row
  // as read. A date that has not arrived certifies a reading nobody could have
  // done, which is the same defect as `2026-02-31` and needs the same answer.
  const ahead = check({ skillText: SKILL, matrixText: audited(`9999-12-31 ${CURRENT}`) });
  assert.ok(ahead.some((f) => f.code === 'audit-ahead-of-the-check'));
  assert.ok(ahead.some((f) => f.code === 'audit-coverage' && f.message.startsWith('0 of 2')));

  // The boundary is today, which is a real reading, and tomorrow, which is not.
  const on = (day) => check({ skillText: SKILL, matrixText: audited(`${day} ${CURRENT}`) })
    .some((f) => f.code === 'audit-ahead-of-the-check');
  assert.equal(on('2026-08-06'), false, 'the day the check runs is a day someone can read on');
  assert.equal(on('2026-08-07'), true);
  assert.equal(on('2026-08-05'), false);
});

test('the check refuses to run without the day, rather than skipping the future rule', () => {
  // A default would turn the future rule off for whoever forgot the argument,
  // and `ground --check` already carries the lesson about a gate that fails
  // open on a missing name.
  assert.throws(() => checkSkill({ skillText: SKILL, matrixText: MATRIX }), InvalidMoment);
  assert.throws(() => checkSkill({ skillText: SKILL, matrixText: MATRIX, now: 'today' }), InvalidMoment);

  // The refusal carries the value and the spellings it accepts. A TypeError
  // said the type was wrong when the shape is what the check objects to.
  const thrown = (now) => {
    try { checkSkill({ skillText: SKILL, matrixText: MATRIX, now }); return null; } catch (e) { return e; }
  };
  const err = thrown('2026-08-06T12:00:00+05:00');
  assert.equal(err.name, 'InvalidMoment');
  assert.equal(err.value, '2026-08-06T12:00:00+05:00');
  assert.match(err.message, /YYYY-MM-DD/);
  assert.match(err.message, /2026-08-06T12:00:00\+05:00/);
});

test('the day the check runs on must itself be a day', () => {
  // The bound was read as the first ten characters and asked nothing more, so
  // `9999-99-99` arrived as the upper bound, every real date sorted below it,
  // and an audit dated `9999-12-31` came back counted as read. A bound that is
  // not a day cannot bound anything.
  const ahead = audited(`9999-12-31 ${CURRENT}`);
  for (const now of ['9999-99-99', '0000-00-00', '2026-02-31', '2026-08-06extra', '2026-8-6']) {
    assert.throws(() => checkSkill({ skillText: SKILL, matrixText: ahead, now }), InvalidMoment,
      `${now} was accepted as the day the check runs on`);

  }

  // A bare day and a UTC timestamp are both moments, and both still refuse the
  // audit dated after them.
  for (const now of ['2026-08-06', '2026-08-06T12:00:00.000Z', '2026-08-06T12:00Z']) {
    assert.ok(checkSkill({ skillText: SKILL, matrixText: ahead, now })
      .some((f) => f.code === 'audit-ahead-of-the-check'), `${now} was refused`);
  }
});

test('the day the check runs on is UTC, so an offset cannot move it', () => {
  // `2026-08-07T00:30:00+05:00` is still 6 August in UTC. The pattern read the
  // WRITTEN day, so an audit dated the 7th passed and was counted as read.
  // Normalising an offset needs date arithmetic in a module that may not build
  // a date, so the grammar refuses the form instead.
  const seventh = audited(`2026-08-07 ${CURRENT}`);
  for (const now of ['2026-08-07T00:30:00+05:00', '2026-08-06T19:30:00-05:00', '2026-08-06 12:00:00']) {
    assert.throws(() => checkSkill({ skillText: SKILL, matrixText: seventh, now }), InvalidMoment,
      `${now} was read as a UTC day`);
  }

  // The same instant written in UTC is the day the check compares against.
  assert.ok(checkSkill({ skillText: SKILL, matrixText: seventh, now: '2026-08-06T19:30:00.000Z' })
    .some((f) => f.code === 'audit-ahead-of-the-check'));
});

test('the coverage count and the findings read the audit cell the same way', () => {
  // Each read the cell for itself, so a stamp that merely matched the pattern
  // counted as audited while the check called it broken. One reading, used by
  // both.
  for (const cell of [`9999-12-31 ${CURRENT}`, '2026-08-06 00000000', `2026-02-31 ${CURRENT}`]) {
    const found = check({ skillText: SKILL, matrixText: audited(cell) });
    assert.ok(found.some((f) => f.level === 'error'), `${cell} passed`);
    assert.ok(found.some((f) => f.code === 'audit-coverage' && f.message.startsWith('0 of 2')),
      `${cell} was counted as read`);
  }
});

test('an audit describes the row it sits in, so editing the row voids it', () => {
  // This is the whole reason the cell carries a digest. A bare date beside a
  // row id survives a rewrite of every other cell, so an audit of words nobody
  // audited goes on reading as current — the defect an ordinal designator had.
  const fresh = audited(`2026-08-06 ${CURRENT}`);
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: fresh })), []);

  for (const [was, now] of [
    ['| Rule 5.1 |', '| Rule 5.2 |'],
    ['| Part 1, Section 5 |', '| Part 1, Section 6 |'],
    ['| Rules | Rule 5.1', '| Elsewhere | Rule 5.1'],
  ]) {
    const changed = fresh.replace(was, now);
    assert.notEqual(changed, fresh, `${was} appears once`);
    assert.ok(check({ skillText: SKILL, matrixText: changed })
      .some((f) => f.code === 'audit-stale'), `${now} left the audit standing`);
  }

  // The guidance moves with `SKILL.md`, so both files change together and the
  // audit still goes stale. An edited sentence was never audited.
  const reworded = 'Use no more than 25 words in a sentence.';
  const both = check({
    skillText: SKILL.replace('20 words', '25 words'),
    matrixText: fresh.replace('Use no more than 20 words in a sentence.', reworded),
  });
  assert.ok(both.some((f) => f.code === 'audit-stale'));
  assert.deepEqual(both.filter((f) => f.code === 'missing-quote'), []);
});

test('the run says how much of the matrix a person has read, and fails nothing', () => {
  // "Grounding clean." over a matrix nobody has audited is what issue 40
  // reports. The count prints beside the verdict so the two cannot be confused.
  const none = check({ skillText: SKILL, matrixText: MATRIX });
  assert.deepEqual(none.filter((f) => f.level !== 'note'), []);
  assert.deepEqual(none.filter((f) => f.code === 'audit-coverage').map((f) => f.message),
    ['0 of 2 G rows record a person reading them against the source.']);

  const one = check({ skillText: SKILL, matrixText: audited(`2026-08-06 ${CURRENT}`) });
  assert.ok(one.some((f) => f.code === 'audit-coverage' && f.message.startsWith('1 of 2')));
});

// The quotation column. Our sentence beside a rule identifier reads as the
// rule, and a reviewer had to open the source to find out. The doctrine
// permits quoting the rule for that reason, so the row records whether it
// does, on the same terms as the audit beside it.

const quoted = (cell) => MATRIX.replace('| Rule 5.1 | unquoted |', `| Rule 5.1 | ${cell} |`);

test('a G row records whether it quotes its rule, and a row of another kind does not', () => {
  const silent = check({ skillText: SKILL, matrixText: quoted(' ') });
  assert.ok(silent.some((f) => f.code === 'g-row-no-quote' && f.message.startsWith('G-01:')));

  // An empty cell would say the same thing far less clearly, and it does not
  // survive the column being dropped. `unquoted` is the state every row starts
  // in, and it is the only spelling of it.
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: MATRIX })), []);

  const narrated = MATRIX.replace('| N-01 | S | S |  |  |', '| N-01 | S | S |  | "S." |');
  assert.ok(check({ skillText: SKILL, matrixText: narrated })
    .some((f) => f.code === 'e-row-has-quote' && f.message.startsWith('N-01:')));
});

test('a quotation is marked as one, because unmarked text beside a rule id reads as the rule', () => {
  // This is the G row defect one column over. Our own paraphrase sitting in a
  // cell headed `Source text` borrows the authority of the standard exactly as
  // a mislabelled row does, and nothing but the marks tells the two apart.
  const refused = (cell) => check({ skillText: SKILL, matrixText: quoted(cell) })
    .filter((f) => f.code === 'quote-unmarked').map((f) => f.message);
  assert.equal(refused('Do not write a sentence of more than 20 words.').length, 1);
  assert.equal(refused('"Keep to 20 words').length, 1, 'an unclosed quotation is not a quotation');
  assert.equal(refused('Rule 5.1 says "Keep to 20 words."').length, 1,
    'the cell opens with the mark, so a lead-in of ours cannot pass as the source');
  assert.equal(refused('"Keep to 20 words."').length, 0);
  assert.equal(refused('"Keep to 20 words." and "Write one idea."').length, 0,
    'a row citing two rules quotes both, and our word between them is outside the marks');
  assert.equal(refused('unquoted').length, 0);

  // The message carries the cell it refused, because a contributor reading
  // "is not a quotation" over a cell they believe is one has nothing to act on.
  assert.match(refused('Keep to 20 words.')[0], /"Keep to 20 words\."/);
});

test('the run says how much of the matrix quotes its source', () => {
  // The substitution limit is a judgment about republishing, and no threshold
  // here can make it. The run reports the number and leaves it with the reader.
  const none = check({ skillText: SKILL, matrixText: quoted('unquoted') });
  assert.deepEqual(none.filter((f) => f.code === 'quote-coverage').map((f) => f.message),
    ["1 of 2 G rows carry the source's own words."]);

  const both = check({ skillText: SKILL, matrixText: quoted('"Keep to 20 words."') });
  assert.ok(both.some((f) => f.code === 'quote-coverage' && f.message.startsWith('2 of 2')));
  // It is a note. A matrix that quotes nothing is honest, and a gate that
  // failed on it would be red for every matrix from the day it landed.
  assert.deepEqual(errors(both), []);
});

test('an audit records the quotation the person read, so rewriting it goes stale', () => {
  // The quoted words are the copy of the rule an auditor read our sentence
  // against. Left out of the digest, they could be rewritten under a recorded
  // audit, which is the defect the digest exists to catch one column over.
  const before = MATRIX.replace('| Rule 5.1 | unquoted |', '| Rule 5.1 | "Keep to 20 words." |');
  const stamp = rowDigest(parseMatrix(before).find((r) => r.id === 'G-01'));
  const recorded = before.replace('| Part 1, Section 5 | unaudited |', `| Part 1, Section 5 | 2026-08-06 ${stamp} |`);
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: recorded })), []);

  const rewritten = recorded.replace('"Keep to 20 words."', '"Keep to 25 words."');
  assert.ok(check({ skillText: SKILL, matrixText: rewritten })
    .some((f) => f.code === 'audit-stale' && f.message.startsWith('G-01:')));
});

// The container, not the cell. Every attack below left the audit VALUES
// untouched and went after the table around them. A matrix whose rendered
// column is gone is not the record, whatever its rows still parse as, because
// the record exists for the person reading the file.

const HEADER = '| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |';
const DELIM = '|---|---|---|---|---|---|---|';
const FULLY = MATRIX
  .replace('| Part 1, Section 5 | unaudited |', `| Part 1, Section 5 | 2026-08-06 ${CURRENT} |`);

test('the header and the delimiter are checked, not skipped', () => {
  // Each of these printed full coverage and no error. In GFM each either drops
  // the rendered column or stops the block being a table at all, so the person
  // loses the audit record while the check reports it intact.
  const codes = (m) => check({ skillText: SKILL, matrixText: m }).map((f) => f.code);

  const SHORT = '| ID | Our guidance | Our anchor | Source rule | Source text | Source location |';
  assert.ok(codes(FULLY.replace(HEADER, SHORT).replace(DELIM, '|---|---|---|---|---|---|'))
    .includes('matrix-header-columns'));
  assert.ok(codes(FULLY.replace(DELIM, '|---|---|---|---|---|---|')).includes('matrix-delimiter-columns'));
  assert.ok(codes(FULLY.replace(DELIM, '|---|---|---|')).includes('matrix-delimiter-columns'));
  assert.ok(codes(FULLY.replace(`${DELIM}\n`, '')).includes('matrix-no-table'));
  assert.ok(codes(FULLY.replace(`${HEADER}\n`, '')).includes('matrix-no-header'));

  // Every heading, not only the audit's. Renaming one column is renaming the
  // label that tells a reader which cell they are reading, and the check named
  // a single column while a second one carried a claim about a source.
  for (const [was, now] of [
    ['| Source location | Audited |', '| Source location | Notes |'],
    ['| Source rule | Source text |', '| Source rule | Notes |'],
    ['| ID | Our guidance |', '| Row | Our guidance |'],
  ]) {
    assert.ok(codes(FULLY.replace(was, now)).includes('matrix-header-column-name'),
      `renaming a column in ${now} passed`);
  }

  // The intact matrix stays clean, so none of the above is a rule the shipped
  // files break.
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: FULLY })), []);
});

test('a row a reader sees as an example is not read as a row', () => {
  // Fenced or indented four spaces, a row is a code sample to a reader and was
  // a recorded audit to the checker. This is the MATRIX reader, not the
  // SKILL.md extractor, so it says nothing about issues 37 and 69.
  const fenced = FULLY.replace('| G-01 | Use', '```\n| G-01 | Use')
    .replace(`2026-08-06 ${CURRENT} |`, `2026-08-06 ${CURRENT} |\n\`\`\``);
  const inFence = check({ skillText: SKILL, matrixText: fenced });
  assert.ok(inFence.some((f) => f.code === 'uncovered-statement'), 'the fenced row stopped counting');
  // The fence also splits the table, so the count is withheld rather than
  // silently rebased onto the rows that survived.
  assert.ok(inFence.some((f) => f.code === 'audit-coverage'
    && f.message === 'not counted: the matrix table is broken.'));

  const indented = check({ skillText: SKILL, matrixText: FULLY.replace('| G-01 |', '    | G-01 |') });
  assert.ok(indented.some((f) => f.code === 'unread-matrix-row'
    && /does not begin at column 0/.test(f.message)));
});

test('a row that is not read is named, so the denominator cannot shrink quietly', () => {
  // A blockquoted row fell out of the parse, and the count printed "1 of 1"
  // over a matrix visibly carrying two G rows. The run was red for another
  // reason, but the number ADR-0018 calls the whole answer was wrong.
  const quoted = check({ skillText: SKILL, matrixText: FULLY.replace('| G-01 |', '> | G-01 |') });
  assert.ok(quoted.some((f) => f.code === 'unread-matrix-row' && /blockquote/.test(f.message)));
});

test('a seventh cell is refused, because no reader and no check sees it', () => {
  const smuggled = FULLY.replace(
    `| Part 1, Section 5 | 2026-08-06 ${CURRENT} |`,
    `| Part 1, Section 5 | 2026-08-06 ${CURRENT} | INVISIBLE IN RENDER |`,
  );
  assert.ok(check({ skillText: SKILL, matrixText: smuggled })
    .some((f) => f.code === 'row-has-extra-cell' && f.message.startsWith('G-01:')));
});

test('a zero offset is UTC, and a bounded time is required', () => {
  // The first version of the UTC rule refused `+00:00` on a day-shifting
  // warrant that cannot apply to an offset of no hours.
  for (const now of ['2026-08-06T12:00:00+00:00', '2026-08-06T12:00:00-00:00',
    '2026-08-06T12:00:00.000+0000', '2026-08-06T12:00:00Z']) {
    assert.deepEqual(errors(checkSkill({ skillText: SKILL, matrixText: FULLY, now })), [],
      `${now} is UTC and was refused`);
  }

  // `24:00:00Z` is a legal ISO spelling of midnight ENDING that day, so its
  // written day put the bound a day early. `99:99:99Z` was simply accepted.
  for (const now of ['2026-08-06T24:00:00Z', '2026-08-06T99:99:99Z', '2026-08-06T12:60:00Z',
    '2026-08-06T12:00:00+05:00', '2026-08-06 12:00:00']) {
    assert.throws(() => checkSkill({ skillText: SKILL, matrixText: FULLY, now }), InvalidMoment,
      `${now} was read as a UTC moment`);
  }
});

test('the table is contiguous, because GFM ends one at the first gap', () => {
  // readMatrix recorded every line number and compared none of them, so a
  // table could be scattered down the file and still parse with full coverage
  // while the reader saw no table at all.
  const codes = (m) => check({ skillText: SKILL, matrixText: m }).map((f) => f.code);
  const G1 = '| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | unquoted | Part 1, Section 5 | unaudited |';

  // Between the header and the delimiter.
  assert.ok(codes(MATRIX.replace(DELIM, `\n${DELIM}`)).includes('matrix-no-header'));
  assert.ok(codes(MATRIX.replace(DELIM, `Some prose.\n\n${DELIM}`)).includes('matrix-no-header'));
  // Under the delimiter, and between two body rows.
  assert.ok(codes(MATRIX.replace(`${DELIM}\n`, `${DELIM}\n\n`)).includes('row-outside-the-table'));
  assert.ok(codes(MATRIX.replace(G1, `\n${G1}`)).includes('row-outside-the-table'));
  assert.ok(codes(MATRIX.replace(G1, `## Later\n\n${G1}`)).includes('row-outside-the-table'));
  assert.ok(codes(MATRIX.replace(G1, `---\n\n${G1}`)).includes('row-outside-the-table'));

  // And none of it fires on the table as written.
  assert.deepEqual(errors(check({ skillText: SKILL, matrixText: MATRIX })), []);
});

test('a fence nobody closes swallows the table, and says so', () => {
  // The last silent denominator shrink: an unclosed fence takes the rest of
  // the file with it, so every row below leaves the parse at once and the
  // count fell from two G rows to none with nothing saying why.
  const swallowed = MATRIX.replace('| G-01 |', '```\n| G-01 |');
  const found = check({ skillText: SKILL, matrixText: swallowed });
  assert.ok(found.some((f) => f.code === 'unread-matrix-row'
    && /never closed/.test(f.message) && /Close it with ```/.test(f.message)));
  assert.ok(found.some((f) => f.code === 'audit-coverage'
    && f.message === 'not counted: the matrix table is broken.'));
});

test('the table is the FIRST delimiter, and a later one is named', () => {
  // This kills the selection mutant that survived the reviewer's battery:
  // flipping first-delimiter to last left the suite green. Under last, the
  // rows below bind to the wrong delimiter and the real rows become strays.
  const twoTables = `${MATRIX}\n${DELIM}\n`;
  const found = check({ skillText: SKILL, matrixText: twoTables });
  assert.ok(found.some((f) => f.code === 'matrix-second-delimiter'));
  // Under a last-delimiter rule these four rows stop parsing entirely.
  assert.equal(readMatrix(twoTables).rows.length, 4);
  assert.equal(readMatrix(twoTables).delimiter.line, readMatrix(MATRIX).delimiter.line);
  assert.deepEqual(found.filter((f) => f.code === 'uncovered-statement'), []);
});

test('a legal GFM shape this check refuses is named for what it is', () => {
  // Both of these are valid GFM and are not house style. The complaint used to
  // name an artifact of the reading instead of the author's line: an unclosed
  // row reported "carries 5 columns, not 6", and an indented table reported
  // "no table" while the real cause was the indentation.
  const unclosed = MATRIX.split('\n').map((l) => l.replace(/\|$/, '')).join('\n');
  const onUnclosed = check({ skillText: SKILL, matrixText: unclosed });
  assert.ok(onUnclosed.some((f) => f.code === 'matrix-row-unclosed'
    && /end the line with a pipe/i.test(f.message)));
  assert.deepEqual(onUnclosed.filter((f) => f.code === 'matrix-delimiter-columns'), [],
    'the column count is an artifact of the unclosed line, so it is not also reported');

  const indented = MATRIX.split('\n').map((l) => (l.startsWith('|') ? `   ${l}` : l)).join('\n');
  const onIndented = check({ skillText: SKILL, matrixText: indented });
  const noTable = onIndented.find((f) => f.code === 'matrix-no-table');
  assert.match(noTable.message, /refused above, at line/);
  assert.ok(onIndented.some((f) => f.code === 'unread-matrix-row'
    && /does not begin at column 0/.test(f.message)));
});

test('the coverage count is withheld when the table is broken', () => {
  // Adjudicated against printing a ratio over a table the reader cannot see.
  // A wrong number is worse than no number, and this is ADR-0018's own defect
  // one level out.
  for (const m of [
    MATRIX.replace('| Source location | Audited |', '| Source location | Notes |'),
    MATRIX.replace(DELIM, '|---|---|---|---|---|---|'),
    MATRIX.replace(`${DELIM}\n`, `${DELIM}\n\n`),
  ]) {
    // Both counts, because a quoted matrix is read against the same broken
    // table. One number withheld and the other printed would tell a reader the
    // table is readable after all.
    for (const code of ['audit-coverage', 'quote-coverage']) {
      const note = check({ skillText: SKILL, matrixText: m }).find((f) => f.code === code);
      // Named, not dereferenced. A missing note is the interesting failure and
      // it read as a TypeError, which reports the test rather than the defect.
      assert.ok(note, `${code} is absent over a broken table, so nothing says why`);
      assert.equal(note.message, 'not counted: the matrix table is broken.');
    }
  }
  // An intact table still reports the ratio.
  assert.ok(check({ skillText: SKILL, matrixText: MATRIX })
    .some((f) => f.code === 'audit-coverage' && f.message.startsWith('0 of 2')));
});

test('a leap second is 23:59:60 and a fraction belongs to the seconds', () => {
  // `|60` after any minute admitted 1439 times that never existed, and the
  // fraction sat outside the seconds group so `12:00.500Z` parsed.
  for (const now of ['2026-08-06T23:59:60Z', '2026-08-06T23:59:60.5Z', '2026-08-06T12:00:00.000Z']) {
    assert.deepEqual(errors(checkSkill({ skillText: SKILL, matrixText: MATRIX, now })), [],
      `${now} is a moment and was refused`);
  }
  for (const now of ['2026-08-06T12:00:60Z', '2026-08-06T23:58:60Z', '2026-08-06T12:00.500Z']) {
    assert.throws(() => checkSkill({ skillText: SKILL, matrixText: MATRIX, now }), InvalidMoment,
      `${now} is not a moment and was accepted`);
  }
});

test('readMatrix finds the table by its delimiter, not by a heading word', () => {
  const table = readMatrix(MATRIX);
  assert.equal(table.header.cells.length, 7);
  assert.equal(table.header.cells[6], 'Audited');
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.refusals, []);
});

test('every row carries the last cell, including a matrix that cites no source', () => {
  // An absent cell used to coalesce to an empty one, so a matrix of E and N
  // rows could drop the column from its header, its delimiter and every row
  // and still pass. No G row was left to complain, and the format quietly
  // became optional for exactly the matrices nobody would check by hand.
  const ours = SKILL.replace(/- Use no more.*\n- Do not use semicolons\.\n/, '- Ours alone.\n');
  const oneShort = `# Grounding: s

| ID | Our guidance | Our anchor | Source rule | Source text | Source location |
|---|---|---|---|---|---|
| N-01 | S | S |  |  | Section title |
| N-02 | Rules | Rules |  |  | Section title |
| E-01 | Ours alone. | Rules |  |  | Ours |
`;
  const found = check({ skillText: ours, matrixText: oneShort });
  assert.deepEqual(found.filter((f) => f.code === 'row-missing-audit-cell').length, 3,
    'every row without the cell is named, not just the ones that cite a source');

  // A G row missing the cell is refused for the missing cell, and not reported
  // as though it had left an audit blank.
  const short = MATRIX.replace('| Part 1, Section 5 | unaudited |', '| Part 1, Section 5 |');
  const codes = check({ skillText: SKILL, matrixText: short }).map((f) => f.code);
  assert.ok(codes.includes('row-missing-audit-cell'));
  assert.ok(!codes.includes('g-row-no-audit'));
});

test('a matrix that cites no source reports no audit coverage', () => {
  // navigable-references has no G row and cannot have one. "0 of 0 audited"
  // would read as a gap where there is nothing to audit.
  const ours = SKILL.replace(/- Use no more.*\n- Do not use semicolons\.\n/, '- Ours alone.\n');
  const matrix = `# Grounding: s

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| N-01 | S | S |  |  | Section title |  |
| N-02 | Rules | Rules |  |  | Section title |  |
| E-01 | Ours alone. | Rules |  |  | Ours |  |
`;
  assert.deepEqual(check({ skillText: ours, matrixText: matrix }), []);
});

// The checker used to see one shape: a `-` bullet on a single line. Everything
// below entered a shipped standards skill unclassified while `ground --check`
// reported clean, under a sentence claiming every statement was traced. Each
// case is the shape that slipped, and each fails against the old extractor.

const uncovered = (text) => check({ skillText: `${SKILL}\n${text}\n`, matrixText: MATRIX })
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

test('an ordered list written with parentheses is still a list', () => {
  // `1)` matched nothing, so two directives merged into one paragraph and one
  // row citing one rule covered both.
  const found = uncovered('1) First rule.\n2) Second rule.');
  assert.match(found, /"First rule\."/);
  assert.match(found, /"Second rule\."/);
});

test('an indented block is code, not prose', () => {
  // Each line reached the paragraph path and was reported uncovered, which
  // teaches a contributor to write a grounding row for an example.
  const found = uncovered('## Later\n\n    const x = 1;\n    const y = 2;');
  assert.match(found, /\[code [0-9a-f]{8}\]/);
  assert.doesNotMatch(found, /const x/);
});

test('a fence closes only on its own marker', () => {
  // A four-backtick block quoting a three-backtick one was closed by the
  // example's opening line, and the rest was read as prose.
  const found = uncovered('````markdown\n```js\nconst x = 1;\n```\nStill inside.\n````');
  assert.doesNotMatch(found, /Still inside/);
  assert.equal(found.match(/\[code [0-9a-f]{8}\]/g).length, 1);
});

test('a table without outer pipes is still a table', () => {
  // `Name | Meaning` over `--- | ---` was read as prose, so it got no
  // designator and could not be quoted in a cell either.
  const found = uncovered('## Later\n\nName | Meaning\n--- | ---\na | b');
  assert.match(found, /\[table [0-9a-f]{8}\]/);
  assert.doesNotMatch(found, /Meaning/);
});

test('a fence info string is part of the block', () => {
  // Changing ```js to ```sh changes how the example is read, and both hashed
  // to one designator.
  assert.notEqual(uncovered('```js\nx\n```'), uncovered('```sh\nx\n```'));
});

test('guidance containing a pipe can be quoted in a cell', () => {
  // parseMatrix split on every pipe with no escape, so a paragraph about a
  // shell pipeline could not be reproduced by any row and stayed red forever.
  const skill = `${SKILL}\nUse a | b carefully.\n`;
  const matrix = `${MATRIX}| E-01 | Use a \\| b carefully. | Rules |  |  | Ours |  |\n`;
  assert.deepEqual(errors(check({ skillText: skill, matrixText: matrix })), []);
});

test('a setext heading is a heading', () => {
  // `Rules` over `=====` was read as prose, so every directive below it was
  // anchored to the PREVIOUS section and a matrix naming that anchor passed.
  const units = check({
    skillText: SKILL.replace('## Rules', 'Rules\n=====\n'), matrixText: MATRIX,
  });
  assert.deepEqual(errors(units), []);
});

test('a setext title is not also preamble prose', () => {
  // The title sat above its underline, so it stayed in the preamble AND became
  // the heading. One occurrence then needed two rows, against the rule that a
  // row claims one occurrence.
  const skillText = SKILL.replace('# S', 'S\n=');
  const units = contentUnits(skillText);
  assert.equal(units.filter((u) => u.text === 'S').length, 1);
  assert.deepEqual(errors(check({ skillText, matrixText: MATRIX })), []);
});

test('prose cannot impersonate a block designator', () => {
  const found = check({ skillText: `${SKILL}\n[table 0123abcd]\n`, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'reserved-designator'));
});

test('a heading is a unit, and so is anything before the first heading', () => {
  // `## Always preserve safety` with an empty matrix used to pass, and so did
  // an instruction written above the title.
  const withHead = check({
    skillText: `${SKILL}\n## Always preserve safety\n`, matrixText: MATRIX,
  });
  assert.ok(withHead.some((f) => f.code === 'uncovered-statement'
    && /Always preserve safety/.test(f.message)));

  const before = check({
    skillText: SKILL.replace('# S', 'Always preserve safety.\n\n# S'), matrixText: MATRIX,
  });
  assert.ok(before.some((f) => f.code === 'uncovered-statement'
    && /before the first heading/.test(f.message)));
});

test('a section named Source grades like any other', () => {
  // Five heading names were exempt, so an instruction under any of them was
  // never disposed of by a row.
  const hidden = check({ skillText: `${SKILL}\n## Source\n\nAlways preserve safety.\n`,
    matrixText: MATRIX });
  assert.ok(hidden.some((f) => f.code === 'uncovered-statement'
    && /Always preserve safety/.test(f.message)));
});

test('pairing does not depend on the order of the rows', () => {
  // A row naming the wrong anchor could consume the occurrence a later correct
  // row needed, so the same two rows in the other order gave different findings.
  const rows = (a, b) => `${MATRIX}${a}${b}`;
  const wrong = '| G-03 | Do not use semicolons. | Nowhere | Rule 8.1 | unquoted | s | unaudited |\n';
  const right = '| G-04 | Do not use semicolons. | Rules | Rule 8.1 | unquoted | s | unaudited |\n';
  const twice = `${SKILL}- Do not use semicolons.\n`;
  const codes = (m) => check({ skillText: twice, matrixText: m })
    .map((f) => f.code).sort();
  assert.deepEqual(codes(rows(wrong, right)), codes(rows(right, wrong)));
  // Three rows claim two occurrences. The row refused is the one whose anchor
  // is wrong, in either order, because every exact match is reserved first.
  const refused = (m) => errors(check({ skillText: twice, matrixText: m }))
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
  const found = check({ skillText: twice, matrixText: MATRIX });
  assert.ok(found.some((f) => f.code === 'uncovered-statement'
    && /Do not use semicolons/.test(f.message)));

  const spare = `${MATRIX}| G-03 | Do not use semicolons. | Rules | Rule 8.1 | unquoted | Part 1, Section 8 | unaudited |\n`;
  assert.deepEqual(errors(check({ skillText: twice, matrixText: spare })), []);
  assert.ok(check({ skillText: SKILL, matrixText: spare })
    .some((f) => f.code === 'duplicate-row'));
});

test('an N row carries no rule, and an unknown prefix is refused', () => {
  const narrative = `${SKILL}\nThis guide does not replace the standard.\n`;
  const withN = `${MATRIX}| N-01 | This guide does not replace the standard. | Rules |  |  | Framing |  |\n`;
  assert.deepEqual(errors(check({ skillText: narrative, matrixText: withN })), []);

  const nWithRule = withN.replace('| Rules |  |  | Framing |', '| Rules | Rule 1.1 |  | Framing |');
  assert.ok(check({ skillText: narrative, matrixText: nWithRule })
    .some((f) => f.code === 'e-row-has-rule'));

  // The same line one column over. An N row that quotes a source is claiming
  // one, whatever its rule cell says.
  const nWithQuote = withN.replace('| Rules |  |  | Framing |', '| Rules |  | "Framing." | Framing |');
  assert.ok(check({ skillText: narrative, matrixText: nWithQuote })
    .some((f) => f.code === 'e-row-has-quote'));

  const bogus = withN.replace('| N-01 |', '| X-01 |');
  assert.ok(check({ skillText: narrative, matrixText: bogus })
    .some((f) => f.code === 'unknown-row-kind'));
});

// The extractor holds no stack of open containers, so it read a construct
// nested in a blockquote or under an indent as the wrong unit. Five rounds
// patched five shapes and the sixth arrived each time, so it now refuses what
// it does not model and names the line. Issue 37 carries the four shapes below,
// and the ones after them are shapes nobody reported. A guard that closes the
// class refuses those too, without a patch for each.
//
// The guard began as a list of shapes to reject, and three review rounds each
// found a shape the list did not name. It states the forms it READS now, and
// refuses everything else, so the test below for an unenumerated shape is the
// one that says the class is closed.

const refused = (text) => check({
  skillText: `${SKILL}\n## Later\n\n${text}\n`, matrixText: MATRIX,
}).filter((f) => f.code === 'unmodelled-construct').map((f) => f.message).join(' ');

test('a paragraph indented under a list item is refused, not read as code', () => {
  // The extractor read the continuation as a code block, so a row could
  // dispose of a directive by its digest without quoting a word of it.
  assert.match(refused('- Context.\n\n    Always preserve safety.'),
    /a paragraph indented under a list item/);
});

test('a fence that does not open at column 0 is refused', () => {
  // Four leading spaces are a code block to a reader and a fence here, so the
  // prose below the opener was swallowed into the block.
  assert.match(refused('    ```js\nconst x = 1;\n```\n\nAlways preserve safety.'),
    /a fenced block that does not begin at column 0/);
});

test('a heading with leading spaces is refused, not merged into prose', () => {
  // `   ## Rules` opened no section, so the heading and the directive below it
  // became one unit under the previous anchor.
  assert.match(refused('   ## Rules\n\nAlways preserve safety.'),
    /a heading that does not begin at column 0/);
});

test('a list inside a blockquote is refused, not flattened into one unit', () => {
  // Two directives were read as one paragraph, so one row disposed of both.
  const found = refused('> - Do first.\n> - Do second.');
  assert.equal(found.match(/a blockquote/g).length, 2);
});

test('a list item indented under another is refused', () => {
  // Not a shape anyone reported. The extractor reads a nested item as a
  // sibling at the top level, which loses which item the guidance qualifies.
  assert.match(refused('- Do first.\n  - Do second.'),
    /a list item that does not begin at column 0/);
});

test('a fence inside a blockquote is refused', () => {
  assert.match(refused('> ```js\n> const x = 1;\n> ```'), /a blockquote/);
});

test('a table indented under a list item is refused', () => {
  // Read as a top-level table, its designator says nothing about the item it
  // belongs to, and the rest of the item disappears into the block.
  assert.match(refused('- Do first.\n\n    | a | b |\n    |---|---|\n    | c | d |'),
    /a table row that does not begin at column 0/);
});

test('a child paragraph under a list item is refused at any indent', () => {
  // The first guard asked for four spaces, which was the width the reported
  // shape used. Two spaces passed it and became a top-level paragraph, so the
  // matrix could anchor a directive outside the item that qualifies it. A
  // blank line above separates a child block from a wrapped line, not a width.
  assert.match(refused('- Context.\n\n  Always preserve safety.'),
    /a paragraph indented under a list item/);
  assert.match(refused('- Context.\n\n\tAlways preserve safety.'),
    /a paragraph indented under a list item/);
});

test('a setext heading that does not begin at column 0 is refused', () => {
  // The section split consumes a setext heading before the line walk sees it,
  // so `Rules` over `-----` under a list item became a top-level section and
  // moved the anchor of everything below it.
  assert.match(refused('- Context.\n\n  Rules\n  -----\n\nAlways preserve safety.'),
    /a heading that does not begin at column 0/);
  assert.match(refused('  Rules\n  -----\n\nAlways preserve safety.'),
    /a heading that does not begin at column 0/);
  assert.equal(refused('Rules\n-----\n\nAlways preserve safety.'), '');
});

test('an indented code block holds whatever it contains', () => {
  // A fence marker inside the block was read as an opener, which split one
  // block into two designators and refused a line that is only an example.
  const text = 'Prose here.\n\n    const x = 1;\n    ```\n    const y = 2;';
  assert.equal(refused(text), '');
  const units = contentUnits(`${SKILL}\n## Later\n\n${text}\n`);
  assert.equal(units.filter((u) => u.block).length, 1);
});

test('an empty list marker opens a list, so its child block is refused', () => {
  // The item pattern wants content after the marker, so `-` on its own left
  // the list shut and the child block under it was read at the top level. The
  // ordered case hid a directive inside a code digest.
  assert.match(refused('-\n\n  Always preserve safety.'),
    /a paragraph indented under a list item/);
  assert.match(refused('1.\n\n    Always preserve safety.'),
    /a paragraph indented under a list item/);
  assert.match(refused('- Do first.\n  -'), /a list item that does not begin at column 0/);
});

test('a container prefix is refused before the line becomes a table', () => {
  // `> A | B` over `--- | ---` reached the table branch first and became a
  // designator, so a blockquote passed the guard with no refusal at all.
  assert.match(refused('> A | B\n--- | ---\n> c | d'), /a blockquote/);
  assert.match(refused('  ## A | B\n--- | ---'),
    /a heading that does not begin at column 0/);
  assert.equal(refused('| a | b |\n|---|---|\n| c | d |'), '');
});

test('indentation is measured in columns, so a tab is four of them', () => {
  // A pattern over literal characters read ` \t` as one space. A code block
  // written with a mixed indent closed at that line, the guard refused the
  // block's own contents, and one block became two designators.
  const text = 'Prose here.\n\n    const x = 1;\n \t> quoted';
  assert.equal(refused(text), '');
  const units = contentUnits(`${SKILL}\n## Later\n\n${text}\n`);
  assert.equal(units.filter((u) => u.block).length, 1);
  assert.match(refused('- Context.\n\n \tAlways preserve safety.'),
    /a paragraph indented under a list item/);
});

test('a shape nobody enumerated is refused, because the grammar states what it reads', () => {
  // The class-closing test. None of these is a shape any review round named,
  // and no branch names them now either. They are refused because they are not
  // among the forms the extractor reads.
  assert.match(refused('Prose here.\n\n  <div>\n  </div>'),
    /does not begin at column 0/);
  assert.match(refused('Prose here.\n\n   Indented prose.'), /does not begin at column 0/);
  assert.match(refused('- Do first.\n\n  > quoted'), /a blockquote/);
});

test('a table may not begin on a list-marker line', () => {
  // `- A | B` over `--- | ---` became one table designator, so the item's own
  // words went into a digest and no row had to quote them.
  const found = check({
    skillText: `${SKILL}\n## Later\n\n- A | B\n--- | ---\n`, matrixText: MATRIX,
  });
  assert.ok(found.some((f) => f.code === 'unmodelled-construct'
    && /a table inside a list item/.test(f.message)));
  // The item stays readable rather than vanishing into the block.
  assert.ok(contentUnits(`${SKILL}\n## Later\n\n- A | B\n--- | ---\n`)
    .some((u) => /A \| B/.test(u.text) && !u.block));
});

test('a marker with no content is refused where it begins a block', () => {
  // A bare marker opened no item, so a child on the very next line merged with
  // the marker into one paragraph and nothing said so.
  assert.match(refused('-\n  Always preserve safety.'), /a list item with no content/);
  assert.match(refused('#'), /a heading with no text/);
  // A number that ends a paragraph is prose. `017966390.` is a trademark
  // number in a shipped skill, and reading it as an empty marker failed the
  // whole catalogue.
  assert.equal(refused('The number is\n017966390.'), '');
});

test('a closing fence indented four columns is the block\'s own contents', () => {
  // Closing there put the directive below the block outside it, and the
  // extractor then read code as prose.
  const text = '```js\ncode\n    ```\nAlways preserve safety.';
  assert.equal(refused(text), '');
  const units = contentUnits(`${SKILL}\n## Later\n\n${text}\n`);
  assert.equal(units.filter((u) => u.block).length, 1);
  // The directive is the block's contents, so it is no unit of its own. It
  // became one when the indented marker closed the block.
  assert.equal(units.filter((u) => /Always preserve safety/.test(u.text)).length, 0);
});

test('a table that does not begin at column 0 is refused at any width', () => {
  // One to three spaces left `LEAD` true but every other test false, so an
  // indented table passed a guard that asked only about four columns.
  assert.match(refused('  | a | b |\n  |---|---|'), /a table row that does not begin at column 0/);
  assert.match(refused('  ## Later'), /a heading that does not begin at column 0/);
});

test('an empty construct is refused for being empty, at any indent', () => {
  // Indented, these were refused for the indent alone, and the remedy told the
  // author to write at column 0 the very line the check refuses there.
  const message = (text) => check({
    skillText: `${SKILL}\n## Later\n\n${text}\n`, matrixText: MATRIX,
  }).find((f) => f.code === 'unmodelled-construct').message;
  assert.match(message('  #'), /a heading with no text/);
  assert.match(message('  #'), /Give the heading its text/);
  assert.match(message('  -'), /a list item with no content/);
  assert.match(message('  -'), /Give the item its words/);
});

test('an empty heading is refused even where it interrupts a paragraph', () => {
  // A heading interrupts a paragraph for a Markdown reader, and neither the
  // section scan nor the walk reads an empty one. `Prose` over `#` over a
  // directive was one unit, so one row could dispose of three.
  assert.match(refused('Prose\n#\nAlways preserve safety.'), /a heading with no text/);
});

test('the section scan stays out of an indented code block', () => {
  // A fence marker inside a permitted indented block was read as an opener
  // there, which suppressed every heading after it. The heading and its
  // directive then joined the prose of the section above.
  const text = 'Prose here.\n\n    code\n    ```\n    more\n\n## Deeper\n\nAlways preserve safety.';
  assert.equal(refused(text), '');
  assert.deepEqual(sections(text).map((s) => s.heading), ['Deeper']);
  assert.ok(contentUnits(`${SKILL}\n## Later\n\n${text}\n`)
    .some((u) => u.anchor === 'Deeper' && /Always preserve safety/.test(u.text)));
});

test('an ordered marker is at most nine digits, wherever it is read', () => {
  // A ten-digit reference number opened a list that a Markdown reader does
  // not, and the standalone code block below it was refused for sitting under
  // that list.
  assert.equal(refused('1234567890. Reference number\n\n    const x = 1;'), '');
  assert.match(refused('1. Item.\n\n    const x = 1;'),
    /a paragraph indented under a list item/);
});

test('a marker that continues a paragraph opens no list', () => {
  // `1.` under prose is the paragraph's own words to a Markdown reader, and an
  // empty item cannot interrupt a paragraph. Opening a list there left it open
  // across the blank line, so a standalone code block below was refused for
  // sitting under a list that was never there.
  assert.equal(refused('Prose\n1.\n\n    const x = 1;'), '');
  assert.match(refused('1. Item.\n\n    const x = 1;'),
    /a paragraph indented under a list item/);
});

test('one file has one reading, so the section scan closes a fence where the walk does', () => {
  // `sections` closed on a marker indented four columns while the walk read
  // that marker as the block's own contents. A heading below it then opened a
  // section from inside a code block, and every anchor under it was wrong.
  const text = '```js\ncode\n    ```\n## Later\n\nAlways preserve safety.';
  assert.equal(refused(text), '');
  const units = contentUnits(`${SKILL}\n## Later\n\n${text}\n`);
  assert.equal(units.filter((u) => u.block).length, 1);
  assert.equal(units.filter((u) => /Always preserve safety/.test(u.text)).length, 0);
  assert.equal(sections(text).length, 0);
});

test('README names every construct refused at column 0', () => {
  // It named the blockquote and not the other two, so a contributor could
  // write a documented form and get a refusal for it.
  const readme = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'README.md'), 'utf8').toLowerCase();
  for (const shape of Object.values(AT_COLUMN_ZERO)) {
    assert.ok(readme.includes(shape), `README does not name ${shape}`);
  }
});

test('a refusal carries a remedy the author can follow', () => {
  // Every refusal ended with "write it at column 0", which a blockquote, an
  // empty marker and an empty heading already do. A remedy that cannot be
  // followed reads as a check that misread the line.
  const message = (text) => check({
    skillText: `${SKILL}\n## Later\n\n${text}\n`, matrixText: MATRIX,
  }).find((f) => f.code === 'unmodelled-construct').message;

  for (const [text, remedy] of [
    ['> quoted', /fenced block/],
    ['#', /Give the heading its text/],
    ['-', /Give the item its words/],
    ['- A | B\n--- | ---', /Move the table out of the list/],
  ]) {
    assert.match(message(text), remedy);
    assert.doesNotMatch(message(text), /Write it at column 0\./);
  }
  assert.match(message('  | a | b |\n  |---|---|'), /Write it at column 0\./);
});

test('an indented construct with no list above it is code, and stands', () => {
  // Refusing is not narrowing. An indented block that begins its own paragraph
  // is read here exactly as a reader reads it, so it needs no refusal, and a
  // wrapped continuation line is not a container either.
  assert.equal(refused('Prose here.\n\n    const x = 1;\n    > quoted'), '');
  assert.equal(refused('- Do not use a semicolon,\n  because it joins two ideas.'), '');
  assert.equal(refused('- Do not use a semicolon,\n    because it joins two ideas.'), '');
  assert.equal(refused('```md\n> quoted\n```'), '');
  assert.equal(refused('- Do first.\n\nProse here.\n\n    const x = 1;'), '');
});

test('a refusal names the line in the file, front matter counted', () => {
  const skillText = `${SKILL}\n> Quoted.\n`;
  const line = skillText.split('\n').indexOf('> Quoted.') + 1;
  assert.deepEqual(unmodelled(skillText), [{ line, shape: 'a blockquote' }]);
  assert.ok(check({ skillText, matrixText: MATRIX })
    .some((f) => f.code === 'unmodelled-construct' && f.message.startsWith(`line ${line}:`)));
});

test('every shipped skill stays inside the Markdown the extractor models', async () => {
  // The guard costs the author a subset to write in. This is the check that
  // the subset is one the shipped skills already sit inside.
  const all = await checkAll(path.join(import.meta.dirname, '..'), { now: NOW });
  const refusals = Object.entries(all)
    .flatMap(([name, fs]) => fs.filter((f) => f.code === 'unmodelled-construct')
      .map((f) => `${name}: ${f.message}`));
  assert.deepEqual(refusals, []);
});

test('checkAll covers every skill in the repository', async () => {
  const all = await checkAll(REPO, { now: NOW });
  assert.ok('demo-standard' in all);
  assert.deepEqual(errors(all['demo-standard']), []);
  assert.ok(all['demo-craft'].some((f) => f.code === 'no-matrix'));
});
