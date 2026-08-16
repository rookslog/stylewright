import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  RERUN_VARS, SCORER, STUDY_MANIFEST, checkDirectory, checkStudy, commandProblems,
  contentProblems, deriveResults, disqualify, rerun, rerunEnv, studyProblems, walkStudy,
} from '../bench/study.mjs';
import { tempStudy } from './bench-helpers.js';

/**
 * A promoted study is a record that reproduces an analysis. These tests hold
 * the two promises it makes: every figure is derived from the scorer's retained
 * output rather than declared beside it, and everything the study rests on is
 * recomputed — the digests, the file inventory, and the scorer run itself.
 *
 * Every fixture below is a real promotion, because the check re-runs the
 * command a study retained. A study assembled by hand could only ever be
 * checked against a hand-written table.
 */

const SCORER_OUTPUT = [
  'audit\tarm\tfile\tnoise\twords\tscaffold\tbullets\tlongestList\thedges\tmenus\techo',
  'audited\tcontrol\treport-1.txt\t0\t171\t0\t2\t2\t1\t0\t0.375',
  'audited\tcontrol\tMEDIAN\t0\t171\t0\t2\t2\t1\t0\t0.375',
  'audited\tcontrol\tRANGE\t0\t150-190\t0\t2-3\t2\t1\t0\t0.3-0.4',
  '',
].join('\n');

/**
 * One result, asserted to exist before anything reads a field off it.
 *
 * A bare `results[id].value` turns a missing identifier into a TypeError, and a
 * mutation that renames every identifier then reads as a crashed suite rather
 * than as a clean red. The anchor has to be an assertion about the identifier.
 */
function at(results, id) {
  assert.ok(results[id], `no result derived at ${id}: ${Object.keys(results).join(', ')}`);
  return results[id];
}

test('a figure is derived from the scorer output, and named for its row and column', () => {
  const results = deriveResults([{ scenario: 'report', stdout: SCORER_OUTPUT }]);
  assert.equal(at(results, 'report.control.median.words').value, '171');
  assert.equal(at(results, 'report.control.median.words').audited, true);
  assert.equal(at(results, 'report.control.median.words').arm, 'control');
  assert.equal(at(results, 'report.control.range.words').value, '150-190');
  assert.equal(at(results, 'report.control.median.echo').value, '0.375');
  // A per-sample row is not a result. Nobody cites one, and an identifier per
  // sample multiplies the namespace by the repetition count.
  assert.equal(results['report.control.report-1.txt.words'], undefined);
});

test('an ungrouped set reads as one arm called all', () => {
  const results = deriveResults([{
    scenario: 'report',
    stdout: 'audit\tarm\tfile\twords\naudited\t-\tMEDIAN\t171\n',
  }]);
  assert.equal(at(results, 'report.all.median.words').value, '171');
  assert.equal(at(results, 'report.all.median.words').arm, 'all');
});

test('an unaudited row derives an unaudited figure', () => {
  const results = deriveResults([{
    scenario: 'report',
    stdout: 'audit\tarm\tfile\twords\nUNAUDITED\tcontrol\tMEDIAN\t171\n',
  }]);
  assert.equal(at(results, 'report.control.median.words').audited, false);
});

test('an arm that did not finish disqualifies its own figures, with the reason on each', () => {
  const results = deriveResults([{
    scenario: 'report',
    stdout: 'audit\tarm\tfile\twords\naudited\tcontrol\tMEDIAN\t171\n'
      + 'audited\twith-skill\tMEDIAN\t59\n',
  }]);
  const out = disqualify(results, { control: 'stopped: killed at rep 3' });
  assert.equal(at(out, 'report.control.median.words').audited, false);
  assert.match(at(out, 'report.control.median.words').reason, /killed at rep 3/);
  // The arm that did finish keeps its figure, and keeps it audited.
  assert.equal(at(out, 'report.with-skill.median.words').audited, true);
  assert.equal(at(out, 'report.with-skill.median.words').reason, undefined);
});

