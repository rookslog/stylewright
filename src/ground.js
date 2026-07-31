import fs from 'node:fs/promises';
import path from 'node:path';
import { sections } from './markdown.js';
import { loadCatalog } from './catalog.js';

const SKIP_HEADINGS = /^(source|source and boundary|boundary|notice|grounding)$/i;

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
 * Every unit of content a graded section carries, not every unit that looks
 * normative.
 *
 * This used to match one shape — a `-` bullet on a single line — and call the
 * result "every statement". The skill above it claimed every statement was
 * traced to a rule, so four numbered priorities and a prose directive entered a
 * standards skill unclassified and `ground --check` reported clean. Widening
 * the pattern to numbered items would have moved that boundary rather than
 * removed it, and the next shape to slip through would have been a definition
 * list.
 *
 * So the checker no longer decides what counts as a statement. It accounts for
 * everything, and the matrix disposes of each unit as `G` (the source's
 * authority), `E` (our own guidance), or `N` (narrative that claims neither).
 * Classification is a judgment somebody recorded, not a shape a regular
 * expression recognised.
 *
 * A wrapped list item is ONE unit. Reading its first line alone let the rest of
 * the item change without the matrix noticing, which is the same defect one
 * level down.
 */
function statements(skillText) {
  const out = [];
  for (const sec of sections(skillText)) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    let para = [];
    let item = null;
    let inFence = false;
    const flush = () => {
      if (para.length) out.push({ text: para.join(' '), anchor: sec.heading });
      para = [];
      item = null;
    };
    for (const line of sec.body.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) { flush(); inFence = !inFence; continue; }
      if (inFence) continue;
      // A table is reference data the reader looks things up in, and a heading
      // names a section rather than asserting anything.
      if (!line.trim() || /^\s*\|/.test(line) || /^#{1,6}\s/.test(line)) { flush(); continue; }
      const m = /^\s*(?:[-*+]|\d+\.)\s+(.*\S)\s*$/.exec(line);
      if (m) {
        flush();
        item = { text: m[1], anchor: sec.heading };
        out.push(item);
        continue;
      }
      // Lazy continuation. Prose under a list item belongs to that item.
      if (item) item.text += ` ${line.trim()}`;
      else para.push(line.trim());
    }
    flush();
  }
  return out;
}

export function checkSkill({ skillText, matrixText }) {
  if (matrixText === null || matrixText === undefined) {
    return [{ level: 'error', code: 'no-matrix', message: 'Skill has no grounding matrix.' }];
  }
  const rows = parseMatrix(matrixText);
  const stmts = statements(skillText);
  const findings = [];

  for (const row of rows) {
    const hit = stmts.find((s) => s.text === row.guidance);
    if (!hit) {
      findings.push({
        level: 'error',
        code: 'missing-quote',
        message: `${row.id}: "${row.guidance}" no longer appears in SKILL.md.`,
      });
      continue;
    }
    if (hit.anchor !== row.anchor) {
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
  }

  const covered = new Set(rows.map((r) => r.guidance));
  for (const s of stmts) {
    if (!covered.has(s.text)) {
      findings.push({
        level: 'error',
        code: 'uncovered-statement',
        message: `"${s.text}" (under "${s.anchor}") has no grounding row.`,
      });
    }
  }
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
