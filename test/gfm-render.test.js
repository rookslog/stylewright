import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { MATRIX_COLUMNS, readMatrix, checkSkill, unmodelled, contentUnits } from '../src/ground.js';
import { renderTables, renderBlocks, cellText } from './gfm.js';

/**
 * The matrix reader, checked against a real GFM parser.
 *
 * `readMatrix` reads Markdown a line at a time and models no container, and
 * every claim about how a matrix renders was read from the specification and
 * written into a comment beside the code. Those claims hold up a design: the
 * rendered column is the one that counts, so a check that reads a column no
 * reader sees reports on a file nobody has. Nothing tested them. The
 * contiguity hole survived three review rounds and an eleven-attack harness,
 * and every attack came out of the same reading of the specification that
 * missed it.
 *
 * These tests put a matrix through `micromark` and its GFM table extension,
 * which reads the dialect GitHub renders, and compare what a reader sees
 * against what the checker read. Issue 76 asked for this, and ADR-0028 records
 * the dependency decision.
 *
 * Two rules carry the attack shapes, rather than a verdict written out for
 * each. A matrix a reader sees damaged is called broken, whatever the damage,
 * and both counts are withheld. And wherever a table stands to a reader, the
 * checker reads no row that reader does not see. A shape nobody has thought of
 * is covered because the render decides, and not because a list names the
 * shape. ADR-0016 states why this repository writes a test that way round.
 */

const GROUNDING = new URL('../grounding/', import.meta.url);
const NOW = '2026-08-06T12:00:00.000Z';

async function matrices() {
  const found = [];
  for (const tier of await readdir(GROUNDING)) {
    const dir = new URL(`${tier}/`, GROUNDING);
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.md')) continue;
      found.push({ name: `${tier}/${name}`, text: await readFile(new URL(name, dir), 'utf8') });
    }
  }
  return found;
}

const HEADER = `| ${MATRIX_COLUMNS.join(' | ')} |`;
const DELIMITER = `|${MATRIX_COLUMNS.map(() => '---').join('|')}|`;
const CELLS = 'Say one thing. | An anchor |  |  | Our own guidance |';
const row = (id, tail = ' |') => `| ${id} | ${CELLS}${tail}`;

/** A matrix around the given lines, carrying the prose a real one carries. */
const matrix = (lines) => [
  '# Grounding: a fixture', '',
  'Disposes of every unit of content in a skill.', '',
  '**Quotation:** forbidden. There is no source, so there is nothing to quote.', '',
  ...lines, '',
].join('\n');

/** The identifier that opens each row a reader sees in the first table. */
const renderedIds = (text) => {
  const [table] = renderTables(text);
  return table ? table.rows.map((cells) => cellText(cells[0])) : [];
};

/** The identifier that opens each row the checker read as part of the table. */
const readIds = (text) => readMatrix(text).rows.map(({ cells }) => cells[0]);

/**
 * The table a reader sees, and the table the checker read, in one shape each.
 * The headings belong here beside the rows, because renaming one loses a
 * record without moving a single row.
 */
const asSeen = (text) => {
  const [table] = renderTables(text);
  return { headings: table ? table.headings.map(cellText) : [], ids: renderedIds(text) };
};
const asRead = (text) => ({ headings: readMatrix(text).header?.cells ?? [], ids: readIds(text) });

const SKILL = `---
name: s
description: d
---

# S
`;

test('every shipped matrix renders as one table the checker read exactly', async () => {
  const found = await matrices();
  assert.ok(found.length >= 6, 'the grounding directory carries the shipped matrices');
  for (const { name, text } of found) {
    const tables = renderTables(text);
    assert.equal(tables.length, 1, `${name}: a reader sees exactly one table`);
    const [{ headings, rows }] = tables;
    assert.deepEqual(headings.map(cellText), MATRIX_COLUMNS, `${name}: the rendered headings`);

    const read = readMatrix(text);
    assert.deepEqual(read.refusals, [], `${name}: no line refused`);
    assert.deepEqual(read.strays, [], `${name}: no line outside the table`);
    assert.equal(rows.length, read.rows.length, `${name}: the reader and the checker count the same rows`);
    rows.forEach((cells, i) => {
      assert.equal(cells.length, MATRIX_COLUMNS.length, `${name}: rendered row ${i + 1} carries every column`);
      assert.equal(cellText(cells[0]), read.rows[i].cells[0], `${name}: rendered row ${i + 1} is the row the checker read`);
    });
  }
});

/**
 * Shapes a reviewer imagined and nobody rendered. Each states the rows its
 * author wrote, and the RENDER decides what the reader still has.
 */