test('an ungrouped figure is disqualified by any arm that did not finish', () => {
  const results = deriveResults([{
    scenario: 'report', stdout: 'audit\tarm\tfile\twords\naudited\t-\tMEDIAN\t171\n',
  }]);
  const out = disqualify(results, { control: 'stopped: killed at rep 3' });
  assert.equal(at(out, 'report.all.median.words').audited, false);
  assert.match(at(out, 'report.all.median.words').reason, /control stopped/);
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
  arms: [{ arm: 'control', path: 'arms/control', manifest_digest: 'b'.repeat(64), abort: null }],
  arms_digest: 'c'.repeat(64),
  prompts: [{ scenario: 'report', path: 'prompts/report.txt', digest: 'd'.repeat(64) }],
  verdicts: [],
  analyses: [{ scenario: 'report', command: ['node'], exit_code: 0, stdout: '', stderr: '' }],
  provenance_gaps: ['platform: no sidecar records it.'],
};

test('a well formed study manifest passes, and each missing part is named', () => {
  assert.deepEqual(studyProblems(wellFormed), []);
  const say = (over) => studyProblems({ ...wellFormed, ...over }).join(' ');
  assert.match(say({ license_check: undefined }), /license_check records what was checked/);
  assert.match(say({ arms: [] }), /arms lists at least one/);
  assert.match(say({ arms_digest: 'short' }), /arms_digest is the digest/);
  // The scorer path is held to a literal, because the check executes it.
  assert.match(say({ scorer: { path: 'x', digest: 'a'.repeat(64) } }),
    /scorer\.path is bench\/score\.mjs, and this study names x/);
  assert.match(say({ scorer: { path: '../evil.mjs', digest: 'a'.repeat(64) } }),
    /it runs one program and refuses the rest/);
  assert.match(say({ scorer: { path: 'bench/score.mjs' } }), /scorer records the digest/);
  assert.match(say({ analyses: [{ scenario: 'report' }] }), /each analysis retains/);
  assert.match(say({ provenance_gaps: undefined }), /provenance_gaps names each field/);
  assert.match(say({ prompts: [{ scenario: 'report' }] }), /each prompt names its scenario/);
  // The key is never absent. A study that dropped it would be one nothing could
  // tell from a study that scored against no ground truth at all, which is the
  // absent-versus-empty confusion the audit column already answers.
  assert.match(say({ verdicts: undefined }), /verdicts lists the verdict records/);
  assert.match(say({ verdicts: [{ record: 'pr-118.json' }] }),
    /each verdict record names itself/);
  assert.match(
    say({ arms: [{ arm: 'a', path: 'arms/a', manifest_digest: 'b'.repeat(64) }] }),
    /repeats its manifest's abort/);
});

test('a manifest that states a figure is refused', () => {
  const problems = studyProblems({ ...wellFormed, median: { words: 171 } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /states a figure, and a reader derives every figure/);
});

test('a retained command is checked before anything re-runs it', () => {
  const opts = { studyDir: '/s', repoRoot: '/' };
  const ok = ['node', SCORER, '--prompt', 's/prompts/report.txt', '--compare',
    's/arms/control/report-1.txt'];
  assert.deepEqual(commandProblems(ok, opts), []);
  const say = (cmd) => commandProblems(cmd, opts).join(' ');
  // The command is the author's own line, so a rewired one would re-run cleanly
  // over bytes the study does not hold.
  assert.match(say(['node', SCORER, 'bench/out/control/report-1.txt']), /is not inside this study/);
  assert.match(say(['node', SCORER, 's/arms/../../elsewhere/x.txt']), /is not inside this study/);
  assert.match(say(['sh', SCORER, 's/x.txt']), /does not run node/);
  assert.match(say(['node', SCORER, '--rm-rf', 's/x.txt']), /which the promotion never passes/);
  assert.match(say(['node', SCORER, '--prompt']), /ends on a flag that needs a path/);
  // The one program, by name. Every earlier gate compared the command against
  // another field of the same file, which the same hand wrote.
  for (const program of ['other.mjs', '../evil.mjs', '/tmp/evil.mjs', 'bench\\score.mjs']) {
    assert.match(say(['node', program, 's/x.txt']),
      /the only program this check runs is bench\/score\.mjs/, `${program} must be refused`);
  }
  // `--unaudited` is a real scorer flag and promotion never emits it, so the
  // allowlist does not carry it. A study whose command asks for it is refused.
  assert.match(say(['node', SCORER, '--unaudited', 's/x.txt']),
    /which the promotion never passes/);
});

test('a command element that is not a string is refused by name, never thrown on', () => {
  // `bench/samples/` is untrusted data, so a malformed element is a case. It
  // used to reach `arg.startsWith` and throw a TypeError out of the check,
  // which stopped `checkDirectory` reaching any study after it.
  //
  // NOT throwing is the assertion, made explicitly. Letting the call throw into
  // the runner would red this test for the right reason and read as a crashed
  // suite, which is not an anchor anybody can trust.
  const opts = { studyDir: '/s', repoRoot: '/' };
  const refuses = (command, what) => {
    let problems;
    assert.doesNotThrow(() => { problems = commandProblems(command, opts); },
      `${what} must be refused, never thrown on`);
    assert.ok(problems.some((p) => /where an argument goes/.test(p)),
      `${what} must be refused by name: ${problems.join(' ')}`);
  };
  for (const bad of [7, null, {}, ['nested'], true]) {
    refuses(['node', SCORER, bad, 's/x.txt'], JSON.stringify(bad) ?? String(bad));
  }
  // And the value position of a flag, which is the other place a string method
  // would have touched it first.
  refuses(['node', SCORER, '--prompt', 7, 's/x.txt'], 'a non-string flag value');
});

// This check RUNS A PROGRAM, and the first version took the program's path from
// the very file an attacker edits. A relative-escape `scorer.path` executed a
// script outside the repository, under the operator's whole environment, and
// echoed the retained output back so the check printed clean and exited zero.
// The three tests below are that payload, refused at each of its three legs.

test('a study naming any program but the one scorer is refused, never run', async (t) => {
  const { arm, dir } = await tempStudy(t);
  // The payload: a script that would announce itself if it ever ran.
  const evil = path.join(arm.root, 'evil.mjs');
  const proof = path.join(arm.root, 'it-ran.txt');
  await fs.writeFile(evil, `import fs from 'node:fs';\n`
    + `fs.writeFileSync(${JSON.stringify(proof)}, JSON.stringify(Object.keys(process.env)));\n`);

  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  const escape = path.relative(path.dirname(path.dirname(import.meta.dirname)), evil);
  // Both fields rewritten together, and the digest recorded correctly, which is
  // exactly what defeated the earlier pair of gates.
  manifest.scorer = { path: escape, digest: 'f'.repeat(64) };
  manifest.analyses[0].command = ['node', escape, `arms/control/${'report'}-1.txt`];
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));

  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /scorer\.path is bench\/score\.mjs/.test(x)));
  assert.ok(problems.some((x) => /the only program this check runs is bench\/score\.mjs/.test(x)));
  // The proof of the negative: the payload never executed.
  await assert.rejects(() => fs.stat(proof), { code: 'ENOENT' });
});

