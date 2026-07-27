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

export function sections(text) {
  const lines = text.split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) heads.push({ level: m[1].length, heading: m[2], startLine: i + 1 });
  });
  return heads.map((h, i) => {
    const endLine = i + 1 < heads.length ? heads[i + 1].startLine - 1 : lines.length;
    return { ...h, endLine, body: lines.slice(h.startLine, endLine).join('\n') };
  });
}
