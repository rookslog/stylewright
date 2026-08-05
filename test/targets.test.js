import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveTarget, PLATFORMS } from '../src/targets.js';

const home = '/home/u';
const cwd = '/work/proj';

test('resolves every documented platform and scope pair', () => {
  // Expectations are built with path.join because resolveTarget names a real
  // directory on THIS machine, in the platform's own separator. Manifest keys
  // are the paths that carry `/` everywhere; this is not one of them.
  const cases = [
    [{ platform: 'claude', scope: 'user' }, path.join(home, '.claude', 'skills')],
    [{ platform: 'claude', scope: 'project' }, path.join(cwd, '.claude', 'skills')],
    [{ platform: 'cowork', scope: 'user' }, path.join(home, '.claude', 'skills')],
    [{ platform: 'codex', scope: 'user' }, path.join(home, '.codex', 'skills')],
    [{ platform: 'codex', scope: 'project' }, path.join(cwd, '.codex', 'skills')],
    [{ platform: 'agents', scope: 'user' }, path.join(home, '.agents', 'skills')],
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveTarget({ ...input, home, cwd }), expected, JSON.stringify(input));
  }
});

test('cowork has no project scope', () => {
  assert.throws(
    () => resolveTarget({ platform: 'cowork', scope: 'project', home, cwd }),
    /cowork.*project/i);
});

test('rejects unknown platform and unknown scope', () => {
  assert.throws(() => resolveTarget({ platform: 'nope', scope: 'user', home, cwd }), /platform/i);
  assert.throws(() => resolveTarget({ platform: 'claude', scope: 'nope', home, cwd }), /scope/i);
});

test('cowork and claude user resolve to the same path', () => {
  assert.equal(
    resolveTarget({ platform: 'cowork', scope: 'user', home, cwd }),
    resolveTarget({ platform: 'claude', scope: 'user', home, cwd }));
});

test('PLATFORMS lists exactly the supported keys', () => {
  assert.deepEqual([...PLATFORMS].sort(), ['agents', 'claude', 'codex', 'cowork']);
});
