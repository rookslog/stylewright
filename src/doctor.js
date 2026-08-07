import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CONSUMERS, SCOPES, resolveTarget, describeTarget, instructionFiles,
} from './targets.js';
import { readManifest } from './manifest.js';
import { LOCK_NAME } from './lock.js';
import { isCommitted } from './journal.js';
import { destinationState } from './tree.js';
import { RESIDENT_NAME, RESIDENT_SKILL, importLine } from './resident.js';

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
        // The pair, not the rendered label. `describeTarget` is one consumer of
        // it and `instructionFiles` is another, and rendering here left the
        // second one parsing a string this module had just built.
        byPath.get(dir).push({ platform, scope });
      }
    }
    byAgent.set(agent, byPath);
  }
  return byAgent;
}

const labelsOf = (pairs) => pairs.map((pair) => describeTarget(pair));

/**
 * An instruction file is large enough to be somebody's whole handbook, and
 * this reads every candidate on every `doctor` run. A megabyte is far above
 * any real one and far below a file worth refusing to hold in memory.
 */
const MAX_INSTRUCTION_BYTES = 1024 * 1024;

/**
 * May this path be read as an instruction file at all?
 *
 * A named predicate over the `stat`, and not a clause inside the read below,
 * because that clause could not be held by a test. Removing the type half lets
 * a FIFO at an instruction path block `fs.readFile` forever, so the suite that
 * would report the regression HANGS rather than failing, and a hang reports
 * nothing. Asked here, the question has an answer a test gets in milliseconds.
 *
 * The type half is for a FIFO, and not for a directory. `readFile` on a
 * directory throws EISDIR and the caller's catch gives the same answer, so the
 * guard changes nothing there. `src/tree.js` names the same hazard, for the
 * same reason.
 */
export function readsAsInstruction(st) {
  return st.isFile() && st.size <= MAX_INSTRUCTION_BYTES;
}

/**
 * The text of an instruction file, or `null` when this tool will not read it.
 *
 * **The content is data.** Every caller below asks the bytes one question — do
 * they contain one fixed string — and nothing here interprets, executes, or
 * takes an instruction from what it reads. The file belongs to the user, and
 * this tool never writes to it. ADR-0022 records why detecting the state beats
 * asserting it.
 *
 * `null` and every failure read the same way to a caller, as "no import here".
 * A file that is absent, unreadable, not a regular file, or larger than the
 * bound all answer alike, and each of those answers can only ADD a warning the
 * user dismisses. ADR-0022 states that direction, because a structural reason
 * to skip a file is invisible in the finding it produces.
 */
