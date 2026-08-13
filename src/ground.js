import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { sections, indentOf, isIndented } from './markdown.js';
import { loadCatalog } from './catalog.js';

/**
 * The columns a matrix carries, in order. The last is the audit.
 *
 * `Source text` sits directly beside `Source rule`, because the control the
 * design document states is that a quotation carries its identifier next to
 * it. A reader compares the two cells without leaving the row, which is the
 * whole reason the column exists: a `G` row against a paraphrase could only be
 * checked against a memory of the rule, or against a 400-page PDF.
 */
export const MATRIX_COLUMNS = ['ID', 'Our guidance', 'Our anchor', 'Source rule', 'Source text', 'Source location', 'Audited'];

// Split on UNESCAPED pipes only. Without this a paragraph containing a pipe —
// guidance about a shell pipeline, or about Markdown itself — could not be
// reproduced in any cell, so `ground --check` stayed red for valid content and
// no row could fix it.
const cellsOf = (line) => line.split(/(?<!\\)\|/).slice(1, -1)
  .map((c) => c.trim().replace(/\\\|/g, '|'));

const MATRIX_FENCE = /^(\s*)(`{3,}|~{3,})/;
/** Anything a reader would take for a table row, wherever it sits. */
const LOOKS_LIKE_ROW = /^\s*>?\s*\|/;
const IS_DELIMITER = (cells) => cells.length > 0
  && cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')));

/**
 * The matrix table, read as a reader sees it.
 *
 * This used to take any line beginning with optional space and a pipe, and to
 * skip the header and the delimiter by pattern. Both halves leaked.
 *
 * The header and the delimiter were skipped rather than checked, so deleting
 * either one, or cutting either short, or renaming a heading to `Notes`, left
 * every row parsing and the coverage note printing full marks. In GFM each of
 * those either drops the rendered column or stops the block being a table at
 * all, so the person reading the matrix loses the record while the check
 * reports it intact. The record exists for the person, so the column they see
 * is the column that counts.
 *
 * A row inside a fenced block or indented four spaces is an EXAMPLE to a
 * reader and was a row to the checker, which is the same disagreement pointing
 * the other way: a code sample could carry a recorded audit. Fenced content is
 * skipped, and a row that does not begin at column 0 is refused by name.
 *
 * A row inside a blockquote fell out of the parse entirely, which shrank the
 * DENOMINATOR — `1 of 1` printed over a matrix visibly carrying two G rows.
 * A line that looks like a row and is not read is now named rather than
 * dropped, so the count cannot quietly describe fewer rows than the file has.
 *
 * This reader is the matrix's own. It is not the `SKILL.md` extractor, and the
 * two do not share a grammar, so a shape refused here says nothing about
 * issues 37 and 69.
 */
export function readMatrix(text) {
  const read = [];
  const refusals = [];
  const AT_ZERO = 'Write it at column 0, or move it into a fenced block if it is an example.';
  let fence = null;
  let opened = 0;
  for (const [i, line] of text.split('\n').entries()) {
    const marker = MATRIX_FENCE.exec(line);
    if (fence) {
      if (marker && marker[2][0] === fence[0] && marker[2].length >= fence.length) fence = null;
      continue;
    }
    if (marker) { fence = marker[2]; opened = i + 1; continue; }
    if (!LOOKS_LIKE_ROW.test(line)) continue;
    if (/^\s*>/.test(line)) {
      refusals.push({ line: i + 1, shape: 'a table row inside a blockquote', remedy: AT_ZERO });
      continue;
    }
    if (/^\s/.test(line)) {
      refusals.push({ line: i + 1, shape: 'a table row that does not begin at column 0', remedy: AT_ZERO });
      continue;
    }
    // A row that does not end in a pipe is legal GFM and is not house style.
    // It matters here because `cellsOf` drops the text after the last pipe, so
    // an unclosed row reported "carries 5 columns, not 6" — a count that is an
    // artifact of the reading rather than the author's mistake.
    read.push({ line: i + 1, cells: cellsOf(line), closed: /(?<!\\)\|\s*$/.test(line) });
  }
  // A fence nobody closed swallows the rest of the file, so every row below it
  // leaves the parse at once. That is the silent denominator shrink again, by
  // a different door: the count fell from two G rows to none with nothing
  // saying why.
  if (fence) {
    refusals.push({
      line: opened,
      shape: 'a fenced block that is never closed',
      remedy: `Close it with ${fence[0].repeat(fence.length)}, or the rest of the file is inside it.`,
    });
  }

  const at = read.findIndex((l) => IS_DELIMITER(l.cells));
  if (at === -1) {
    return { header: null, delimiter: null, rows: [], strays: read, refusals };
  }

  // Contiguity. Every line above recorded where it sits and nothing compared
  // the numbers, so a table could be scattered down the file and still parse:
  // a blank line or a paragraph between the header and the delimiter, a header
  // twelve lines up, a blank line under the delimiter, or a heading or a
  // thematic break between two body rows. GFM ends the table at every one of
  // those. The rows kept parsing and the coverage note kept printing, over a
  // file where the reader sees no table at all.
  const delimiter = read[at];
  const above = at > 0 ? read[at - 1] : null;
  const header = above && above.line === delimiter.line - 1 ? above : null;
  const rows = [];
  const strays = [];
  let expected = delimiter.line + 1;
  for (const entry of read.slice(at + 1)) {
    if (entry.line === expected && !IS_DELIMITER(entry.cells)) {
      rows.push(entry);
      expected += 1;
    } else strays.push(entry);
  }
  // A detached header is not part of the table, so it is a stray too, and it
  // is reported as one rather than silently becoming the row above nothing.
  if (above && !header) strays.unshift(above);
  return { header, delimiter, rows, strays, refusals, detached: Boolean(above && !header) };
}

export function parseMatrix(text) {
  return readMatrix(text).rows.map(({ cells }) => ({
    id: cells[0],
    guidance: cells[1],
    anchor: cells[2],
    rule: cells[3],
    quote: cells[4],
    location: cells[5],
    // An absent last cell is NOT an empty one. Coalescing the two here made
    // the column optional for any matrix without a G row: delete the header,
    // the delimiter and every cell from a matrix of E and N rows and the
    // check stayed clean, because each missing cell read as an empty audit
    // and no G row was left to complain. `undefined` reaches the check and
    // the check names it.
    audit: cells[6],
    // Everything past the last cell. GFM drops it from the render, so text
    // here is seen by no reader and was read by no check.
    extra: cells.slice(7),
  }));
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

/**
 * What a `G` row records about its own audit.
 *
 * A `G` row claims the authority of a source. No program here can open that
 * source, so no program can confirm the row reads it correctly. The check
 * confirms that a rule is cited and stops there, and a clean run therefore
 * said nothing at all about whether the citation is true. Reading a green
 * check as an audited matrix is the gap issue 40 names.
 *
 * So the row carries the audit itself. `unaudited` is the honest default and
 * the state every row starts in. The other spelling is a date and a digest,
 * which together say that a person compared this row against the source on
 * that day.
 *
 * The digest names the row's CONTENTS, for the reason `[table 8f3a2b1c]`
 * does. A bare date beside a row id would survive a rewrite of every other
 * cell in that row, so an audit of words nobody audited would keep reading as
 * current. Edit the guidance, the anchor, the rule or the location and the
 * audit goes stale, which is what every other row in this file already does
 * when the thing it describes moves underneath it.
 *
 * The cell names no auditor. The commit that wrote it does, and one record of
 * who is enough.
 */
const UNAUDITED = 'unaudited';
const AUDIT = /^(\d{4})-(\d{2})-(\d{2}) ([0-9a-f]{8})$/;

/**
 * What a `G` row records about the source's own words.
 *
 * The row's guidance cell is OUR sentence. Beside a rule identifier it reads
 * as the rule, and a reviewer checking it has to open the source to find out.
 * The doctrine permits quoting the rule for exactly that reason, so the row
 * carries a cell for the source's words.
 *
 * `unquoted` is the honest default and the state every row starts in, as
 * `unaudited` is for the cell beside it. An empty cell would say the same
 * thing far less clearly, and it would not survive the column being dropped.
 *
 * The other spelling is a quotation, and it is marked as one. Unmarked text
 * here would be indistinguishable from a second paraphrase of ours sitting
 * under a heading that says `Source`, which is this repository's worst defect
 * wearing a new cell. So the cell opens and closes with a quotation mark, and
 * the marks pair. Words outside a pair are ours — `"a" and "b"` cites two
 * rules — and words inside one are the source's.
 *
 * Quoting is bounded by substitution rather than by any count this program
 * could hold: a matrix that quotes every rule in full has stopped citing and
 * started republishing. No threshold here can decide that, so the run reports
 * how much of each matrix is quoted and leaves the judgment with the person
 * who reads the number.
 *
 * Every pair holds something. `""` and `"   "` opened and closed with a mark
 * and passed, so a row could claim to quote its rule while quoting nothing,
 * and the coverage count called it quoted. An empty pair is not a quotation of
 * anything, and `unquoted` is the spelling for a row that carries no words.
 */
const UNQUOTED = 'unquoted';
const PAIR = '"(?=[^"]*[^\\s"])[^"]*"';
const QUOTED = new RegExp(`^${PAIR}(?:[^"]*${PAIR})*$`);

/**
 * Whether this matrix may quote its source at all.
 *
 * The cell grammar above says what a quotation looks like. It cannot say
 * whether this source permits one, and four of the five matrices here do not.
 * ASD reserves all rights, and the owner's publication decision turns on no
 * rule text being reproduced. Nothing mechanical held that: substituting rule
 * text into the forbidden matrix left `ground --check` green, so a prohibition
 * recorded in prose was one cell away from being crossed by anybody who had
 * not read the prose.
 *
 * So each matrix declares it, in a line a reader sees. `forbidden` refuses any
 * cell but `unquoted`, whatever else is true of that cell. Crossing the
 * owner's condition then takes an edit to the declaration and its stated
 * reason, which is a decision about the source, rather than an edit to one row.
 *
 * The declaration is required, and its absence reads as `forbidden`. A default
 * of `permitted` would turn the rule off for whoever forgot the line, which is
 * a gate failing open on a missing argument and a defect this file already
 * carries a fix for two checks over.
 *
 * A second declaration does not overrule the first. Both are refused, and any
 * `forbidden` among them governs, because the way to lift a prohibition is to
 * edit it rather than to add a line under it.
 *
 * Three things make a declaration unreadable, and an unreadable one governs
 * nothing. Each was found by attacking this check rather than by imagining it.
 *
 * It sits ABOVE the table. A permitting line written under the matrix was
 * accepted, and a reader looking for the state of a file reads its opening
 * prose. A declaration below the rows it governs is a footnote to them.
 *
 * It sits outside raw HTML. A permitting line inside a collapsed `<details>`
 * was accepted, and a reader on GitHub does not see it at all. That is the
 * container asymmetry this file already refuses for a matrix row, pointing the
 * other way: a line the reader cannot see may not carry the record.
 *
 * It names its state once. `permitted for the dictionary only. Rule text is
 * forbidden.` read as permitted, and it says both. The state is a binary and
 * the reason may not restate it, so the whole paragraph is checked and not the
 * first line, or the qualification simply moves down a line.
 */
const FORBIDDEN = 'forbidden';
// The state word ENDS the token. `\b` alone matched inside `permitted-not`,
// which reads to a person as the opposite of what the check took it for.
const DECLARATION = /^\*\*Quotation:\*\* (permitted|forbidden)(?![-\w])/;
// The reason's test stays loose on purpose. Every shape it catches is refused,
// so a wider match fails closed, and the narrower rule above governs only what
// the check reads AS a declaration.
const EITHER_STATE = /\b(?:permitted|forbidden)\b/i;

/**
 * Raw HTML, read as a region rather than as a block. A reader sees `<details>`
 * hide everything to its closer, whatever blank lines fall between, and
 * CommonMark's HTML block ends at the first of those.
 *
 * Up to three leading spaces, because CommonMark allows them and a renderer
 * treats a two-space-indented `<details>` as HTML. Anchoring at column 0 read
 * such a block as visible prose while the reader saw it collapsed, which is
 * the same disagreement this check exists to end.
 *
 * A void element opens nothing. `<br>` never closes, so counting it left every
 * declaration below it inside a region that no line could end. The check fails
 * closed there, and a rule that refuses an honest file until somebody works out
 * why is a rule people route around.
 */
const VOID = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr';
const HTML_OPENS = new RegExp(`^ {0,3}<(?!(?:${VOID})(?![\\w-]))[a-zA-Z][\\w-]*(?=[\\s>/]|$)`, 'i');
const HTML_CLOSES = /^ {0,3}<\/[a-zA-Z][\w-]*\s*>/;
const HTML_SELF_CLOSES = /\/>\s*$/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;

/**
 * Every declaration in the file, each with what makes it unreadable. The
 * caller decides, because an unreadable declaration is two facts at once: a
 * finding to report, and a line that governs nothing.
 */
export function readDeclaration(text, headerLine = null) {
  const found = [];
  const lines = text.split('\n');
  let fence = null;
  let html = 0;
  for (const [i, line] of lines.entries()) {
    const marker = MATRIX_FENCE.exec(line);
    if (fence) {
      if (marker && marker[2][0] === fence[0] && marker[2].length >= fence.length) fence = null;
      continue;
    }
    if (marker) { fence = marker[2]; continue; }
    if (HTML_CLOSES.test(line)) html = Math.max(0, html - 1);
    else if (HTML_OPENS.test(line) && !HTML_SELF_CLOSES.test(line)) html += 1;
    const stated = DECLARATION.exec(line);
    if (!stated) continue;
    // The reason runs to the next heading or to the table, whichever comes
    // first. Reading one line let the qualification move to the second, and
    // reading one paragraph let it move to the paragraph after — the argument
    // for widening the first time reaches the second time as well. A heading
    // ends it because a heading starts a different subject, and the table ends
    // it because there is nothing after that a declaration could be arguing.
    //
    // Fenced content is skipped rather than read, and skipped rather than
    // stopped at. Reading it made a matrix that SHOWS what a declaration looks
    // like equivocate about its own state, and stopping at it would hand the
    // qualification the same escape one fence lower down.
    const reason = [line.slice(stated[0].length)];
    let shown = null;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (headerLine !== null && j + 1 >= headerLine) break;
      const inner = MATRIX_FENCE.exec(lines[j]);
      if (shown) {
        if (inner && inner[2][0] === shown[0] && inner[2].length >= shown.length) shown = null;
        continue;
      }
      if (inner) { shown = inner[2]; continue; }
      if (HEADING.test(lines[j])) break;
      reason.push(lines[j]);
    }
    found.push({
      line: i + 1,
      state: stated[1],
      inHtml: html > 0,
      belowTable: headerLine !== null && i + 1 > headerLine,
      equivocates: EITHER_STATE.test(reason.join(' ')),
    });
  }
  return found;
}

const LEAP = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Whether the three numbers name a day that exists. `2026-02-31` parses under
 * the pattern above and names nothing, and an audit dated on a day that never
 * happened is not a record of anything.
 *
 * This counts days rather than building a date, because no module under `src/`
 * may reach the clock and a constructed date is one argument away from it.
 *
 * It is exported for the editorial audit record, which dates a reading the
 * same way a `G` row does. A second reading of what a day is would be a second
 * thing to drift.
 */
export function isRealDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const lengths = [31, LEAP(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

/**
 * The digest an audit of this row would carry. Every cell the audit is a
 * claim about goes in: our guidance, where it sits, the rule it cites, the
 * source's own words and where that rule lives. The id stays out, because
 * renumbering a matrix rewrites no claim.
 *
 * The quotation is in for the reason every other cell is. A person auditing a
 * row reads our sentence against the rule, and the quotation is the copy of
 * the rule they read it against. Leaving it out would let the quoted words be
 * rewritten under a recorded audit, which is the stale-digest defect one
 * column over.
 */
export function rowDigest(row) {
  return digest([row.guidance, row.anchor, row.rule, row.quote, row.location].join('\n'));
}

/**
 * The UTC day the checker is running on, from the time the command line hands
 * in. No module here reads a clock, so the day arrives as a parameter like
 * every other moment this program needs.
 *
 * A caller that omits it is refused rather than defaulted. The one thing this
 * value does is reject an audit dated in the future, and a default would turn
 * that check off for whoever forgot the argument. A gate that fails open on a
 * missing argument is the defect `ground --check` already carries a fix for,
 * one floor down.
 *
 * The day it names must exist, by the same rule the audit date obeys. This
 * read the first ten characters and asked no more, so `9999-99-99` arrived as
 * the upper bound, every real date sorted below it, and an audit dated
 * `9999-12-31` came back counted as read. A bound that is not a day cannot
 * bound anything, and applying the calendar to one of these dates and not the
 * other is the same check-narrower-than-the-claim shape one argument over.
 *
 * The tail after the day is the time, which nothing here reads. It may be
 * absent, and it may not be arbitrary text, because text that is not a
 * timestamp is a caller passing something other than a moment.
 *
 * The moment must be UTC. An offset timestamp names a day in one zone and a
 * different day in UTC, and this read the written day: `2026-08-07T00:30:00
 * +05:00` is still 6 August in UTC, so an audit dated the 7th passed and was
 * counted as read. Normalising an offset needs date arithmetic in a module
 * that may not build a date, and the one caller hands in `toISOString`, which
 * is always UTC. So the grammar states the forms it reads and refuses the
 * rest, which is how this file already treats Markdown.
 *
 * A ZERO offset is UTC, and the first version of that rule refused `+00:00`
 * and `+0000` on a day-shifting warrant that cannot apply to an offset of no
 * hours. Those are admitted. A non-zero offset still is not, because the
 * refusal is what stops the day moving.
 *
 * The time is bounded rather than waved through. `24:00:00Z` is a legal ISO
 * spelling of MIDNIGHT ENDING that day, so reading its written day put the
 * bound one day early and over-refused an honest audit, and `99:99:99Z` was
 * simply accepted. Neither is a moment this program should guess at.
 *
 * A leap second is `23:59:60` and nothing else. Allowing `:60` after any
 * minute admitted 1439 times that have never existed. The fraction attaches to
 * the SECONDS, because it sat outside that group and `12:00.500Z` — a fraction
 * of no seconds — parsed.
 */
const TIME = '(?:23:59:60(?:\\.\\d+)?|(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?)';
const ISO_DAY = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})(?:T${TIME}(?:Z|[+-]00:?00))?$`);

/**
 * A moment this check cannot read. It carries the value and the spellings it
 * accepts, because a refusal the caller cannot act on is worse than none.
 *
 * It is not a `TypeError`. The type is usually right and the shape is wrong,
 * and every other refusal in this file is data rather than a throw. This one
 * stays a throw because a bad bound cannot be reported as a finding without
 * first being used as a bound.
 */
export class InvalidMoment extends Error {
  constructor(value) {
    super('`now` must be a UTC moment: a day as YYYY-MM-DD, or that day with a time ending '
      + `in Z or a zero offset. Got ${JSON.stringify(value)}.`);
    this.name = 'InvalidMoment';
    this.value = value;
  }
}
export function dayOf(now) {
  const stamp = typeof now === 'string' ? ISO_DAY.exec(now) : null;
  if (!stamp || !isRealDate(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]))) {
    throw new InvalidMoment(now);
  }
  return `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
}

/**
 * What a row's audit cell amounts to, read once and used twice. The findings
 * below and the coverage count above disagreed when each read the cell for
 * itself: a stale or impossible stamp still matched the pattern, so the count
 * called the row audited while the check called it broken.
 *
 * `recorded` is the only state that counts as a person having read the row.
 */
function auditState(row, today) {
  const audit = row.audit;
  if (audit === undefined) return { state: 'missing' };
  if (!audit) return { state: 'absent' };
  if (audit === UNAUDITED) return { state: 'unaudited' };
  const stamp = AUDIT.exec(audit);
  if (!stamp || !isRealDate(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]))) {
    return { state: 'malformed' };
  }
  const day = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
  // Zero-padded ISO days sort as text, so this needs no date arithmetic.
  if (day > today) return { state: 'ahead', day };
  if (stamp[4] !== rowDigest(row)) return { state: 'stale', day };
  return { state: 'recorded', day };
}

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
  // A blockquote is the one construct at column 0 whose contents the extractor
  // reads as its own prose, so the quote and its container merge.
  if (indentOf(line) === 0 && line.startsWith('>')) return AT_COLUMN_ZERO.blockquote;
  // An empty heading is refused wherever it appears, because a heading does
  // interrupt a paragraph for a Markdown reader, and neither the section scan
  // nor the walk reads one. `Prose` over `#` over a directive was one unit.
  if (EMPTY_HEADING.test(line.trimStart())) return AT_COLUMN_ZERO.heading;
  // An empty marker is refused where it begins a block, at any indent. On a
  // continuation line it is the prose of the line above, and a Markdown reader
  // agrees: an empty item interrupts no paragraph. Indented, both were refused
  // for the indent alone, and the remedy told the author to write at column 0
  // the very line the check refuses there.
  if (!openText || startsBlock) {
    if (EMPTY_LIST.test(line.trimStart())) return AT_COLUMN_ZERO.item;
  }
  if (indentOf(line) === 0) return null;
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
    // Nine digits at most here too. A ten-digit reference number opened a list
    // that a Markdown reader does not, and the standalone code block below it
    // was then refused for sitting under that list.
    const m = /^\s*(?:[-*+]|\d{1,9}[.)])\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flush();
      if (!LEAD.test(line)) listOpen = true;
      item = { text: m[1], anchor, block: false };
      out.push(item);
      continue;
    }
    // An empty marker opens a list too, where it BEGINS a block. The item
    // pattern above wants content after the marker, so `-` on its own left the
    // list shut and the child block under it was read at the top level. One
    // that continues a paragraph opens nothing, and treating it as a list left
    // `listOpen` set across the blank line, so a standalone code block below
    // was refused for sitting under a list that was never there.
    if (OPENS_LIST.test(line) && (!item && !para.length)) listOpen = true;
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

