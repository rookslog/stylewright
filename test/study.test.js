import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildManifest, collectFiles, digestBytes, writeArmManifest } from '../bench/arm-manifest.mjs';
import {
  STUDY_MANIFEST, checkDirectory, checkStudy, contentProblems, deriveResults, studyProblems,
} from '../bench/study.mjs';

/**
 * A promoted study is a record that reproduces an analysis. These tests hold
 * the two promises it makes: every figure is derived from the scorer's retained
 * output rather than declared beside it, and every digest is recomputed, which
 * is what makes the evidence tamper-evident rather than merely committed.
 */

const SCORER_OUTPUT = [
  'audit\tarm\tfile\tnoise\twords\tscaffold\tbullets\tlongestList\thedges\tmenus\techo',
  'audited\tcontrol\treport-1.txt\t0\t171\t0\t2\t2\t1\t0\t0.375',
  'audited\tcontrol\tMEDIAN\t0\t171\t0\t2\t2\t1\t0\t0.375',
  'audited\tcontrol\tRANGE\t0\t150-190\t0\t2-3\t2\t1\t0\t0.3-0.4',
  '',
].join('\n');

test('a figure is derived from the scorer output, and named for its row and column', () => {
  const results = deriveResults([{ scenario: 'report', stdout: SCORER_OUTPUT }]);
  assert.equal(results['report.control.median.words'].value, '171');
  assert.equal(results['report.control.median.words'].audited, true);
  assert.equal(results['report.control.range.words'].value, '150-190');
  assert.equal(results['report.control.median.echo'].value, '0.375');
  // A per-sample row is not a result. Nobody cites one, and an identifier per
  // sample multiplies the namespace by the repetition count.
  assert.equal(results['report.control.report-1.txt.words'], undefined);
});

test('an ungrouped set reads as one arm called all', () => {
  const results = deriveResults([{
    scenario: 'report',
    stdout: 'audit\tarm\tfile\twords\naudited\t-\tMEDIAN\t171\n',
  }]);
  assert.equal(results['report.all.median.words'].value, '171');
});

test('an unaudited row derives an unaudited figure', () => {
  const results = deriveResults([{
    scenario: 'report',
    stdout: 'audit\tarm\tfile\twords\nUNAUDITED\tcontrol\tMEDIAN\t171\n',
  }]);
  assert.equal(results['report.control.median.words'].audited, false);
});

test('a home path, a rules file, and a credential each refuse a retained file', () => {
  assert.match(contentProblems('see /Users/someone/notes.md')[0], /home directory/);
  assert.match(contentProblems('C:\\Users\\someone\\notes.md')[0], /home directory/);
  assert.match(contentProblems('it read ~/.claude/CLAUDE.md')[0], /operator rules/);
  assert.match(contentProblems('.claude/settings.local.json')[0], /operator rules/);
  assert.deepEqual(contentProblems('an ordinary reply about a guard clause'), []);
});

test('a credential is refused and never quoted back', () => {
  const found = contentProblems('token sk-ant-oat01-abcdefghijklmnop');
  assert.equal(found.length, 1);
  assert.match(found[0], /looks like a credential/);
  assert.ok(!found[0].includes('abcdefghijklmnop'));
});

const wellFormed = {
  kind: 'study',
  study: '2026-08-06-demo',
  promoted: '2026-08-06T00:00:00Z',
  package_version: '0.2.1',
  scorer: { path: 'bench/score.mjs', digest: 'a'.repeat(64) },
  license_check: { checked: 'nothing reproduced', at: '2026-08-06T00:00:00Z' },
  arms: [{ arm: 'control', path: 'arms/control', manifest_digest: 'b'.repeat(64) }],
  arms_digest: 'c'.repeat(64),
  prompts: [{ scenario: 'report', path: 'prompts/report.txt', digest: 'd'.repeat(64) }],
  analyses: [{ scenario: 'report', command: ['node'], exit_code: 0, stdout: '', stderr: '' }],
  provenance_gaps: ['platform: no sidecar records it.'],
};

test('a well formed study manifest passes, and each missing part is named', () => {
  assert.deepEqual(studyProblems(wellFormed), []);
  const say = (over) => studyProblems({ ...wellFormed, ...over }).join(' ');
  assert.match(say({ license_check: undefined }), /license_check records what was checked/);
  assert.match(say({ arms: [] }), /arms lists at least one/);
  assert.match(say({ arms_digest: 'short' }), /arms_digest is the digest/);
  assert.match(say({ scorer: { path: 'x' } }), /scorer names the scorer/);
  assert.match(say({ analyses: [{ scenario: 'report' }] }), /each analysis retains/);
  assert.match(say({ provenance_gaps: undefined }), /provenance_gaps names each field/);
  assert.match(say({ prompts: [{ scenario: 'report' }] }), /each prompt names its scenario/);
});

