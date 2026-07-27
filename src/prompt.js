import { checkbox, select } from '@inquirer/prompts';
import { PLATFORMS } from './targets.js';

export async function promptTargets() {
  const platforms = await checkbox({
    message: 'Install for which platforms?',
    choices: PLATFORMS.map((p) => ({ name: p, value: p })),
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
