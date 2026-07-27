# stylewright Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `stylewright` CLI engine and prove it end-to-end against one real skill, so that `npx stylewright install` places skills on disk for Claude and Codex at user or project scope, with drift-safe updates, an exact uninstall, an ASD-STE100 mechanical lint, and a checked grounding matrix.

**Architecture:** Pure-function core modules under `src/`, each with one responsibility, wrapped by a thin CLI in `bin/stylewright.mjs` that owns all prompting and all process exit codes. Core modules never prompt and never call `process.exit`, so every behavior is testable without a TTY. Filesystem side effects funnel through `install.js`, `uninstall.js`, and `manifest.js`. Time is injected, never read from a global, so manifests compare byte-for-byte across pathways in the conformance suite.

**Tech Stack:** Node 20+, ES modules, `node:test` and `node:assert/strict` as the test runner. One runtime dependency: `@inquirer/prompts` for interactive multi-select. No build step. No transpiler.

## Global Constraints

- Node 20 or later. ESM only (`"type": "module"`). No CommonJS.
- Run the suite as bare `node --test`, which auto-discovers test files. Do NOT
  pass a directory such as `node --test test/`. Node 26 treats a positional
  directory as a module path and fails with `Cannot find module`. Observed on
  Node v26.5.0 during Task 11. Single files still work: `node --test test/x.test.js`.
- Exactly one runtime dependency: `@inquirer/prompts`. Any further dependency needs a recorded decision.
- Skill directory paths MUST stay stable: `skills/<tier>/<name>/`. Pathway 1 addresses skills by GitHub path.
- Grounding matrices live at `grounding/<tier>/<name>.md`. They MUST NOT appear inside any skill directory, and MUST NOT appear in any installed tree.
- Install by copy, never by symbolic link.
- Core modules under `src/` MUST NOT call `process.exit`, MUST NOT prompt, and MUST NOT read the wall clock. The CLI and injected parameters own those.
- Engine, tests, and tooling are licensed MIT. Each skill carries its own `LICENSE`.
- Every `standards/` skill states that it is not affiliated with, endorsed by, or approved by the owner of its standard.
- No reproduced sentences from ASD-STE100. No dictionary entries.
- Docs written under Simplified Technical English: no semicolons, no contractions, procedural sentences of 20 words or fewer, descriptive sentences of 25 words or fewer.

**Platform and scope matrix** (exact values, used by `src/targets.js`):

| Platform key | Scope | Resolved path |
|---|---|---|
| `claude` | `user` | `$HOME/.claude/skills` |
| `claude` | `project` | `<cwd>/.claude/skills` |
| `cowork` | `user` | `$HOME/.claude/skills` (alias of `claude`/`user`) |
| `codex` | `user` | `$HOME/.codex/skills` |
| `codex` | `project` | `<cwd>/.codex/skills` |
| `agents` | `user` | `$HOME/.agents/skills` |

`cowork` has no `project` scope. Requesting it is an error.

---

### Task 1: Repository scaffold and test harness

**Files:**
- Create: `package.json`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `src/version.js`
- Test: `test/version.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `VERSION` (string) exported from `src/version.js`. Every later task imports this for manifest stamping.

- [ ] **Step 1: Write the failing test**

Create `test/version.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../src/version.js';

test('VERSION is a semver string', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('VERSION matches package.json', async () => {
  const pkg = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/version.test.js`
Expected: FAIL with `Cannot find module` for `../src/version.js`.

- [ ] **Step 3: Write minimal implementation**

Create `package.json`:

```json
{
  "name": "stylewright",
  "version": "0.1.0",
  "description": "Writing skills for coding agents, distilled from named standards.",
  "type": "module",
  "license": "MIT",
  "bin": { "stylewright": "./bin/stylewright.mjs" },
  "engines": { "node": ">=20" },
  "files": ["bin", "src", "skills", "README.md", "LICENSE"],
  "scripts": {
    "test": "node --test test/",
    "lint:docs": "node bin/stylewright.mjs lint README.md docs/",
    "check:ground": "node bin/stylewright.mjs ground --check --all"
  },
  "dependencies": { "@inquirer/prompts": "^7.0.0" }
}
```

Create `src/version.js`:

```javascript
export const VERSION = '0.1.0';
```

Create `.gitignore`:

```
node_modules/
.DS_Store
*.tgz
```

Create `LICENSE` containing the standard MIT License text, copyright `2026 Logan Rooks`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && node --test test/version.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json LICENSE .gitignore src/version.js test/version.test.js
git commit -m "feat: scaffold package, MIT license, and version module"
```

---

### Task 2: Target resolution

**Files:**
- Create: `src/targets.js`
- Test: `test/targets.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PLATFORMS` — array of platform keys: `['claude', 'cowork', 'codex', 'agents']`.
  - `resolveTarget({ platform, scope, home, cwd })` → absolute path string. Throws `Error` on an unknown platform, an unknown scope, or `cowork` with `project`.
  - `describeTarget({ platform, scope })` → human label string, for prompts and the manifest.

- [ ] **Step 1: Write the failing test**

Create `test/targets.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, PLATFORMS } from '../src/targets.js';

const home = '/home/u';
const cwd = '/work/proj';

test('resolves every documented platform and scope pair', () => {
  const cases = [
    [{ platform: 'claude', scope: 'user' }, '/home/u/.claude/skills'],
    [{ platform: 'claude', scope: 'project' }, '/work/proj/.claude/skills'],
    [{ platform: 'cowork', scope: 'user' }, '/home/u/.claude/skills'],
    [{ platform: 'codex', scope: 'user' }, '/home/u/.codex/skills'],
    [{ platform: 'codex', scope: 'project' }, '/work/proj/.codex/skills'],
    [{ platform: 'agents', scope: 'user' }, '/home/u/.agents/skills'],
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/targets.test.js`
Expected: FAIL with `Cannot find module` for `../src/targets.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/targets.js`:

```javascript
import path from 'node:path';

const LAYOUT = {
  claude: { dir: '.claude', scopes: ['user', 'project'] },
  cowork: { dir: '.claude', scopes: ['user'] },
  codex:  { dir: '.codex',  scopes: ['user', 'project'] },
  agents: { dir: '.agents', scopes: ['user'] },
};

export const PLATFORMS = Object.keys(LAYOUT);

export function resolveTarget({ platform, scope, home, cwd }) {
  const entry = LAYOUT[platform];
  if (!entry) {
    throw new Error(`Unknown platform "${platform}". Known: ${PLATFORMS.join(', ')}`);
  }
  if (scope !== 'user' && scope !== 'project') {
    throw new Error(`Unknown scope "${scope}". Known: user, project`);
  }
  if (!entry.scopes.includes(scope)) {
    throw new Error(`Platform "${platform}" does not support the "${scope}" scope.`);
  }
  const root = scope === 'user' ? home : cwd;
  return path.join(root, entry.dir, 'skills');
}

export function describeTarget({ platform, scope }) {
  return `${platform} (${scope})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/targets.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/targets.js test/targets.test.js
git commit -m "feat: resolve platform and scope to install paths"
```

---

### Task 3: Markdown segmentation

This module is shared by the lint and the grounding check. Both need to ignore code and tables.

**Files:**
- Create: `src/markdown.js`
- Test: `test/markdown.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `stripNonProse(text)` → string, same line count as input, with fenced code blocks, inline code spans, markdown table rows, and link targets blanked out. Blanking preserves line numbers.
  - `sentences(text)` → array of `{ text, line }`, where `line` is 1-indexed.
  - `sections(text)` → array of `{ heading, level, startLine, endLine, body }` from ATX headings.

- [ ] **Step 1: Write the failing test**

Create `test/markdown.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripNonProse, sentences, sections } from '../src/markdown.js';

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
  assert.deepEqual(got.map(s => s.text.trim()),
    ['One here.', 'Two here.', 'Three here.']);
  assert.deepEqual(got.map(s => s.line), [1, 1, 3]);
});

test('parses ATX sections with bounds', () => {
  const got = sections('# A\nbody a\n## B\nbody b\n');
  assert.equal(got.length, 2);
  assert.equal(got[0].heading, 'A');
  assert.equal(got[0].level, 1);
  assert.equal(got[1].heading, 'B');
  assert.ok(got[1].body.includes('body b'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/markdown.test.js`
Expected: FAIL with `Cannot find module` for `../src/markdown.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/markdown.js`:

```javascript
const blank = (s) => ' '.repeat(s.length);

export function stripNonProse(text) {
  const lines = text.split('\n');
  let inFence = false;
  const out = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return blank(line); }
    if (inFence) return blank(line);
    if (/^\s*\|.*\|\s*$/.test(line)) return blank(line);
    return line
      .replace(/`[^`]*`/g, blank)
      .replace(/\]\([^)]*\)/g, (m) => ']' + blank(m.slice(1)))
      .replace(/^\s*\[[^\]]+\]:.*$/g, blank);
  });
  return out.join('\n');
}

