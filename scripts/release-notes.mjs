/**
 * Reads the release notes for one version out of CHANGELOG.md.
 *
 * The release workflow puts the result in the GitHub Release body. A hand
 * written changelog entry says what changed and why. Generated commit lists do
 * not, so this reads the file that a person wrote.
 *
 * This lives in `scripts/` and not in `src/`, because `package.json` publishes
 * `src` to npm and nobody who installs the package needs this.
 */

const HEADING = /^##\s+(.*)$/;

/**
 * Returns the body of the section for `version`, without its heading.
 *
 * A heading matches when its text starts with the version, so both
 * `## 0.1.0` and `## 0.1.0 — 2026-07-27` resolve for `0.1.0`. A leading `v` on
 * the requested version is ignored, so a git tag works as it is.
 *
 * Throws when the section is absent or empty. A release with no notes is a
 * defect, and a silent empty string would ship it.
 */
export function releaseNotes(changelog, version) {
  const wanted = String(version).replace(/^v/, '');
  const lines = changelog.split('\n');

  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const heading = HEADING.exec(lines[i]);
    if (!heading) continue;

    if (start === -1) {
      // Match on a word boundary. Without it, `0.1` would match `0.1.0`.
      const text = heading[1].trim();
      if (text === wanted || text.startsWith(`${wanted} `)) start = i + 1;
    } else {
      end = i;
      break;
    }
  }

  if (start === -1) {
    throw new Error(`CHANGELOG.md has no section for version ${wanted}`);
  }

  const body = lines.slice(start, end).join('\n').trim();
  if (!body) {
    throw new Error(`The CHANGELOG.md section for ${wanted} is empty`);
  }
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const version = process.argv[2];
  if (!version) {
    process.stderr.write('usage: release-notes.mjs <version>\n');
    process.exit(2);
  }
  try {
    process.stdout.write(`${releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
