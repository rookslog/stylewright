/**
 * Checks that the resident fragment still matches the skill it comes from.
 *
 * One rule now has two delivery forms, and two forms of one rule drift. The
 * skill is the single source, the fragment is generated from it, and this
 * script is what fails a checkout where the two disagree. ADR-0022 records the
 * decision.
 *
 * `--write` regenerates the fragment instead of failing. It is how you fix
 * what this reports.
 *
 * This lives in `scripts/` and not in `src/`, because it owns the exit code
 * and nobody who installs the package needs it.
 */
import { writeFileSync } from 'node:fs';
import { checkResident, residentPath } from '../src/resident.js';

const write = process.argv.includes('--write');
const repoRoot = process.cwd();
const { expected, problems } = await checkResident(repoRoot);

if (write) {
  if (expected === null) {
    for (const p of problems) process.stderr.write(`${p}\n`);
    process.exit(1);
  }
  writeFileSync(residentPath(repoRoot), expected);
  process.stdout.write('Resident fragment written from the skill.\n');
} else if (problems.length) {
  for (const p of problems) process.stderr.write(`${p}\n`);
  process.exit(1);
} else {
  process.stdout.write('Resident fragment matches its skill.\n');
}
