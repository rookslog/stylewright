/**
 * Checks the front matter of every document under docs/.
 *
 * A document states what it is in YAML front matter, and this script refuses
 * what the schema refuses, so metadata is checked and not a style argument.
 * CONTRIBUTING.md documents the schema. The supersede check reads both ends
 * of every link, because a one-ended supersession leaves a stale document
 * that claims to be current.
 *
 * This lives in `scripts/` and not in `src/`, because `package.json`
 * publishes `src` to npm and nobody who installs the package needs this.
 */

export const TYPES = ['spec', 'plan', 'adr'];
export const STATUSES = ['draft', 'review', 'accepted', 'shipped', 'superseded'];
export const KEYS = ['type', 'status', 'issues', 'supersedes', 'superseded-by', 'decided'];

const DIR_FOR = { spec: 'docs/specs', plan: 'docs/plans', adr: 'docs/adr' };
const DATED_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/;
const NUMBERED_NAME = /^\d{4}-[a-z0-9][a-z0-9-]*\.md$/;
const ISSUE_LIST = /^\[\d+(, \d+)*\]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns `{ fields, problems }`. Parsing never throws, because the runner
 * reports every file in one pass instead of stopping at the first.
 */
export function parseFrontMatter(text) {
  const problems = [];
  const fields = {};
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { fields, problems: ['no front matter. The file must open with `---`.'] };
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) {
    return { fields, problems: ['front matter never closes. A second `---` is missing.'] };
  }
  for (const line of lines.slice(1, close)) {
    if (!line.trim()) continue;
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (!kv) {
      problems.push(`unreadable front matter line: "${line.trim()}"`);
      continue;
    }
    if (!KEYS.includes(kv[1])) {
      problems.push(`unknown front matter key "${kv[1]}". The schema allows: ${KEYS.join(', ')}.`);
      continue;
    }
    fields[kv[1]] = kv[2].trim();
  }
  return { fields, problems };
}

/** Checks one document against the schema. Returns a list of problems. */
export function checkDoc(relPath, text) {
  const { fields, problems } = parseFrontMatter(text);
  if (problems.length && !Object.keys(fields).length) return problems;

  const name = relPath.split('/').pop();

  if (!fields.type) problems.push('front matter has no type.');
  else if (!TYPES.includes(fields.type)) {
    problems.push(`type "${fields.type}" is not one of: ${TYPES.join(', ')}.`);
  } else {
    const dir = DIR_FOR[fields.type];
    if (!relPath.startsWith(`${dir}/`)) {
      problems.push(`a ${fields.type} lives under ${dir}/, not here.`);
    }
    if (fields.type === 'adr') {
      if (!NUMBERED_NAME.test(name)) {
        problems.push('an adr file is named NNNN-slug.md.');
      }
      if (!fields.decided) problems.push('an adr states when it was decided.');
    } else {
      if (!DATED_NAME.test(name)) {
        problems.push(`a ${fields.type} file is named YYYY-MM-DD-slug.md.`);
      }
      if (fields.decided) {
        problems.push('only an adr carries decided. The filename dates everything else.');
      }
    }
  }

  if (!fields.status) problems.push('front matter has no status.');
  else if (!STATUSES.includes(fields.status)) {
    problems.push(`status "${fields.status}" is not one of: ${STATUSES.join(', ')}.`);
  }

  if (fields.issues && !ISSUE_LIST.test(fields.issues)) {
    problems.push('issues is a bracketed list of numbers, such as [21, 43].');
  }
  if (fields.decided && !DATE.test(fields.decided)) {
    problems.push('decided is a date, YYYY-MM-DD.');
  }

  const superseded = fields.status === 'superseded';
  if (superseded && !fields['superseded-by']) {
    problems.push('a superseded document names its successor in superseded-by.');
  }
  if (!superseded && fields['superseded-by']) {
    problems.push('superseded-by requires status: superseded.');
  }

  return problems;
}

/**
 * Checks every document, then checks both ends of every supersede link.
 * `docs` maps a repository-relative path to its text.
 */
export function checkCorpus(docs) {
  const problems = [];
  const parsed = new Map();
  for (const [relPath, text] of docs) {
    for (const p of checkDoc(relPath, text)) problems.push(`${relPath}: ${p}`);
    parsed.set(relPath, parseFrontMatter(text).fields);
  }
  for (const [relPath, fields] of parsed) {
    if (fields.supersedes) {
      const target = parsed.get(fields.supersedes);
      if (!target) {
        problems.push(`${relPath}: supersedes ${fields.supersedes}, which does not exist.`);
      } else if (target['superseded-by'] !== relPath) {
        problems.push(
          `${relPath}: supersedes ${fields.supersedes}, but that document does not `
          + 'point back with superseded-by.');
      }
    }
    if (fields['superseded-by']) {
      const successor = parsed.get(fields['superseded-by']);
      if (!successor) {
        problems.push(
          `${relPath}: superseded-by ${fields['superseded-by']}, which does not exist.`);
      } else if (successor.supersedes !== relPath) {
        problems.push(
          `${relPath}: superseded-by ${fields['superseded-by']}, but that document `
          + 'does not claim it with supersedes.');
      }
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, readdirSync } = await import('node:fs');
  const path = await import('node:path');
  const docs = new Map();
  for (const entry of readdirSync('docs', { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const rel = path.join('docs', path.relative('docs', path.join(entry.parentPath, entry.name)));
    docs.set(rel.split(path.sep).join('/'), readFileSync(rel, 'utf8'));
  }
  const problems = checkCorpus(docs);
  for (const p of problems) process.stderr.write(`${p}\n`);
  if (problems.length) process.exit(1);
  process.stdout.write(`Docs metadata clean. ${docs.size} documents checked.\n`);
}
