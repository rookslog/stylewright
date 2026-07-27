import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillChoices, platformChoices, summarize } from '../src/prompt.js';

const catalog = [
  { name: 'asd-ste100', tier: 'standards', description: 'Writing rules from ASD-STE100 Issue 8.' },
  { name: 'plain-language', tier: 'standards', description: 'Rules distilled from the U.S. Federal Plain Language Guidelines.' },
  { name: 'readme-craft', tier: 'craft', description: 'Our own guidance. No external source.' },
];

test('skillChoices maps every catalog entry', () => {
  const choices = skillChoices(catalog);
  assert.equal(choices.length, 3);
  assert.equal(choices[0].name, 'asd-ste100  (standards)');
  assert.equal(choices[0].value, 'asd-ste100');
  assert.equal(choices[0].checked, true);
});

test('skillChoices marks installed skills', () => {
  const installed = new Map();
  installed.set('plain-language', ['claude', 'codex']);
  const choices = skillChoices(catalog, installed);
  assert.match(choices[1].name, /\[installed: claude, codex\]/);
});

test('skillChoices trims a long description', () => {
  const long = [...catalog, {
    name: 'verbose-skill',
    tier: 'craft',
    description: 'A'.repeat(200),
  }];
  const choices = skillChoices(long);
  const desc = choices[3].description;
  assert.ok(desc.length <= 100);
});

test('skillChoices handles missing description', () => {
  const empty = [{ name: 'bare', tier: 'craft' }];
  const choices = skillChoices(empty);
  assert.equal(choices[0].description, '');
});

test('platformChoices excludes cowork', () => {
  const choices = platformChoices([]);
  const names = choices.map((c) => c.value);
  assert.ok(!names.includes('cowork'));
  assert.ok(names.includes('claude'));
  assert.ok(names.includes('codex'));
  assert.ok(names.includes('agents'));
});

test('platformChoices pre-selects detected platforms', () => {
  const choices = platformChoices(['claude', 'codex']);
  assert.equal(choices.find((c) => c.value === 'claude').checked, true);
  assert.equal(choices.find((c) => c.value === 'codex').checked, true);
  assert.equal(choices.find((c) => c.value === 'agents').checked, false);
});

test('platformChoices marks found platforms', () => {
  const choices = platformChoices(['claude']);
  assert.match(choices.find((c) => c.value === 'claude').name, /\(found\)/);
  assert.doesNotMatch(choices.find((c) => c.value === 'codex').name, /\(found\)/);
});

test('summarize lists skills and platform paths', () => {
  const s = summarize({
    names: ['asd-ste100', 'readme-craft'],
    platforms: ['claude', 'codex'],
    scope: 'user',
    home: '/home/user',
    cwd: '/tmp/proj',
  });
  assert.match(s, /2 skill\(s\): asd-ste100, readme-craft/);
  assert.match(s, /claude  ->  \/home\/user\/\.claude\/skills/);
  assert.match(s, /codex  ->  \/home\/user\/\.codex\/skills/);
});

test('summarize uses cwd for project scope', () => {
  const s = summarize({
    names: ['asd-ste100'],
    platforms: ['claude'],
    scope: 'project',
    home: '/home/user',
    cwd: '/tmp/proj',
  });
  assert.match(s, /claude  ->  \/tmp\/proj\/\.claude\/skills/);
});

test('summarize handles agents platform', () => {
  const s = summarize({
    names: ['craft-skill'],
    platforms: ['agents'],
    scope: 'user',
    home: '/home/user',
    cwd: '/tmp/proj',
  });
  assert.match(s, /agents  ->  \/home\/user\/\.agents\/skills/);
});

test('summarize lines up multiple platforms', () => {
  const s = summarize({
    names: ['asd-ste100', 'plain-language', 'readme-craft'],
    platforms: ['claude', 'codex', 'agents'],
    scope: 'user',
    home: '/home/user',
    cwd: '/tmp/proj',
  });
  const lines = s.split('\n');
  assert.equal(lines[0], '3 skill(s): asd-ste100, plain-language, readme-craft');
  assert.equal(lines[1], '');
  assert.match(lines[2], /claude/);
  assert.match(lines[3], /codex/);
  assert.match(lines[4], /agents/);
});