export function checkSkill({ skillText, matrixText, now }) {
  const today = dayOf(now);
  if (matrixText === null || matrixText === undefined) {
    return [{ level: 'error', code: 'no-matrix', message: 'Skill has no grounding matrix.' }];
  }
  const rows = parseMatrix(matrixText);
  const { units: stmts, refusals } = extract(skillText);
  const findings = [];

  // The table itself, before any row in it. A matrix whose header or delimiter
  // no longer carries every column is not the file the audit record lives in,
  // whatever its rows still say.
  const table = readMatrix(matrixText);

  // Whether this matrix may quote at all, before any row is read. An absent
  // declaration reads as `forbidden`, a second one lifts nothing, and one the
  // reader cannot find governs nothing either.
  const declared = readDeclaration(matrixText, table.header?.line ?? table.delimiter?.line ?? null);
  const unreadable = [
    ['belowTable', 'matrix-declaration-below-the-table',
      'sits under the table it governs. A reader looking for the state of this file reads '
      + 'its opening prose. Write it above the header row.'],
    ['inHtml', 'matrix-declaration-inside-html',
      'sits inside raw HTML, where a reader on GitHub may not see it at all. Write it as '
      + 'ordinary prose at column 0.'],
    ['equivocates', 'matrix-declaration-equivocates',
      'names a state and then names one again in its reason. The state is a binary, and '
      + '"permitted for some of it" is a qualification the check cannot read. Give one word, '
      + 'and write the reason without either word in it.'],
  ];
  for (const d of declared) {
    for (const [flag, code, why] of unreadable) {
      if (!d[flag]) continue;
      findings.push({
        level: 'error',
        code,
        message: `matrix line ${d.line}: the declaration ${why} Until then it declares nothing, `
          + 'and this matrix reads as forbidden.',
      });
    }
  }
  // What governs. A readable declaration governs, and so does an unreadable one
  // that says `forbidden`, because everywhere else here doubt reads as
  // forbidden and a badly written prohibition is still somebody prohibiting.
  // A state-blind filter had a clean `permitted` beating a misplaced or
  // equivocating `forbidden` above it, which is this design pointing backwards.
  const readable = declared.filter((d) => !d.belowTable && !d.inHtml && !d.equivocates);
  const governing = declared.filter((d) => readable.includes(d) || d.state === FORBIDDEN);
  const forbids = !governing.length || governing.some((d) => d.state === FORBIDDEN);
  if (!declared.length) {
    findings.push({
      level: 'error',
      code: 'matrix-no-quotation-declaration',
      message: 'the matrix does not declare whether it may quote its source. Write '
        + '`**Quotation:** permitted` or `**Quotation:** forbidden` at column 0, above the '
        + 'header row, with the reason beside it. Until it does, no row here may carry '
        + 'anything but `unquoted`.',
    });
  } else if (declared.length > 1) {
    // Every declaration, not the readable ones. Two lines are two lines, and
    // counting only the readable ones let a second declaration hide the fact
    // of itself by also being malformed.
    findings.push({
      level: 'error',
      code: 'matrix-two-quotation-declarations',
      message: `the matrix declares its quotation state ${declared.length} times, on line `
        + `${declared.map((d) => d.line).join(', ')}. Lift a prohibition by editing it and its `
        + 'reason, never by adding a line under it.',
    });
  }
  for (const r of table.refusals) {
    findings.push({
      level: 'error',
      code: 'unread-matrix-row',
      message: `matrix line ${r.line}: ${r.shape} is not read by this check. ${r.remedy}`,
    });
  }
  // An unclosed line is reported for what it is. The column count that follows
  // from it is an artifact, so it is not reported as well.
  const unclosed = (what, entry) => {
    if (entry.closed) return false;
    findings.push({
      level: 'error',
      code: 'matrix-row-unclosed',
      message: `matrix line ${entry.line}: the ${what} does not end with a pipe. `
        + 'GFM allows that and this check does not, because the text after the last '
        + 'pipe is dropped. End the line with a pipe.',
    });
    return true;
  };
  const named = (what, entry) => {
    if (unclosed(what, entry)) return;
    const cells = entry.cells;
    if (cells.length !== MATRIX_COLUMNS.length) {
      findings.push({
        level: 'error',
        code: `matrix-${what}-columns`,
        message: `the matrix ${what} carries ${cells.length} columns, not ${MATRIX_COLUMNS.length}. `
          + `The columns are: ${MATRIX_COLUMNS.join(', ')}.`,
      });
      return;
    }
    // Every heading, not only the audit's. The check named one column because
    // one column was the record. A second column now carries a claim about a
    // source, and a heading is what tells the reader which cell they are
    // reading, so renaming any of them loses a record the same way.
    if (what !== 'header') return;
    MATRIX_COLUMNS.forEach((name, i) => {
      if (cells[i] === name) return;
      findings.push({
        level: 'error',
        code: 'matrix-header-column-name',
        message: `the matrix names column ${i + 1} "${cells[i]}", not "${name}".`,
      });
    });
  };
  if (!table.delimiter) {
    // The cause matters more than the absence. An indented table has a
    // delimiter the check refused above, and "no table" sent the author
    // looking for a missing line rather than at the indentation.
    const why = table.refusals.length
      ? `Every line that looks like one was refused above, at line ${table.refusals.map((r) => r.line).join(', ')}.`
      : 'A row needs a header and a delimiter directly above it.';
    findings.push({
      level: 'error',
      code: 'matrix-no-table',
      message: `the matrix has no table this check can read. ${why}`,
    });
  } else {
    named('delimiter', table.delimiter);
    if (!table.header) {
      findings.push({
        level: 'error',
        code: 'matrix-no-header',
        message: table.detached
          ? `the matrix header does not sit directly above its delimiter on line ${table.delimiter.line}. `
            + 'GFM ends the table at the gap, so the reader sees no table.'
          : 'the matrix table has no header row above its delimiter.',
      });
    } else named('header', table.header);
  }
  // Anything below a gap. A second delimiter is called out on its own, because
  // this check binds ONE table, at the first delimiter, and a later one is the
  // shape that would make a different selection rule look reasonable.
  for (const stray of table.strays) {
    const second = table.delimiter && IS_DELIMITER(stray.cells);
    findings.push({
      level: 'error',
      code: second ? 'matrix-second-delimiter' : 'row-outside-the-table',
      message: second
        ? `matrix line ${stray.line}: a second delimiter. The matrix carries one table, `
          + `bound at the delimiter on line ${table.delimiter.line}.`
        : `matrix line ${stray.line}: this row does not sit in the table. GFM ends a table `
          + 'at the first blank line, heading, or break, so a row below one is not read.',
    });
  }
  for (const row of table.rows) unclosed('row', row);

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

    // The audit is checked on its own, not as another branch of the chain
    // above. A G row can both omit its rule and carry a stale audit, and both
    // are true findings. Folding them into one chain reported whichever came
    // first and hid the rest until it was fixed.
    if (!kind) return;
    const { state, day } = auditState(row, today);
    // The column is the format, not a courtesy a G row extends. A row that
    // does not carry the cell is refused whatever kind it is, because the
    // alternative is a matrix that quietly drops the column the moment it
    // cites no source.
    if (state === 'missing') {
      findings.push({
        level: 'error',
        code: 'row-missing-audit-cell',
        message: `${row.id}: the row has no Audited cell. Every row carries `
          + `${MATRIX_COLUMNS.length} columns, and only a G row fills the last two.`,
      });
      return;
    }
    // The quotation, on the same terms as the audit and for the same reason.
    // Only a G row cites a source, so only a G row has anything to quote from
    // one, and the cell is present on every row either way.
    if (kind === 'G') {
      const remedyQuote = 'Write `unquoted`, or the rule\'s own words in quotation marks.';
      // The prohibition first, and on its own. It is a fact about the source
      // rather than about this cell, so it holds whatever else the cell is,
      // and a well-formed quotation is exactly the case it exists to refuse.
      if (forbids && row.quote && row.quote !== UNQUOTED) {
        findings.push({
          level: 'error',
          code: 'quotation-forbidden-here',
          message: `${row.id}: this matrix may not quote its source, so the Source text cell `
            + `reads \`${UNQUOTED}\`. ${governing.some((d) => d.state === FORBIDDEN)
              ? `The declaration on line ${governing.find((d) => d.state === FORBIDDEN).line} says so`
              : 'The matrix declares nothing this check can read, which reads as forbidden'}. `
            + 'Changing that is a decision about the source, and it is made in the declaration.',
        });
      }
      if (!row.quote) {
        findings.push({
          level: 'error',
          code: 'g-row-no-quote',
          message: `${row.id}: a G row records whether it quotes its rule. ${remedyQuote}`,
        });
      } else if (row.quote !== UNQUOTED && !QUOTED.test(row.quote)) {
        // Unmarked text beside a rule identifier reads as the rule and may be
        // ours. The marks are what separate the source's words from our own,
        // so a cell that carries neither is refused rather than trusted.
        findings.push({
          level: 'error',
          code: 'quote-unmarked',
          message: `${row.id}: "${row.quote}" is neither \`${UNQUOTED}\` nor a quotation. `
            + `The cell opens and closes with a quotation mark, and the marks pair. ${remedyQuote}`,
        });
      }
    } else if (row.quote) {
      findings.push({
        level: 'error',
        code: 'e-row-has-quote',
        message: `${row.id}: only a G row quotes a source, because only a G row cites one.`,
      });
    }
    // A cell past the last is read by nobody and was refused by nobody. GFM drops it
    // from the render, so text could sit in a row that neither the checker nor
    // the person reading the matrix ever sees.
    if (row.extra.length) {
      findings.push({
        level: 'error',
        code: 'row-has-extra-cell',
        message: `${row.id}: the row carries ${MATRIX_COLUMNS.length + row.extra.length} columns, `
          + `not ${MATRIX_COLUMNS.length}. Nothing reads past the last, and no reader sees it.`,
      });
    }
    if (kind !== 'G') {
      if (state !== 'absent') {
        findings.push({
          level: 'error',
          code: 'e-row-has-audit',
          message: `${row.id}: only a G row records an audit, because only a G row cites a source.`,
        });
      }
      return;
    }
    const remedy = `Write \`${UNAUDITED}\`, or a date and \`${rowDigest(row)}\`.`;
    if (state === 'absent') {
      findings.push({
        level: 'error',
        code: 'g-row-no-audit',
        message: `${row.id}: a G row records its audit. ${remedy}`,
      });
    } else if (state === 'malformed') {
      findings.push({
        level: 'error',
        code: 'audit-malformed',
        message: `${row.id}: "${row.audit}" is not an audit. ${remedy}`,
      });
    } else if (state === 'ahead') {
      findings.push({
        level: 'error',
        code: 'audit-ahead-of-the-check',
        message: `${row.id}: ${day} has not happened yet on ${today}, `
          + `so nobody read this row that day. ${remedy}`,
      });
    } else if (state === 'stale') {
      findings.push({
        level: 'error',
        code: 'audit-stale',
        message: `${row.id}: the row changed since ${day}, so its audit describes other `
          + `words. Read it against the source again and write \`${rowDigest(row)}\`, `
          + `or write \`${UNAUDITED}\`.`,
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

  // Last, and at a level that fails nothing. `Grounding clean.` printed over a
  // matrix where nobody has read a single row against its source is the whole
  // of what issue 40 reports, and a check that failed on it would be red for
  // every matrix from the day it landed. So the run says the number out loud
  // instead, beside the verdict, where a reader cannot mistake one for the
  // other. A matrix with no G row claims no source, so it gets no line.
  // A ratio computed over a table the reader cannot see is this decision's own
  // defect one level out: it reports on a file nobody has. So when the
  // container is broken the count is withheld rather than printed, because a
  // wrong number here is worse than no number. It also covers the fenced row,
  // which silently rebased the denominator to `1 of 1`.
  //
  // The list is written out, one code at a time, and it is not a prefix match.
  // A prefix was the first version, and it read `matrix-` as "about the table".
  // It is not: `matrix-` names the FILE, and the declaration lives in that file
  // above the table. So the five declaration findings withheld both counts and
  // said the table was broken over a table nobody had touched. A code added
  // later would inherit that by spelling, which is the defect renewing itself,
  // and a name is the wrong thing to carry this. Each code here describes the
  // container the reader sees: the header, the delimiter, the rows' place in
  // the block, and the lines that look like rows and are not read.
  const BROKEN = new Set([
    'matrix-no-table',
    'matrix-no-header',
    'matrix-header-columns',
    'matrix-delimiter-columns',
    'matrix-header-column-name',
    'matrix-second-delimiter',
    'matrix-row-unclosed',
    'unread-matrix-row',
    'row-outside-the-table',
  ]);
  const broken = findings.some((f) => BROKEN.has(f.code));
  const sourced = rows.filter((r) => /^G-/i.test(r.id));
  if (broken) {
    findings.push({
      level: 'note',
      code: 'audit-coverage',
      message: 'not counted: the matrix table is broken.',
    });
    findings.push({
      level: 'note',
      code: 'quote-coverage',
      message: 'not counted: the matrix table is broken.',
    });
  } else if (sourced.length) {
    findings.push({
      level: 'note',
      code: 'audit-coverage',
      message: `${sourced.filter((r) => auditState(r, today).state === 'recorded').length} `
        + `of ${sourced.length} G rows record a person reading them against the source.`,
    });
    // The second number the verdict cannot carry. A reader holds the
    // substitution limit, and they cannot hold it against a file they have to
    // count by hand. It rises as rows are quoted and it is a note either way:
    // an unquoted matrix is honest, and a fully quoted one is a judgment about
    // republishing that no threshold here can make.
    findings.push({
      level: 'note',
      code: 'quote-coverage',
      // A cell the check refused is not a quotation, so it is not counted as
      // one. Counting every cell that merely differed from `unquoted` let a
      // malformed cell — an empty pair, or our own unmarked paraphrase —
      // raise the number that reports how much of the source this file carries.
      //
      // The prohibition refuses cells too, and the first version of this rule
      // applied it to one refusal and not the other: a forbidden matrix
      // reported `1 of 39` beside the finding that refused that very cell. A
      // count that contradicts the finding above it is worse than either.
      message: `${forbids ? 0 : sourced.filter((r) => r.quote && QUOTED.test(r.quote)).length} `
        + `of ${sourced.length} G rows carry the source's own words.`,
    });
  }

  return findings;
}

export async function checkAll(repoRoot, { now } = {}) {
  const out = {};
  for (const skill of await loadCatalog(repoRoot)) {
    const skillText = await fs.readFile(path.join(skill.dir, 'SKILL.md'), 'utf8');
    let matrixText = null;
    try {
      matrixText = await fs.readFile(skill.groundingPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    out[skill.name] = checkSkill({ skillText, matrixText, now });
  }
  return out;
}
