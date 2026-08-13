/**
 * Checks the editorial audit record in `editorial/AUDITS.md`.
 *
 * `stylewright lint` cannot see the defects the craft skills name. `de-slop`
 * says so in its own `What a check can see` section, and ADR-0021 holds that
 * the discipline lives in a writer or a reviewer rather than in a matcher. So
 * this script checks the RECORD of a reading and never the prose. It refuses a
 * malformed row, a document the list does not govern, a document stamped
 * twice, and a day that never happened or that lies ahead of the run.
 *
 * It prints two notes, `editorial-coverage` and `editorial-staleness`, and
 * both fail nothing. Do not promote either to an error, and do not remove
 * either to quiet the output. That is the disposition `ground --check` already
 * gives `audit-coverage` and `quote-coverage`, and for the same reason: a
 * green run over prose nobody has read is what the count is the answer to.
 * ADR-0027 records the decision.
 *
 * The governed list is a constant HERE and not a section of the record,
 * because a list the record carries is a denominator the record can shrink.
 * `bench/study.mjs` names its scorer as a literal for the same reason.
 *
 * This lives in `scripts/` and not in `src/`, because it owns the exit code
 * and the clock, and nobody who installs the package needs it.
 */
import crypto from 'node:crypto';
import { dayOf, isRealDate } from '../src/ground.js';

/** The columns the record carries, in order. Each is checked by name. */
export const COLUMNS = ['Document', 'Read', 'Digest'];

/**
 * The documents a reading is recorded for.
 *
 * These are the prose a reader meets and that we rewrite. `docs/` is out
 * because a past ADR keeps its wording, so a stamp there would go stale by
 * design. `skills/` is out because a grounding matrix already disposes of
 * every unit in one, and that record has its own audit column. Widening this
 * list is a one-line change, and ADR-0027 states what widening costs.
 */
export const GOVERNED = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'bench/README.md',
];

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
// Every CommonMark HTML block opens with a line whose first non-space
// character is `<`, so this catches every one of them without modelling which
// ones swallow what follows. The record is prose and one table, and it needs
// no raw HTML, so the whole file refuses it rather than the check deciding
// which hiding places matter.
const RAW_HTML = /^\s*</;
const DELIMITER = /^\|(\s*:?-+:?\s*\|)+$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIGEST = /^[0-9a-f]{8}$/;
const ENDS_TABLE = /^(\s*$|#{1,6}\s|(\*\s*){3,}$|(-\s*){3,}$|(_\s*){3,}$)/;

/**
 * The first eight hex characters of a SHA-256 digest of the document, as the
 * reader read it. `src/ground.js` truncates the same way for a row, and the
 * two are deliberately separate: that digest names five cells, and this one
 * names a whole file.
 */
export const digestOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);

const cellsOf = (line) => line.slice(1, -1).split('|').map((c) => c.trim());

/**
 * Reads the record's table.
 *
 * `broken` is what withholds the notes. A count taken over a table the reader
 * cannot see reports on a file nobody has, so a wrong number is worse than no
 * number. The rule and its wording come from `ground --check`.
 *
 * Fenced content is skipped, so an example in this repository's documents
 * cannot bind. This is not `readMatrix`, and it shares no grammar with it.
 */
