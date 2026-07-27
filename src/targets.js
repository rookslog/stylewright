import path from 'node:path';

const LAYOUT = {
  claude: { dir: '.claude', scopes: ['user', 'project'] },
  cowork: { dir: '.claude', scopes: ['user'] },
  codex: { dir: '.codex', scopes: ['user', 'project'] },
  agents: { dir: '.agents', scopes: ['user'] },
};

export const PLATFORMS = Object.keys(LAYOUT);
export const SCOPES = ['user', 'project'];

/**
 * The platforms whose directories one agent loads at once.
 *
 * A platform key and an agent are not the same thing, and treating them as one
 * hid a real conflict. `agents` is a cross-agent directory convention rather
 * than an agent of its own, so it belongs in every consumer's set and is never
 * a consumer itself. `cowork` resolves to the Claude path, so it belongs to
 * Claude. Keying duplicate detection on the platform name instead reported no
 * finding when one skill sat in both `~/.agents/skills` and `~/.codex/skills`.
 *
 * Membership is this repository's own claim, from the label it gives the
 * target, and is not verified against either agent's documented load order.
 * See issue #28.
 */
export const CONSUMERS = {
  claude: ['claude', 'cowork', 'agents'],
  codex: ['codex', 'agents'],
};

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
