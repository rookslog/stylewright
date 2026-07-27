import path from 'node:path';

const LAYOUT = {
  claude: { dir: '.claude', scopes: ['user', 'project'] },
  cowork: { dir: '.claude', scopes: ['user'] },
  codex: { dir: '.codex', scopes: ['user', 'project'] },
  agents: { dir: '.agents', scopes: ['user'] },
};

export const PLATFORMS = Object.keys(LAYOUT);
export const SCOPES = ['user', 'project'];

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