async function instructionText(abs) {
  try {
    // `stat` and not `lstat`: a symbolically linked `CLAUDE.md` is ordinary in
    // a dotfiles repository, and this only ever reads.
    const st = await fs.stat(abs);
    if (!readsAsInstruction(st)) return null;
    return await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
}

export async function doctor({ home, cwd }) {
  const findings = [];
  const reported = new Set();

  for (const [platform, byPath] of targetsByAgent({ home, cwd })) {
    const seen = new Map();
    // Where this agent carries each delivery form of the one rule that has
    // two. Collected across the whole group, because the question is about
    // what ONE agent loads at once, exactly as the duplicate check is.
    const residentDirs = new Map();
    const skillDirs = [];
    // Gathered from the layout rather than from any manifest, so a held
    // directory does not hide an instruction file that has nothing to do with
    // it. A file can be reached from two pairs, and a Set keeps one read.
    const candidates = new Set();
    for (const [, pairs] of byPath) {
      for (const pair of pairs) {
        for (const file of instructionFiles({ ...pair, home, cwd })) candidates.add(file);
      }
    }
    for (const [dir, pairs] of byPath) {
      const labels = labelsOf(pairs);
      // BEFORE the manifest is read. A run killed while it held the directory
      // leaves this behind, and it may have been killed mid-write, so reading
      // the manifest first reported a parse error where the answer the user
      // needs is the name of the file to remove. Telling a live run from a dead
      // one is the one judgement this tool cannot make, so it reports and
      // leaves the decision where it belongs.
      if (await destinationState(path.join(dir, LOCK_NAME)) !== 'absent') {
        if (reported.has(dir)) continue;
        reported.add(dir);
        findings.push({
          level: 'warn',
          code: 'locked-directory',
          message: `A stylewright command is working in ${dir}, or one was killed there. `
            + `Every command refuses until ${path.join(dir, LOCK_NAME)} goes. `
            + 'Remove it when no other run is active.',
        });
        continue;
      }
      const manifest = await readManifest(dir);
      // An install that did not come back states what it was about to write.
      // The files it left are reachable, and the next `install` or `uninstall`
      // clears them, but nothing said they were there.
      //
      // A COMMITTED statement is the opposite case, and reporting it as
      // unfinished told the user their skill was half installed when it is
      // recorded and whole. What is outstanding there is the sweep of the
      // version it replaced, so the finding says that instead.
      for (const [name, stated] of Object.entries(manifest.pending ?? {})) {
        const key = `${dir} :: ${name}`;
        if (reported.has(key)) continue;
        reported.add(key);
        findings.push({
          level: 'warn',
          code: isCommitted(stated) ? 'unswept-install' : 'interrupted-install',
          message: isCommitted(stated)
            ? `An install of "${name}" in ${dir} is recorded, and the version it `
              + 'replaced is still on disk. Run `stylewright install` or '
              + '`stylewright uninstall` against that directory to clear it.'
            : `An install of "${name}" in ${dir} did not finish. `
              + 'Run `stylewright install` or `stylewright uninstall` against that '
              + 'directory to clear what it left.',
        });
      }
      for (const name of Object.keys(manifest.skills)) {
        if (!seen.has(name)) seen.set(name, new Map());
        seen.get(name).set(dir, labels);
      }
      if (RESIDENT_NAME in manifest.skills) residentDirs.set(dir, pairs);
      if (RESIDENT_SKILL in manifest.skills) skillDirs.push(dir);
    }

    // The thesis of ADR-0022. A write into an instruction file could only
    // ASSERT that the rule is resident. This detects whether it is, and the
    // inactive state is the one a user cannot see for themselves.
    //
    // Per INSTALLED FRAGMENT, and never one flat set over the group.
    // `importLine` spells the path relative to the file that holds it, so the
    // line that activates a user-scope fragment is not the line that activates
    // a project-scope one. A single set let a mark in a project instruction
    // file silence the warning about a user-scope fragment that nothing
    // imports, which is the one state this check exists to find.
    //
    // Each candidate is read at most once, however many fragments it is
    // compared against. Reading a file the user owns twice to ask two
    // questions of the same bytes is not something to do casually.
    const texts = new Map();
    const textOf = async (file) => {
      if (!texts.has(file)) texts.set(file, await instructionText(file));
      return texts.get(file);
    };
    const importedFrom = new Map();
    for (const dir of residentDirs.keys()) {
      const hits = [];
      for (const file of [...candidates].sort()) {
        const text = await textOf(file);
        // The exact line this tool told the user to paste, from this file, for
        // this fragment. A substring and not a Markdown model, which is the
        // same answer ADR-0016 gives everywhere else in this repository. So a
        // fenced or negated occurrence of the correct spelling still reads as
        // imported, and ADR-0022 records that residual direction.
        if (text?.includes(importLine({ targetDir: dir, instructionFile: file }))) {
          hits.push(file);
        }
      }
      importedFrom.set(dir, hits);
    }

    for (const [dir, pairs] of residentDirs) {
      if (importedFrom.get(dir).length) continue;
      const key = `resident :: ${dir}`;
      if (reported.has(key)) continue;
      reported.add(key);
      // The line is spelled for the first instruction file the pair names,
      // because the paste has to go somewhere and naming one beats naming
      // four. Any of the files this check reads would satisfy it.
      const [file] = instructionFiles({ ...pairs[0], home, cwd });
      findings.push({
        level: 'warn',
        code: 'resident-not-imported',
        message: `The resident fragment is installed in ${dir}, and no instruction `
          + `file ${platform} reads imports it, so the rule is not active. `
          + `Add this line to ${file}: ${importLine({ targetDir: dir, instructionFile: file })}`,
      });
    }

    // Both forms of one rule at once. `update` does not retire a skill this
    // repository still ships, and the duplicate check above only ever compares
    // skill directories, so this state is silent on every existing install.
    //
    // It reads `importedFrom`, which is empty unless a fragment is INSTALLED.
    // Gating on the import alone fired where only the skill was installed and
    // an instruction file happened to carry the spelling — a stale line, or a
    // fenced example. The advice is "keep one delivery", so that finding told
    // a user to remove the only delivery they had.
    const active = [...importedFrom]
      .filter(([, hits]) => hits.length)
      .map(([dir, hits]) => `${dir} (imported by ${hits.join(', ')})`)
      .sort();
    if (active.length && skillDirs.length) {
      const key = `double :: ${platform} :: ${skillDirs.sort().join(', ')}`;
      if (!reported.has(key)) {
        reported.add(key);
        findings.push({
          level: 'warn',
          code: 'resident-double-delivery',
          message: `The "${RESIDENT_SKILL}" rule reaches ${platform} twice: the skill is `
            + `installed in ${skillDirs.join(', ')}, and the resident fragment in `
            + `${active.join('; ')} is active. Keep one delivery.`,
        });
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
