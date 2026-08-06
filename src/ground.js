import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { sections, indentOf, isIndented } from './markdown.js';
import { loadCatalog } from './catalog.js';

export function parseMatrix(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    // Split on UNESCAPED pipes only. Without this a paragraph containing a
    // pipe — guidance about a shell pipeline, or about Markdown itself — could
    // not be reproduced in any cell, so `ground --check` stayed red for valid
    // content and no row could fix it.
    const cells = line.split(/(?<!\\)\|/).slice(1, -1)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/[\s:]/g, ''))) continue;
    if (/^id$/i.test(cells[0])) continue;
    rows.push({
      id: cells[0],
      guidance: cells[1],
      anchor: cells[2],
      rule: cells[3],
      location: cells[4],
    });
  }
  return rows;
}

/**
 * Every unit of content the skill carries. Not every unit that looks normative,
 * and not every unit that sits somewhere convenient to read.
 *
 * This used to match one shape — a `-` bullet on a single line — and call the
 * result "every statement". The skill above it claimed every statement was
 * traced to a rule, so four numbered priorities and a prose directive entered a
 * standards skill unclassified and `ground --check` reported clean.
 *
 * The first attempt at the fix widened the pattern and then exempted tables,
 * headings, fenced blocks, and five sections named in a regular expression.
 * A review found every one of those to be a hiding place: `## Always preserve
 * safety` with an empty matrix passed, and so did an instruction written under
 * a heading called `Source`. Moving a boundary is not removing it.
 *
 * So there are no exemptions left. Every heading, every paragraph, every list
 * item, every table and every block is a unit, including the ones before the
 * first heading. The matrix disposes of each as `G` (the source's authority),
 * `E` (our own guidance), or `N` (narrative that claims neither). Front matter
 * is the one thing outside this, because it is metadata for the harness rather
 * than instruction for a reader, and the documents say so rather than leaving
 * it to be discovered.
 *
 * A wrapped list item is ONE unit. Reading its first line alone let the rest of
 * the item change without the matrix noticing, which is the same defect one
 * level down.
 */

/** The first eight hex characters of a SHA-256 digest. */
const digest = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

/**
 * A table and a fenced block do not fit in a matrix cell, so each is named by a
 * designator instead.
 *
 * The designator carries a digest of the block rather than a number. An
 * ordinal identified a POSITION, so the contents of a table could be replaced
 * entirely while the matrix stayed clean, reordering two blocks silently
 * rebound their rows, and inserting one renumbered every block after it. A
 * digest identifies the CONTENT: edit the block and its row stops matching,
 * which is what every other row already does.
 */
const DESIGNATOR = /^\[(?:table|code) [0-9a-f]{8}\]$/;

const PREAMBLE = '(before the first heading)';

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const PIPE = /(?<!\\)\|/;
const DELIMITER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const LEAD = /^[ \t]+/;
// A marker with nothing after it is an empty list item, and a child block under
// it belongs to that item. Wanting content after the marker left the list shut,
// so the child was read at the top level and no row noticed.
//
// Nine digits at most, because that is what a Markdown reader accepts as an
// ordered marker. Any run of digits made `017966390.`, a trademark number that
// ends a paragraph in a shipped skill, into an empty list item.
const OPENS_LIST = /^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const EMPTY_LIST = /^(?:[-*+]|\d{1,9}[.)])\s*$/;
const EMPTY_HEADING = /^#{1,6}\s*$/;

// The indent in columns lives in `markdown.js`, because the section scan needs
// the same rule. Two copies of it gave one file two readings.

/**
 * The three constructs refused at column 0, named once. README lists them for
 * a contributor, and a test holds that list against this one, because a
 * document that names two of three teaches an author to write the third.
 */
export const AT_COLUMN_ZERO = {
  blockquote: 'a blockquote',
  heading: 'a heading with no text',
  item: 'a list item with no content',
};

