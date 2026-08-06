import { test } from 'node:test';
import assert from 'node:assert/strict';

import { labelsFor, rules, vocabulary } from '../.github/issue-labeler.mjs';

// The rules run in a workflow, so CI is the only place they execute. These
// tests hold the three properties a reviewer cannot read off the regular
// expressions: that every rule names a label the repository actually has, that
// a rule fires on the shape it claims, and that a stand-down guard stands down.
// They are not a backtest. The pull request that added this file carries one.

test('every rule names a label from the repository taxonomy', () => {
  // The label set as `gh label list` reported it on 2026-08-06. A rule for a
  // label that does not exist fails silently in the workflow, because the API
  // creates the label rather than refusing it.
  const taxonomy = new Set([
    'documentation',
    'duplicate',
    'enhancement',
    'good first issue',
    'help wanted',
    'wontfix',
    'defect',
    'engine',
    'lint',
    'new skill',
    'grounding',
    'wrong rule',
    'distribution',
    'skill content',
  ]);
  for (const rule of rules) {
    assert.ok(taxonomy.has(rule.label), `unknown label: ${rule.label}`);
  }
  assert.deepEqual(vocabulary, ['distribution', 'engine', 'new skill']);
});

test('every rule states why its pattern implies its label', () => {
  for (const rule of rules) {
    assert.equal(typeof rule.why, 'string', `rule for ${rule.label} has no reason`);
    assert.ok(rule.why.length > 0, `rule for ${rule.label} has an empty reason`);
  }
});

test('the skill form title applies the new skill label', () => {
  assert.deepEqual(labelsFor({ title: 'skill: diataxis', body: '' }), ['new skill']);
});

test('a title naming an engine command applies the engine label', () => {
  assert.deepEqual(labelsFor({ title: 'uninstall leaves an empty manifest behind' }), ['engine']);
});

test('a body naming a module under src applies the engine label', () => {
  const labels = labelsFor({
    title: 'The grounding extractor reads Markdown by line',
    body: '`src/ground.js` reads Markdown a line at a time.',
  });
  assert.deepEqual(labels, ['engine']);
});

test('a marketplace manifest is distribution and not the engine manifest', () => {
  // `manifest` in a title means the install manifest, except when the title is
  // about a plugin marketplace. Issue #3 is the case.
  const labels = labelsFor({ title: 'Pathway 2 and 3: plugin marketplace manifests' });
  assert.deepEqual(labels, ['distribution']);
});

test('a title about the lint or a skill applies nothing', () => {
  // Three enhancement issues name `stylewright lint` while asking for a change
  // to a skill. The rules stay silent rather than call them engine work.
  const labels = labelsFor({
    title: 'Ship a resident layer, not only skills',
    body: 'Anything a program can detect | Yes, `stylewright lint`',
  });
  assert.deepEqual(labels, []);
});

test('labelsFor is stable and reads nothing outside its arguments', () => {
  const issue = { title: 'skill: de-slop', body: 'a `craft/` tier skill' };
  assert.deepEqual(labelsFor(issue), labelsFor(issue));
  assert.deepEqual(labelsFor(), []);
});