test('a re-run inherits no credential, no home, and nothing but its allowlist', () => {
  const env = rerunEnv({
    PATH: '/usr/bin',
    HOME: '/Users/someone',
    USERPROFILE: 'C:\\Users\\someone',
    ANTHROPIC_API_KEY: 'never-read',
    ANTHROPIC_BASE_URL: 'https://elsewhere',
    CLAUDE_CODE_OAUTH_TOKEN: 'never-read',
    AWS_BEARER_TOKEN_BEDROCK: 'never-read',
    SOME_INTERNAL_SECRET: 'never-read',
  });
  // An allowlist, the way `bench/collect-probe.mjs` settled it: a subtraction
  // decays with every release, and a review measured what one let through.
  assert.deepEqual(Object.keys(env).sort(), RERUN_VARS.filter((v) => v === 'PATH'));
  for (const gone of ['HOME', 'USERPROFILE', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_OAUTH_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK', 'SOME_INTERNAL_SECRET']) {
    assert.equal(env[gone], undefined, `${gone} must not reach a program the check runs`);
  }
  // Matched case-insensitively, or a Windows child cannot find anything.
  assert.equal(rerunEnv({ Path: '/usr/bin' }).Path, '/usr/bin');
});

test('the child really gets that environment, and not this process\'s', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-env-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'echo-env.mjs');
  await fs.writeFile(script, 'process.stdout.write(JSON.stringify(Object.keys(process.env)));\n');
  const seen = await rerun(['node', script], { cwd: root });
  const keys = JSON.parse(seen.stdout);
  assert.ok(!keys.includes('HOME'), `the child saw HOME: ${keys.join(', ')}`);
  assert.ok(!keys.some((k) => /^(ANTHROPIC|CLAUDE|AWS)_/i.test(k)),
    `the child saw a credential-adjacent name: ${keys.join(', ')}`);
});