export function readRecord(text) {
  const problems = [];
  const rows = [];
  const lines = text.split('\n');
  const fenced = new Array(lines.length).fill(false);
  let open = null;
  lines.forEach((line, i) => {
    const fence = FENCE.exec(line);
    if (open === null && fence) {
      open = fence[1];
      fenced[i] = true;
    } else if (open !== null) {
      fenced[i] = true;
      // A fence closes on a run of the same character at least as long as the
      // one that opened it. Reading the first character alone let a shorter
      // line reopen the file, and a table below it bound.
      const closes = fence && fence[1][0] === open[0] && fence[1].length >= open.length
        && !fence[2].trim();
      if (closes) open = null;
    }
  });

  const html = lines.findIndex((line, i) => !fenced[i] && RAW_HTML.test(line));
  if (html !== -1) {
    problems.push({
      code: 'record-has-raw-html',
      message: `line ${html + 1} opens raw HTML. A table inside an HTML comment or a `
        + 'collapsed block is a table no reader sees, so this record carries no raw HTML '
        + 'at all. Write it as prose.',
    });
    return { rows, problems, broken: true };
  }

  const delimiters = lines
    .map((line, i) => (!fenced[i] && DELIMITER.test(line.trim()) ? i : -1))
    .filter((i) => i !== -1);

  if (!delimiters.length) {
    problems.push({
      code: 'record-has-no-table',
      message: 'the record carries no table. It opens with a header row and a delimiter, '
        + `spelled \`| ${COLUMNS.join(' | ')} |\`.`,
    });
    return { rows, problems, broken: true };
  }

  const at = delimiters[0];
  const header = at > 0 ? lines[at - 1] : '';
  if (!header.startsWith('|') || !header.trimEnd().endsWith('|')) {
    problems.push({
      code: 'record-heading-renamed',
      message: 'the line above the delimiter is not a header row. The header sits directly '
        + 'above the delimiter, at column 0, and it opens and closes with a pipe.',
    });
    return { rows, problems, broken: true };
  }
  const headings = cellsOf(header.trimEnd());
  if (headings.length !== COLUMNS.length
    || cellsOf(lines[at].trim()).length !== COLUMNS.length) {
    problems.push({
      code: 'record-columns-wrong',
      message: `the header and the delimiter each carry ${COLUMNS.length} columns. `
        + 'GFM drops a column the two disagree about, so the reader loses what it held.',
    });
    return { rows, problems, broken: true };
  }
  for (const [i, name] of COLUMNS.entries()) {
    if (headings[i] !== name) {
      problems.push({
        code: 'record-heading-renamed',
        message: `column ${i + 1} of the record is \`${name}\`, not \`${headings[i]}\`. `
          + 'The column the reader sees is the column that counts.',
      });
      return { rows, problems, broken: true };
    }
  }

  let end = at + 1;
  let broken = false;
  for (; end < lines.length; end++) {
    const line = lines[end];
    if (ENDS_TABLE.test(line)) break;
    if (/^\s+\|/.test(line)) {
      problems.push({
        code: 'row-indented',
        message: `line ${end + 1} is indented. GFM reads an indented row as text, so a row `
          + 'begins at column 0.',
      });
      broken = true;
      continue;
    }
    if (!line.startsWith('|') || !line.endsWith('|')) {
      problems.push({
        code: 'row-not-closed',
        message: `line ${end + 1} does not end in a pipe. GFM drops the text after the last `
          + 'pipe, so the row the reader sees is not the row that was written.',
      });
      broken = true;
      continue;
    }
    const cells = cellsOf(line);
    if (cells.length !== COLUMNS.length) {
      problems.push({
        code: 'row-wrong-width',
        message: `line ${end + 1} carries ${cells.length} cells and the record carries `
          + `${COLUMNS.length}. GFM drops the rest, so nobody reads what stands there.`,
      });
      broken = true;
      continue;
    }
    rows.push({ document: cells[0], read: cells[1], digest: cells[2], line: end + 1 });
  }

  const later = delimiters.find((i) => i >= end);
  if (later !== undefined) {
    problems.push({
      code: 'record-has-a-second-table',
      message: `line ${later + 1} opens a second table. The record is one table, and a check `
        + 'that rebound to a later one would read rows the first table never held.',
    });
    broken = true;
  } else {
    // GFM ends a table at the first blank line, so a row below one is text to
    // the reader and was a recorded reading to this check. Dropping it shrank
    // the count, which is the `unread-matrix-row` defect one file over.
    for (let i = end; i < lines.length; i++) {
      if (fenced[i] || !lines[i].trim().startsWith('|')) continue;
      problems.push({
        code: 'unread-record-row',
        message: `line ${i + 1} looks like a row and sits outside the table. The table runs `
          + 'unbroken from the line below the delimiter, and a blank line ends it.',
      });
      broken = true;
    }
  }
  return { rows, problems, broken };
}

/**
 * What a row's stamp amounts to, read once and used twice. The findings and
 * the notes below would otherwise disagree about a row, which is the defect
 * `ground --check` fixed one file over.
 */
function stampState(row, today, current) {
  const day = DAY.exec(row.read);
  if (!day || !isRealDate(Number(day[1]), Number(day[2]), Number(day[3]))
    || !DIGEST.test(row.digest)) {
    return { state: 'malformed' };
  }
  // Zero-padded ISO days sort as text, so this needs no date arithmetic.
  if (row.read > today) return { state: 'ahead' };
  return { state: row.digest === current ? 'read' : 'stale' };
}

