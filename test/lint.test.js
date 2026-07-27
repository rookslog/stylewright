import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintText } from '../src/lint.js';

const codes = (findings) => findings.map((f) => f.rule).sort();

test('accepts clean descriptive prose', () => {
  assert.deepEqual(lintText('This sentence is short and clear.\n'), []);
});

test('flags a semicolon in prose but not in code or a table', () => {
  assert.deepEqual(codes(lintText('Do this; then that.\n')), ['semicolon']);
  assert.deepEqual(lintText('Run `a; b` now.\n'), []);
  assert.deepEqual(lintText('| a; b | c |\n'), []);
  assert.deepEqual(lintText('```\nconst a = 1;\n```\n'), []);
});

test('flags contractions', () => {
  const found = lintText("Do not use it if it isn't ready.\n");
  assert.deepEqual(codes(found), ['contraction']);
  assert.equal(found[0].line, 1);
});

test('applies 25 words to descriptive text', () => {
  const ok = `${'word '.repeat(24)}end.`;
  const bad = `${'word '.repeat(25)}end.`;
  assert.deepEqual(lintText(ok), []);
  assert.deepEqual(codes(lintText(bad)), ['sentence-length']);
});

test('applies 20 words inside a procedure section', () => {
  const body = `${'word '.repeat(21)}end.`;
  assert.deepEqual(codes(lintText(`## Procedure\n\n${body}`)), ['sentence-length']);
  assert.deepEqual(lintText(`## Overview\n\n${body}`), []);
});

test('flags a non-imperative ordered-list step', () => {
  assert.deepEqual(codes(lintText('1. Removing the panel.\n')), ['imperative']);
  assert.deepEqual(codes(lintText('1. The panel comes off.\n')), ['imperative']);
  assert.deepEqual(lintText('1. Remove the panel.\n'), []);
});

test('reports 1-indexed line numbers', () => {
  const found = lintText('Clean line.\nDo this; then that.\n');
  assert.equal(found[0].line, 2);
});
