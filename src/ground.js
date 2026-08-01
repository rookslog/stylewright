import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { sections } from './markdown.js';
import { loadCatalog } from './catalog.js';

export function parseMatrix(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
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

function unitsIn(body, anchor) {
  const out = [];
  let para = [];
  let item = null;
  let block = null;
  const push = (text, isBlock = false) => out.push({ text, anchor, block: isBlock });
  const closeBlock = () => {
    if (!block) return;
    push(`[${block.kind} ${digest(block.lines.join('\n'))}]`, true);
    block = null;
  };
  const flush = () => {
    if (para.length) push(para.join(' '));
    para = [];
    item = null;
  };
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (block?.kind === 'code') { closeBlock(); continue; }
      flush();
      closeBlock();
      block = { kind: 'code', lines: [] };
      continue;
    }
    if (block?.kind === 'code') { block.lines.push(line); continue; }
    if (/^\s*\|/.test(line)) {
      if (!block) { flush(); block = { kind: 'table', lines: [] }; }
      block.lines.push(line.trim());
      continue;
    }
    if (block) closeBlock();
    if (!line.trim()) { flush(); continue; }
    const m = /^\s*(?:[-*+]|\d+\.)\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flush();
      item = { text: m[1], anchor, block: false };
      out.push(item);
      continue;
    }
    // Lazy continuation. Prose under a list item belongs to that item.
    if (item) item.text += ` ${line.trim()}`;
    else para.push(line.trim());
  }
  flush();
  // A block nobody closed still holds content, so it still needs a row.
  closeBlock();
  return out;
}

/** Front matter, removed. Everything after it is instruction for a reader. */
function withoutFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return text;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return close === -1 ? text : lines.slice(close + 1).join('\n');
}

export function contentUnits(skillText) {
  const body = withoutFrontMatter(skillText);
  const secs = sections(body);
  const lines = body.split('\n');
  const firstHeading = secs.length ? secs[0].startLine - 1 : lines.length;
  const out = unitsIn(lines.slice(0, firstHeading).join('\n'), PREAMBLE);
  for (const sec of secs) {
    // The heading is a unit of its own. It was the anchor and nothing else, so
    // a heading that gave an instruction was never disposed of by any row.
    out.push({ text: sec.heading, anchor: sec.heading, block: false });
    out.push(...unitsIn(sec.body, sec.heading));
  }
  return out;
}

export function checkSkill({ skillText, matrixText }) {
  if (matrixText === null || matrixText === undefined) {
    return [{ level: 'error', code: 'no-matrix', message: 'Skill has no grounding matrix.' }];
  }
  const rows = parseMatrix(matrixText);
  const stmts = contentUnits(skillText);
  const findings = [];

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
