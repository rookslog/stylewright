const blank = (s) => ' '.repeat(s.length);

export function stripNonProse(text) {
  const lines = text.split('\n');
  let inFence = false;
  const out = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return blank(line);
    }
    if (inFence) return blank(line);
    if (/^\s*\|.*\|\s*$/.test(line)) return blank(line);
    // A blockquote is quoted material, not our prose. Before-and-after guides
    // quote deliberately bad text, so linting it reports the wrong thing.
    if (/^\s*>/.test(line)) return blank(line);
    return line
      .replace(/`[^`]*`/g, blank)
      .replace(/\]\([^)]*\)/g, (m) => `]${blank(m.slice(1))}`)
      .replace(/^\s*\[[^\]]+\]:.*$/g, blank);
  });
  return out.join('\n');
}

export function sentences(text) {
  const results = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^#{1,6}\s/.test(trimmed)) return;
    const parts = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    for (const part of parts) {
      if (part.trim()) results.push({ text: part.trim(), line: i + 1 });
    }
  });
  return results;
}

/**
 * Front matter, blanked in place. The lines stay so that every offset below
 * still points where it did, and nothing inside them can be read as prose. It
 * matters here because a closing `---` sitting under `description: ...` is
 * exactly the shape of a setext heading.
 */
function maskFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return lines;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return lines;
  return lines.map((l, i) => (i <= close ? '' : l));
}

const SETEXT = /^\s{0,3}(=+|-+)\s*$/;

export function sections(text) {
  const lines = maskFrontMatter(text.split('\n'));
  const heads = [];
  // A `#` inside a fence is a comment in somebody's shell script, not a
  // heading. Reading it as one splits a section in the middle of the block.
  // A fence closes only on its own marker, at least as long as the opener, so
  // a four-backtick block quoting a three-backtick one stays one block.
  let marker = null;
  lines.forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      if (!marker) marker = f[1];
      else if (f[1][0] === marker[0] && f[1].length >= marker.length && !f[2].trim()) marker = null;
      return;
    }
    if (marker) return;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) {
      heads.push({ level: m[1].length, heading: m[2], startLine: i + 1 });
      return;
    }
    // A setext heading. `Rules` over `=====` is a heading, and reading it as
    // prose put every rule below it under the PREVIOUS section's anchor, so a
    // matrix naming the wrong anchors still passed.
    const under = SETEXT.exec(line);
    const above = i > 0 ? lines[i - 1] : '';
    if (under && above.trim() && !SETEXT.test(above) && !/^\s*[-*+|>]|^\s*\d+[.)]/.test(above)
      && !/^(#{1,6})\s/.test(above)) {
      // `startLine` is the underline, because the body begins after it.
      // `firstLine` is the text above, because the PREVIOUS section ends
      // before it — otherwise the heading text is also read as its prose.
      heads.push({
        level: under[1][0] === '=' ? 1 : 2,
        heading: above.trim(),
        startLine: i + 1,
        firstLine: i - 1,
      });
    }
  });
  return heads.map((h, i) => {
    const next = heads[i + 1];
    const endLine = next ? (next.firstLine ?? next.startLine - 1) : lines.length;
    return { ...h, endLine, body: lines.slice(h.startLine, endLine).join('\n') };
  });
}
