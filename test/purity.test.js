import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/**
 * CONTRIBUTING and AGENTS.md both state the purity rule for `src/`. Nothing
 * checked it, so a change could break the rule and still pass CI. These tests
 * are what make the rule enforceable rather than advisory.
 *
 * The rule exists so that manifests stay comparable across install pathways in
 * the conformance suite. Time is passed in, never read.
 */

const SRC = new URL('../src/', import.meta.url);

async function sources() {
  const names = (await readdir(SRC)).filter((n) => n.endsWith('.js'));
  return Promise.all(
    names.map(async (name) => ({ name, text: await readFile(new URL(name, SRC), 'utf8') })),
  );
}

test('no module under src/ calls process.exit', async () => {
  for (const { name, text } of await sources()) {
    assert.doesNotMatch(text, /process\.exit\s*\(/, `${name} calls process.exit`);
  }
});

test('no module under src/ reads the wall clock', async () => {
  for (const { name, text } of await sources()) {
    assert.doesNotMatch(text, /Date\.now\s*\(/, `${name} reads Date.now`);
    // `new Date(value)` is fine. `new Date()` reads the clock.
    assert.doesNotMatch(text, /new Date\s*\(\s*\)/, `${name} reads the clock via new Date()`);
  }
});

test('only src/prompt.js may reach for a terminal prompt', async () => {
  // prompt.js is the deliberate exception. It is the adapter that owns the
  // dialogue, which is why the CLI injects it and every other test replaces it.
  // Keeping the dependency in exactly one file is what makes that possible.
  for (const { name, text } of await sources()) {
    if (name === 'prompt.js') continue;
    assert.doesNotMatch(text, /@inquirer/, `${name} imports a prompt library`);
  }
});

test('src/prompt.js is the only file that needs the prompt dependency', async () => {
  // Guards the claim above from becoming vacuous. If prompt.js stopped using
  // the library, the exception should be deleted rather than left standing.
  const text = await readFile(new URL('prompt.js', SRC), 'utf8');
  assert.match(text, /@inquirer/);
});
