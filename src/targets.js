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

/**
 * The instruction files one platform reads at one scope, outermost preference
 * first.
 *
 * The resident fragment is inert until an instruction file imports it, so
 * `doctor` has to know which files could carry the import and `install` has to
 * know which one to name. That is layout knowledge, so it lives here beside
 * `LAYOUT` rather than in a second table somewhere else.
 *
 * The list is wide on purpose. A project may carry `CLAUDE.md` and `AGENTS.md`
 * together, with one importing the other — this repository does exactly that —
 * and a check that reads only the first would report "not imported" against a
 * user who did everything right. A false alarm is how a warning gets ignored,
 * and reading one extra file costs a read.
 *
 * Membership is this repository's own claim, from the label it gives the
 * target, and is not verified against either agent's documented load order.
 * `CONSUMERS` above carries the same caveat, and issue #28 tracks it.
 */
const INSTRUCTIONS = {
  claude: {
    user: [path.join('.claude', 'CLAUDE.md')],
    project: ['CLAUDE.md', 'AGENTS.md', path.join('.claude', 'CLAUDE.md')],
  },
  cowork: { user: [path.join('.claude', 'CLAUDE.md')] },
  codex: { user: [path.join('.codex', 'AGENTS.md')], project: ['AGENTS.md'] },
  agents: { user: [path.join('.agents', 'AGENTS.md')] },
};

export function instructionFiles({ platform, scope, home, cwd }) {
  const root = scope === 'user' ? home : cwd;
  return (INSTRUCTIONS[platform]?.[scope] ?? []).map((rel) => path.join(root, rel));
}
