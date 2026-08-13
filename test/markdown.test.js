import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripNonProse, sentences, sections, indentOf, isIndented, columnOf,
} from '../src/markdown.js';

test('blanks fenced code but keeps line count', () => {
  const input = 'Alpha text.\n```js\nconst a = 1;\n```\nBravo text.';
  const out = stripNonProse(input);
  assert.equal(out.split('\n').length, input.split('\n').length);
  assert.ok(!out.includes('const a = 1;'));
  assert.ok(out.includes('Alpha text.'));
  assert.ok(out.includes('Bravo text.'));
});

test('blanks inline code and table rows', () => {
  const out = stripNonProse('Use `a; b` here.\n| x; y | z |\nPlain; text.');
  assert.ok(!out.includes('a; b'));
  assert.ok(!out.includes('x; y'));
  assert.ok(out.includes('Plain; text.'));
});

test('blanks link targets but keeps link text', () => {
  const out = stripNonProse('See [the guide](https://e.com/a;b) now.');
  assert.ok(out.includes('the guide'));
  assert.ok(!out.includes('https://e.com/a;b'));
});

test('splits sentences and reports 1-indexed lines', () => {
  const got = sentences('One here. Two here.\n\nThree here.');
  assert.deepEqual(got.map((s) => s.text.trim()),
    ['One here.', 'Two here.', 'Three here.']);
  assert.deepEqual(got.map((s) => s.line), [1, 1, 3]);
});

test('a column counts a tab to the next stop of four', () => {
  // One rule, asked at two offsets. The indent asks it at the first character
  // that is neither a space nor a tab, and the padding after a list marker
  // asks it across the marker and the gap after it.
  assert.equal(indentOf('\tx'), 4);
  assert.equal(indentOf('  \tx'), 4);
  assert.equal(indentOf('    x'), 4);
  assert.ok(isIndented('\tx'));
  assert.equal(columnOf('a\tb', 2), 4);
  assert.equal(columnOf('abc', 2), 2);
  assert.equal(columnOf('abc', 99), 3);
});

test('a setext underline indented four columns is not one', () => {
  // A pattern over whitespace CHARACTERS read a tab as one, so `Rules` over a
  // tab and three dashes became a heading here while a Markdown reader keeps
  // both lines as one paragraph. Every anchor below it moved, and the check
  // that guards an indented heading reads the heading TEXT alone, so nothing
  // reported it. Issue 70.
  assert.deepEqual(sections('Rules\n\t---\n\nAlways preserve safety.').map((s) => s.heading), []);
  assert.deepEqual(sections('Rules\n    ---\n\nAlways.').map((s) => s.heading), []);
  assert.deepEqual(sections('Rules\n   ---\n\nAlways.').map((s) => s.heading), ['Rules']);
  assert.deepEqual(sections('Rules\n---\n\nAlways.').map((s) => s.heading), ['Rules']);
});

test('parses ATX sections with bounds', () => {
  const got = sections('# A\nbody a\n## B\nbody b\n');
  assert.equal(got.length, 2);
  assert.equal(got[0].heading, 'A');
  assert.equal(got[0].level, 1);
  assert.equal(got[1].heading, 'B');
  assert.ok(got[1].body.includes('body b'));
});
