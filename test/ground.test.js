import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseMatrix, checkSkill, checkAll, contentUnits, unmodelled } from '../src/ground.js';

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
  const matrix = `${MATRIX}| E-01 | Use a \\| b carefully. | Rules |  | Ours |\n`;
  assert.deepEqual(checkSkill({ skillText: skill, matrixText: matrix }), []);
});

test('a setext heading is a heading', () => {
  // `Rules` over `=====` was read as prose, so every directive below it was
  // anchored to the PREVIOUS section and a matrix naming that anchor passed.
  const units = checkSkill({
    skillText: SKILL.replace('## Rules', 'Rules\n=====\n'), matrixText: MATRIX,
  });
  assert.deepEqual(units, []);
});

test('a setext title is not also preamble prose', () => {
  // The title sat above its underline, so it stayed in the preamble AND became
  // the heading. One occurrence then needed two rows, against the rule that a
  // row claims one occurrence.
  const skillText = SKILL.replace('# S', 'S\n=');
  const units = contentUnits(skillText);
  assert.equal(units.filter((u) => u.text === 'S').length, 1);
  assert.deepEqual(checkSkill({ skillText, matrixText: MATRIX }), []);
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

const refused = (text) => checkSkill({
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
  const found = checkSkill({
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
  assert.match(refused('  #'), /a heading that does not begin at column 0/);
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
  assert.ok(checkSkill({ skillText, matrixText: MATRIX })
    .some((f) => f.code === 'unmodelled-construct' && f.message.startsWith(`line ${line}:`)));
});

test('every shipped skill stays inside the Markdown the extractor models', async () => {
  // The guard costs the author a subset to write in. This is the check that
  // the subset is one the shipped skills already sit inside.
  const all = await checkAll(path.join(import.meta.dirname, '..'));
  const refusals = Object.entries(all)
    .flatMap(([name, fs]) => fs.filter((f) => f.code === 'unmodelled-construct')
      .map((f) => `${name}: ${f.message}`));
  assert.deepEqual(refusals, []);
});

test('checkAll covers every skill in the repository', async () => {
  const all = await checkAll(REPO);
  assert.ok('demo-standard' in all);
  assert.deepEqual(all['demo-standard'], []);
  assert.ok(all['demo-craft'].some((f) => f.code === 'no-matrix'));
});
