import fs from 'node:fs/promises';
import path from 'node:path';
import { TIERS } from './catalog.js';
import { contentUnits } from './ground.js';
import { destinationState, reachability } from './tree.js';

const NAME_RULE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// Every repo-relative path this module names — in a message, in a return value,
// or on its way to `reachability` — is spelled with `/`, the one spelling a
// manifest key carries too. `path.join` spells it `\` where `path.sep` is `\`,
// which printed a different path for the same collision and, worse, left
// `ancestorsOf` with nothing to split, so the preflight inspected no ancestor
// at all on Windows.
const repoRelative = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

// One constant, quoted into the skill and into its matrix row, because the two
// must be identical for `ground --check` to pass. Written twice, they drift on
// the first edit to either — and the scaffold is the one place a drift is
// inherited by every skill made after it.
const RULE = 'Replace this line with your first rule. Write one instruction in each line.';
const PURPOSE = 'Replace this paragraph. State what a writer achieves with this skill,'
  + ' and when to reach for it.';

/**
 * The scaffold generates a skill whose statement and grounding row already
 * match, so `ground --check` passes immediately. The contributor then edits
 * both together. A scaffold that started red would teach the wrong lesson,
 * which is that the check is noise to be silenced.
 */
function skillMd({ name, tier, description, source, url }) {
  const boundary = tier === 'standards'
    ? `## Source and boundary

This skill is an operational digest written in our own words. It reproduces no
rule text from the source. It does not replace the official source.

Standard: [${source}](${url})

Every unit of content above is accounted for in a public trace. Each one either
cites a rule in the source, or is marked as our own editorial guidance, or is
marked as narrative that asserts no rule. The trace lives in the stylewright
repository at \`grounding/${tier}/${name}.md\`. It is not installed with this
skill.

## Notice

This skill is not affiliated with, endorsed by, or approved by the owner of the
source above.
`
    : `## Boundary

This skill has no external standard behind it. Every rule in it is our own
editorial guidance, and the trace marks the rest as narrative that asserts no
rule. The trace lives in the stylewright repository at
\`grounding/${tier}/${name}.md\`. It is not installed with this skill.
`;

  return `---
name: ${name}
description: ${description}
---

# ${name}

## Purpose

${PURPOSE}

## Rules

- ${RULE}

${boundary}`;
}

/**
 * The scaffold builds its matrix from the SAME extractor the check uses, so a
 * fresh skill cannot start with a row the check does not want or miss one it
 * does. A hand-written template drifted from the extractor twice.
 *
 * The KINDS are still a judgment, and the scaffold only guesses. It marks the
 * rule placeholder and the purpose placeholder as instructions, because both
 * tell a reader to do something, and everything else as narrative. A
 * contributor revises those as the skill fills in. Marking an instruction `N`
 * is the defect `AGENTS.md` calls critical, so the scaffold must not seed one.
 */
