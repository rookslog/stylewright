import { PLATFORMS, resolveTarget, describeTarget } from './targets.js';
import { readManifest } from './manifest.js';

const SCOPES = ['user', 'project'];

// Several platform and scope pairs can resolve to ONE directory. `cowork/user`
// is always the same path as `claude/user`, and `user` equals `project` when
// the process runs in the home directory. Duplicate detection therefore counts
// distinct PATHS, never labels. Counting labels reports a duplicate for every
// ordinary Claude install.
function uniqueTargets({ home, cwd }) {
  const byPath = new Map();
  for (const platform of PLATFORMS) {
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
  return byPath;
}

export async function doctor({ home, cwd }) {
  const seen = new Map();

  for (const [dir, labels] of uniqueTargets({ home, cwd })) {
    const manifest = await readManifest(dir);
    for (const name of Object.keys(manifest.skills)) {
      if (!seen.has(name)) seen.set(name, new Map());
      seen.get(name).set(dir, labels);
    }
  }

  const findings = [];
  for (const [name, places] of seen) {
    if (places.size > 1) {
      const where = [...places.entries()]
        .map(([dir, labels]) => `${dir} (${labels.join(', ')})`)
        .sort();
      findings.push({
        level: 'error',
        code: 'duplicate-install',
        message: `Skill "${name}" is installed in ${places.size} directories: ${where.join('; ')}. Two copies declare the same skill name.`,
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}
