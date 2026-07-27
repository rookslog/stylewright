import { stripNonProse, sections } from './markdown.js';

const CONTRACTIONS = /\b(?:can't|don't|doesn't|won't|isn't|aren't|it's|that's|we're|you're|didn't|hasn't|haven't|wouldn't|couldn't|shouldn't|let's|there's|here's|what's|who's|they're|I'm|we've|you've|they've)\b/i;
const NON_IMPERATIVE_FIRST = /^(?:the|a|an|this|that|these|those|it|he|she|they|we|you|i)$/i;

const PROCEDURAL_HEADING = /procedure|steps|instructions/i;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
// A numbered item whose whole content is one link is navigation, such as a
// table of contents. It is not an instruction, so the imperative rule is wrong
// for it. stripNonProse has already blanked the link target by this point.
const LINK_ONLY_ITEM = /^\s*\[[^\]]*\]\s*$/;

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
    // Rules 5.1 and 5.3 sit in Section 5, "Procedures". They govern
    // instructions. A numbered list in a requirements or reference section is
    // not a procedure, so the 20-word cap and the imperative rule do not reach
    // it. Section 6 governs descriptive text at 25 words.
    const inProcedure = procedural || proceduralZone.has(line);
    const isStep = Boolean(ordered) && inProcedure;
    const limit = inProcedure ? 20 : 25;

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

    if (isStep && !LINK_ONLY_ITEM.test(ordered[1])) {
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
