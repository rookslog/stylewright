import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'acorn';

/**
 * CONTRIBUTING and AGENTS.md both state the purity rule for `src/`. Nothing
 * checked it, so a change could break the rule and still pass CI. These tests
 * are what make the rule enforceable rather than advisory.
 *
 * The rule exists so that manifests stay comparable across install pathways in
 * the conformance suite. Time is passed in, never read.
 *
 * These tests parse each module and inspect the tree. The first version matched
 * text, so `const bye = process.exit`, `new Date` without parentheses, and a
 * direct read of standard input all passed it.
 *
 * What counts as a violation:
 *
 * - A reference to a guarded global that is not a member access naming an
 *   allowed property. `process`, `Date`, `performance`, `globalThis` and
 *   `global` are guarded. A reference to the whole object is a violation by
 *   itself, because `const p = process` puts the property beyond a property
 *   check. So is `process[name]`, whose property this test cannot read.
 * - `new Date` with no argument, and a `new Date` whose arguments are all
 *   spreads, because a spread may carry nothing. `new Date(value)` is fine.
 * - `Date` called as a function, which returns the current time whatever its
 *   arguments say.
 * - `Intl.DateTimeFormat`, which formats the current moment when it is handed
 *   no date, and reaches the clock without naming `Date`.
 * - Importing a module that hands back a guarded global or a terminal
 *   dialogue, by static import, by dynamic import, or by `require`. A dynamic
 *   import whose specifier is not a literal counts, because it names nothing
 *   this test can read. So does `node:perf_hooks`, which exports the clock
 *   under whatever local name the importer picks, and `node:module`, whose
 *   `createRequire` builds a `require` this test cannot follow. Naming
 *   `require` without calling it counts for the same reason.
 * - Reading file descriptor 0, or a path that names the terminal. The reader
 *   may be aliased first, and the descriptor may arrive as an `fd` option
 *   rather than as the first argument.
 *
 * An identifier in a property slot or an import name slot is a name and not a
 * reference, so `entry.process` stays fine. Every other position counts, a
 * binding that shadows the global included, because shadowing is how an alias
 * hides.
 */

const SRC = new URL('../src/', import.meta.url);

async function sources() {
  const names = (await readdir(SRC)).filter((n) => n.endsWith('.js'));
  return Promise.all(names.map(async (name) => ({ name, tree: await tree(name) })));
}

async function tree(name) {
  const text = await readFile(new URL(name, SRC), 'utf8');
  return parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}

/** Every node in the tree, with the node that holds it and the slot it sits in. */
function* nodes(node, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  yield { node, parent, key };
  for (const slot of Object.keys(node)) {
    const value = node[slot];
    if (Array.isArray(value)) {
      for (const item of value) yield* nodes(item, node, slot);
    } else if (value && typeof value === 'object') {
      yield* nodes(value, node, slot);
    }
  }
}

/** The name a member access or a property key states, or null when the test cannot read it. */
function nameOf(node, slot) {
  const key = node[slot];
  if (!key) return null;
  if (!node.computed && key.type === 'Identifier') return key.name;
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}

/** The property a member access reads, or null when the test cannot read it. */
function propertyOf(member) {
  return nameOf(member, 'property');
}

const NAME_SLOTS = new Set([
  'MemberExpression.property',
  'Property.key',
  'PropertyDefinition.key',
  'MethodDefinition.key',
  'ImportSpecifier.imported',
  'ExportSpecifier.local',
  'ExportSpecifier.exported',
]);

function isName(parent, key) {
  if (!parent) return false;
  if (parent.computed && (key === 'property' || key === 'key')) return false;
  return NAME_SLOTS.has(`${parent.type}.${key}`);
}

function at(node, detail) {
  return { line: node.loc.start.line, detail };
}

/** Guard `globalThis` and `global` over the same names, one step removed. */
function reachedThrough(names) {
  return { globalThis: names, global: names };
}

