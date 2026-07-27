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

function statements(skillText) {
  const out = [];
  for (const sec of sections(skillText)) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    for (const line of sec.body.split('\n')) {
      const m = /^\s*[-*+]\s+(.*\S)\s*$/.exec(line);
      if (m) out.push({ text: m[1], anchor: sec.heading });
    }
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
    const isG = /^G-/i.test(row.id);
    if (isG && !row.rule) {
      findings.push({
        level: 'error',
        code: 'g-row-no-rule',
        message: `${row.id}: a G row must cite a source rule.`,
      });
    }
    if (!isG && row.rule) {
      findings.push({
        level: 'error',
        code: 'e-row-has-rule',
        message: `${row.id}: an E row is our own guidance and must cite no source rule.`,
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
