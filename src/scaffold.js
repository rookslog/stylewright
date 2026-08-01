import fs from 'node:fs/promises';
import path from 'node:path';
import { TIERS } from './catalog.js';
import { destinationState, reachability } from './tree.js';

const NAME_RULE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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

Every statement above is traced to the source. The trace lives in the
stylewright repository at \`grounding/${tier}/${name}.md\`. It is not installed
with this skill.

## Notice

This skill is not affiliated with, endorsed by, or approved by the owner of the
source above.
`
    : `## Boundary

This skill has no external standard behind it. Every statement is our own
editorial guidance. The trace lives in the stylewright repository at
\`grounding/${tier}/${name}.md\`. It is not installed with this skill.
`;

  return `---
name: ${name}
description: ${description}
---

# ${name}

## Purpose

Replace this paragraph. State what a writer achieves with this skill, and when
to reach for it.

## Rules

- Replace this line with your first rule. Write one instruction in each line.

${boundary}`;
}

function groundingMd({ name, tier, source }) {
  const first = tier === 'standards'
    ? '| G-01 | Replace this line with your first rule. Write one instruction in each line. | Rules | RULE-ID | Section |'
    : '| E-01 | Replace this line with your first rule. Write one instruction in each line. | Rules |  | Our own guidance |';

  return `# Grounding: ${name}

Traces every statement in \`skills/${tier}/${name}/SKILL.md\`${tier === 'standards' ? ` to ${source}` : ''}.

- A **\`G\` row** traces to an external source. Its rule cell names the rule.
- An **\`E\` row** is our own editorial guidance. Its rule cell is empty.

This file stays in the repository. It does not install with the skill.

Checked by \`stylewright ground --check --skill ${name}\`.

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
${first}
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
  const dir = path.join('skills', tier, name);

  // Every output, decided before anything is written. The scaffold used to
  // check one path and write six. It checked whether the skill directory
  // existed, and then wrote each file with a call that follows a symbolic link
  // and truncates whatever it lands on. The grounding path is not under the
  // skill directory, so it was never checked at all: a grounding file linked
  // outside the repository was written through, the link survived, and an
  // existing draft was replaced without a word.
  const outputs = [
    [path.join(dir, 'SKILL.md'), skillMd({ name, tier, description: desc, source, url })],
    [path.join(dir, 'agents', 'openai.yaml'), agentsYaml({ name, description: desc })],
    [path.join(dir, 'LICENSE'), tier === 'standards'
      ? `Source license: ${license || 'FILL IN'}\n\nThe original digest in this directory is licensed MIT.\nSee SOURCE.md for the source record.\n`
      : 'MIT\n'],
    ...(tier === 'standards'
      ? [[path.join(dir, 'SOURCE.md'), sourceMd({ source, url, license: license || 'FILL IN' })]]
      : []),
    [path.join('grounding', tier, `${name}.md`), groundingMd({ name, tier, source })],
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
  try {
    for (const [rel, body] of outputs) {
      let cur = repoRoot;
      for (const part of path.dirname(rel).split(path.sep).filter((q) => q && q !== '.')) {
        cur = path.join(cur, part);
        const state = await destinationState(cur);
        if (state === 'absent') {
          const at = cur;
          await fs.mkdir(at).then(async () => {
            // Identity, for the same reason the files carry it. Removing a
            // remembered NAME removes whatever now stands there, and what now
            // stands there may be a link into somebody else's tree.
            const st = await fs.lstat(at);
            made.push({ abs: at, dev: st.dev, ino: st.ino });
          }, (e) => {
            if (e.code !== 'EEXIST') throw e;
          });
        } else if (state !== 'directory') {
          throw new Error(
            `Cannot scaffold "${name}": ${path.relative(repoRoot, cur)} is a ${state}.`);
        }
      }
      const abs = path.join(repoRoot, rel);
      await fs.writeFile(abs, body, { flag: 'wx' });
      // Identity, not the name. Rollback that deletes whatever now stands at a
      // remembered path deletes another process's file when it put one there.
      const st = await fs.lstat(abs);
      written.push({ rel, dev: st.dev, ino: st.ino });
    }
    for (const { rel } of written) {
      let cur = repoRoot;
      for (const part of path.dirname(rel).split(path.sep).filter((q) => q && q !== '.')) {
        cur = path.join(cur, part);
        if (await destinationState(cur) !== 'directory') {
          throw new Error(
            `Cannot scaffold "${name}": ${path.relative(repoRoot, cur)} changed while writing.`);
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
