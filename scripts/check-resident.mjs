/**
 * Checks that the resident fragment still matches the skill it comes from.
 *
 * One rule now has two delivery forms, and two forms of one rule drift. The
 * skill is the single source, the fragment is generated from it, and this
 * script is what fails a checkout where the two disagree. ADR-0022 records the
 * decision.
 *
 * `--write` regenerates the fragment instead of failing. It is how you fix
 * what this reports, and it writes through `src/tree.js` like every other
 * write surface in this repository.
 *
 * This lives in `scripts/` and not in `src/`, because it owns the exit code
 * and nobody who installs the package needs it.
 */
import { checkResident, writeResident, ResidentDrift } from '../src/resident.js';

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const write = process.argv.includes('--write');
const repoRoot = process.cwd();

// A renamed section throws rather than emitting a shorter fragment, and that
// throw reaches here on both paths. It is a message about this repository, so
// it prints as one. `bin/stylewright.mjs` already ruled that a stack trace
// says where we were and not what to do.
let result;
try {
  result = await checkResident(repoRoot);
} catch (err) {
  if (!(err instanceof ResidentDrift)) throw err;
  fail(err.message);
}

const { expected, problems } = result;

if (write) {
  if (expected === null) fail(problems.join('\n'));
  await writeResident(repoRoot, expected);
  process.stdout.write('Resident fragment written from the skill.\n');
} else if (problems.length) {
  fail(problems.join('\n'));
} else {
  process.stdout.write('Resident fragment matches its skill.\n');
}
