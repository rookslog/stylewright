import fs from 'node:fs/promises';
import path from 'node:path';
import { TIERS } from './catalog.js';

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

  const skillDir = path.join(repoRoot, 'skills', tier, name);
  try {
    await fs.access(skillDir);
    throw new Error(`Skill "${name}" already exists at skills/${tier}/${name}.`);
  } catch (err) {
    if (!err.code || err.code !== 'ENOENT') {
      if (err.message.includes('already exists')) throw err;
    }
  }

  const desc = description || `FILL IN one sentence. Say when an agent should use ${name}.`;
  const written = [];

  const write = async (abs, body) => {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body);
    written.push(path.relative(repoRoot, abs));
  };

  await write(path.join(skillDir, 'SKILL.md'),
    skillMd({ name, tier, description: desc, source, url }));
  await write(path.join(skillDir, 'agents', 'openai.yaml'),
    agentsYaml({ name, description: desc }));
  await write(path.join(skillDir, 'LICENSE'),
    tier === 'standards'
      ? `Source license: ${license || 'FILL IN'}\n\nThe original digest in this directory is licensed MIT.\nSee SOURCE.md for the source record.\n`
      : 'MIT\n');

  if (tier === 'standards') {
    await write(path.join(skillDir, 'SOURCE.md'),
      sourceMd({ source, url, license: license || 'FILL IN' }));
  }

  await write(path.join(repoRoot, 'grounding', tier, `${name}.md`),
    groundingMd({ name, tier, source }));

  return written.sort();
}
