import { PLATFORMS, resolveTarget, describeTarget } from './targets.js';
import { readManifest } from './manifest.js';

const SCOPES = ['user', 'project'];

export async function doctor({ home, cwd }) {
  const seen = new Map();

  for (const platform of PLATFORMS) {
    for (const scope of SCOPES) {
      let dir;
      try {
        dir = resolveTarget({ platform, scope, home, cwd });
      } catch {
        continue;
      }
      const manifest = await readManifest(dir);
      for (const name of Object.keys(manifest.skills)) {
        if (!seen.has(name)) seen.set(name, new Set());
        seen.get(name).add(`${describeTarget({ platform, scope })} -> ${dir}`);
      }
    }
  }

  const findings = [];
  for (const [name, places] of seen) {
    if (places.size > 1) {
      findings.push({
        level: 'error',
        code: 'duplicate-install',
        message: `Skill "${name}" is installed in ${places.size} places: ${[...places].sort().join(', ')}. Two copies declare the same skill name.`,
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}
