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
  for (const rel of rels) {
    const state = await destinationState(path.join(repoRoot, rel));
    if (state !== 'absent') {
      throw new Error(`Cannot scaffold "${name}": ${rel} already exists, as a ${state}.`);
    }
  }

  const written = [];
  try {
    for (const [rel, body] of outputs) {
      const abs = path.join(repoRoot, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      // `wx` refuses an existing path rather than truncating it, and it does
      // not follow a link. The checks above report a collision in words. This
      // is what holds if one appears between the check and the write.
      await fs.writeFile(abs, body, { flag: 'wx' });
      written.push(rel);
    }
  } catch (err) {
    // A half-written skill passes neither check and looks like a skill, so it
    // is worse than no skill. Take back only what this call wrote.
    for (const rel of written.reverse()) await fs.rm(path.join(repoRoot, rel), { force: true });
    throw err;
  }

  return written.sort();
}
