import { CONSUMERS, SCOPES, resolveTarget, describeTarget } from './targets.js';
import { readManifest } from './manifest.js';

// A duplicate is a problem only when ONE agent would load two copies of the
// same skill name at once. Grouping by directory instead of by agent reports
// the README's own `--platform claude,codex` example as a fault, because that
// writes two directories on purpose and each agent reads one of them.
//
// Within one agent the scopes still collide. Claude reads user scope and
// project scope together, so a skill present in both is a real conflict.
//
// Distinct paths still matter inside a group. `cowork/user` resolves to the
// same path as `claude/user`, and `user` equals `project` when the process runs
// in the home directory. Counting labels rather than paths would report a
// duplicate for every ordinary install.
// A group is the set of directories ONE agent reads, which is not the same as
// the set a platform key names. `targets.js` owns that relation, because the
// layout it describes is what makes it true.
function targetsByAgent({ home, cwd }) {
  const byAgent = new Map();
  for (const [agent, platforms] of Object.entries(CONSUMERS)) {
    const byPath = new Map();
    for (const platform of platforms) {
      for (const scope of SCOPES) {
        let dir;
        try {
          dir = resolveTarget({ platform, scope, home, cwd });
        } catch {
          continue;
        }
        if (!byPath.has(dir)) byPath.set(dir, []);
        byPath.get(dir).push(describeTarget({ platform, scope }));
      }
    }
    byAgent.set(agent, byPath);
  }
  return byAgent;
}

export async function doctor({ home, cwd }) {
  const findings = [];

  for (const [platform, byPath] of targetsByAgent({ home, cwd })) {
    const seen = new Map();
    for (const [dir, labels] of byPath) {
      const manifest = await readManifest(dir);
      for (const name of Object.keys(manifest.skills)) {
        if (!seen.has(name)) seen.set(name, new Map());
        seen.get(name).set(dir, labels);
      }
    }
    for (const [name, places] of seen) {
      if (places.size < 2) continue;
      const where = [...places.entries()]
        .map(([dir, labels]) => `${dir} (${labels.join(', ')})`)
        .sort();
      findings.push({
        level: 'error',
        code: 'duplicate-install',
        // "Remove one copy" was wrong once `agents` joined every group: the
        // cross-agent copy appears in more than one finding, and removing it
        // resolves all of them. Name the copies and leave the choice, rather
        // than assert a count that depends on findings not shown here.
        message: `Skill "${name}" is installed in ${places.size} directories that ${platform} reads at once: ${where.join('; ')}. Keep one.`,
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}
