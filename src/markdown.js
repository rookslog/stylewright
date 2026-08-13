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

/**
 * A setext underline, as far as its own characters go. Where it may stand is
 * the column rule's question, and the caller asks that separately, because a
 * pattern that counted whitespace CHARACTERS read a tab as one column: `Rules`
 * over a tab and three dashes became a heading here while a Markdown reader
 * kept both lines as one paragraph, and every anchor below it moved.
 */
const SETEXT = /^[ \t]*(=+|-+)[ \t]*$/;

/**
 * The column an offset in the line sits at, where a tab advances to the next
 * stop of four.
 *
 * It lives here because every reading of a file needs it and they must agree:
 * the section scan closed a fence on a marker indented four columns while the
 * grounding walk read that marker as the block's own contents, so one file had
 * two readings and a heading inside a code block became a section.
 *
 * `indentOf` is this measured to the first character that is neither a space
 * nor a tab. The padding after a list marker is this measured across two
 * offsets, and it is a column count for the same reason an indent is: a tab
 * after a marker widens the gap by up to four, and counting it as one
 * character read a nested code block as the item's own prose.
 */
export const TAB = 4;
export function columnOf(line, index) {
  let n = 0;
  for (let i = 0; i < index && i < line.length; i += 1) {
    n += line[i] === '\t' ? TAB - (n % TAB) : 1;
  }
  return n;
}
export function indentOf(line) {
  let i = 0;
  while (line[i] === ' ' || line[i] === '\t') i += 1;
  return columnOf(line, i);
}
export const isIndented = (line) => indentOf(line) >= TAB;

export function sections(text) {
  const lines = maskFrontMatter(text.split('\n'));
  const heads = [];
  // A `#` inside a fence is a comment in somebody's shell script, not a
  // heading. Reading it as one splits a section in the middle of the block.
  // A fence closes only on its own marker, at least as long as the opener, so
  // a four-backtick block quoting a three-backtick one stays one block.
  let marker = null;
  lines.forEach((line, i) => {
    // A marker indented four columns is code, not a fence. As a closer it is
    // the block's own contents, and as an opener it is a line inside an
    // indented code block. Reading either as a fence gave one file two
    // readings: a heading below the marker opened a section from inside a code
    // block, and a marker inside an indented example suppressed every heading
    // after it.
    const f = isIndented(line) ? null : /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      if (!marker) marker = f[1];
      else if (f[1][0] === marker[0]
        && f[1].length >= marker.length && !f[2].trim()) marker = null;
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
    //
    // An underline indented four columns is not one. A Markdown reader keeps
    // that line as the paragraph's own words, because indented code cannot
    // interrupt a paragraph and an underline may carry three columns at most.
    // The indent is measured in columns here, by the rule the fence above
    // obeys, so a tab counts for what it is worth to a reader.
    const under = isIndented(line) ? null : SETEXT.exec(line);
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