test('a re-run that will not finish is killed and refused by name', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-hang-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'hang.mjs');
  await fs.writeFile(script, 'setInterval(() => {}, 1000);\n');
  const result = await rerun(['node', script], { cwd: root, timeoutMs: 250 });
  assert.equal(result.timed_out, true);
  assert.notEqual(result.exit_code, 0);
});

test('a study built by a real promotion passes, and derives its figures', async (t) => {
  const { dir, result } = await tempStudy(t);
  assert.equal(result.code, 0, result.stderr);
  const { problems, results, summary } = await checkStudy(dir, '2026-08-06-demo');
  assert.deepEqual(problems, []);
  assert.ok(at(results, 'report.all.median.words'));
  // Two per metric the scorer prints, MEDIAN and RANGE, over one arm. So this
  // literal moves whenever `keys` in `bench/score.mjs` gains or loses a metric,
  // and it went 16 to 18 when `signatures` landed. A study derives every cell,
  // which is the property worth holding, so the number stays literal rather
  // than being computed from the same list it is checking.
  assert.match(summary, /18 result\(s\) derived, audited/);
});

test('a retained scorer table edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  // One cell, the way a figure would be flattered. Every digest still matches,
  // because no digest ever covered this text.
  manifest.analyses[0].stdout = manifest.analyses[0].stdout.replace(/\tMEDIAN\t0\t(\d+)/, '\tMEDIAN\t0\t12');
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /produced different output from the bytes this study retains/);
});

test('a retained stderr edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  // Stderr is promoted output that no digest covers, exactly like the table.
  manifest.analyses[0].stderr = 'a reason the scorer never gave\n';
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /wrote different stderr from the bytes this study retains/);
});

test('a study already refused for any reason is not re-run at all', async (t) => {
  const { dir } = await tempStudy(t);
  // An edited sample refuses on its digest AND would change what the scorer
  // prints, so the two gates are distinguishable: with the narrow gate the
  // re-run happens and adds a second problem, and with this one it does not.
  // That matters because containment is a string predicate over `path.resolve`,
  // which resolves no symbolic links — a refusal that did not stop the spawn
  // let the scorer read through an in-study link to bytes outside it.
  await fs.writeFile(path.join(dir, 'arms', 'control', 'report-1.txt'),
    'a very different answer, many more words than the one that was promoted here\n');
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1, `expected the digest refusal alone: ${problems.join(' | ')}`);
  assert.match(problems[0], /report-1\.txt does not match its recorded digest/);
  assert.ok(!problems.some((x) => /re-running/.test(x)),
    `a refused study still spawned: ${problems.join(' | ')}`);
});

test('an in-study symlink is refused, and the refusal precedes any spawn', async (t) => {
  const { dir } = await tempStudy(t);
  const outside = path.join(dir, '..', 'outside.txt');
  await fs.writeFile(outside, 'bytes this study does not hold\n');
  try {
    await fs.symlink(outside, path.join(dir, 'arms', 'control', 'linked.txt'));
  } catch {
    return; // A platform without symlink permission has nothing to test here.
  }
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /linked\.txt is a symlink/.test(x)));
  assert.ok(!problems.some((x) => /re-running/.test(x)));
});

test('a study scored under a different scorer refuses the re-run, and names the drift', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.scorer.digest = 'e'.repeat(64);
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is now [0-9a-f]{64} and this study was scored under e{64}/);
  assert.match(problems[0], /would not be the run this study describes/);
});

test('a sample edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.writeFile(path.join(dir, 'arms', 'control', 'report-1.txt'), 'much longer than before\n');
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /report-1\.txt does not match its recorded digest/.test(x)));
});

test('an arm manifest edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, 'arms', 'control', 'arm-manifest.json');
  const edited = JSON.parse(await fs.readFile(p, 'utf8'));
  edited.reps = 9;
  await fs.writeFile(p, JSON.stringify(edited, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /arm manifest does not match the digest/.test(x)));
  assert.ok(problems.some((x) => /arms_digest does not match/.test(x)));
});