export function sentences(text) {
  const results = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^#{1,6}\s/.test(trimmed)) return;
    const parts = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    for (const part of parts) {
      if (part.trim()) results.push({ text: part.trim(), line: i + 1 });
    }
  });
  return results;
}

export function sections(text) {
  const lines = text.split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) heads.push({ level: m[1].length, heading: m[2], startLine: i + 1 });
  });
  return heads.map((h, i) => {
    const endLine = i + 1 < heads.length ? heads[i + 1].startLine - 1 : lines.length;
    return { ...h, endLine, body: lines.slice(h.startLine, endLine).join('\n') };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/markdown.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/markdown.js test/markdown.test.js
git commit -m "feat: markdown segmentation shared by lint and grounding"
```

---

### Task 4: Skill catalog

**Files:**
- Create: `src/catalog.js`
- Create: `test/fixtures/repo/skills/standards/demo-standard/SKILL.md`
- Create: `test/fixtures/repo/skills/standards/demo-standard/SOURCE.md`
- Create: `test/fixtures/repo/skills/standards/demo-standard/LICENSE`
- Create: `test/fixtures/repo/skills/craft/demo-craft/SKILL.md`
- Create: `test/fixtures/repo/skills/craft/demo-craft/LICENSE`
- Create: `test/fixtures/repo/grounding/standards/demo-standard.md`
- Test: `test/catalog.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readFrontmatter(text)` → `{ name, description }` or throws on missing frontmatter.
  - `loadCatalog(repoRoot)` → Promise of array of `{ name, tier, dir, description, groundingPath }`, sorted by name. `groundingPath` is absolute and may point at a file that does not exist.

- [ ] **Step 1: Write the failing test**

Create the fixture files first.

`test/fixtures/repo/skills/standards/demo-standard/SKILL.md`:

```markdown
---
name: demo-standard
description: Demo standards skill used by the test suite.
---

# Demo Standard

## Rules

- Use no more than 20 words in a sentence.
- Do not use semicolons.
```

`test/fixtures/repo/skills/standards/demo-standard/SOURCE.md`:

```markdown
# Source

- Source: Demo Standard Issue 1
- URL: https://example.invalid/demo
- License: CC0 1.0
- Verified: 2026-07-26
```

`test/fixtures/repo/skills/standards/demo-standard/LICENSE`: the single line `CC0 1.0 Universal`.

`test/fixtures/repo/skills/craft/demo-craft/SKILL.md`:

```markdown
---
name: demo-craft
description: Demo craft skill used by the test suite.
---

# Demo Craft

## Rules

- Write one idea in each sentence.
```

`test/fixtures/repo/skills/craft/demo-craft/LICENSE`: the single line `MIT`.

`test/fixtures/repo/grounding/standards/demo-standard.md`:

```markdown
# Grounding: demo-standard

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | Part 1, Section 5 |
| G-02 | Do not use semicolons. | Rules | Rule 8.1 | Part 1, Section 8 |
```

Create `test/catalog.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCatalog, readFrontmatter } from '../src/catalog.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');

test('reads name and description from frontmatter', () => {
  const fm = readFrontmatter('---\nname: a-skill\ndescription: Does a thing.\n---\n# Body\n');
  assert.equal(fm.name, 'a-skill');
  assert.equal(fm.description, 'Does a thing.');
});

test('throws when frontmatter is missing', () => {
  assert.throws(() => readFrontmatter('# No frontmatter\n'), /frontmatter/i);
});

test('loads both tiers, sorted by name', async () => {
  const cat = await loadCatalog(REPO);
  assert.deepEqual(cat.map(s => s.name), ['demo-craft', 'demo-standard']);
  assert.equal(cat.find(s => s.name === 'demo-craft').tier, 'craft');
  assert.equal(cat.find(s => s.name === 'demo-standard').tier, 'standards');
});

test('grounding path points outside the skill directory', async () => {
  const cat = await loadCatalog(REPO);
  const skill = cat.find(s => s.name === 'demo-standard');
  assert.ok(skill.groundingPath.endsWith(path.join('grounding', 'standards', 'demo-standard.md')));
  assert.ok(!skill.groundingPath.startsWith(skill.dir));
});