const SHAPES = {
  'a delimiter cut short': [['E-01'], [HEADER, '|---|---|', row('E-01')]],
  'a header cut short': [['E-01'], ['| ID | Our guidance |', DELIMITER, row('E-01')]],
  'a renamed heading': [['E-01'], [HEADER.replace('Audited', 'Notes'), DELIMITER, row('E-01')]],
  'a blank line above the delimiter': [['E-01'], [HEADER, '', DELIMITER, row('E-01')]],
  'a blank line under the delimiter': [['E-01'], [HEADER, DELIMITER, '', row('E-01')]],
  'a blank line between two rows': [['E-01', 'E-02'], [HEADER, DELIMITER, row('E-01'), '', row('E-02')]],
  'a heading between two rows': [['E-01', 'E-02'], [HEADER, DELIMITER, row('E-01'), '## Later', row('E-02')]],
  'a thematic break between two rows': [['E-01', 'E-02'], [HEADER, DELIMITER, row('E-01'), '***', row('E-02')]],
  'a header twelve lines up': [['E-01'], [HEADER, ...Array(12).fill('Prose.'), DELIMITER, row('E-01')]],
  'a row indented four spaces': [['E-01', 'E-02'], [HEADER, DELIMITER, row('E-01'), `    ${row('E-02')}`]],
  'a second delimiter below the first': [['E-01', 'E-02'], [HEADER, DELIMITER, row('E-01'), DELIMITER, row('E-02')]],
};

test('a matrix a reader sees damaged is called broken, whatever the damage', () => {
  // The verdict is derived from the render rather than written out per shape,
  // so a shape whose render surprises us fails here rather than passing on a
  // comment.
  for (const [what, [wrote, lines]] of Object.entries(SHAPES)) {
    const matrixText = matrix(lines);
    assert.notDeepEqual(asSeen(matrixText), { headings: MATRIX_COLUMNS, ids: wrote },
      `${what}: this shape is meant to damage what a reader sees`);

    const findings = checkSkill({ skillText: SKILL, matrixText, now: NOW });
    const note = (code) => findings.find((f) => f.code === code)?.message;
    assert.equal(note('audit-coverage'), 'not counted: the matrix table is broken.', `${what}: the audit count`);
    assert.equal(note('quote-coverage'), 'not counted: the matrix table is broken.', `${what}: the quote count`);
    assert.ok(findings.some((f) => f.level === 'error'), `${what}: the run reports an error`);
  }
});

test('where the reader sees a table, the checker reads its rows and no others', () => {
  // The direction that loses a record, asserted apart from the verdict,
  // because a verdict can be right for the wrong reason. The rule holds
  // wherever a table stands at all: a matrix whose header and delimiter the
  // check accepts must carry, to the checker, the rows a reader sees under
  // it. Where the header or the delimiter is gone there is no table to a
  // reader, so `readMatrix` naming the lines it refused is what lets the
  // check say which line to fix.
  //
  // The containment runs one way. The checker reading FEWER rows than the
  // reader sees costs a skill author a refusal they can write around, which is
  // the direction ADR-0016 asks a disagreement to fall in, and the second
  // delimiter is that case: GFM reads the dashes as another row and the check
  // ends the table above them. Equality is asserted where it must hold, over
  // the shipped matrices, in the first test here.
  const SHAPELESS = new Set(['matrix-no-table', 'matrix-no-header', 'matrix-header-columns', 'matrix-delimiter-columns']);
  for (const [what, [, lines]] of Object.entries(SHAPES)) {
    const text = matrix(lines);
    const findings = checkSkill({ skillText: SKILL, matrixText: text, now: NOW });
    if (findings.some((f) => SHAPELESS.has(f.code))) continue;
    // With multiplicity. A set said `E-01` was seen, over a render that showed
    // it once and a checker that read it twice, so a dropped row could hide
    // behind a repeated identifier.
    const seen = renderedIds(text);
    for (const id of readIds(text)) {
      const at = seen.indexOf(id);
      assert.ok(at !== -1, `${what}: the checker read ${id}, which no reader sees as a row`);
      seen.splice(at, 1);
    }
  }
});

test('a reader sees no table when the delimiter is short or detached', () => {
  assert.deepEqual(renderTables(matrix([HEADER, '|---|---|', row('E-01')])), []);
  assert.deepEqual(renderTables(matrix([HEADER, '', DELIMITER, row('E-01')])), []);
  assert.deepEqual(renderTables(matrix([DELIMITER, row('E-01')])), []);
});

