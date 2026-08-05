import fs from 'node:fs/promises';
import path from 'node:path';
import { TIERS } from './catalog.js';
import { contentUnits } from './ground.js';

const NAME_RULE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
    return `| ${kind}-${String(counts[kind]).padStart(2, '0')} | ${cell(u.text)} | ${cell(u.anchor)} | ${rule} | ${note} |`;
  });

  return `# Grounding: ${name}

Disposes of every unit of content in \`skills/${tier}/${name}/SKILL.md\`${tier === 'standards' ? `, against ${source}` : ''}.

- A **\`G\` row** traces to an external source. Its rule cell names the rule.
- An **\`E\` row** is our own editorial guidance. Its rule cell is empty.
- An **\`N\` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

A row that tells the reader to do something is never an \`N\` row. The kinds
below are a starting guess. Revise them as you write the skill.

This file stays in the repository. It does not install with the skill.

Checked by \`stylewright ground --check --skill ${name}\`.

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
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

  const skillText = skillMd({ name, tier, description: desc, source, url });
  await write(path.join(skillDir, 'SKILL.md'), skillText);
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
    groundingMd({ name, tier, skillText, source }));

  return written.sort();
}