test('frontmatter name must match directory name', async () => {
  const cat = await loadCatalog(REPO);
  for (const s of cat) assert.equal(path.basename(s.dir), s.name);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/catalog.test.js`
Expected: FAIL with `Cannot find module` for `../src/catalog.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/catalog.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';

export const TIERS = ['standards', 'craft'];

export function readFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error('SKILL.md has no YAML frontmatter block.');
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  if (!out.name) throw new Error('SKILL.md frontmatter has no name.');
  return out;
}

async function listDirs(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function loadCatalog(repoRoot) {
  const skills = [];
  for (const tier of TIERS) {
    const tierDir = path.join(repoRoot, 'skills', tier);
    for (const name of await listDirs(tierDir)) {
      const dir = path.join(tierDir, name);
      const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      const fm = readFrontmatter(text);
      if (fm.name !== name) {
        throw new Error(`Skill "${name}" declares name "${fm.name}" in frontmatter.`);
      }
      skills.push({
        name, tier, dir,
        description: fm.description ?? '',
        groundingPath: path.join(repoRoot, 'grounding', tier, `${name}.md`),
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/catalog.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog.js test/catalog.test.js test/fixtures/
git commit -m "feat: skill catalog with out-of-tree grounding paths"
```

---

### Task 5: Manifest read, write, and hashing

**Files:**
- Create: `src/manifest.js`
- Test: `test/manifest.test.js`

**Interfaces:**
- Consumes: `VERSION` from `src/version.js`.
- Produces:
  - `MANIFEST_NAME` — the string `.stylewright-manifest.json`.
  - `hashFile(absPath)` → Promise of a lowercase hex sha256 string.
  - `readManifest(targetDir)` → Promise of a manifest object. Returns an empty manifest when the file is absent.
  - `writeManifest(targetDir, manifest)` → Promise of undefined. Writes with a trailing newline and two-space indent.
  - `emptyManifest()` → `{ schema: 1, stylewrightVersion: VERSION, skills: {} }`.
  - `recordSkill(manifest, { name, tier, pathway, files, now })` → new manifest object. Does not mutate its input. `now` is an ISO string supplied by the caller.

- [ ] **Step 1: Write the failing test**

Create `test/manifest.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MANIFEST_NAME, hashFile, readManifest, writeManifest, emptyManifest, recordSkill,
} from '../src/manifest.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-mf-'));

test('hashFile is stable and content-sensitive', async () => {
  const dir = await tmp();
  const a = path.join(dir, 'a.txt');
  await fs.writeFile(a, 'hello');
  const h1 = await hashFile(a);
  assert.equal(h1, await hashFile(a));
  await fs.writeFile(a, 'hello!');
  assert.notEqual(h1, await hashFile(a));
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('readManifest returns an empty manifest when absent', async () => {
  const dir = await tmp();
  const mf = await readManifest(dir);
  assert.deepEqual(mf.skills, {});
  assert.equal(mf.schema, 1);
});

test('round-trips through disk', async () => {
  const dir = await tmp();
  const mf = recordSkill(emptyManifest(), {
    name: 'demo', tier: 'craft', pathway: 'engine',
    files: { 'SKILL.md': 'a'.repeat(64) }, now: '2026-01-01T00:00:00.000Z',
  });
  await writeManifest(dir, mf);
  assert.deepEqual(await readManifest(dir), mf);
  const raw = await fs.readFile(path.join(dir, MANIFEST_NAME), 'utf8');
  assert.ok(raw.endsWith('\n'));
});

test('recordSkill does not mutate its input', () => {
  const base = emptyManifest();
  recordSkill(base, {
    name: 'demo', tier: 'craft', pathway: 'engine',
    files: {}, now: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(base.skills, {});
});

test('recordSkill stores the injected time, not the clock', () => {
  const mf = recordSkill(emptyManifest(), {
    name: 'demo', tier: 'craft', pathway: 'engine',
    files: {}, now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(mf.skills.demo.installedAt, '2026-01-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/manifest.test.js`
Expected: FAIL with `Cannot find module` for `../src/manifest.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/manifest.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { VERSION } from './version.js';

export const MANIFEST_NAME = '.stylewright-manifest.json';

export async function hashFile(absPath) {
  const buf = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function emptyManifest() {
  return { schema: 1, stylewrightVersion: VERSION, skills: {} };
}

export async function readManifest(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, MANIFEST_NAME), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return emptyManifest();
    throw err;
  }
}

export async function writeManifest(targetDir, manifest) {
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + '\n');
}

export function recordSkill(manifest, { name, tier, pathway, files, now }) {
  return {
    ...manifest,
    skills: {
      ...manifest.skills,
      [name]: { tier, pathway, installedAt: now, files },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/manifest.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifest.js test/manifest.test.js
git commit -m "feat: manifest with content hashes and injected time"
```

---

### Task 6: Install

**Files:**
- Create: `src/install.js`
- Test: `test/install.test.js`

**Interfaces:**
- Consumes: `loadCatalog` from `src/catalog.js`, manifest helpers from `src/manifest.js`.
- Produces: `installSkills({ repoRoot, targetDir, names, pathway = 'engine', now, force = false })` → Promise of `{ installed: string[], skipped: Array<{ name, reason, files }> }`. Copies each named skill directory into `targetDir/<name>`, then writes the manifest once. Refuses to overwrite a locally edited file unless `force` is true.

- [ ] **Step 1: Write the failing test**

Create `test/install.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { readManifest } from '../src/manifest.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-inst-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

test('copies the skill tree and writes a manifest', async () => {
  const target = await tmp();
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.ok(await exists(path.join(target, 'demo-standard', 'SKILL.md')));
  assert.ok(await exists(path.join(target, 'demo-standard', 'SOURCE.md')));
  const mf = await readManifest(target);
  assert.equal(mf.skills['demo-standard'].tier, 'standards');
  assert.equal(mf.skills['demo-standard'].pathway, 'engine');
  assert.match(mf.skills['demo-standard'].files['SKILL.md'], /^[0-9a-f]{64}$/);
});

test('never installs a grounding matrix', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const entries = await fs.readdir(path.join(target, 'demo-standard'));
  assert.ok(!entries.some(e => /grounding/i.test(e)));
  assert.ok(!(await exists(path.join(target, 'demo-standard', 'GROUNDING.md'))));
});

test('refuses to clobber a locally edited file without force', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const skillFile = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.writeFile(skillFile, 'LOCAL EDIT\n');
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'locally-modified');
  assert.deepEqual(res.skipped[0].files, ['SKILL.md']);
  assert.equal(await fs.readFile(skillFile, 'utf8'), 'LOCAL EDIT\n');
});

test('force overwrites a locally edited file', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const skillFile = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.writeFile(skillFile, 'LOCAL EDIT\n');
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW, force: true });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.notEqual(await fs.readFile(skillFile, 'utf8'), 'LOCAL EDIT\n');
});

test('rejects an unknown skill name', async () => {
  const target = await tmp();
  await assert.rejects(
    () => installSkills({ repoRoot: REPO, targetDir: target, names: ['nope'], now: NOW }),
    /nope/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/install.test.js`
Expected: FAIL with `Cannot find module` for `../src/install.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/install.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { hashFile, readManifest, writeManifest, recordSkill } from './manifest.js';

async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) out.push(...await walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

async function modifiedFiles(destDir, recorded) {
  const drifted = [];
  for (const [rel, expected] of Object.entries(recorded ?? {})) {
    const abs = path.join(destDir, rel);
    try {
      if (await hashFile(abs) !== expected) drifted.push(rel);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return drifted.sort();
}

export async function installSkills({
  repoRoot, targetDir, names, pathway = 'engine', now, force = false,
}) {
  const catalog = await loadCatalog(repoRoot);
  const byName = new Map(catalog.map(s => [s.name, s]));
  for (const name of names) {
    if (!byName.has(name)) throw new Error(`Unknown skill "${name}".`);
  }

  let manifest = await readManifest(targetDir);
  const installed = [];
  const skipped = [];

  for (const name of names) {
    const skill = byName.get(name);
    const destDir = path.join(targetDir, name);

    if (!force) {
      const drifted = await modifiedFiles(destDir, manifest.skills[name]?.files);
      if (drifted.length) {
        skipped.push({ name, reason: 'locally-modified', files: drifted });
        continue;
      }
    }

    const rels = await walk(skill.dir);
    const files = {};
    for (const rel of rels) {
      const from = path.join(skill.dir, rel);
      const to = path.join(destDir, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      files[rel] = await hashFile(to);
    }
    manifest = recordSkill(manifest, { name, tier: skill.tier, pathway, files, now });
    installed.push(name);
  }

  await writeManifest(targetDir, manifest);
  return { installed, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/install.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/install.js test/install.test.js
git commit -m "feat: install with drift detection and no grounding leakage"
```

---

### Task 7: Uninstall and doctor

**Files:**
- Create: `src/uninstall.js`
- Create: `src/doctor.js`
- Test: `test/uninstall.test.js`
- Test: `test/doctor.test.js`

**Interfaces:**
- Consumes: manifest helpers, `resolveTarget` and `PLATFORMS` from `src/targets.js`.
- Produces:
  - `uninstallSkills({ targetDir, names })` → Promise of `{ removed: string[], missing: string[] }`. Removes only files the manifest records, then removes now-empty directories, then rewrites the manifest.
  - `doctor({ repoRoot, home, cwd })` → Promise of array of `{ level, code, message }`, where `level` is `'error'` or `'warn'`. Detects code `duplicate-install` when a skill name appears in more than one resolved target.

- [ ] **Step 1: Write the failing test**

Create `test/uninstall.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { uninstallSkills } from '../src/uninstall.js';
import { readManifest } from '../src/manifest.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-uninst-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

test('removes exactly what the manifest records', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const stray = path.join(target, 'demo-standard', 'NOTES.md');
  await fs.writeFile(stray, 'user file\n');

  const res = await uninstallSkills({ targetDir: target, names: ['demo-standard'] });
  assert.deepEqual(res.removed, ['demo-standard']);
  assert.ok(await exists(stray), 'must not delete a file it did not install');
  assert.ok(!(await exists(path.join(target, 'demo-standard', 'SKILL.md'))));
  assert.deepEqual((await readManifest(target)).skills, {});
});

test('reports a skill that is not installed', async () => {
  const target = await tmp();
  const res = await uninstallSkills({ targetDir: target, names: ['demo-standard'] });
  assert.deepEqual(res.removed, []);
  assert.deepEqual(res.missing, ['demo-standard']);
});

test('removes the skill directory when it becomes empty', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(!(await exists(path.join(target, 'demo-craft'))));
});
```

Create `test/doctor.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { doctor } from '../src/doctor.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-doc-'));

test('reports nothing on a clean machine', async () => {
  const home = await tmp();
  const cwd = await tmp();
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('detects the same skill installed in two targets', async () => {
  const home = await tmp();
  const cwd = await tmp();
  for (const dir of ['.claude/skills', '.codex/skills']) {
    await installSkills({
      repoRoot: REPO, targetDir: path.join(home, dir),
      names: ['demo-standard'], now: NOW });
  }
  const found = await doctor({ repoRoot: REPO, home, cwd });
  const dup = found.find(f => f.code === 'duplicate-install');
  assert.ok(dup, 'expected a duplicate-install finding');
  assert.match(dup.message, /demo-standard/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/uninstall.test.js test/doctor.test.js`
Expected: FAIL with `Cannot find module` for `../src/uninstall.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/uninstall.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifest, writeManifest } from './manifest.js';

async function pruneEmpty(dir, stopAt) {
  let current = dir;
  while (current.startsWith(stopAt) && current !== stopAt) {
    let entries;
    try { entries = await fs.readdir(current); } catch { return; }
    if (entries.length) return;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

export async function uninstallSkills({ targetDir, names }) {
  const manifest = await readManifest(targetDir);
  const removed = [];
  const missing = [];
  const skills = { ...manifest.skills };

  for (const name of names) {
    const entry = skills[name];
    if (!entry) { missing.push(name); continue; }
    for (const rel of Object.keys(entry.files)) {
      const abs = path.join(targetDir, name, rel);
      await fs.rm(abs, { force: true });
      await pruneEmpty(path.dirname(abs), targetDir);
    }
    await pruneEmpty(path.join(targetDir, name), targetDir);
    delete skills[name];
    removed.push(name);
  }

  await writeManifest(targetDir, { ...manifest, skills });
  return { removed, missing };
}
```

Create `src/doctor.js`:

```javascript
import { PLATFORMS, resolveTarget, describeTarget } from './targets.js';
import { readManifest } from './manifest.js';

const SCOPES = ['user', 'project'];

export async function doctor({ home, cwd }) {
  const seen = new Map();

  for (const platform of PLATFORMS) {
    for (const scope of SCOPES) {
      let dir;
      try { dir = resolveTarget({ platform, scope, home, cwd }); } catch { continue; }
      const manifest = await readManifest(dir);
      for (const name of Object.keys(manifest.skills)) {
        if (!seen.has(name)) seen.set(name, new Set());
        seen.get(name).add(`${describeTarget({ platform, scope })} -> ${dir}`);
      }
    }
  }

  const findings = [];
  for (const [name, places] of seen) {
    if (places.size > 1) {
      findings.push({
        level: 'error',
        code: 'duplicate-install',
        message: `Skill "${name}" is installed in ${places.size} places: ${[...places].sort().join(', ')}. Two copies declare the same skill name.`,
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/uninstall.test.js test/doctor.test.js`
Expected: PASS, 5 tests total.

Note: `.claude/skills` and `.codex/skills` under one temporary HOME resolve to two distinct paths, so the duplicate test exercises real duplicate detection.

- [ ] **Step 5: Commit**

```bash
git add src/uninstall.js src/doctor.js test/uninstall.test.js test/doctor.test.js
git commit -m "feat: exact uninstall and duplicate-install detection"
```

---

### Task 8: The lint

**Files:**
- Create: `src/lint.js`
- Test: `test/lint.test.js`

**Interfaces:**
- Consumes: `stripNonProse`, `sentences`, `sections` from `src/markdown.js`.
- Produces: `lintText(text, { procedural = false } = {})` → array of `{ line, rule, message }`, sorted by line then rule. Rule keys: `sentence-length`, `semicolon`, `contraction`, `imperative`.

Rules, with exact limits:

- `sentence-length`: 20 words in a procedural region, 25 words elsewhere. A procedural region is any section whose heading matches `/procedure|steps|instructions/i`, plus any ordered-list item anywhere.
- `semicolon`: any `;` in prose.
- `contraction`: any word matching the contraction list.
- `imperative`: an ordered-list item whose first word ends in `ing`, or is an article or a pronoun.

- [ ] **Step 1: Write the failing test**

Create `test/lint.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintText } from '../src/lint.js';

const codes = (findings) => findings.map(f => f.rule).sort();

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
  const ok = 'word '.repeat(24) + 'end.';
  const bad = 'word '.repeat(25) + 'end.';
  assert.deepEqual(lintText(ok), []);
  assert.deepEqual(codes(lintText(bad)), ['sentence-length']);
});

test('applies 20 words inside a procedure section', () => {
  const body = 'word '.repeat(21) + 'end.';
  assert.deepEqual(lintText('## Procedure\n\n' + body), 
    lintText('## Procedure\n\n' + body));
  assert.deepEqual(codes(lintText('## Procedure\n\n' + body)), ['sentence-length']);
  assert.deepEqual(lintText('## Overview\n\n' + body), []);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lint.test.js`
Expected: FAIL with `Cannot find module` for `../src/lint.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lint.js`:

```javascript
import { stripNonProse, sections } from './markdown.js';

const CONTRACTIONS = /\b(?:can't|cannot've|don't|doesn't|won't|isn't|aren't|it's|that's|we're|you're|didn't|hasn't|haven't|wouldn't|couldn't|shouldn't|let's|there's|here's|what's|who's|they're|I'm|we've|you've|they've)\b/i;
const NON_IMPERATIVE_FIRST = /^(?:the|a|an|this|that|these|those|it|he|she|they|we|you|i)$/i;

const PROCEDURAL_HEADING = /procedure|steps|instructions/i;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function proceduralLines(text) {
  const set = new Set();
  for (const sec of sections(text)) {
    if (!PROCEDURAL_HEADING.test(sec.heading)) continue;
    for (let n = sec.startLine; n <= sec.endLine; n++) set.add(n);
  }
  return set;
}

export function lintText(text, { procedural = false } = {}) {
  const prose = stripNonProse(text);
  const proceduralZone = proceduralLines(text);
  const findings = [];
  const lines = prose.split('\n');

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    if (!rawLine.trim()) return;
    if (/^\s*#{1,6}\s/.test(rawLine)) return;

    const ordered = ORDERED_ITEM.exec(rawLine);
    const isStep = Boolean(ordered);
    const limit = (procedural || isStep || proceduralZone.has(line)) ? 20 : 25;

    if (rawLine.includes(';')) {
      findings.push({ line, rule: 'semicolon', message: 'Do not use semicolons.' });
    }
    const contraction = CONTRACTIONS.exec(rawLine);
    if (contraction) {
      findings.push({
        line, rule: 'contraction',
        message: `Do not use the contraction "${contraction[0]}".`,
      });
    }

    for (const part of rawLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []) {
      const body = ORDERED_ITEM.exec(part)?.[1] ?? part.replace(/^\s*[-*+]\s+/, '');
      const n = wordCount(body);
      if (n > limit) {
        findings.push({
          line, rule: 'sentence-length',
          message: `Sentence has ${n} words. The limit here is ${limit}.`,
        });
      }
    }

    if (isStep) {
      const first = ordered[1].trim().split(/\s+/)[0]?.replace(/[^A-Za-z']/g, '') ?? '';
      if (/ing$/i.test(first) || NON_IMPERATIVE_FIRST.test(first)) {
        findings.push({
          line, rule: 'imperative',
          message: `Start a step with an imperative verb. Found "${first}".`,
        });
      }
    }
  });

  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lint.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint.js test/lint.test.js
git commit -m "feat: mechanical ASD-STE100 lint"
```

---

### Task 9: The grounding check

**Files:**
- Create: `src/ground.js`
- Test: `test/ground.test.js`

**Interfaces:**
- Consumes: `sections` from `src/markdown.js`, `loadCatalog` from `src/catalog.js`.
- Produces:
  - `parseMatrix(text)` → array of `{ id, guidance, anchor, rule, location }`. Skips the header row and the separator row.
  - `checkSkill({ skillText, matrixText })` → array of `{ level, code, message }`. Codes: `missing-quote`, `wrong-anchor`, `uncovered-statement`, `g-row-no-rule`, `e-row-has-rule`, `no-matrix`.
  - `checkAll(repoRoot)` → Promise of `{ [skillName]: findings }`.

A normative statement, for coverage purposes, is any unordered-list item under a heading that is not named `Source`, `Boundary`, or `Notice`.

- [ ] **Step 1: Write the failing test**

Create `test/ground.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseMatrix, checkSkill, checkAll } from '../src/ground.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');

const SKILL = `---
name: s
description: d
---

# S

## Rules

- Use no more than 20 words in a sentence.
- Do not use semicolons.
`;

const MATRIX = `# Grounding: s

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| G-01 | Use no more than 20 words in a sentence. | Rules | Rule 5.1 | Part 1, Section 5 |
| G-02 | Do not use semicolons. | Rules | Rule 8.1 | Part 1, Section 8 |
`;

test('parses rows and skips the separator', () => {
  const rows = parseMatrix(MATRIX);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'G-01');
  assert.equal(rows[0].anchor, 'Rules');
  assert.equal(rows[1].rule, 'Rule 8.1');
});

test('a matching skill and matrix produce no findings', () => {
  assert.deepEqual(checkSkill({ skillText: SKILL, matrixText: MATRIX }), []);
});

test('detects a quote that no longer appears in the skill', () => {
  const drifted = SKILL.replace('Do not use semicolons.', 'Avoid semicolons.');
  const found = checkSkill({ skillText: drifted, matrixText: MATRIX });
  assert.ok(found.some(f => f.code === 'missing-quote'));
});

test('detects a quote under the wrong anchor', () => {
  const moved = MATRIX.replace('| Rules | Rule 8.1', '| Nowhere | Rule 8.1');
  const found = checkSkill({ skillText: SKILL, matrixText: moved });
  assert.ok(found.some(f => f.code === 'wrong-anchor'));
});

test('detects a skill statement with no row', () => {
  const extra = SKILL + '- Write one idea in each sentence.\n';
  const found = checkSkill({ skillText: extra, matrixText: MATRIX });
  assert.ok(found.some(f => f.code === 'uncovered-statement'));
});

test('a G row must carry a rule and an E row must not', () => {
  const gNoRule = MATRIX.replace('| Rule 5.1 |', '|  |');
  assert.ok(checkSkill({ skillText: SKILL, matrixText: gNoRule })
    .some(f => f.code === 'g-row-no-rule'));

  const eWithRule = MATRIX.replace('| G-01 |', '| E-01 |');
  assert.ok(checkSkill({ skillText: SKILL, matrixText: eWithRule })
    .some(f => f.code === 'e-row-has-rule'));
});

test('checkAll covers every skill in the repository', async () => {
  const all = await checkAll(REPO);
  assert.ok('demo-standard' in all);
  assert.deepEqual(all['demo-standard'], []);
  assert.ok(all['demo-craft'].some(f => f.code === 'no-matrix'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ground.test.js`
Expected: FAIL with `Cannot find module` for `../src/ground.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ground.js`:

```javascript
import fs from 'node:fs/promises';
import { sections } from './markdown.js';
import { loadCatalog } from './catalog.js';

const SKIP_HEADINGS = /^(source|boundary|notice|grounding)$/i;

export function parseMatrix(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/[\s:]/g, ''))) continue;
    if (/^id$/i.test(cells[0])) continue;
    rows.push({
      id: cells[0], guidance: cells[1], anchor: cells[2],
      rule: cells[3], location: cells[4],
    });
  }
  return rows;
}

function statements(skillText) {
  const out = [];
  for (const sec of sections(skillText)) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    for (const line of sec.body.split('\n')) {
      const m = /^\s*[-*+]\s+(.*\S)\s*$/.exec(line);
      if (m) out.push({ text: m[1], anchor: sec.heading });
    }
  }
  return out;
}

export function checkSkill({ skillText, matrixText }) {
  if (matrixText === null || matrixText === undefined) {
    return [{ level: 'error', code: 'no-matrix', message: 'Skill has no grounding matrix.' }];
  }
  const rows = parseMatrix(matrixText);
  const stmts = statements(skillText);
  const findings = [];

  for (const row of rows) {
    const hit = stmts.find(s => s.text === row.guidance);
    if (!hit) {
      findings.push({
        level: 'error', code: 'missing-quote',
        message: `${row.id}: "${row.guidance}" no longer appears in SKILL.md.`,
      });
      continue;
    }
    if (hit.anchor !== row.anchor) {
      findings.push({
        level: 'error', code: 'wrong-anchor',
        message: `${row.id}: quote is under "${hit.anchor}", not "${row.anchor}".`,
      });
    }
    const isG = /^G-/i.test(row.id);
    if (isG && !row.rule) {
      findings.push({
        level: 'error', code: 'g-row-no-rule',
        message: `${row.id}: a G row must cite a source rule.`,
      });
    }
    if (!isG && row.rule) {
      findings.push({
        level: 'error', code: 'e-row-has-rule',
        message: `${row.id}: an E row is our own guidance and must cite no source rule.`,
      });
    }
  }

  const covered = new Set(rows.map(r => r.guidance));
  for (const s of stmts) {
    if (!covered.has(s.text)) {
      findings.push({
        level: 'error', code: 'uncovered-statement',
        message: `"${s.text}" (under "${s.anchor}") has no grounding row.`,
      });
    }
  }
  return findings;
}

export async function checkAll(repoRoot) {
  const out = {};
  for (const skill of await loadCatalog(repoRoot)) {
    const skillText = await fs.readFile(`${skill.dir}/SKILL.md`, 'utf8');
    let matrixText = null;
    try { matrixText = await fs.readFile(skill.groundingPath, 'utf8'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    out[skill.name] = checkSkill({ skillText, matrixText });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ground.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ground.js test/ground.test.js
git commit -m "feat: grounding matrix parser and drift check"
```

---

### Task 10: The CLI

**Files:**
- Create: `bin/stylewright.mjs`
- Create: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: every module above.
- Produces: `run(argv, { home, cwd, repoRoot, stdout, now })` → Promise of an exit code number. `run` never calls `process.exit`. `bin/stylewright.mjs` calls `run` and sets `process.exitCode`.

Flag contract:

```
stylewright install [--tier standards|craft|all] [--skill <name>]...
                    [--platform claude,codex,...] [--scope user|project] [--force]
stylewright uninstall --skill <name>... [--platform ...] [--scope ...]
stylewright list
stylewright doctor
stylewright lint <path>...
stylewright ground --check (--all | --skill <name>)
```

`install` with no `--platform` and a TTY prompts. `install` with no `--platform` and no TTY is an error, so that continuous integration never hangs.

- [ ] **Step 1: Write the failing test**

Create `test/cli.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-cli-'));

function capture() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join('') };
}

test('list prints both tiers', async () => {
  const out = capture();
  const code = await run(['list'], { home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0);
  assert.match(out.text(), /demo-standard/);
  assert.match(out.text(), /demo-craft/);
});

test('install with flags writes into the resolved target', async () => {
  const home = await tmp();
  const out = capture();
  const code = await run(
    ['install', '--tier', 'standards', '--platform', 'claude', '--scope', 'user'],
    { home, cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 0);
  await fs.access(path.join(home, '.claude', 'skills', 'demo-standard', 'SKILL.md'));
});

test('install refuses to prompt without a TTY', async () => {
  const out = capture();
  const code = await run(['install'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW, interactive: false });
  assert.notEqual(code, 0);
  assert.match(out.text(), /--platform/);
});

test('lint returns 1 and prints the finding', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'bad.md');
  await fs.writeFile(file, 'Do this; then that.\n');
  const out = capture();
  const code = await run(['lint', file], {
    home: '/h', cwd: dir, repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 1);
  assert.match(out.text(), /semicolon/);
});

test('ground --check --all fails on the craft fixture', async () => {
  const out = capture();
  const code = await run(['ground', '--check', '--all'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 1);
  assert.match(out.text(), /demo-craft/);
});

test('unknown command returns 2', async () => {
  const out = capture();
  const code = await run(['frobnicate'], {
    home: '/h', cwd: '/c', repoRoot: REPO, stdout: out, now: NOW });
  assert.equal(code, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL with `Cannot find module` for `../src/cli.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/cli.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { resolveTarget, PLATFORMS } from './targets.js';
import { installSkills } from './install.js';
import { uninstallSkills } from './uninstall.js';
import { doctor } from './doctor.js';
import { lintText } from './lint.js';
import { checkAll } from './ground.js';
import { VERSION } from './version.js';

const USAGE = `stylewright ${VERSION}

  install    [--tier standards|craft|all] [--skill <name>]...
             [--platform ${PLATFORMS.join(',')}] [--scope user|project] [--force]
  uninstall  --skill <name>... [--platform ...] [--scope ...]
  list
  doctor
  lint       <path>...
  ground     --check (--all | --skill <name>)
`;

function parseFlags(argv) {
  const flags = { _: [], skill: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'force' || key === 'check' || key === 'all') { flags[key] = true; continue; }
    const value = argv[++i];
    if (key === 'skill') flags.skill.push(value);
    else flags[key] = value;
  }
  return flags;
}

async function collectFiles(targets) {
  const out = [];
  for (const t of targets) {
    const st = await fs.stat(t);
    if (st.isDirectory()) {
      for (const e of await fs.readdir(t, { withFileTypes: true })) {
        const p = path.join(t, e.name);
        if (e.isDirectory()) out.push(...await collectFiles([p]));
        else if (p.endsWith('.md')) out.push(p);
      }
    } else out.push(t);
  }
  return out;
}

export async function run(argv, ctx) {
  const { home, cwd, repoRoot, stdout, now, interactive = false } = ctx;
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const say = (s) => stdout.write(s + '\n');

  if (!command || command === 'help' || command === '--help') { say(USAGE); return 0; }

  if (command === 'list') {
    for (const s of await loadCatalog(repoRoot)) say(`${s.tier.padEnd(9)} ${s.name}  ${s.description}`);
    return 0;
  }

  if (command === 'doctor') {
    const findings = await doctor({ repoRoot, home, cwd });
    if (!findings.length) { say('No problems found.'); return 0; }
    for (const f of findings) say(`${f.level}: ${f.message}`);
    return 1;
  }

  if (command === 'lint') {
    if (!flags._.length) { say('lint needs at least one path.'); return 2; }
    let failed = 0;
    for (const file of await collectFiles(flags._)) {
      const text = await fs.readFile(file, 'utf8');
      for (const f of lintText(text)) {
        say(`${file}:${f.line}: ${f.rule}: ${f.message}`);
        failed++;
      }
    }
    if (failed) { say(`${failed} finding(s).`); return 1; }
    say('Lint clean.');
    return 0;
  }

  if (command === 'ground') {
    if (!flags.check) { say('ground needs --check.'); return 2; }
    const all = await checkAll(repoRoot);
    const names = flags.all ? Object.keys(all) : flags.skill;
    let failed = 0;
    for (const name of names) {
      for (const f of all[name] ?? []) { say(`${name}: ${f.code}: ${f.message}`); failed++; }
    }
    if (failed) { say(`${failed} finding(s).`); return 1; }
    say('Grounding clean.');
    return 0;
  }

  if (command === 'install' || command === 'uninstall') {
    if (!flags.platform) {
      if (!interactive) {
        say('No --platform given and no interactive terminal. Pass --platform and --scope.');
        return 2;
      }
      const { promptTargets } = await import('./prompt.js');
      Object.assign(flags, await promptTargets({ repoRoot }));
    }
    const scope = flags.scope ?? 'user';
    const catalog = await loadCatalog(repoRoot);
    let names = flags.skill;
    if (!names.length) {
      const tier = flags.tier ?? 'all';
      names = catalog.filter(s => tier === 'all' || s.tier === tier).map(s => s.name);
    }
    if (!names.length) { say('No skills selected.'); return 2; }

    for (const platform of String(flags.platform).split(',')) {
      const targetDir = resolveTarget({ platform, scope, home, cwd });
      if (command === 'install') {
        const res = await installSkills({
          repoRoot, targetDir, names, now, force: Boolean(flags.force) });
        for (const n of res.installed) say(`installed ${n} -> ${targetDir}`);
        for (const s of res.skipped) {
          say(`skipped ${s.name}: ${s.reason} (${s.files.join(', ')}). Use --force to overwrite.`);
        }
      } else {
        const res = await uninstallSkills({ targetDir, names });
        for (const n of res.removed) say(`removed ${n} from ${targetDir}`);
        for (const n of res.missing) say(`not installed: ${n} in ${targetDir}`);
      }
    }
    return 0;
  }

  say(`Unknown command "${command}".`);
  say(USAGE);
  return 2;
}
```

Create `src/prompt.js`:

```javascript
import { checkbox, select } from '@inquirer/prompts';
import { PLATFORMS } from './targets.js';

export async function promptTargets() {
  const platforms = await checkbox({
    message: 'Install for which platforms?',
    choices: PLATFORMS.map(p => ({ name: p, value: p })),
    required: true,
  });
  const scope = await select({
    message: 'Install at which scope?',
    choices: [
      { name: 'user (your home directory)', value: 'user' },
      { name: 'project (this repository)', value: 'project' },
    ],
  });
  const tier = await select({
    message: 'Which tier?',
    choices: [
      { name: 'both', value: 'all' },
      { name: 'standards only', value: 'standards' },
      { name: 'craft only', value: 'craft' },
    ],
  });
  return { platform: platforms.join(','), scope, tier };
}
```

Create `bin/stylewright.mjs`:

```javascript
#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

process.exitCode = await run(process.argv.slice(2), {
  home: os.homedir(),
  cwd: process.cwd(),
  repoRoot,
  stdout: process.stdout,
  now: new Date().toISOString(),
  interactive: process.stdin.isTTY === true,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x bin/stylewright.mjs && node --test test/cli.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add bin/stylewright.mjs src/cli.js src/prompt.js test/cli.test.js
git commit -m "feat: CLI with non-interactive safety and injected context"
```

---

### Task 11: Conformance suite for pathways 4 and 5

Pathways 1, 2, 3, and 6 arrive in Plan 2. This task builds the harness and covers the two pathways that exist now: manual copy and the engine.

**Files:**
- Create: `test/conformance/pathways.test.js`
- Create: `test/conformance/helpers.js`

**Interfaces:**
- Consumes: `installSkills`, `MANIFEST_NAME`.
- Produces: `treeOf(dir)` → Promise of a sorted array of `{ rel, sha256 }`, excluding the manifest file. Plan 2 imports this.

- [ ] **Step 1: Write the failing test**

Create `test/conformance/helpers.js`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MANIFEST_NAME } from '../../src/manifest.js';

export async function treeOf(dir, base = '') {
  const out = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (err) { if (err.code === 'ENOENT') return out; throw err; }
  for (const e of entries) {
    if (e.name === MANIFEST_NAME) continue;
    const rel = path.join(base, e.name);
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await treeOf(abs, rel));
    else {
      out.push({
        rel,
        sha256: crypto.createHash('sha256').update(await fs.readFile(abs)).digest('hex'),
      });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
```

Create `test/conformance/pathways.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../../src/install.js';
import { treeOf } from './helpers.js';

const REPO = path.join(import.meta.dirname, '..', 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const SKILL = 'demo-standard';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-conf-'));

async function pathwayEngine() {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: [SKILL], now: NOW });
  return target;
}

async function pathwayManualCopy() {
  const target = await tmp();
  await fs.cp(path.join(REPO, 'skills', 'standards', SKILL),
              path.join(target, SKILL), { recursive: true });
  return target;
}

test('engine and manual copy produce identical trees', async () => {
  const [a, b] = await Promise.all([pathwayEngine(), pathwayManualCopy()]);
  assert.deepEqual(await treeOf(a), await treeOf(b));
});

test('no pathway installs a grounding matrix', async () => {
  for (const make of [pathwayEngine, pathwayManualCopy]) {
    const dir = await make();
    const tree = await treeOf(dir);
    assert.equal(tree.filter(f => /grounding/i.test(f.rel)).length, 0,
      `pathway leaked a grounding file: ${JSON.stringify(tree.map(f => f.rel))}`);
  }
});

test('the fixture skill does have a grounding matrix in the repo', async () => {
  await fs.access(path.join(REPO, 'grounding', 'standards', `${SKILL}.md`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/conformance/pathways.test.js`
Expected: FAIL with `Cannot find module` for `./helpers.js`.

- [ ] **Step 3: Write minimal implementation**

Both files are written in Step 1. If the first test fails on a tree difference, the cause is a real defect in `installSkills`. Fix `src/install.js` rather than relaxing the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/conformance/pathways.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add test/conformance/
git commit -m "test: conformance harness for the manual and engine pathways"
```

---

### Task 12: Port the ASD-STE100 skill with its grounding matrix

**Files:**
- Create: `skills/standards/simplified-technical-english/SKILL.md`
- Create: `skills/standards/simplified-technical-english/SOURCE.md`
- Create: `skills/standards/simplified-technical-english/LICENSE`
- Create: `skills/standards/simplified-technical-english/references/rule-navigation.md`
- Create: `skills/standards/simplified-technical-english/references/examples.md`
- Create: `skills/standards/simplified-technical-english/agents/openai.yaml`
- Create: `grounding/standards/simplified-technical-english.md`

**Interfaces:**
- Consumes: the grounding schema from Task 9.
- Produces: the first real skill. Plan 2 copies this shape.

- [ ] **Step 1: Copy the existing skill and add the required files**

```bash
mkdir -p skills/standards/simplified-technical-english grounding/standards
cp -R ~/.claude/skills/simplified-technical-english/. \
      skills/standards/simplified-technical-english/
cp ~/.codex/skills/simplified-technical-english/agents/openai.yaml \
   skills/standards/simplified-technical-english/agents/openai.yaml
```

Verify no reproduced sentences from the standard. Read `SKILL.md` against the PDF at `~/Downloads/ASD-STE100_ISSUE9.pdf`. Every rule must be in our own words.

- [ ] **Step 2: Add the boundary, notice, LICENSE, and SOURCE files**

Append to `SKILL.md`, replacing the existing `## Source` section:

```markdown
## Source and boundary

This skill is a paraphrased operational digest. It reproduces no rule text and no
dictionary entries. It does not replace the official standard.

- Standard: [ASD-STE100 Issue 9 (2025)](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf)
- Grounding matrix: [grounding/standards/simplified-technical-english.md](https://github.com/OWNER/stylewright/blob/main/grounding/standards/simplified-technical-english.md)

## Notice

This skill is not affiliated with, endorsed by, or approved by ASD. `ASD-STE100`
and `Simplified Technical English` are European Union registered trademarks owned
by the Aerospace, Security and Defence Industries Association of Europe, number
017966390.
```

Replace `OWNER` with the account chosen in Open Item 2 of the spec.

Create `LICENSE` in the skill directory:

```
The ASD-STE100 standard is (c) ASD 2025. All rights reserved.

This directory contains no text from that standard. It contains an original
paraphrased digest, a navigation map, and examples, written by the stylewright
authors and licensed MIT.

See SOURCE.md for the source record, and the repository grounding matrix for a
statement-by-statement trace to the standard.
```

Create `SOURCE.md`:

```markdown
# Source record

- Source: ASD-STE100 Simplified Technical English, Issue 9, January 2025
- URL: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
- Rights holder: Aerospace, Security and Defence Industries Association of Europe
- License: (c) ASD 2025. All rights reserved. Reproduction rights are granted to
  eight enumerated categories of organization.
- Trademark: European Union registered trademark 017966390
- Verified: 2026-07-26, from the copyright page of the official PDF
- Transformation: paraphrased digest and navigation map. No rule text. No
  dictionary entries.
```

- [ ] **Step 3: Write the grounding matrix**

Create `grounding/standards/simplified-technical-english.md`. Every unordered-list item in `SKILL.md` needs one row. Quote each item exactly. Use the rule identifiers already mapped in `references/rule-navigation.md`.

```markdown
# Grounding: simplified-technical-english

Traces every statement in `skills/standards/simplified-technical-english/SKILL.md`
to ASD-STE100 Issue 9. A `G` row traces to the standard. An `E` row is our own
editorial guidance and traces to nothing.

Checked by `stylewright ground --check --skill simplified-technical-english`.

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| G-01 | Use approved STE words when the dictionary is available. | Vocabulary | Rule 1.1 | Part 1, Section 1 |
| G-02 | Use each approved word only with its approved meaning, part of speech, and form. | Vocabulary | Rule 1.2 | Part 1, Section 1 |
```

Continue until every list item in `SKILL.md` has a row. Mark any statement that
`rule-navigation.md` cannot map as an `E` row with an empty rule cell.

- [ ] **Step 4: Run the checks**

```bash
node bin/stylewright.mjs ground --check --skill simplified-technical-english
node bin/stylewright.mjs lint skills/standards/simplified-technical-english/
node --test test/
```

Expected: `Grounding clean.`, `Lint clean.`, and all tests passing. A
`uncovered-statement` finding means a row is missing. Add it. Do not delete the
statement to silence the check.

- [ ] **Step 5: Commit**

```bash
git add skills/standards/simplified-technical-english grounding/standards
git commit -m "feat: port the ASD-STE100 skill with its grounding matrix"
```

---

### Task 13: README, written under the skill

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the CLI contract from Task 10.
- Produces: the front-facing document. `npm run lint:docs` MUST pass against it.

- [ ] **Step 1: Write the README**

Cover, in this order: what `stylewright` is, the two tiers, the skill table with a license column, install by every available pathway, the manual copy instructions, the command reference, the authoring doctrine in brief, the grounding matrix and how to read a `G` row against an `E` row, per-skill licensing, and the non-affiliation notices.

Write it under Simplified Technical English. No semicolons. No contractions. Sentences of 25 words or fewer, and 20 words or fewer in the install procedure.

- [ ] **Step 2: Run the lint and read the findings**

Run: `node bin/stylewright.mjs lint README.md`
Expected: findings on the first pass. This is the point of the exercise.

- [ ] **Step 3: Fix every finding**

Rewrite each flagged sentence. Do not suppress a rule.

- [ ] **Step 4: Verify clean**

Run: `node bin/stylewright.mjs lint README.md docs/`
Expected: `Lint clean.`

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README written under and checked by the STE lint"
```

---

### Task 14: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the npm scripts from Task 1.
- Produces: the gate. All three dogfooding checks from spec section 6.4 run on every push.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - name: Unit and conformance tests
        run: npm test
      - name: Lint the repository documentation
        run: npm run lint:docs
      - name: Check every grounding matrix
        run: npm run check:ground
```

- [ ] **Step 2: Run every gate locally**

```bash
npm ci && npm test && npm run lint:docs && npm run check:ground
```

Expected: all four succeed with exit code 0.

- [ ] **Step 3: Verify the workflow fails on a real defect**

Introduce a semicolon into `README.md`, then run `npm run lint:docs`.
Expected: exit code 1 with a `semicolon` finding. Revert the change.

- [ ] **Step 4: Confirm the tree is clean**

Run: `git status --porcelain`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run tests, doc lint, and grounding checks on every push"
```

---

## Self-review

**Spec coverage.**

| Spec section | Task |
|---|---|
| 2.1 admission test | Plan 2, at authoring time |
| 2.2 grounding matrix | 9, 12 |
| 2.3 per-skill licensing | 12, 13 |
| 2.4 non-affiliation notice | 12, 13 |
| 3.1 roster, STE row | 12 |
| 4 layout | 1, 4, 12 |
| 4.1 universal skill directories | 6, 11 |
| 5.3 engine commands | 6, 7, 8, 9, 10 |
| 5.4 manifest and duplicate detection | 5, 7 |
| 6.1 conformance suite | 11, extended in Plan 2 |
| 6.2 lint | 8 |
| 6.3 grounding check | 9 |
| 6.4 dogfooding | 13, 14 |

**Deferred to Plan 2, deliberately:** roster rows for the other six skills (spec 3.1 and 3.4), pathways 1, 2, 3, and 6 with their marketplace manifests (spec 5.1, 5.2), and the two unverified plugin claims (spec 5.4). Plan 1 ships working software without them.

**Placeholder scan.** One intentional placeholder remains: `OWNER` in the Task 12 GitHub URL. It resolves when spec Open Item 2 resolves. Task 12 Step 2 names it explicitly.

**Type consistency.** `installSkills` returns `{ installed, skipped }` in Tasks 6, 10, and 11. `uninstallSkills` returns `{ removed, missing }` in Tasks 7 and 10. `lintText` returns `{ line, rule, message }` in Tasks 8 and 10. `checkSkill` returns `{ level, code, message }` in Tasks 9 and 10. `doctor` returns `{ level, code, message }` in Tasks 7 and 10. `treeOf` returns `{ rel, sha256 }` in Task 11 and is imported by Plan 2.
