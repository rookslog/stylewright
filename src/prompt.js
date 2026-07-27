import { checkbox, select, confirm } from '@inquirer/prompts';
import { PLATFORMS, resolveTarget } from './targets.js';
import { detectPlatforms, installedSkills } from './detect.js';

const PLATFORM_LABEL = {
  claude: 'Claude Code, and Claude Cowork',
  codex: 'Codex',
  agents: 'Cross-agent directory (~/.agents/skills)',
  cowork: 'Claude Cowork',
};

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Build the skill checkbox choices. Everything starts selected. */
export function skillChoices(catalog, installed = new Map()) {
  return catalog.map((s) => {
    const where = installed.get(s.name);
    const mark = where?.length ? `  [installed: ${where.join(', ')}]` : '';
    return {
      name: `${s.name}  (${s.tier})${mark}`,
      value: s.name,
      description: truncate(s.description, 100),
      checked: true,
    };
  });
}

/** Build the platform checkbox choices, pre-selecting the detected ones. */
export function platformChoices(detected) {
  const offered = PLATFORMS.filter((p) => p !== 'cowork');
  return offered.map((p) => ({
    name: `${p}  — ${PLATFORM_LABEL[p]}${detected.includes(p) ? '  (found)' : ''}`,
    value: p,
    checked: detected.includes(p),
  }));
}

/**
 * Build the scope choices. Each option names the directory it resolves to,
 * because "user" and "project" mean nothing without the path behind them.
 */
export function scopeChoices({ home, cwd }) {
  return [
    { name: `user  — available everywhere (${home})`, value: 'user' },
    { name: `project  — this directory only (${cwd})`, value: 'project' },
  ];
}

/** Render the confirmation summary. Pure, so that it can be tested. */
export function summarize({ names, platforms, scope, home, cwd }) {
  const lines = [`${names.length} skill(s): ${names.join(', ')}`, ''];
  for (const platform of platforms) {
    lines.push(`  ${platform}  ->  ${resolveTarget({ platform, scope, home, cwd })}`);
  }
  return lines.join('\n');
}

/**
 * Run the guided install dialogue.
 *
 * `ask` holds the three prompt calls, and defaults to the real library. A test
 * passes fakes, which is what lets the sequencing, the overwrite warning, and
 * the returned flag shape be checked without a terminal. The library import
 * stays in this module, which is the single exception to the purity rule.
 */
export async function promptTargets({
  catalog, home, cwd, stdout, ask = { checkbox, select, confirm },
}) {
  const say = (s) => stdout.write(`${s}\n`);

  const detected = await detectPlatforms({ home });
  say('');
  say('stylewright install');
  say(detected.length
    ? `Found on this machine: ${detected.join(', ')}.`
    : 'No agent directories found in your home directory. Choose targets by hand.');
  say('');

  const skill = await ask.checkbox({
    message: 'Which skills? Everything is selected. Press space to remove one.',
    choices: skillChoices(catalog),
    required: true,
    pageSize: 15,
  });

  const platforms = await ask.checkbox({
    message: 'Install for which platforms?',
    choices: platformChoices(detected),
    required: true,
  });

  const scope = await ask.select({
    message: 'Install at which scope?',
    choices: scopeChoices({ home, cwd }),
  });

  const already = await installedSkills({ home, cwd, scope });
  const overwrites = skill.filter((n) => already.has(n));

  say('');
  say(summarize({ names: skill, platforms, scope, home, cwd }));
  if (overwrites.length) {
    say('');
    say(`Already installed, and will be replaced: ${overwrites.join(', ')}.`);
    say('Files that you edited yourself are never overwritten without --force.');
  }
  say('');

  const ok = await ask.confirm({ message: 'Install now?', default: true });
  if (!ok) return null;

  return { platform: platforms.join(','), scope, skill };
}
