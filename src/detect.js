import fs from 'node:fs/promises';
import path from 'node:path';
import { PLATFORMS, resolveTarget } from './targets.js';
import { readManifest } from './manifest.js';

const PARENT = {
  claude: '.claude',
  cowork: '.claude',
  codex: '.codex',
  agents: '.agents',
};

/**
 * Report which platforms this machine appears to use, so that the installer can
 * pre-select them. Presence of the parent directory is the signal, because a
 * platform creates it before any skill exists.
 *
 * `cowork` shares a directory with `claude`, so it is never reported on its own.
 * Offering both would ask the user to pick the same path twice.
 */
export async function detectPlatforms({ home }) {
  const found = [];
  for (const platform of PLATFORMS) {
    if (platform === 'cowork') continue;
    const dir = path.join(home, PARENT[platform]);
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) found.push(platform);
    } catch {
      // Absent means the platform is not set up here. Not an error.
    }
  }
  return found;
}

/**
 * Map each skill name to the platforms where it is already installed at the
 * given scope. The installer shows this so that a user is not surprised by an
 * overwrite.
 */
export async function installedSkills({ home, cwd, scope }) {
  const out = new Map();
  for (const platform of PLATFORMS) {
    if (platform === 'cowork') continue;
    let dir;
    try {
      dir = resolveTarget({ platform, scope, home, cwd });
    } catch {
      continue;
    }
    const manifest = await readManifest(dir);
    for (const name of Object.keys(manifest.skills)) {
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(platform);
    }
  }
  return out;
}