/**
 * Checks the record against the documents it governs.
 *
 * `documents` maps a repository-relative path to its text. `now` is the UTC
 * moment the command line hands in, and a caller that omits it is refused
 * rather than defaulted, for the reason `checkSkill` gives: the one thing this
 * value does is reject a stamp dated in the future.
 */
export function checkRecord({ recordText, documents, now }) {
  const today = dayOf(now);
  const { rows, problems, broken } = readRecord(recordText);
  const stamped = new Map();

  for (const name of GOVERNED) {
    if (!documents.has(name)) {
      problems.push({
        code: 'governed-document-absent',
        message: `${name} is governed and the repository does not carry it. A governed `
          + 'document that moved is a change to the list in `scripts/check-editorial.mjs`.',
      });
    }
  }

  for (const row of rows) {
    if (!GOVERNED.includes(row.document)) {
      problems.push({
        code: 'ungoverned-document',
        message: `line ${row.line} stamps ${row.document}, which the list does not govern. `
          + 'Add it to `GOVERNED` in `scripts/check-editorial.mjs` first.',
      });
      continue;
    }
    if (stamped.has(row.document)) {
      problems.push({
        code: 'document-stamped-twice',
        message: `line ${row.line} stamps ${row.document} a second time. One row states the `
          + 'reading, so no reader has to pick between two.',
      });
      continue;
    }
    const { state } = stampState(row, today, digestOf(documents.get(row.document) ?? ''));
    if (state === 'malformed') {
      problems.push({
        code: 'stamp-malformed',
        message: `line ${row.line} does not state a reading. \`Read\` is a UTC day the `
          + 'calendar carries, and `Digest` is the first eight hex characters of the '
          + 'document you read.',
      });
      continue;
    }
    if (state === 'ahead') {
      problems.push({
        code: 'stamp-ahead-of-the-check',
        message: `line ${row.line} is dated ${row.read}, which is ahead of ${today}. Nobody `
          + 'read a document on a day that has not happened.',
      });
      continue;
    }
    stamped.set(row.document, state);
  }

  // Withheld together when the table is broken. One number printed beside one
  // withheld would tell a reader the table is readable after all.
  if (broken) return { problems, notes: [] };

  const moved = [...stamped].filter(([, state]) => state === 'stale').map(([name]) => name);
  const notes = [
    {
      code: 'editorial-coverage',
      message: `${stamped.size} of ${GOVERNED.length} governed documents carry an editorial `
        + 'audit.',
    },
    {
      code: 'editorial-staleness',
      message: moved.length
        ? `${moved.length} of ${stamped.size} changed since a person read them: `
          + `${moved.join(', ')}.`
        : `0 of ${stamped.size} changed since a person read them.`,
    },
  ];
  return { problems, notes };
}

const { fileURLToPath } = await import('node:url');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { readFile } = await import('node:fs/promises');
  // `--digest README.md` prints what a stamp for that document would carry.
  // A person writes the row, so a person needs the number, and computing a
  // truncated hash by hand is where a stamp goes wrong for no good reason.
  // It reads a governed document and nothing else, because a check that
  // reads any path the caller names is a different program.
  const [flag, target] = process.argv.slice(2);
  if (flag === '--digest') {
    if (!GOVERNED.includes(target)) {
      process.stderr.write(`--digest reads a governed document: ${GOVERNED.join(', ')}.\n`);
      process.exit(1);
    }
    process.stdout.write(`${digestOf(await readFile(target, 'utf8'))}\n`);
    process.exit(0);
  }
  const documents = new Map();
  for (const name of GOVERNED) {
    try {
      documents.set(name, await readFile(name, 'utf8'));
    } catch {
      // An absent governed document is a finding, and the check states it.
    }
  }
  // The clock lives here. No module under `src/` may read one, and this script
  // is the command line for this check.
  const { problems, notes } = checkRecord({
    recordText: await readFile('editorial/AUDITS.md', 'utf8'),
    documents,
    now: new Date().toISOString(),
  });
  for (const p of problems) process.stderr.write(`${p.code}: ${p.message}\n`);
  if (notes.length) {
    for (const n of notes) process.stdout.write(`${n.code}: ${n.message}\n`);
  } else {
    process.stdout.write('not counted: the editorial record\'s table is broken\n');
  }
  if (problems.length) process.exit(1);
  process.stdout.write('Editorial record clean.\n');
}