function guardedGlobals(tree, guards, constructible = []) {
  const found = [];
  for (const { node, parent, key } of nodes(tree)) {
    if (node.type !== 'Identifier') continue;
    const banned = guards[node.name];
    if (!banned || isName(parent, key)) continue;
    if (constructible.includes(node.name) && parent.type === 'NewExpression' && parent.callee === node) {
      continue;
    }
    if (parent.type === 'MemberExpression' && parent.object === node) {
      const property = propertyOf(parent);
      if (property === null) found.push(at(node, `${node.name}[...] reads a property this test cannot name`));
      else if (banned.includes(property)) found.push(at(node, `${node.name}.${property}`));
      continue;
    }
    found.push(at(node, `${node.name} is referenced whole, which hides what it reaches for`));
  }
  return found;
}

/** Every module this file pulls in, by static import, dynamic import, or `require`. */
function imported(tree) {
  const out = [];
  for (const { node, parent, key } of nodes(tree)) {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
      if (node.source) out.push({ node, specifier: node.source.value });
    } else if (node.type === 'ImportExpression') {
      const literal = node.source.type === 'Literal' && typeof node.source.value === 'string';
      out.push({ node, specifier: literal ? node.source.value : null });
    } else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const first = node.arguments[0];
      const literal = first && first.type === 'Literal' && typeof first.value === 'string';
      out.push({ node, specifier: literal ? first.value : null });
    } else if (node.type === 'Identifier' && node.name === 'require' && !isName(parent, key)
      && !(parent && parent.type === 'CallExpression' && parent.callee === node)) {
      // `const r = require` moves the call beyond the branch above, and the
      // specifier it later reads is one this test never sees.
      out.push({ node, specifier: null, detail: 'names require without calling it, so what it pulls in is unreadable' });
    }
  }
  return out;
}

function importFindings(tree, banned) {
  const found = [];
  for (const { node, specifier, detail } of imported(tree)) {
    if (detail) found.push(at(node, detail));
    else if (specifier === null) found.push(at(node, 'imports a specifier this test cannot read'));
    else if (banned.test(specifier)) found.push(at(node, `imports ${specifier}`));
  }
  return found;
}

// `node:process` hands back the same object the global names, so an import of
// it reopens both the exit check and the standard input check.
const PROCESS_MODULE = /^(node:)?process$/;

// `createRequire` is the one way an ES module builds a `require`, and the
// module it comes from is what this test can name. The local name is not,
// because an import renames anything.
const REQUIRE_MODULE = /^(node:)?module$/;

// `node:perf_hooks` exports the same `performance` the global names, under
// whatever local name the importer picks.
const CLOCK_MODULE = /^(node:)?perf_hooks$/;

function anyOf(...patterns) {
  return new RegExp(patterns.map((pattern) => pattern.source).join('|'));
}

async function report(check, { skip = [] } = {}) {
  const lines = [];
  for (const { name, tree } of await sources()) {
    if (skip.includes(name)) continue;
    for (const { line, detail } of check(tree)) lines.push(`src/${name}:${line} ${detail}`);
  }
  return lines;
}

test('no module under src/ calls process.exit', async () => {
  const found = await report((tree) => [
    ...guardedGlobals(tree, { process: ['exit'], ...reachedThrough(['process']) }),
    ...importFindings(tree, anyOf(PROCESS_MODULE, REQUIRE_MODULE)),
  ]);
  assert.deepEqual(found, [], `process.exit is reachable:\n${found.join('\n')}`);
});

test('no module under src/ reads the wall clock', async () => {
  const found = await report((tree) => {
    const clocks = {
      Date: ['now'],
      performance: ['now'],
      process: ['hrtime', 'uptime'],
      Intl: ['DateTimeFormat'],
      ...reachedThrough(['Date', 'performance', 'process', 'Intl']),
    };
    const out = [
      ...guardedGlobals(tree, clocks, ['Date']),
      ...importFindings(tree, anyOf(CLOCK_MODULE, REQUIRE_MODULE)),
    ];
    for (const { node } of nodes(tree)) {
      const callee = node.callee;
      const isDate = callee && callee.type === 'Identifier' && callee.name === 'Date';
      if (!isDate) continue;
      if (node.type === 'CallExpression') {
        out.push(at(node, 'Date called as a function returns the current time'));
      } else if (node.type === 'NewExpression' && node.arguments.length === 0) {
        out.push(at(node, 'new Date takes no argument, so it reads the clock'));
      } else if (node.type === 'NewExpression' && node.arguments.every((a) => a.type === 'SpreadElement')) {
        out.push(at(node, 'new Date spreads arguments that may be empty, so it may read the clock'));
      }
    }
    return out;
  });
  assert.deepEqual(found, [], `the clock is read:\n${found.join('\n')}`);
});

