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

/**
 * Every matrix in the grounding tree, however deep it sits.
 *
 * A skill's reference files are graded one matrix per file, under a directory
 * named for the skill, so a scan of the tier directory alone stopped at the
 * directory and read none of them. The whole tree is walked instead, which is
 * what "every shipped matrix" has to mean for the test below to be true.
 */
async function matrices(dir = GROUNDING, base = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...await matrices(new URL(`${entry.name}/`, dir), rel));
    } else if (entry.name.endsWith('.md')) {
      found.push({ name: rel, text: await readFile(new URL(entry.name, dir), 'utf8') });
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
  assert.ok(found.length >= 8, 'the grounding tree carries the shipped matrices');
  assert.ok(found.some((m) => m.name.includes('/references/')),
    'and the reference matrices among them, which a flat scan missed');
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

    const findings = checkSkill({ subject: 'SKILL.md', skillText: SKILL, matrixText, now: NOW });
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
    const findings = checkSkill({ subject: 'SKILL.md', skillText: SKILL, matrixText: text, now: NOW });
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
  const findings = checkSkill({ subject: 'SKILL.md', skillText: SKILL, matrixText: text, now: NOW });
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
  const findings = checkSkill({ subject: 'SKILL.md', skillText: SKILL, matrixText: text, now: NOW });
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

/**
 * A list item, forced LOOSE, so the render says where the blocks are.
 *
 * A tight list drops the `<p>` around an item's paragraph, so the render of
 * `- Context.` over `  <script>` looks the same whether the HTML interrupted
 * that paragraph or sits inside it as inline markup. The first version of the
 * test below asserted that the output CONTAINS `<script>`, which is true
 * either way, so two of its rows could not fail for the reason the test names.
 * A second item makes the list loose and the paragraphs get their tags back.
 */
const loose = (text) => `${text}\n\n- Second item.`;

/** The block-level tags a reader gets, in order, with inline markup dropped. */
const INLINE = new Set(['a', 'code', 'em', 'strong', 'del', 'img', 'br', 'span', 'sup', 'sub']);
const blockTags = (text) => (renderBlocks(loose(text)).match(/<\/?[a-zA-Z!][^>\s]*/g) ?? [])
  .filter((t) => !INLINE.has(t.replace(/^<\/?/, '').toLowerCase()));

/**
 * Whether a reader sees ONE list item holding ONE paragraph and nothing else.
 *
 * That is the whole question the continuation grammar asks, put to the parser
 * as one property rather than a verdict per shape. A container opened on the
 * continuation line shows up as a second block inside the item, or as the
 * item's paragraph turning into something that is not a paragraph, or as a
 * second item. Two is the item count a prose continuation gives, because
 * `loose` appends one.
 */
const readsAsProse = (text) => {
  const tags = blockTags(text);
  const inside = tags.slice(tags.indexOf('<li') + 1, tags.indexOf('</li'));
  return tags.filter((t) => t === '<li').length === 2
    && inside.length === 2 && inside[0] === '<p' && inside[1] === '</p';
};

test('a container a reader sees on a continuation line is refused', () => {
  // Every row is one fact from the parser: the item does NOT read as one
  // paragraph, so something opened. A substring of the whole render is not
  // that fact, and `<script>` appears in the tight render either way.
  for (const text of [
    '- Context.\n  <script>\n  Always preserve safety.\n  </script>',
    '- Context.\n  <!-- Always preserve safety. -->',
    '- Context.\n  ---\n  Always preserve safety.',
    '- Context.\n  | a | b |\n  |---|---|',
    '-     Always preserve safety.',
    '- First.\n-\n  Always preserve safety.',
    '- Context.\n  ```js\n  code\n  ```',
  ]) {
    assert.equal(readsAsProse(text), false,
      `a reader sees more than one paragraph in ${JSON.stringify(text)}: ${blockTags(text).join(' ')}`);
    assert.ok(refusalsFor(text).length > 0, `the check refuses ${JSON.stringify(text)}`);
  }
});

test('prose a reader keeps whole is not refused, and reaches one unit', () => {
  // The other direction, which is the one the shipped catalogue cannot
  // measure: no skill here writes an indented line at all, so nothing but
  // this says the grammar admits the prose a reader admits.
  //
  // The code span is the row that changed the rule. A fenced block is the only
  // block a backtick or a tilde opens and it needs three of them, so the
  // grammar asks the walk's own fence test rather than refusing the character.
  // Refusing it outright cost 166 false refusals across 574 real skill files,
  // every one of this shape. ADR-0029 carries the measurement.
  for (const text of [
    '- Do not use a semicolon,\n  because it joins two ideas.',
    '- Context.\n  "Always preserve safety."',
    '- Context.\n  a | b are columns.',
    '- Context.\n  `stylewright doctor` reports it.',
    '- Context.\n  ~~struck~~ words here.',
    '-    Always preserve safety.',
    '-\tAlways preserve safety.',
  ]) {
    assert.equal(readsAsProse(text), true,
      `a reader sees one paragraph in ${JSON.stringify(text)}: ${blockTags(text).join(' ')}`);
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

test('the one shape the oracle and the check disagree about is pinned', () => {
  // `01.` counts from one, so a list may interrupt the paragraph above it and
  // this check opens one. `micromark` is the outlier: it keeps the line in the
  // paragraph. pandoc 3.10 and the CommonMark rule that an interrupting list
  // must start at 1 both back the split, so the check is not changed to match
  // the oracle here.
  //
  // The disagreement lived in ADR prose alone, where an upgrade moving it
  // either way would go unnoticed. It is a test now, so it fails instead.
  assert.ok(!renderBlocks('Prose\n01. item').includes('<ol'),
    'micromark still keeps `01.` inside the paragraph');
  assert.ok(unitsFor('Prose\n01. item').includes('item'),
    'the check still opens a list for `01.`');
  // The two the parsers agree on, where the check follows the render.
  assert.ok(renderBlocks('Prose\n1. item').includes('<ol'));
  assert.ok(unitsFor('Prose\n1. item').includes('item'));
  assert.ok(!renderBlocks('Prose\n2. item').includes('<ol'));
  assert.ok(unitsFor('Prose\n2. item').includes('Prose 2. item'));
});

test('a table a reader sees without a pipe is refused, and a heading is not', () => {
  // Codex reported one shape, `- Context.` over `:-`. The class is wider. GFM
  // asks for no pipe at all when a table has one column, so a delimiter row
  // that a setext underline does not claim first makes a table of the line
  // above it, at column 0 as well as under a list item. The walk reads a table
  // through its pipes, so it reads none of these, and it refuses them.
  for (const text of [
    'Prose here.\n:-',
    'Prose here.\n:-:',
    'Prose here.\n-:',
    'Prose here.\n:---:',
    'Prose here.\n-|',
    'Prose here.\n|-',
    '- Context.\n  :-',
    '- Context.\n  :-\n  Always preserve safety.',
  ]) {
    assert.match(renderBlocks(text), /<table>/, `a reader sees a table in ${JSON.stringify(text)}`);
    assert.ok(refusalsFor(text).some((s) => /no pipe/.test(s)),
      `the check refuses ${JSON.stringify(text)}: ${JSON.stringify(refusalsFor(text))}`);
  }
  // The other side of that line, and the reason the colon is what decides. A
  // delimiter carrying neither a colon nor a pipe IS a setext underline, and
  // refusing these would refuse a heading this repository writes everywhere.
  for (const text of ['Prose here.\n---', 'Prose here.\n-', 'Prose here.\n--']) {
    assert.doesNotMatch(renderBlocks(text), /<table>/);
    assert.deepEqual(refusalsFor(text), [], `the check admits ${JSON.stringify(text)}`);
  }
  // A delimiter with no header above it is no table to either reader.
  assert.doesNotMatch(renderBlocks('Prose here.\n\n:-'), /<table>/);
  assert.deepEqual(refusalsFor('Prose here.\n\n:-'), []);
});

test('front matter is invisible to this check and visible to a reader', () => {
  // The exemption's whole warrant is that a harness consumes the block as
  // metadata, which is true of `SKILL.md` and of no reference file. This is
  // what a reader gets for the same bytes where no harness reads them.
  //
  // The property is stated as one rule over many shapes, and not as the render
  // of any one of them. A first draft asserted a thematic break and a setext
  // heading, which is what the first shape below produces and what three of the
  // others do not: a list inside the block renders as a list, a fenced block as
  // code, and a table as a table. Writing that one render into four documents
  // as the reason for the refusal was the comment explaining away what the
  // parser had not been asked. What holds across every shape is the thing the
  // refusal actually rests on: a reader sees the block's contents, and this
  // check reads no unit from any line of it.
  const shapes = {
    'a mapping': '---\nnote: Always preserve safety.\n---\n\n# Heading',
    'a list': '---\n- Always preserve safety.\n---\n\n# Heading',
    'a fenced block': '---\n```\nAlways preserve safety.\n```\n---\n\n# Heading',
    'a blank line inside': '---\na: b\n\nc: Always preserve safety.\n---\n\n# Heading',
    'a table': '---\n| Always preserve safety. | b |\n|---|---|\n---\n\n# Heading',
  };
  for (const [name, text] of Object.entries(shapes)) {
    assert.match(renderBlocks(text), /Always preserve safety\./,
      `a reader sees the block's contents in ${name}`);
    assert.deepEqual(contentUnits(text).map((u) => u.text), ['Heading'],
      `the walk reads no unit from the block in ${name}`);
    assert.deepEqual(unmodelled(text), [], `and refuses no line of it in ${name}`);
  }
});

/**
 * The blockquote, read as a block, checked against the same parser.
 *
 * The walk refused a blockquote until issue #99, because it merged the quote
 * with its contents: `> - one gasket` reached a matrix row as a paragraph
 * carrying its own markers. It reads one BLOCK now, named by a digest of what
 * the quote holds, which is the disposition a table and a fenced block already
 * have. So the claim to check is the one ADR-0028 asks for: where a reader sees
 * one blockquote, the walk reads one block, and nothing inside it reaches a
 * unit of its own.
 */
const blockquotes = (text) => (renderBlocks(text).match(/<blockquote>/g) ?? []).length;

test('where a reader sees one blockquote, the walk reads one block', () => {
  // Each of these holds a construct the walk reads as a block of its own at
  // column 0. Inside the quote it is the quote's content, and a reader agrees.
  for (const text of [
    '> Quoted.',
    '> One.\n>\n> Two.',
    '> Intro:\n>\n> - one gasket\n> - two clamps',
    '> ```js\n> const x = 1;\n> ```',
    '> | a | b |\n> |---|---|',
    '> # A heading inside the quote',
  ]) {
    assert.equal(blockquotes(text), 1, `a reader sees one quote in ${JSON.stringify(text)}`);
    // The heading is a unit of its own, so the section's body starts after it.
    const units = contentUnits(skillWith(text))
      .filter((u) => u.anchor === 'Later' && u.text !== 'Later');
    assert.deepEqual(units.map((u) => u.block), [true],
      `the walk reads one block in ${JSON.stringify(text)}: ${JSON.stringify(units)}`);
    assert.match(units[0].text, /^\[quote [0-9a-f]{8}\]$/);
    assert.deepEqual(refusalsFor(text), []);
  }
});

test('a line under a blockquote is refused, and the render says why it must be', () => {
  // A reader CONTINUES the quote over a line that carries prose, and over a
  // table's own lines, so reading those at the top level would ground the
  // quote's contents as something else.
  for (const follower of ['Prose here.', '===', '| a | b |\n|---|---|', '    indented']) {
    const text = `> Quoted.\n${follower}`;
    assert.match(renderBlocks(text), /<blockquote>[\s\S]*Prose here\.|<blockquote>[\s\S]*===|<blockquote>[\s\S]*a \| b|<blockquote>[\s\S]*indented/,
      `a reader keeps ${JSON.stringify(follower)} inside the quote`);
    assert.ok(refusalsFor(text).includes('a line directly under a blockquote'),
      `the check refuses ${JSON.stringify(text)}: ${JSON.stringify(refusalsFor(text))}`);
  }
});

test('the over-refusal under a blockquote is pinned, because a reader ends it there', () => {
  // The other direction, stated rather than hidden. A construct that interrupts
  // a paragraph ends the quote for a reader whatever the quote holds, so these
  // lines need no refusal. The walk refuses them anyway: whether a line is lazy
  // continuation depends on the block open INSIDE the quote, and the walk holds
  // no container state to answer with. The cost is a blank line the author
  // writes, and every shipped file already has one there.
  for (const follower of ['- item', '1. item', '```\ncode\n```', '---', '<div>x</div>']) {
    const text = `> Quoted.\n${follower}`;
    assert.equal(blockquotes(text), 1);
    assert.doesNotMatch(renderBlocks(text).split('</blockquote>')[0], /item|code|<div|<hr/,
      `a reader ends the quote above ${JSON.stringify(follower)}`);
    assert.ok(refusalsFor(text).includes('a line directly under a blockquote'),
      'the walk refuses it, and this test is where that cost is recorded');
    assert.deepEqual(refusalsFor(`> Quoted.\n\n${follower}`), [],
      'a blank line is the whole remedy');
  }
  // A heading is the one follower the two readers agree on with no blank line,
  // and not because the walk decided it. The section split takes the heading and
  // everything under it into the next section, so the quote ends at the end of
  // the body and no line follows it there.
  assert.deepEqual(refusalsFor('> Quoted.\n## Deeper\n\nProse.'), []);
  assert.doesNotMatch(renderBlocks('> Quoted.\n## Deeper').split('</blockquote>')[0], /Deeper/);
});
