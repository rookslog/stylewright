import { stripNonProse, sections } from './markdown.js';

const CONTRACTIONS = /\b(?:can't|don't|doesn't|won't|isn't|aren't|it's|that's|we're|you're|didn't|hasn't|haven't|wouldn't|couldn't|shouldn't|let's|there's|here's|what's|who's|they're|I'm|we've|you've|they've)\b/i;
const NON_IMPERATIVE_FIRST = /^(?:the|a|an|this|that|these|those|it|he|she|they|we|you|i)$/i;

const PROCEDURAL_HEADING = /procedure|steps|instructions/i;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function proceduralLines(text) {
  const set = new Set();
  for (const sec of sections(text)) {
    if (!PROCEDURAL_HEADING.test(sec.heading)) continue;
    for (let n = sec.startLine; n <= sec.endLine; n++) set.add(n);
  }
  return set;
}

export function lintText(text, { procedural = false } = {}) {
  const prose = stripNonProse(text);
  const proceduralZone = proceduralLines(text);
  const findings = [];
  const lines = prose.split('\n');

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    if (!rawLine.trim()) return;
    if (/^\s*#{1,6}\s/.test(rawLine)) return;

    const ordered = ORDERED_ITEM.exec(rawLine);
    const isStep = Boolean(ordered);
    const limit = (procedural || isStep || proceduralZone.has(line)) ? 20 : 25;

    if (rawLine.includes(';')) {
      findings.push({ line, rule: 'semicolon', message: 'Do not use semicolons.' });
    }
    const contraction = CONTRACTIONS.exec(rawLine);
    if (contraction) {
      findings.push({
        line,
        rule: 'contraction',
        message: `Do not use the contraction "${contraction[0]}".`,
      });
    }

    for (const part of rawLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []) {
      const body = ORDERED_ITEM.exec(part)?.[1] ?? part.replace(/^\s*[-*+]\s+/, '');
      const n = wordCount(body);
      if (n > limit) {
        findings.push({
          line,
          rule: 'sentence-length',
          message: `Sentence has ${n} words. The limit here is ${limit}.`,
        });
      }
    }

    if (isStep) {
      const first = ordered[1].trim().split(/\s+/)[0]?.replace(/[^A-Za-z']/g, '') ?? '';
      if (/ing$/i.test(first) || NON_IMPERATIVE_FIRST.test(first)) {
        findings.push({
          line,
          rule: 'imperative',
          message: `Start a step with an imperative verb. Found "${first}".`,
        });
      }
    }
  });

  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}
