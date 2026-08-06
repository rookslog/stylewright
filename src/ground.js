import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { sections } from './markdown.js';
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
const BLOCKQUOTE = /^[ \t]*>/;
const HEADING = /^[ \t]+#{1,6}\s/;
// A marker with nothing after it is an empty list item, and a child block under
// it belongs to that item. Wanting content after the marker left the list shut,
// so the child was read at the top level and no row noticed.
const MARKER = /^[ \t]+(?:[-*+]|\d+[.)])(?:\s|$)/;
const OPENS_LIST = /^(?:[-*+]|\d+[.)])(?:\s|$)/;

/**
 * The indent in columns, where a tab advances to the next stop of four. A
 * pattern over literal characters counted ` \t` as one space, so a code block
 * written with a mixed indent closed at that line and the guard then refused
 * the block's own contents.
 */
const TAB = 4;
function indentOf(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += TAB - (n % TAB);
    else break;
  }
  return n;
}
const isIndented = (line) => indentOf(line) >= TAB;

/**
 * The extractor reads one line at a time, and it holds no stack of open
 * containers. So it reads a heading, a list item, a fence or a table nested
 * inside a blockquote or under an indent as the wrong unit, and a matrix over
 * that reading disposes of something the skill does not say.
 *
 * Five review rounds each found a fresh shape of this and each patched that
 * shape. The sixth arrived every time. So the extractor stops guessing: it
 * REFUSES what it does not model, names the line, and says what to write
 * instead. A construct outside the subset then fails loudly at the point of
 * use, rather than passing under a reading nobody checked.
 *
 * The subset is every construct written at column 0, plus a wrapped
 * continuation line, plus an indented code block that stands on its own.
 * Refusing is not narrowing: every unit the extractor already saw it still
 * sees, and the refusal is an additional finding rather than a replacement.
 * ADR-0016 records the choice of the guard over a CommonMark parser.
 */
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
  /**
   * The guard, in one place, because a table row can carry a container prefix.
   * `> A | B` over `--- | ---` reached the table branch first and became a
   * designator, so a blockquote passed with no refusal at all.
   *
   * `nested` is any indent under an open list, at ANY width. What separates a
   * child block from a wrapped line is the blank line above it, and not how far
   * the author indented. An indented construct with no list above it is an
   * ordinary code block, which the extractor reads as a reader does, so it
   * stands.
   */
  const container = (i, line, startsBlock) => {
    const nested = listOpen && LEAD.test(line);
    if (BLOCKQUOTE.test(line) && (nested || !isIndented(line))) {
      refuse(i, 'a blockquote');
    } else if (MARKER.test(line) && (nested || !isIndented(line))) {
      refuse(i, 'a list item indented under another');
    } else if (HEADING.test(line) && (nested || !isIndented(line))) {
      refuse(i, 'a heading that does not begin at column 0');
    } else if (nested && startsBlock) {
      refuse(i, 'a paragraph indented under a list item');
    } else {
      return false;
    }
    return true;
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
    if (block?.kind === 'code' && block.marker && fence
      && fence[2][0] === block.marker[0] && fence[2].length >= block.marker.length
      && !fence[3].trim()) {
      closeBlock();
      continue;
    }
    if (fence && block?.kind !== 'code') {
      // An indented opener is read as a fence here and as a code block or as
      // part of a list item by a parser, so the prose below it is swallowed.
      if (fence[1]) refuse(i, 'a fenced block that does not open at column 0');
      listOpen = false;
      afterBlank = false;
      flush();
      closeBlock();
      // The info string governs how the block is read, so it is part of the
      // block. Hashing the body alone gave ```js and ```sh one designator.
      block = { kind: 'code', lines: [fence[3].trim()], marker: fence[2] };
      continue;
    }
    if (block?.kind === 'code') { block.lines.push(line); continue; }
    // A table row need not start with a pipe. `Name | Meaning` over
    // `--- | ---` is a table, and reading it as prose left it with no
    // designator and no way to be quoted in a cell.
    const inTable = block?.kind === 'table';
    if (PIPE.test(line) && (inTable || DELIMITER.test(lines[i + 1] ?? ''))) {
      if (!container(i, line, afterBlank) && LEAD.test(line)
        && (listOpen || isIndented(line))) {
        refuse(i, 'a table under an indent');
      }
      if (!LEAD.test(line)) { listOpen = false; }
      afterBlank = false;
      if (!inTable) { flush(); block = { kind: 'table', lines: [] }; }
      block.lines.push(line.trim());
      continue;
    }
    if (block) closeBlock();
    if (!line.trim()) { flush(); afterBlank = true; continue; }
    const startsBlock = afterBlank;
    afterBlank = false;
    // Every shape the guard names reads as one unit here and as another to a
    // reader, so the extractor refuses it instead of choosing.
    container(i, line, startsBlock);
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
        + 'Write it at column 0, or move it out of the container.',
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