test('a reader sees no eighth cell', () => {
  const text = matrix([HEADER, DELIMITER, row('E-01', ' | dropped |')]);
  const [{ rows }] = renderTables(text);
  assert.equal(rows[0].length, MATRIX_COLUMNS.length);
  assert.ok(!rows[0].some((c) => cellText(c) === 'dropped'), 'GFM drops the cell past the last heading');
  assert.equal(readMatrix(text).rows[0].cells.length, MATRIX_COLUMNS.length + 1, 'the checker sees it, and reports it');
  const findings = checkSkill({ skillText: SKILL, matrixText: text, now: NOW });
  assert.ok(findings.some((f) => f.code === 'row-has-extra-cell' && f.level === 'error'));
});

test('a backslash escapes one character, so an odd run of them escapes a pipe', () => {
  // A one-character lookbehind read `x\\|` as an escaped pipe. GFM reads the
  // escaped BACKSLASH and then a cell boundary, so the checker saw one cell
  // where a reader sees two. `closed` carried the same lookbehind and so the
  // same defect, and a row ending in `\\|` read as unclosed.
  const cells = (tail) => {
    const text = matrix([HEADER, DELIMITER, `| E-01 | ${tail} | An anchor |  |  | Our own guidance |  |`]);
    const [{ rows }] = renderTables(text);
    return { seen: rows[0].map(cellText), read: readMatrix(text).rows[0].cells };
  };
  for (const tail of ['x', 'x\\|y', 'x\\\\', 'x\\\\\\|y', 'x\\n']) {
    const { seen, read } = cells(tail);
    assert.deepEqual(read, seen, `a cell ending ${JSON.stringify(tail)}`);
  }
  const ends = (row) => readMatrix(matrix([HEADER, DELIMITER, row])).rows[0].closed;
  assert.equal(ends('| E-01 | a | b |  |  | c | d\\\\|'), true);
  assert.equal(ends('| E-01 | a | b |  |  | c | d\\|'), false);
});

test('a reader sees the table end at a blank line, a heading, or a thematic break', () => {
  for (const breaker of ['', '## Later', '***']) {
    const text = matrix([HEADER, DELIMITER, row('E-01'), breaker, row('E-02')]);
    assert.deepEqual(renderedIds(text), ['E-01'], `a table ends at ${JSON.stringify(breaker)}`);
  }
});

test('a paragraph line does not end the table, and the checker is stricter', () => {
  // Prose is absent from the list above on purpose. GFM reads a line of text
  // under a table as another row, with everything in the first cell, so the
  // rows below it stay in the table a reader sees. The checker ends the table
  // there instead. That divergence costs a skill author a refusal they can
  // write around, and it loses no record, which is the direction ADR-0016
  // asks a disagreement to fall in.
  const text = matrix([HEADER, DELIMITER, row('E-01'), 'Prose.', row('E-02')]);
  assert.deepEqual(renderedIds(text), ['E-01', 'Prose.', 'E-02']);
  assert.deepEqual(readIds(text), ['E-01']);
});

test('a renamed heading renders under its new name, and the record goes with it', () => {
  // The render corrected a claim written from the specification. Deleting the
  // header or cutting it short stops the block being a table, and this one was
  // filed beside them as dropping a column. It does not: GFM renders whatever
  // heading the line carries, so the reader and the checker agree about the
  // table and the record is gone anyway, because `Notes` is not the column the
  // audit lives in. `matrix-header-column-name` is what catches it, and it is
  // in the broken set for that reason.
  const text = matrix([HEADER.replace('Audited', 'Notes'), DELIMITER, row('E-01')]);
  assert.deepEqual(asSeen(text), asRead(text), 'nothing here divides the reader from the checker');
  assert.equal(asSeen(text).headings.at(-1), 'Notes');
  const findings = checkSkill({ skillText: SKILL, matrixText: text, now: NOW });
  assert.ok(findings.some((f) => f.code === 'matrix-header-column-name' && f.level === 'error'));
  assert.equal(findings.find((f) => f.code === 'audit-coverage')?.message,
    'not counted: the matrix table is broken.');
});

test('two legal shapes render and are refused as house style', () => {
  // An indented table and a row that does not end in a pipe are both tables to
  // a reader. AGENTS.md says why the check is stricter on each. Rendering them
  // here is what keeps that claim honest: it is house style, not a hole.
  const indented = matrix([`   ${HEADER}`, `   ${DELIMITER}`, `   ${row('E-01')}`]);
  assert.deepEqual(renderedIds(indented), ['E-01']);
  assert.deepEqual(readIds(indented), []);
  assert.ok(readMatrix(indented).refusals.some((r) => /column 0/.test(r.shape)));

  const unclosed = matrix([HEADER, DELIMITER, row('E-01', ' x')]);
  assert.deepEqual(renderedIds(unclosed), ['E-01']);
  assert.equal(readMatrix(unclosed).rows[0].closed, false);
});

