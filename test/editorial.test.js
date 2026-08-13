import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvalidMoment } from '../src/ground.js';
import {
  COLUMNS, GOVERNED, checkRecord, digestOf,
} from '../scripts/check-editorial.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NOW = '2026-08-12T12:00:00Z';
const README = '# stylewright\n\nBody.\n';
const corpus = (extra = {}) => {
  const docs = new Map();
  for (const name of GOVERNED) docs.set(name, `${name}\n\nBody.\n`);
  docs.set('README.md', README);
  for (const [name, text] of Object.entries(extra)) docs.set(name, text);
  return docs;
};

const record = (rows) => [
  'Prose above the table.',
  '',
  `| ${COLUMNS.join(' | ')} |`,
  `|${COLUMNS.map(() => ' --- |').join('')}`,
  ...rows,
  '',
].join('\n');

const codes = (findings) => findings.map((f) => f.code);

test('a stamp whose digest matches the document reads clean and counts as covered', () => {
  const result = checkRecord({
    recordText: record([`| README.md | 2026-08-11 | ${digestOf(README)} |`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.find((n) => n.code === 'editorial-coverage').message,
    new RegExp(`1 of ${GOVERNED.length}`));
});

test('a caller that omits the day is refused rather than defaulted', () => {
  assert.throws(
    () => checkRecord({ recordText: record([]), documents: corpus() }),
    InvalidMoment,
  );
});

test('a stamp dated ahead of the run day is refused', () => {
  const result = checkRecord({
    recordText: record([`| README.md | 2026-08-13 | ${digestOf(README)} |`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['stamp-ahead-of-the-check']);
});

test('a day the calendar does not carry is refused', () => {
  const result = checkRecord({
    recordText: record([`| README.md | 2026-02-30 | ${digestOf(README)} |`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['stamp-malformed']);
});

test('a digest that is not eight hex characters is refused', () => {
  const result = checkRecord({
    recordText: record(['| README.md | 2026-08-11 | not-a-digest |']),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['stamp-malformed']);
});

test('a row naming a document the list does not govern is refused', () => {
  const result = checkRecord({
    recordText: record([`| docs/adr/0001-a.md | 2026-08-11 | ${digestOf(README)} |`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['ungoverned-document']);
});

test('a second row for one document is refused, so no reader has to pick', () => {
  const result = checkRecord({
    recordText: record([
      `| README.md | 2026-08-10 | ${digestOf(README)} |`,
      `| README.md | 2026-08-11 | ${digestOf(README)} |`,
    ]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['document-stamped-twice']);
});

test('a governed document the repository no longer carries is refused', () => {
  const documents = corpus();
  documents.delete('SECURITY.md');
  const result = checkRecord({ recordText: record([]), documents, now: NOW });
  assert.deepEqual(codes(result.problems), ['governed-document-absent']);
});

// The decision this test pins. A document that moved since a person read it,
// and a document nobody has read at all, are both notes. Neither fails.
test('a moved document and an unread document are notes and never problems', () => {
  const documents = corpus({ 'README.md': '# stylewright\n\nRewritten.\n' });
  const result = checkRecord({
    recordText: record([`| README.md | 2026-08-11 | ${digestOf(README)} |`]),
    documents,
    now: NOW,
  });
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.find((n) => n.code === 'editorial-staleness').message, /README\.md/);
});

test('an empty record is clean, and the coverage note reads zero', () => {
  const result = checkRecord({ recordText: record([]), documents: corpus(), now: NOW });
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.find((n) => n.code === 'editorial-coverage').message,
    new RegExp(`0 of ${GOVERNED.length}`));
});

test('a renamed heading breaks the table, and both notes are withheld', () => {
  const broken = record([]).replace('| Document |', '| File |');
  const result = checkRecord({ recordText: broken, documents: corpus(), now: NOW });
  assert.deepEqual(codes(result.problems), ['record-heading-renamed']);
  assert.deepEqual(result.notes, []);
});

test('a row that does not end in a pipe is refused, and the message names the cause', () => {
  const result = checkRecord({
    recordText: record([`| README.md | 2026-08-11 | ${digestOf(README)}`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['row-not-closed']);
  assert.match(result.problems[0].message, /pipe/);
});

test('a row carrying a fourth cell is refused', () => {
  const result = checkRecord({
    recordText: record([`| README.md | 2026-08-11 | ${digestOf(README)} | extra |`]),
    documents: corpus(),
    now: NOW,
  });
  assert.deepEqual(codes(result.problems), ['row-wrong-width']);
});

test('a table inside a fence does not bind, and the record with none is refused', () => {
  const fenced = ['# Editorial audits', '', '```', `| ${COLUMNS.join(' | ')} |`,
    '| --- | --- | --- |', '```', ''].join('\n');
  const result = checkRecord({ recordText: fenced, documents: corpus(), now: NOW });
  assert.deepEqual(codes(result.problems), ['record-has-no-table']);
  assert.deepEqual(result.notes, []);
});

// An audit record is a record for a person. A matrix stays out of an installed
// tree by its location, and this one stays out of the tarball the same way.
test('the record is not published, because location is what keeps a record home', async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(!pkg.files.includes('editorial'), `files: ${pkg.files.join(', ')}`);
  assert.equal(pkg.scripts['check:editorial'], 'node scripts/check-editorial.mjs');
  assert.match(pkg.scripts.check, /check:editorial/);
});

test('the record this repository ships is clean against the documents it governs', async () => {
  const recordText = await readFile(path.join(repoRoot, 'editorial/AUDITS.md'), 'utf8');
  const documents = new Map();
  for (const name of GOVERNED) {
    documents.set(name, await readFile(path.join(repoRoot, name), 'utf8'));
  }
  const result = checkRecord({ recordText, documents, now: NOW });
  assert.deepEqual(result.problems, []);
});