test('a prompt edited after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.writeFile(path.join(dir, 'prompts', 'report.txt'), 'a different scenario\n');
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /prompts\/report\.txt does not match its recorded digest/.test(x)));
});

test('operator configuration committed after promotion is visible', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.writeFile(path.join(dir, 'arms', 'control', 'report-1.txt'), 'it read ~/.claude/CLAUDE.md');
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /operator rules/.test(x)));
});

test('an arm path pointing outside the study is refused, and credits nothing', async (t) => {
  const { arm, dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.arms[0].path = `../../out/${arm.name}`;
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /arms\[\]\.path names .* which is outside this study/.test(x)));
});

test('a prompt path pointing outside the study is refused', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.prompts[0].path = '../../../bench/prompts/report.txt';
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /prompts\[\]\.path names .* which is outside this study/.test(x)));
});

test('a symbolic link inside a study is refused, never scanned past', async (t) => {
  const { dir } = await tempStudy(t);
  const outside = path.join(dir, '..', 'outside.txt');
  await fs.writeFile(outside, 'it read ~/.claude/CLAUDE.md\n');
  try {
    await fs.symlink(outside, path.join(dir, 'arms', 'control', 'linked.txt'));
  } catch {
    return; // A platform without symlink permission has nothing to test here.
  }
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /linked\.txt is a symlink, and a study holds only plain files/.test(x)));
  const { files } = await walkStudy(dir);
  assert.ok(!files.some((f) => f.endsWith('linked.txt')));
});

test('a file the study does not account for is reported', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.writeFile(path.join(dir, 'notes.md'), 'a stray file\n');
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /notes\.md is here and the study does not account for it/);
});

test('an aborted arm promotes, and every figure it touched says why it is not audited', async (t) => {
  const { dir } = await tempStudy(t, {
    manifest: { abort: 'the treatment moved during report-4' },
  });
  const { problems, results, summary } = await checkStudy(dir, '2026-08-06-demo');
  assert.deepEqual(problems, []);
  // Retained, as the design requires of a failed attempt. Not audited, and the
  // reason rides on the figure rather than sitting in a footnote.
  assert.equal(at(results, 'report.all.median.words').audited, false);
  assert.match(at(results, 'report.all.median.words').reason, /the treatment moved during report-4/);
  assert.match(summary, /UNAUDITED/);
  assert.match(summary, /Not scorable: control stopped: the treatment moved during report-4/);
});

test('an arm whose abort the study dropped is caught', async (t) => {
  const { dir } = await tempStudy(t, { manifest: { abort: 'killed at rep 3' } });
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.arms[0].abort = null;
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /recorded abort disagrees with its arm manifest/.test(x)));
});

test('a directory of samples with no manifest is not a study', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.rm(path.join(dir, STUDY_MANIFEST));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is missing, and a directory of samples is not a study/);
});

test('an arm with no manifest is live or dead, and neither is a study', async (t) => {
  const { dir } = await tempStudy(t);
  await fs.rm(path.join(dir, 'arms', 'control', 'arm-manifest.json'));
  const { problems } = await checkStudy(dir, '2026-08-06-demo');
  assert.ok(problems.some((x) => /carries no arm manifest/.test(x)));
});

test('a study whose scorer printed nothing derives no figure, and does not read as audited', async (t) => {
  const { dir } = await tempStudy(t);
  const p = path.join(dir, STUDY_MANIFEST);
  const manifest = JSON.parse(await fs.readFile(p, 'utf8'));
  manifest.analyses = [];
  await fs.writeFile(p, JSON.stringify(manifest, null, 2));
  const { problems, summary } = await checkStudy(dir, '2026-08-06-demo');
  assert.deepEqual(problems, []);
  assert.match(summary, /0 result\(s\) derived, no figure derives from it/);
});

test('a badly named study directory is refused', async (t) => {
  const { arm, dir } = await tempStudy(t);
  const renamed = path.join(arm.out, 'demo');
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

test('the shipped samples directory holds no study that fails its own check', async () => {
  const dir = path.join(path.dirname(import.meta.dirname), 'bench', 'samples');
  const { problems } = await checkDirectory(dir);
  assert.deepEqual(problems, []);
});