// Reading descriptor 0 is reading the terminal by another name.
const READS_A_FILE = new Set(['readFile', 'readFileSync', 'createReadStream', 'open', 'openSync']);

/** True when this expression names a reader, directly or through a member access. */
function namesAReader(node, readers) {
  if (node.type === 'Identifier') return readers.has(node.name);
  if (node.type === 'MemberExpression') return readers.has(propertyOf(node));
  return false;
}

/**
 * The names this module can read a file through. A reader bound to another
 * name is the same reader, so `const rf = fs.readFileSync` extends the set and
 * `rf(0)` still counts. The pass repeats until it settles, because an alias of
 * an alias is one too.
 */
function readerAliases(tree) {
  const readers = new Set(READS_A_FILE);
  for (let settled = false; !settled;) {
    settled = true;
    for (const { node } of nodes(tree)) {
      const declared = node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init
        && namesAReader(node.init, readers) ? node.id.name : null;
      const destructured = node.type === 'Property' && node.value.type === 'Identifier'
        && readers.has(nameOf(node, 'key')) ? node.value.name : null;
      const bound = declared || destructured;
      if (bound && !readers.has(bound)) {
        readers.add(bound);
        settled = false;
      }
    }
  }
  return readers;
}
const TERMINAL_PATH = /^\/dev\/(stdin|tty)$/;
const TERMINAL_MODULE = /^(node:)?readline(\/promises)?$|^@inquirer\/|^(inquirer|enquirer|prompts)$/;

test('only src/prompt.js may reach for a terminal prompt', async () => {
  // prompt.js is the deliberate exception. It is the adapter that owns the
  // dialogue, which is why the CLI injects it and every other test replaces it.
  // Keeping the dependency in exactly one file is what makes that possible.
  const found = await report((tree) => {
    const out = [
      ...guardedGlobals(tree, { process: ['stdin'], ...reachedThrough(['process']) }),
      ...importFindings(tree, anyOf(TERMINAL_MODULE, PROCESS_MODULE, REQUIRE_MODULE)),
    ];
    const readers = readerAliases(tree);
    for (const { node } of nodes(tree)) {
      if (node.type === 'Literal' && typeof node.value === 'string' && TERMINAL_PATH.test(node.value)) {
        out.push(at(node, `names ${node.value}`));
      }
      // A descriptor also arrives as an option, where no argument position
      // names it: `createReadStream(null, { fd: 0 })` opens standard input.
      if (node.type === 'Property' && nameOf(node, 'key') === 'fd'
        && node.value.type === 'Literal' && node.value.value === 0) {
        out.push(at(node, 'names descriptor 0 as an fd option, which is standard input'));
      }
      if (node.type !== 'CallExpression' || !node.arguments.length) continue;
      const name = node.callee.type === 'Identifier'
        ? node.callee.name
        : node.callee.type === 'MemberExpression' ? propertyOf(node.callee) : null;
      const first = node.arguments[0];
      if (readers.has(name) && first.type === 'Literal' && first.value === 0) {
        out.push(at(node, `${name} reads descriptor 0, which is standard input`));
      }
    }
    return out;
  }, { skip: ['prompt.js'] });
  assert.deepEqual(found, [], `a terminal is reachable outside prompt.js:\n${found.join('\n')}`);
});

test('src/prompt.js is the only file that needs the prompt dependency', async () => {
  // Guards the claim above from becoming vacuous. If prompt.js stopped using
  // the library, the exception should be deleted rather than left standing.
  const specifiers = imported(await tree('prompt.js')).map((i) => i.specifier);
  assert.ok(
    specifiers.some((s) => typeof s === 'string' && s.startsWith('@inquirer/')),
    `prompt.js imports: ${specifiers.join(', ')}`,
  );
});