test('no shipped module imports the parser', async () => {
  // Every module below each directory, not the ones sitting directly in it. A
  // scan over names alone would let `src/format/x.js` import the parser and
  // ship it, which is the whole thing this test exists to prevent.
  const walk = async (at, seen = []) => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), at);
      if (entry.isDirectory()) await walk(child, seen);
      else if (/\.m?js$/.test(entry.name)) seen.push(child);
    }
    return seen;
  };
  for (const dir of ['../src/', '../bin/']) {
    const files = await walk(new URL(dir, import.meta.url));
    assert.ok(files.length > 0, `${dir} carries modules to check`);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      assert.ok(!/micromark/.test(text), `${file.pathname} must not reach for a Markdown parser`);
    }
  }
});

/**
 * The continuation grammar, checked against the same parser.
 *
 * The grammar rests on claims about which constructs a reader lets interrupt
 * open prose, and every one of them was read from the specification and
 * written into a comment. ADR-0028 says a claim about a render answers to a
 * renderer, and ADR-0029 puts the extractor's grammar under that rule. The
 * parser corrected two claims on the day this was written: an underline under
 * a list item makes a setext HEADING rather than a thematic break, and an
 * ordered marker indented under an item can be a sibling rather than the lazy
 * continuation the first draft admitted.
 *
 * The property is one rule, not a verdict per shape. Wherever a reader sees a
 * container the extractor did not read, the check refuses the line.
 */
const skillWith = (text) => `---\nname: demo\ndescription: A demo skill.\n---\n\n# Demo\n\n## Later\n\n${text}\n`;
const refusalsFor = (text) => unmodelled(skillWith(text)).map((r) => r.shape);
const unitsFor = (text) => contentUnits(skillWith(text)).map((u) => u.text);

test('a container a reader sees on a continuation line is refused', () => {
  // The left column is what the parser puts in the render, so each row is a
  // fact about a reader rather than a reading of the specification.
  for (const [text, seen] of [
    ['- Context.\n  <script>\n  Always preserve safety.\n  </script>', '<script>'],
    ['- Context.\n  <!-- Always preserve safety. -->', '<!--'],
    ['- Context.\n  ---\n  Always preserve safety.', '<h2>'],
    ['- Context.\n  | a | b |\n  |---|---|', '<table>'],
    ['-     Always preserve safety.', '<pre>'],
    ['- First.\n-\n  Always preserve safety.', '<li>Always preserve safety.</li>'],
  ]) {
    assert.ok(renderBlocks(text).includes(seen),
      `a reader sees ${seen} in ${JSON.stringify(text)}`);
    assert.ok(refusalsFor(text).length > 0, `the check refuses ${JSON.stringify(text)}`);
  }
});

test('prose a reader keeps whole is not refused, and reaches one unit', () => {
  // The other direction, which is the one the shipped catalogue cannot
  // measure: no skill here writes an indented line at all, so nothing but
  // this says the grammar admits the prose a reader admits.
  for (const text of [
    '- Do not use a semicolon,\n  because it joins two ideas.',
    '- Context.\n  "Always preserve safety."',
    '- Context.\n  a | b are columns.',
    '-    Always preserve safety.',
    '-\tAlways preserve safety.',
    'Prose\n  2. item',
  ]) {
    const html = renderBlocks(text);
    for (const container of ['<pre>', '<hr', '<h2>', '<table>', '<blockquote>']) {
      assert.ok(!html.includes(container),
        `a reader sees no ${container} in ${JSON.stringify(text)}`);
    }
    assert.equal((html.match(/<li>/g) ?? []).length <= 1, true,
      `a reader sees one item at most in ${JSON.stringify(text)}`);
    assert.deepEqual(refusalsFor(text), [], `the check admits ${JSON.stringify(text)}`);
  }
});

test('an ordered marker opens a list here where it opens one for a reader', () => {
  // `2.` cannot interrupt a paragraph, so a reader keeps it in the paragraph
  // and the walk keeps it in the unit. A list already open takes it as the
  // next item, and a reader agrees there too.
  assert.ok(!renderBlocks('Prose\n2. item').includes('<ol'));
  assert.ok(unitsFor('Prose\n2. item').includes('Prose 2. item'));
  assert.ok(renderBlocks('1. First.\n2. Second.').includes('<li>Second.</li>'));
  assert.ok(unitsFor('1. First.\n2. Second.').includes('Second.'));
});