/** What the line looks like. This names the refusal and nothing else. */
function shapeOf(line) {
  const t = line.trimStart();
  if (t.startsWith('>')) return 'a blockquote';
  if (/^#{1,6}(?:\s|$)/.test(t)) return 'a heading';
  if (/^(?:`{3,}|~{3,})/.test(t)) return 'a fenced block';
  if (OPENS_LIST.test(t)) return 'a list item';
  if (PIPE.test(t)) return 'a table row';
  return 'a paragraph';
}

/**
 * The grammar: the forms the extractor reads, stated as themselves. A line
 * outside them is refused, and the refusal names the line.
 *
 * This was a list of the shapes to reject, and three review rounds each found
 * a shape the list did not name. A rejection list is only as complete as the
 * last round of review, and the shape it misses passes silently. So the test
 * runs the other way now. These forms pass:
 *
 * - a blank line,
 * - any construct written at column 0, except a blockquote, an empty heading
 *   and a marker with no content, none of which the extractor reads,
 * - a line that continues the paragraph or list item above it, carrying prose
 *   rather than opening a container,
 * - an indented code block that stands on its own, with no list above it.
 *
 * Everything else is refused, including a shape nobody has thought of. That is
 * the point of stating it this way round.
 */
function outsideGrammar(line, { startsBlock, openText, listOpen, opensFence, opensTable }) {
  if (!line.trim()) return null;
  if (indentOf(line) === 0) {
    // A blockquote is the one construct at column 0 whose contents the
    // extractor reads as its own prose, so the quote and its container merge.
    if (line.startsWith('>')) return AT_COLUMN_ZERO.blockquote;
    // An empty marker and an empty heading are refused where they begin a
    // block. On a continuation line they are the prose of the line above, and
    // a Markdown reader agrees: neither interrupts a paragraph.
    if (!openText || startsBlock) {
      if (EMPTY_HEADING.test(line)) return AT_COLUMN_ZERO.heading;
      if (EMPTY_LIST.test(line)) return AT_COLUMN_ZERO.item;
    }
    return null;
  }
  const shape = shapeOf(line);
  // A continuation line carries prose. A container opened on one belongs to
  // the block above it, which the extractor does not model.
  if (openText && !startsBlock) {
    return shape === 'a paragraph' || shape === 'a table row'
      ? null
      : `${shape} that does not begin at column 0`;
  }
  // An indented code block with no list above it is read here as a reader
  // reads it, so it stands. A fence marker and a table row are not: the
  // extractor claims each of those before it looks at the indent, so the
  // indent hides a container rather than opening a block of code.
  if (isIndented(line) && !listOpen && !openText && !opensFence && !opensTable) return null;
  if (listOpen && shape === 'a paragraph') return 'a paragraph indented under a list item';
  return `${shape} that does not begin at column 0`;
}
function unitsIn(body, anchor, refuse = () => {}) {
  const out = [];
  let para = [];
  let item = null;
  let block = null;
  // A list stays open across a blank line, because an indented paragraph after
  // one belongs to the item above it. Only a fresh block at column 0 ends it.
  let listOpen = false;
  let afterBlank = true;
  const push = (text, isBlock = false) => out.push({ text, anchor, block: isBlock });
  const closeBlock = () => {
    if (!block) return;
    push(`[${block.kind === 'indented' ? 'code' : block.kind} ${digest(block.lines.join('\n'))}]`, true);
    block = null;
  };
  const flush = () => {
    if (para.length) push(para.join(' '));
    para = [];
    item = null;
  };
  const lines = body.split('\n');
  for (const [i, line] of lines.entries()) {
    // An indented block is code too. Reading it as prose reported each line as
    // an uncovered statement, which teaches a contributor to write a grounding
    // row for an example. Its contents are settled before anything else looks
    // at the line, because a fence marker or a table row indented INSIDE one is
    // part of the example. Testing for a fence first split one block in two.
    if (block?.kind === 'indented') {
      if (!line.trim() || isIndented(line)) { block.lines.push(line); continue; }
      closeBlock();
    }
    const fence = FENCE.exec(line);
    // Close only on the SAME marker, at least as long. A four-backtick fence
    // around a three-backtick example was closed by the example's own opening
    // line, and the rest of the block was then read as prose.
    // A closer is a marker a reader sees as one. Indented four columns it is
    // the block's own contents, and closing there left the directive below the
    // block outside it.
    if (block?.kind === 'code' && block.marker && fence && !isIndented(line)
      && fence[2][0] === block.marker[0] && fence[2].length >= block.marker.length
      && !fence[3].trim()) {
      closeBlock();
      continue;
    }
    if (block?.kind === 'code') { block.lines.push(line); continue; }
    // Everything above this line is the contents of a block. Everything below
    // it is a line the grammar has to admit.
    const startsBlock = afterBlank;
    if (line.trim()) afterBlank = false;
    const inTable = block?.kind === 'table';
    const opensTable = !inTable && PIPE.test(line) && DELIMITER.test(lines[i + 1] ?? '');
    const outside = outsideGrammar(line, {
      startsBlock,
      openText: Boolean(item) || para.length > 0,
      listOpen,
      opensFence: Boolean(fence),
      opensTable: opensTable || (inTable && PIPE.test(line)),
    });
    if (outside) refuse(i, outside);
    if (fence) {
      listOpen = false;
      flush();
      closeBlock();
      // The info string governs how the block is read, so it is part of the
      // block. Hashing the body alone gave ```js and ```sh one designator.
      block = { kind: 'code', lines: [fence[3].trim()], marker: fence[2] };
      continue;
    }
    // A table row need not start with a pipe. `Name | Meaning` over
    // `--- | ---` is a table, and reading it as prose left it with no
    // designator and no way to be quoted in a cell.
    // A table may not begin on a list-marker line. `- A | B` over `--- | ---`
    // is a table inside the item, and reading it as one at the top level hid
    // the item's own words in a digest. The item is read as an item instead.
    const tableInItem = opensTable && OPENS_LIST.test(line);
    if (tableInItem) refuse(i, 'a table inside a list item');
    if (PIPE.test(line) && (inTable || opensTable) && !tableInItem) {
      if (!LEAD.test(line)) { listOpen = false; }
      if (!inTable) { flush(); block = { kind: 'table', lines: [] }; }
      block.lines.push(line.trim());
      continue;
    }
    if (block) closeBlock();
    if (!line.trim()) { flush(); afterBlank = true; continue; }
    if (isIndented(line) && !item && !para.length) {
      block = { kind: 'code', lines: [line] };
      block.kind = 'indented';
      continue;
    }
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flush();
      if (!LEAD.test(line)) listOpen = true;
      item = { text: m[1], anchor, block: false };
      out.push(item);
      continue;
    }
    // An empty marker opens a list too. The item pattern above wants content
    // after the marker, so `-` on its own left the list shut and the child
    // block under it was read at the top level.
    if (OPENS_LIST.test(line)) listOpen = true;
    // A paragraph beginning at column 0 after a blank line is a new block, so
    // the list above it has ended. A line that merely continues one has not.
    else if (startsBlock && !LEAD.test(line)) listOpen = false;
    // Lazy continuation. Prose under a list item belongs to that item.
    if (item) item.text += ` ${line.trim()}`;
    else para.push(line.trim());
  }
  flush();
  // A block nobody closed still holds content, so it still needs a row.
  closeBlock();
  return out;
}

/**
 * Front matter, removed, with the count of the lines it took. A refusal names
 * a line of the file the author edits, so every offset below is carried
 * forward rather than recomputed against the shortened body.
 */
function withoutFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { body: text, offset: 0 };
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return { body: text, offset: 0 };
  return { body: lines.slice(close + 1).join('\n'), offset: close + 1 };
}

function extract(skillText) {
  const refusals = [];
  const { body, offset } = withoutFrontMatter(skillText);
  const secs = sections(body);
  const lines = body.split('\n');
  // `firstLine` for a setext heading, because `startLine` is the underline and
  // the heading TEXT sits above it. Taking `startLine - 1` left that text in the
  // preamble and then added it again as the heading, so one occurrence in the
  // source demanded two matrix rows. `endLine` already reads it this way.
  const firstHeading = secs.length ? (secs[0].firstLine ?? secs[0].startLine - 1) : lines.length;
  // A refusal counts lines from 1, in the file the author opens, so it carries
  // the front matter and the position of the section body with it.
  const at = (base) => (i, shape) => refusals.push({ line: offset + base + i + 1, shape });
  const out = unitsIn(lines.slice(0, firstHeading).join('\n'), PREAMBLE, at(0));
  for (const sec of secs) {
    // A setext heading never reaches `unitsIn`, because the section split
    // consumes it. So the guard has to meet it here, or `Rules` over `-----`
    // indented under a list item becomes a top-level section and every anchor
    // below it moves. An ATX heading begins at column 0 by the rule that finds
    // it, so this refuses only the setext spelling.
    const head = sec.firstLine ?? sec.startLine - 1;
    if (LEAD.test(lines[head] ?? '')) at(0)(head, 'a heading that does not begin at column 0');
    // The heading is a unit of its own. It was the anchor and nothing else, so
    // a heading that gave an instruction was never disposed of by any row.
    out.push({ text: sec.heading, anchor: sec.heading, block: false });
    out.push(...unitsIn(sec.body, sec.heading, at(sec.startLine)));
  }
  return { units: out, refusals };
}

export function contentUnits(skillText) {
  return extract(skillText).units;
}

/**
 * What to do about the refusal. Every refusal used to end with "write it at
 * column 0", which a blockquote, an empty marker and an empty heading already
 * do. A remedy that the author cannot follow is worse than none, because it
 * says the check misread the line.
 */
function remedyFor(shape) {
  if (shape.startsWith('a blockquote')) {
    return 'Write the quoted words as our own prose, or put them in a fenced block.';
  }
  if (shape === 'a heading with no text') return 'Give the heading its text, or delete the line.';
  if (shape === 'a list item with no content') return 'Give the item its words, or delete the marker.';
  if (shape === 'a table inside a list item') return 'Move the table out of the list.';
  if (shape === 'a paragraph indented under a list item') {
    return 'Write it at column 0, or fold it into the item above it.';
  }
  return 'Write it at column 0.';
}

/**
 * Every construct in the skill that the extractor does not model, by line.
 * `checkSkill` reports these, and this export lets a caller ask for them
 * without a matrix to compare against.
 */
export function unmodelled(skillText) {
  return extract(skillText).refusals;
}

export function checkSkill({ skillText, matrixText }) {
  if (matrixText === null || matrixText === undefined) {
    return [{ level: 'error', code: 'no-matrix', message: 'Skill has no grounding matrix.' }];
  }
  const rows = parseMatrix(matrixText);
  const { units: stmts, refusals } = extract(skillText);
  const findings = [];

  // Refusals lead, because every finding under them rests on a reading the
  // extractor has just said it cannot make.
  for (const r of refusals) {
    findings.push({
      level: 'error',
      code: 'unmodelled-construct',
      message: `line ${r.line}: ${r.shape} is outside the Markdown this check models. `
        + remedyFor(r.shape),
    });
  }

  // Two passes, because one was order-dependent. A row was matched against the
  // first unused unit with its text, so a row naming the wrong anchor could
  // consume the occurrence a later, correct row needed. The same two rows in
  // the other order gave different findings. Every exact match — text AND
  // anchor — is reserved first, and only then are the leftovers paired by text
  // alone to tell a moved quote from a missing one.
  const taken = new Set();
  const claim = (row, sameAnchor) => stmts.findIndex((s, i) => !taken.has(i)
    && s.text === row.guidance && (!sameAnchor || s.anchor === row.anchor));
  const claims = rows.map(() => -1);
  rows.forEach((row, i) => {
    const j = claim(row, true);
    if (j >= 0) { taken.add(j); claims[i] = j; }
  });
  rows.forEach((row, i) => {
    if (claims[i] >= 0) return;
    const j = claim(row, false);
    if (j >= 0) { taken.add(j); claims[i] = j; }
  });

  rows.forEach((row, i) => {
    const hit = claims[i] >= 0 ? stmts[claims[i]] : null;
    if (!hit) {
      const spent = stmts.some((s) => s.text === row.guidance);
      findings.push({
        level: 'error',
        code: spent ? 'duplicate-row' : 'missing-quote',
        message: spent
          ? `${row.id}: "${row.guidance}" appears fewer times in SKILL.md than the matrix claims.`
          : `${row.id}: "${row.guidance}" no longer appears in SKILL.md.`,
      });
    } else if (hit.anchor !== row.anchor) {
      findings.push({
        level: 'error',
        code: 'wrong-anchor',
        message: `${row.id}: quote is under "${hit.anchor}", not "${row.anchor}".`,
      });
    }
    const kind = /^([GEN])-/i.exec(row.id)?.[1]?.toUpperCase();
    if (!kind) {
      findings.push({
        level: 'error',
        code: 'unknown-row-kind',
        message: `${row.id}: an id must begin with G-, E-, or N-.`,
      });
    } else if (kind === 'G' && !row.rule) {
      findings.push({
        level: 'error',
        code: 'g-row-no-rule',
        message: `${row.id}: a G row must cite a source rule.`,
      });
    } else if (kind !== 'G' && row.rule) {
      findings.push({
        level: 'error',
        code: 'e-row-has-rule',
        message: `${row.id}: only a G row cites a source rule.`,
      });
    }
  });

  stmts.forEach((s, i) => {
    // Prose in the shape of a designator would satisfy a row written for a
    // block, so the syntax is reserved rather than merely conventional.
    if (!s.block && DESIGNATOR.test(s.text)) {
      findings.push({
        level: 'error',
        code: 'reserved-designator',
        message: `"${s.text}" (under "${s.anchor}") is written where only a block may be named.`,
      });
    }
    if (!taken.has(i)) {
      findings.push({
        level: 'error',
        code: 'uncovered-statement',
        message: `"${s.text}" (under "${s.anchor}") has no grounding row.`,
      });
    }
  });

  return findings;
}

export async function checkAll(repoRoot) {
  const out = {};
  for (const skill of await loadCatalog(repoRoot)) {
    const skillText = await fs.readFile(path.join(skill.dir, 'SKILL.md'), 'utf8');
    let matrixText = null;
    try {
      matrixText = await fs.readFile(skill.groundingPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    out[skill.name] = checkSkill({ skillText, matrixText });
  }
  return out;
}
