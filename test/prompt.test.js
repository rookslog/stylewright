// `src/prompt.js` owns the guided install. Every other test injects a fake
// through `ctx`, so before this file nothing imported the module at all, and a
// major bump of `@inquirer/prompts` passed CI without executing a line of the
// code it changed. See issue #10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  skillChoices, platformChoices, scopeChoices, summarize, promptTargets,
} from '../src/prompt.js';
import { installSkills } from '../src/install.js';
import { run } from '../src/cli.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-prompt-'));

const CATALOG = [
  { name: 'demo-standard', tier: 'standards', description: 'A standards fixture.' },
  { name: 'demo-craft', tier: 'craft', description: 'A craft fixture.' },
];

function capture() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join('') };
}

// A stand-in for the three inquirer calls. Answers are consumed in order, so a
// test states the dialogue as a script.
function fakeAsk(answers) {
  const asked = [];
  const next = (kind) => async (config) => {
    asked.push({ kind, config });
    return answers[kind].shift();
  };
  return {
    asked,
    checkbox: next('checkbox'),
    select: next('select'),
    confirm: next('confirm'),
  };
}

test('skillChoices starts everything selected', () => {
  const choices = skillChoices(CATALOG);
  assert.equal(choices.length, 2);
  assert.ok(choices.every((c) => c.checked), 'every skill starts checked');
  assert.deepEqual(choices.map((c) => c.value), ['demo-standard', 'demo-craft']);
});

test('skillChoices marks a skill that is already installed', () => {
  const installed = new Map([['demo-craft', ['claude', 'codex']]]);
  const [standard, craft] = skillChoices(CATALOG, installed);
  assert.doesNotMatch(standard.name, /installed/);
  assert.match(craft.name, /\[installed: claude, codex\]/);
});

test('skillChoices truncates a long description rather than wrapping the screen', () => {
  const long = 'x'.repeat(500);
  const [choice] = skillChoices([{ name: 'a', tier: 'craft', description: long }]);
  assert.ok(choice.description.length <= 100, choice.description.length);
  assert.match(choice.description, /…$/);
});

test('platformChoices pre-selects exactly what was detected', () => {
  const choices = platformChoices(['codex']);
  const checked = choices.filter((c) => c.checked).map((c) => c.value);
  assert.deepEqual(checked, ['codex']);
  assert.match(choices.find((c) => c.value === 'codex').name, /\(found\)/);
});

test('platformChoices never offers cowork, which is the claude path', () => {
  // Offering both would ask the user to pick one directory twice.
  const values = platformChoices([]).map((c) => c.value);
  assert.ok(!values.includes('cowork'), values.join(', '));
  assert.ok(values.includes('claude'));
});

test('scopeChoices shows the directory that each option resolves to', () => {
  // A user cannot choose between "user" and "project" without seeing where
  // each one writes.
  const choices = scopeChoices({ home: '/h', cwd: '/c' });
  assert.deepEqual(choices.map((c) => c.value), ['user', 'project']);
  assert.match(choices[0].name, /\/h/);
  assert.match(choices[1].name, /\/c/);
});

test('summarize names every destination path before anything is written', () => {
  const text = summarize({
    names: ['demo-craft'], platforms: ['claude', 'codex'], scope: 'user',
    home: '/h', cwd: '/c',
  });
  assert.match(text, /1 skill\(s\): demo-craft/);
  assert.match(text, /\/h\/\.claude\/skills/);
  assert.match(text, /\/h\/\.codex\/skills/);
});

test('cancelling at the confirmation returns null', async () => {
  const out = capture();
  const ask = fakeAsk({
    checkbox: [['demo-craft'], ['claude']],
    select: ['user'],
    confirm: [false],
  });
  const result = await promptTargets({
    catalog: CATALOG, home: '/h', cwd: '/c', stdout: out, ask,
  });
  assert.equal(result, null);
});

test('the command layer installs what the dialogue returns', async () => {
  // The dialogue's answer is assigned straight onto the parsed flags, so its
  // shape is a contract with `run` and nothing in either module states it. A
  // stub on the command side cannot hold that contract: it asserts the shape
  // the test author believed. This runs the real dialogue and hands its real
  // answer to the real command.
  const home = await tmp();
  const out = capture();
  const ask = fakeAsk({
    checkbox: [['demo-craft', 'demo-standard'], ['claude', 'codex']],
    select: ['user'],
    confirm: [true],
  });
  const chosen = await promptTargets({
    catalog: CATALOG, home, cwd: '/c', stdout: out, ask,
  });
  assert.deepEqual(chosen, {
    platform: ['claude', 'codex'],
    scope: ['user'],
    skill: ['demo-craft', 'demo-standard'],
  });

  const code = await run(['install'], {
    home, cwd: '/c', repoRoot: REPO, stdout: capture(), now: NOW,
    interactive: true, promptTargets: async () => chosen,
  });
  assert.equal(code, 0);
  for (const agent of ['.claude', '.codex']) {
    for (const name of ['demo-craft', 'demo-standard']) {
      await fs.access(path.join(home, agent, 'skills', name, 'SKILL.md'));
    }
  }
});

test('warns before it replaces a skill that is already installed', async () => {
  const home = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: path.join(home, '.claude', 'skills'),
    names: ['demo-craft'], now: NOW,
  });
  const out = capture();
  const ask = fakeAsk({
    checkbox: [['demo-craft'], ['claude']],
    select: ['user'],
    confirm: [true],
  });
  await promptTargets({ catalog: CATALOG, home, cwd: '/c', stdout: out, ask });
  assert.match(out.text(), /will be replaced: demo-craft/);
  assert.match(out.text(), /--force/);
});

test('asks the three steps in order', async () => {
  const out = capture();
  const ask = fakeAsk({
    checkbox: [['demo-craft'], ['claude']],
    select: ['user'],
    confirm: [true],
  });
  await promptTargets({ catalog: CATALOG, home: '/h', cwd: '/c', stdout: out, ask });
  assert.deepEqual(ask.asked.map((a) => a.kind),
    ['checkbox', 'checkbox', 'select', 'confirm']);
  assert.ok(ask.asked[0].config.required, 'the skill step must require an answer');
  assert.ok(ask.asked[1].config.required, 'the platform step must require an answer');
});

test('the prompt library still exports what this module calls', async () => {
  // This is the test that makes a breaking bump of @inquirer/prompts fail CI.
  // Every other test here injects a fake, so nothing else would notice a
  // rename or a removal.
  //
  // It does NOT catch a signature change that keeps the same export names. A
  // full guard needs a terminal, which CI does not have.
  const inquirer = await import('@inquirer/prompts');
  for (const name of ['checkbox', 'select', 'confirm']) {
    assert.equal(typeof inquirer[name], 'function',
      `@inquirer/prompts no longer exports ${name} as a function`);
  }
});