test('a manifest that states a figure is refused', () => {
  const problems = studyProblems({ ...wellFormed, median: { words: 171 } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /states a figure, and a reader derives every figure/);
});

/** Builds a study on disk that passes its own check, so a test can then break it. */
async function tempStudy(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-study-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '2026-08-06-demo');
  const armDir = path.join(dir, 'arms', 'control');
  await fs.mkdir(armDir, { recursive: true });
  await fs.mkdir(path.join(dir, 'prompts'));
  await fs.writeFile(path.join(armDir, 'report-1.txt'), 'a short answer');
  await fs.writeFile(path.join(armDir, 'report-1.txt.meta'), 'arm=control scenario=report');
  const promptBytes = Buffer.from('the report scenario\n');
  await fs.writeFile(path.join(dir, 'prompts', 'report.txt'), promptBytes);

  const armManifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 1, at: 'now', files: await collectFiles(armDir),
  });
  await writeArmManifest(armDir, armManifest, dir);
  const manifestDigest = digestBytes(await fs.readFile(path.join(armDir, 'arm-manifest.json')));

  const manifest = {
    ...wellFormed,
    arms: [{ arm: 'control', path: 'arms/control', manifest_digest: manifestDigest }],
    arms_digest: digestBytes(manifestDigest),
    prompts: [{ scenario: 'report', path: 'prompts/report.txt', digest: digestBytes(promptBytes) }],
    analyses: [{
      scenario: 'report', command: ['node', 'bench/score.mjs'], exit_code: 0,
      stdout: SCORER_OUTPUT, stderr: '',
    }],
  };
  await fs.writeFile(path.join(dir, STUDY_MANIFEST), JSON.stringify(manifest, null, 2));
  return { root, dir, armDir, manifest };
}

test('a study built to its own rules passes, and derives its figures', async (t) => {
  const { dir } = await tempStudy(t);
  const { problems, results, summary } = await checkStudy(dir);
  assert.deepEqual(problems, []);
  assert.equal(results['report.control.median.words'].value, '171');
  // Eight metrics, two statistics each: the scorer's own table, one identifier
  // per cell a figure could be quoted from.
  assert.match(summary, /16 result\(s\) derived, audited/);
});

test('a sample edited after promotion is visible', async (t) => {
  const { dir, armDir } = await tempStudy(t);
  await fs.writeFile(path.join(armDir, 'report-1.txt'), 'a much longer answer than before');
  const { problems } = await checkStudy(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /report-1\.txt does not match its recorded digest/);
});

test('an arm manifest edited after promotion is visible', async (t) => {
  const { dir, armDir } = await tempStudy(t);
  const p = path.join(armDir, 'arm-manifest.json');
  const edited = JSON.parse(await fs.readFile(p, 'utf8'));
  edited.reps = 5;
  await fs.writeFile(p, JSON.stringify(edited, null, 2));
  const { problems } = await checkStudy(dir);
  assert.ok(problems.some((x) => /arm manifest does not match the digest/.test(x)));
  assert.ok(problems.some((x) => /arms_digest does not match/.test(x)));
});

test('a prompt edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.writeFile(path.join(dir, 'prompts', 'report.txt'), 'a different scenario\n');
  const { problems } = await checkStudy(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /prompts\/report\.txt does not match its recorded digest/);
});

test('operator configuration committed after promotion is visible', async (t) => {
  const { dir, armDir } = await tempStudy(t);
  await fs.writeFile(path.join(armDir, 'report-1.txt'), 'it read ~/.claude/CLAUDE.md');
  const { problems } = await checkStudy(dir);
  assert.ok(problems.some((x) => /operator rules/.test(x)));
});

test('a directory of samples with no manifest is not a study', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.rm(path.join(dir, STUDY_MANIFEST));
  const { problems } = await checkStudy(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is missing, and a directory of samples is not a study/);
});

test('an arm with no manifest is live or dead, and neither is a study', async (t) => {
  const { dir, armDir } = await tempStudy(t);
  await fs.rm(path.join(armDir, 'arm-manifest.json'));
  const { problems } = await checkStudy(dir);
  assert.ok(problems.some((x) => /carries no arm manifest/.test(x)));
});

test('a study whose scorer printed nothing derives no figure, and does not read as audited', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.analyses = [{
    scenario: 'report', command: ['node'], exit_code: 1, stdout: '', stderr: 'refusing to score',
  }];
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems, summary } = await checkStudy(dir);
  assert.deepEqual(problems, []);
  assert.match(summary, /0 result\(s\) derived, no figure derives from it/);
});

test('a badly named study directory is refused', async (t) => {
  const { root, dir } = await tempStudy(t);
  const renamed = path.join(root, 'demo');
  await fs.rename(dir, renamed);
  const { problems } = await checkStudy(renamed);
  assert.ok(problems.some((x) => /named <date>-<slug>/.test(x)));
});

test('a samples directory with no studies is not a failure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-empty-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'README.md'), '# retained samples\n');
  assert.deepEqual(await checkDirectory(root), { problems: [], lines: [] });
  assert.deepEqual(await checkDirectory(path.join(root, 'absent')), { problems: [], lines: [] });
});