function groundingMd({ name, tier, skillText, source }) {
  // A pipe in a cell ends the cell. The check learned to read `\\|`, and this
  // generator never learned to write it, so a source named `ACME | Standard`
  // produced a matrix that failed its own first check.
  const cell = (v) => String(v).replace(/\|/g, '\\|');
  const instructs = new Set([PURPOSE, RULE]);
  const counts = { G: 0, E: 0, N: 0 };
  const rows = contentUnits(skillText).map((u) => {
    let kind = 'N';
    let note = u.text === u.anchor ? 'Section title, asserts no rule' : 'Asserts no rule';
    if (instructs.has(u.text)) {
      kind = u.text === RULE && tier === 'standards' ? 'G' : 'E';
      note = kind === 'G' ? 'Section' : 'Our own guidance';
    }
    counts[kind] += 1;
    const rule = kind === 'G' ? 'RULE-ID' : '';
    // A scaffolded G row is unaudited by construction. The scaffold guessed
    // the rule identifier a line above, so nobody has read anything against
    // anything, and seeding a date here would be the matrix lying on the day
    // it was created.
    const audit = kind === 'G' ? 'unaudited' : '';
    // Unquoted by construction, for the reason the row is unaudited. The
    // scaffold has read no source, so it has no words of one to carry.
    const quote = kind === 'G' ? 'unquoted' : '';
    return `| ${kind}-${String(counts[kind]).padStart(2, '0')} | ${cell(u.text)} | ${cell(u.anchor)} | ${rule} | ${quote} | ${note} | ${audit} |`;
  });

  return `# Grounding: ${name}

Disposes of every unit of content in \`skills/${tier}/${name}/SKILL.md\`${tier === 'standards' ? `, against ${source}` : ''}.

- A **\`G\` row** traces to an external source. Its rule cell names the rule.
- An **\`E\` row** is our own editorial guidance. Its rule cell is empty.
- An **\`N\` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The \`Audited\` cell of a \`G\` row says whether a person has read that row against
the source. Every row starts at \`unaudited\`, and no run of the checker raises
it. A person who checks a row writes the date and the row's digest in place of
the word. Editing any other cell changes that digest, so the audit goes stale
and the check says so.

The \`Source text\` cell of a \`G\` row carries the rule's own words, in quotation
marks, beside the identifier that names them. Every row starts at \`unquoted\`.
Quote the operative sentence where the exact wording is what a reader must
check, and stop well short of a quoted set that could stand in for the source.

**Quotation:** forbidden. No licence has been checked for this source yet, so
this file starts where every file starts. Read the licence, record the check in
\`SOURCE.md\`, and then edit this line.

A row that tells the reader to do something is never an \`N\` row. The kinds
below are a starting guess. Revise them as you write the skill.

This file stays in the repository. It does not install with the skill.

Checked by \`stylewright ground --check --skill ${name}\`.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function sourceMd({ source, url, license }) {
  return `# Source record

- Source: ${source}
- URL: ${url}
- Rights holder: FILL IN
- License: ${license}
- Verified: FILL IN a date, and the URL that stated the license
- Transformation: an operational digest in our own words. No rule text.

## How to re-check this record

1. Open the URL above.
2. Find the license statement.
3. Compare it against the line above.
`;
}

function agentsYaml({ name, description }) {
  const short = description.length > 60 ? `${description.slice(0, 59)}…` : description;
  return `interface:
  display_name: "${name}"
  short_description: "${short}"
  default_prompt: "Use $${name} to check this document."
`;
}

export async function scaffoldSkill({
  repoRoot, name, tier, description, source = '', url = '', license = '',
}) {
  if (!NAME_RULE.test(name)) {
    throw new Error(`Skill name "${name}" must be lowercase kebab-case, such as "plain-language".`);
  }
  if (!TIERS.includes(tier)) {
    throw new Error(`Unknown tier "${tier}". Known: ${TIERS.join(', ')}`);
  }
  if (tier === 'standards' && (!source || !url)) {
    throw new Error('A standards skill needs --source and --url. Every rule must trace somewhere.');
  }

  const desc = description || `FILL IN one sentence. Say when an agent should use ${name}.`;
  const dir = `skills/${tier}/${name}`;

  // Every output, decided before anything is written. The scaffold used to
  // check one path and write six. It checked whether the skill directory
  // existed, and then wrote each file with a call that follows a symbolic link
  // and truncates whatever it lands on. The grounding path is not under the
  // skill directory, so it was never checked at all: a grounding file linked
  // outside the repository was written through, the link survived, and an
  // existing draft was replaced without a word.
  //
  // The matrix is built from the skill text this call will write, and not from
  // the file afterwards, so the two cannot disagree even if the write never
  // happens.
  const skillText = skillMd({ name, tier, description: desc, source, url });
  const outputs = [
    [`${dir}/SKILL.md`, skillText],
    [`${dir}/agents/openai.yaml`, agentsYaml({ name, description: desc })],
    [`${dir}/LICENSE`, tier === 'standards'
      ? `Source license: ${license || 'FILL IN'}\n\nThe original digest in this directory is licensed MIT.\nSee SOURCE.md for the source record.\n`
      : 'MIT\n'],
    ...(tier === 'standards'
      ? [[`${dir}/SOURCE.md`, sourceMd({ source, url, license: license || 'FILL IN' })]]
      : []),
    [`grounding/${tier}/${name}.md`,
      groundingMd({ name, tier, skillText, source })],
  ];

  const rels = outputs.map(([rel]) => rel);
  const { blocked } = await reachability(repoRoot, rels);
  if (blocked.size) {
    throw new Error(
      `Cannot scaffold "${name}": ${[...blocked].sort().join(', ')} is not a directory.`);
  }
  // The skill DIRECTORY, not only the leaves this call would write. Checking
  // leaves alone let a directory holding `notes.md` and nothing else pass, and
  // install pathways copy a skill directory whole, so that file would ship
  // inside the new skill rather than be reported as a collision.
  if (await destinationState(path.join(repoRoot, dir)) !== 'absent') {
    throw new Error(`Cannot scaffold "${name}": ${dir} already exists.`);
  }
  // The OTHER tiers hold the same namespace. Checking the selected tier alone
  // let this command write the second skill of a name that `loadCatalog` then
  // refuses to read, which turns one mistyped tier into a repository no command
  // can load. The catalog is the enforcement, and this is the early word.
  for (const other of TIERS.filter((t) => t !== tier)) {
    const taken = `skills/${other}/${name}`;
    if (await destinationState(path.join(repoRoot, taken)) !== 'absent') {
      throw new Error(
        `Cannot scaffold "${name}": ${taken} already holds that name. `
        + 'A skill name is unique across tiers.');
    }
  }
  for (const rel of rels) {
    const state = await destinationState(path.join(repoRoot, rel));
    if (state !== 'absent') {
      throw new Error(`Cannot scaffold "${name}": ${rel} already exists, as a ${state}.`);
    }
  }

  // Three findings from one cause: the writes used primitives that resolve a
  // whole path, and the rollback remembered NAMES.
  //
  // `mkdir` with `recursive` and `writeFile` with `wx` both resolve every
  // ancestor, and `wx` protects the leaf alone, so a link appearing at an
  // ancestor after the preflight sent every output outside the repository and
  // the command reported success. Each directory is now created one level at a
  // time, and a level that is not already a directory stops the call.
  //
  // The chain is re-read after the last write, because creating it level by
  // level narrows that window and does not close it. Node offers no way to
  // open a path relative to a directory it has already checked, so detection
  // after the fact is the honest end of what this can do.
  const written = [];
  const made = [];
  const skillDir = path.join(repoRoot, dir);
  try {
    for (const [rel, body] of outputs) {
      let cur = repoRoot;
      for (const part of path.posix.dirname(rel).split('/').filter((q) => q && q !== '.')) {
        cur = path.join(cur, part);
        const state = await destinationState(cur);
        if (state === 'absent') {
          const at = cur;
          const created = await fs.mkdir(at).then(() => true, (e) => {
            if (e.code !== 'EEXIST') throw e;
            return false;
          });
          if (created) {
            // Identity, for the same reason the files carry it. Removing a
            // remembered NAME removes whatever now stands there, and what now
            // stands there may be a link into somebody else's tree.
            const st = await fs.lstat(at);
            made.push({ abs: at, dev: st.dev, ino: st.ino });
          // EEXIST says something appeared between the classification and the
          // call, and swallowing it accepted whatever appeared. A link there
          // sent the next write out of the repository, and the scan after the
          // last write reported it only once that file existed.
          } else if (await destinationState(at) !== 'directory') {
            throw new Error(
              `Cannot scaffold "${name}": ${repoRelative(repoRoot, at)} is not a directory.`);
          }
        } else if (state !== 'directory') {
          throw new Error(
            `Cannot scaffold "${name}": ${repoRelative(repoRoot, cur)} is a ${state}.`);
        }
        // The skill directory is not an ordinary ancestor. The preflight
        // refuses one that already exists, because install pathways copy this
        // directory whole and would ship whatever a stranger left inside it.
        // One that appears after the preflight is the same directory and the
        // same refusal, so this call must be the one that made it.
        if (cur === skillDir) {
          const st = await fs.lstat(cur);
          const mine = made.find((m) => m.abs === cur);
          if (!mine || mine.dev !== st.dev || mine.ino !== st.ino) {
            throw new Error(`Cannot scaffold "${name}": ${dir} already exists.`);
          }
        }
      }
      const abs = path.join(repoRoot, rel);
      // Identity comes from the HANDLE that created the file, not from the
      // path afterwards. Sampling through the path let another process swap
      // the file between the write and the stat, and rollback would then match
      // that inode and delete the replacement.
      const fh = await fs.open(abs, 'wx');
      try {
        // Recorded BEFORE the body goes in. The open created the file, so a
        // write that fails on a full disk leaves an empty file this call made,
        // and rollback that learned of it only afterwards left it standing and
        // refused every retry.
        const st = await fh.stat();
        written.push({ rel, dev: st.dev, ino: st.ino });
        await fh.writeFile(body);
      } finally {
        await fh.close();
      }
    }
    for (const { rel } of written) {
      let cur = repoRoot;
      for (const part of path.posix.dirname(rel).split('/').filter((q) => q && q !== '.')) {
        cur = path.join(cur, part);
        if (await destinationState(cur) !== 'directory') {
          throw new Error(
            `Cannot scaffold "${name}": ${repoRelative(repoRoot, cur)} changed while writing.`);
        }
      }
    }
  } catch (err) {
    // A half-written skill passes neither check and looks like a skill, so it
    // is worse than no skill. Take back what this call made, and only that.
    for (const { rel, dev, ino } of [...written].reverse()) {
      const abs = path.join(repoRoot, rel);
      const st = await fs.lstat(abs).catch(() => null);
      if (st?.isFile() && st.dev === dev && st.ino === ino) await fs.rm(abs, { force: true });
    }
    // Directories too, deepest first. Leaving them behind made the new
    // directory-level collision check refuse every retry until somebody
    // removed them by hand.
    for (const { abs, dev, ino } of [...made].reverse()) {
      const st = await fs.lstat(abs).catch(() => null);
      if (st?.isDirectory() && st.dev === dev && st.ino === ino) {
        await fs.rmdir(abs).catch(() => {});
      }
    }
    throw err;
  }

  return written.map(({ rel }) => rel).sort();
}
