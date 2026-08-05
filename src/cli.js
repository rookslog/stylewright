import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, TIERS } from './catalog.js';
import { resolveTarget, PLATFORMS } from './targets.js';
import { installSkills } from './install.js';
import { uninstallSkills } from './uninstall.js';
import { updateSkills } from './update.js';
import { doctor } from './doctor.js';
import { readManifest } from './manifest.js';
import { lintText } from './lint.js';
import { checkAll } from './ground.js';
import { scaffoldSkill } from './scaffold.js';
import { VERSION } from './version.js';

const USAGE = `stylewright ${VERSION}

  install    [--tier standards|craft|all | --skill <name>...]
             [--platform ${PLATFORMS.join(',')}] [--scope user|project] [--force]
             One selection at a time. Omit both to take everything.
  update     [--skill <name>]... [--platform ...] [--scope ...] [--force]
             With no flags, covers user scope plus THIS directory. Installs in
             other projects are not discoverable, so run it there too.
  uninstall  (--skill <name>... | --tier standards|craft | --all)
             [--platform ...] [--scope ...] [--force]
             It never removes everything by default. Name what goes.
  list
  doctor
  lint       <path>...
  ground     --check (--all | --skill <name>)
  new-skill  <name> --tier standards|craft
             [--source "<name>"] [--url <url>] [--license "<license>"]
             [--description "<one sentence>"]
`;

// Flags that name a set rather than a single value. `--skill a,b` and
// `--skill a --skill b` mean the same thing, and every consumer reads the same
// array. Splitting at the point of use instead let each consumer decide, and
// they decided differently.
const LIST_FLAGS = new Set(['skill', 'platform', 'scope']);
const BOOL_FLAGS = new Set(['force', 'check', 'all']);

// What each command accepts. One shared parser and no schema meant a flag was
// silently ignored by the command that did not read it, and — worse — that
// `uninstall` inherited install's rule for an empty selection. `--platform
// claude` with nothing else removed the whole catalogue and exited zero.
//
// A flag a command does not read is a typing mistake, and acting on the rest of
// the line carries out something other than what was typed.
const COMMAND_FLAGS = new Map(Object.entries({
  install: new Set(['tier', 'skill', 'platform', 'scope', 'force']),
  update: new Set(['skill', 'platform', 'scope', 'force']),
  uninstall: new Set(['tier', 'skill', 'platform', 'scope', 'force', 'all']),
  list: new Set(),
  doctor: new Set(),
  lint: new Set(),
  ground: new Set(['check', 'all', 'skill']),
  'new-skill': new Set(['tier', 'source', 'url', 'license', 'description']),
// A plain object inherits from Object.prototype, so `stylewright constructor`
// looked up a function and `allowed.has` threw a type error at a typing
// mistake. A Map holds only what was put in it.
}));

// Which commands read a word that is not a flag. Declaring the flags and not
// the arguments left half a schema: `uninstall --all demo-craft` named one
// skill and removed every one, because nothing read the word and nothing
// rejected it. A command that reads no arguments takes none.
const COMMAND_ARGS = new Set(['lint', 'new-skill']);

function splitList(value) {
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function parseFlags(argv) {
  const flags = { _: [], skill: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      flags._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (BOOL_FLAGS.has(key)) {
      flags[key] = true;
      continue;
    }
    const value = argv[++i];
    // A value flag that receives nothing usable is a typing mistake, not an
    // empty selection. Both shapes arrive here: no value at all, and a value
    // that names no entries, such as `--skill ,`. Either one produced an empty
    // filter, which install reads as "take the whole tier" and uninstall reads
    // as "every recorded skill". One rule, checked once, before any command
    // sees the flag.
    if (value === undefined || value.startsWith('--') || !splitList(value).length) {
      throw new Error(`--${key} needs a value.`);
    }
    if (LIST_FLAGS.has(key)) flags[key] = [...(flags[key] ?? []), ...splitList(value)];
    else if (key in flags) {
      // A flag that names ONE value, given twice, kept the last. `--tier craft
      // --tier standards` therefore selected standards and removed standards,
      // silently discarding half of what was typed, on a command that deletes.
      throw new Error(`--${key} was given more than once.`);
    } else flags[key] = value;
  }
  return flags;
}

async function collectFiles(targets) {
  const out = [];
  for (const t of targets) {
    const st = await fs.stat(t);
    if (st.isDirectory()) {
      for (const e of await fs.readdir(t, { withFileTypes: true })) {
        const p = path.join(t, e.name);
        if (e.isDirectory()) out.push(...await collectFiles([p]));
        else if (p.endsWith('.md')) out.push(p);
      }
    } else out.push(t);
  }
  return out.sort();
}

export async function run(argv, ctx) {
  const { home, cwd, repoRoot, stdout, now, interactive = false } = ctx;
  const [command, ...rest] = argv;
  const say = (s) => stdout.write(`${s}\n`);
  let flags;
  try {
    flags = parseFlags(rest);
  } catch (err) {
    say(err.message);
    return 2;
  }

  const allowed = COMMAND_FLAGS.get(command);
  if (allowed) {
    const stray = Object.keys(flags)
      .filter((k) => k !== '_' && !allowed.has(k) && !(k === 'skill' && !flags.skill.length));
    if (stray.length) {
      say(`${command} does not take ${stray.sort().map((k) => `--${k}`).join(', ')}.`);
      say(USAGE);
      return 2;
    }
    if (flags._.length && !COMMAND_ARGS.has(command)) {
      say(`${command} takes no arguments, and got ${flags._.map((a) => `"${a}"`).join(', ')}.`);
      say(USAGE);
      return 2;
    }
  }

  if (!command || command === 'help' || command === '--help') {
    say(USAGE);
    return 0;
  }

  if (command === 'list') {
    for (const s of await loadCatalog(repoRoot)) {
      say(`${s.tier.padEnd(9)} ${s.name}  ${s.description}`);
    }
    return 0;
  }

  if (command === 'doctor') {
    const findings = await doctor({ repoRoot, home, cwd });
    if (!findings.length) {
      say('No problems found.');
      return 0;
    }
    for (const f of findings) say(`${f.level}: ${f.message}`);
    return 1;
  }

  if (command === 'lint') {
    if (!flags._.length) {
      say('lint needs at least one path.');
      return 2;
    }
    let failed = 0;
    for (const file of await collectFiles(flags._)) {
      const text = await fs.readFile(file, 'utf8');
      for (const f of lintText(text)) {
        say(`${file}:${f.line}: ${f.rule}: ${f.message}`);
        failed++;
      }
    }
    if (failed) {
      say(`${failed} finding(s).`);
      return 1;
    }
    say('Lint clean.');
    return 0;
  }

  if (command === 'ground') {
    if (!flags.check) {
      say('ground needs --check.');
      return 2;
    }
    const all = await checkAll(repoRoot);
    const names = flags.all ? Object.keys(all) : flags.skill;
    if (!names.length) {
      say('ground needs --all or --skill <name>.');
      return 2;
    }
    // The same rule as `update`'s unmatched names, and this is the instance
    // that matters most: `ground --check` is a CI gate, and a name it does not
    // know contributed no findings and reported "Grounding clean." A gate that
    // fails open on a typo or a renamed skill is worse than no gate.
    const unknown = names.filter((n) => !(n in all));
    if (unknown.length) {
      say(`Unknown skill: ${unknown.join(', ')}.`);
      say(`Available: ${Object.keys(all).sort().join(', ')}.`);
      return 2;
    }
    let failed = 0;
    for (const name of names) {
      for (const f of all[name] ?? []) {
        say(`${name}: ${f.code}: ${f.message}`);
        failed++;
      }
    }
    if (failed) {
      say(`${failed} finding(s).`);
      return 1;
    }
    say('Grounding clean.');
    return 0;
  }

  if (command === 'new-skill') {
    const name = flags._[0];
    if (!name) {
      say('new-skill needs a name. Example: new-skill plain-language --tier standards');
      return 2;
    }
    try {
      const written = await scaffoldSkill({
        repoRoot,
        name,
        tier: flags.tier ?? 'craft',
        description: flags.description,
        source: flags.source,
        url: flags.url,
        license: flags.license,
      });
      for (const f of written) say(`created ${f}`);
      say('');
      say('Next:');
      say('  1. Replace the placeholder rule in SKILL.md with your own.');
      say(`  2. Add a matching row to grounding/${flags.tier ?? 'craft'}/${name}.md.`);
      say('  3. Run: npm run check:ground && npm run lint:docs && npm test');
      return 0;
    } catch (err) {
      say(err.message);
      return 2;
    }
  }

  if (command === 'update') {
    let update;
    try {
      update = await updateSkills({
        repoRoot, home, cwd, now,
        platforms: flags.platform,
        scopes: flags.scope,
        names: flags.skill.length ? flags.skill : undefined,
        force: Boolean(flags.force),
      });
    } catch (err) {
      say(err.message);
      return 2;
    }
    if (!update.results.length && !update.unmatched.length) {
      say('Nothing to update. No installed skills were found.');
      say('Run `stylewright install` first, or pass --platform to look elsewhere.');
      return 0;
    }
    // Report what happened BEFORE reporting what was not found. Returning early
    // on `unmatched` skipped this loop, so naming one installed skill and one
    // uninstalled one rewrote files and then said only that the second was
    // missing. The exit code covered three outcomes and distinguished none.
    for (const r of update.results) {
      for (const n of r.installed) say(`updated ${n} -> ${r.targetDir}`);
      for (const s of r.skipped) {
        say(`skipped ${s.name}: ${s.reason} (${s.files.join(', ')}). Use --force to overwrite.`);
      }
      for (const n of r.orphaned) {
        say(`no longer in this repository: ${n} in ${r.targetDir}. Uninstall it or keep it as it is.`);
      }
    }
    if (update.unmatched.length) {
      say(`Not installed anywhere this command looked: ${update.unmatched.join(', ')}.`);
      say('Run `stylewright install` to add it, or `doctor` to see what is where.');
      return 2;
    }
    // The same rule install and uninstall already carry: an operation that
    // changed nothing must not report success. `update` was the third consumer
    // and did not have it, so a scripted update that refused every skill for a
    // local edit exited zero and said the refresh had happened.
    if (!update.results.some((r) => r.installed.length)) {
      say('Nothing was updated.');
      return 1;
    }
    return 0;
  }

  if (command === 'install' || command === 'uninstall') {
    const catalog = await loadCatalog(repoRoot);

    // The guided dialogue is the DEFAULT. Any flag that selects targets or
    // skills opts out of it, so a scripted command stays non-interactive.
    const flagDriven = Boolean(flags.platform) || Boolean(flags.tier)
      || flags.skill.length > 0 || Boolean(flags.all);

    // The dialogue belongs to install. A bare `uninstall` in a terminal ran it,
    // so the user was shown `stylewright install` and asked `Install now?`, and
    // answering yes removed skills. A destructive command may not borrow a
    // script that names the other operation. Until uninstall has its own, it
    // asks for a selection rather than guessing one.
    if (!flagDriven && command === 'uninstall') {
      say('uninstall needs to know what to remove.');
      say('');
      say('  --skill <name>            one skill, repeatable');
      say('  --tier standards|craft    every skill in one tier');
      say('  --all                     every skill the target has installed');
      say('');
      say('Add --platform to say where. Run `stylewright doctor` to see what is installed.');
      return 2;
    }

    if (!flagDriven) {
      if (!interactive) {
        say('stylewright install needs either a terminal or flags.');
        say('');
        say('  --platform claude,codex   where to install');
        say('  --scope user|project      which scope');
        say('  --tier standards|craft    a whole tier, or');
        say('  --skill <name>            one skill, repeatable. Run `list` for names.');
        return 2;
      }
      // Injectable so that the guided path is testable without a terminal.
      const promptTargets = ctx.promptTargets
        ?? (await import('./prompt.js')).promptTargets;
      const chosen = await promptTargets({ catalog, home, cwd, stdout });
      if (!chosen) {
        say('Cancelled. Nothing was written.');
        return 0;
      }
      Object.assign(flags, chosen);
    } else if (!flags.platform) {
      say(`Pass --platform when you select skills. ${command === 'uninstall'
        ? 'Run `stylewright doctor` to see where they are.'
        : 'Omit all flags for the guided install.'}`);
      return 2;
    }

    // `update` searches many scopes at once. These two write to one, so a list
    // here is a request the command cannot carry out, and picking the first
    // entry would carry out half of it in silence.
    // Distinct scopes, not occurrences. `--scope user --scope user` names one
    // scope twice and was rejected as if it named two.
    const scopes = [...new Set(flags.scope ?? [])];
    if (scopes.length > 1) {
      say(`${command} writes one scope at a time. Run it once per scope.`);
      return 2;
    }
    const scope = scopes[0] ?? 'user';
    // One selection at a time. `--all --tier craft` accepted both and applied
    // the tier, so a command naming everything removed one tier and exited
    // zero. Implicit precedence between two explicit selections is a silent
    // reinterpretation of what was typed.
    const selectors = [
      flags.skill.length && '--skill', flags.tier && '--tier', flags.all && '--all',
    ].filter(Boolean);
    if (selectors.length > 1) {
      say(`${command} takes one of ${selectors.join(', ')}, not several.`);
      return 2;
    }
    // A tier value nothing checked. `all` is a tier to install and is not one
    // to remove, because uninstall reserves the whole target for `--all`, and
    // `uninstall --tier all` walked past that and deleted everything anyway.
    // The usage says `standards|craft` there, so the grammar now says it too.
    const tiers = command === 'install' ? [...TIERS, 'all'] : TIERS;
    if (flags.tier && !tiers.includes(flags.tier)) {
      say(`${command} takes --tier ${tiers.join('|')}, not "${flags.tier}".`);
      if (command === 'uninstall') say('Use --all to remove every skill in the target.');
      return 2;
    }

    const targetDirs = flags.platform
      .map((platform) => [platform, resolveTarget({ platform, scope, home, cwd })]);

    // An omitted selection means "everything" for install, where the cost of
    // being wrong is a file you can delete. `uninstall` inherited that rule
    // from sharing this block, so `--platform claude` with nothing else
    // removed every installed skill and exited zero. Nothing in the command
    // said so, and no dialogue ran, because a flag turns the dialogue off.
    //
    // Removing everything stays available. It has to be typed.
    if (!flags.skill.length && command === 'uninstall' && !flags.all && !flags.tier) {
      say('uninstall needs to know what to remove.');
      say('');
      say('  --skill <name>            one skill, repeatable');
      say('  --tier standards|craft    every skill in one tier');
      say('  --all                     every skill the target has installed');
      say('');
      say('Run `stylewright doctor` to see what is installed.');
      return 2;
    }

    const tier = flags.tier ?? 'all';
    const fromCatalog = command === 'install'
      ? catalog.filter((s) => tier === 'all' || s.tier === tier).map((s) => s.name)
      : [];
    if (command === 'install' && !flags.skill.length && !fromCatalog.length) {
      say('No skills selected.');
      return 2;
    }

    // Install and uninstall answer two different questions, and one catalogue
    // lookup answered both. The catalogue says what this repository ships NOW
    // and which tier it ships it in. A removal asks what is installed HERE and
    // which tier it was installed under, and only this target's manifest knows
    // that. Seeding a removal from the catalogue crossed the boundary twice:
    // it missed a withdrawn skill the manifest still placed in the tier, and it
    // removed a skill from a target whose manifest placed it outside the tier,
    // because a skill that moved tiers is one name under two answers.
    const selections = [];
    for (const [, dir] of targetDirs) {
      if (flags.skill.length) {
        selections.push([dir, flags.skill]);
        continue;
      }
      if (command === 'install') {
        selections.push([dir, fromCatalog]);
        continue;
      }
      const names = [];
      for (const [n, entry] of Object.entries((await readManifest(dir)).skills)) {
        if (flags.all || entry.tier === flags.tier) names.push(n);
      }
      selections.push([dir, names]);
    }

    const known = new Set(catalog.map((s) => s.name));
    // A skill this repository withdrew is still installed on the user's
    // machine, and `update` tells them to uninstall it. Validating uninstall
    // against the catalog alone made that advice impossible to follow, so
    // uninstall also accepts any name a selected manifest records.
    if (command === 'uninstall') {
      for (const [, dir] of targetDirs) {
        for (const n of Object.keys((await readManifest(dir)).skills)) known.add(n);
      }
    }
    const selected = [...new Set([...flags.skill, ...selections.flatMap(([, n]) => n)])];
    const unknown = selected.filter((n) => !known.has(n));
    if (unknown.length) {
      say(`Unknown skill: ${unknown.join(', ')}.`);
      say(`Available: ${[...known].sort().join(', ')}.`);
      return 2;
    }

    // One rule, stated once over both commands: an operation that changed
    // nothing must not report success. `uninstall` exited zero after removing
    // nothing, while `update` exited 2 for the same skill on the same machine,
    // and an `install` that refused every skill was indistinguishable from one
    // that wrote them all.
    let changed = 0;
    let refused = 0;
    for (const [targetDir, selected] of selections) {
      if (command === 'install') {
        const res = await installSkills({
          repoRoot, targetDir, names: selected, now, force: Boolean(flags.force),
        });
        for (const n of res.installed) say(`installed ${n} -> ${targetDir}`);
        for (const s of res.skipped) {
          say(`skipped ${s.name}: ${s.reason} (${s.files.join(', ')}). Use --force to overwrite.`);
        }
        changed += res.installed.length;
        refused += res.skipped.length;
      } else {
        const res = await uninstallSkills({
          targetDir, names: selected, force: Boolean(flags.force),
        });
        for (const n of res.removed) say(`removed ${n} from ${targetDir}`);
        for (const n of res.missing) say(`not installed: ${n} in ${targetDir}`);
        for (const s of res.skipped) {
          // Advise `--force` only where `--force` is the answer. A blocked
          // ancestor, or a directory standing where a recorded file was, is
          // refused whether or not it is passed — so the unconditional advice
          // sent the user through the same command twice and left them with
          // nothing to try. Naming the reason without a remedy is the honest
          // report when there is no remedy to name.
          const remedy = s.reason === 'locally-modified'
            ? ' Use --force to remove it anyway.' : '';
          say(`kept ${s.name}: ${s.reason} (${s.files.join(', ')}).${remedy}`);
        }
        changed += res.removed.length;
        refused += res.skipped.length;
      }
    }
    if (!changed) {
      say(refused
        ? `Nothing was ${command === 'install' ? 'installed' : 'removed'}.`
        : `Nothing to ${command === 'install' ? 'install' : 'remove'}.`);
      return 1;
    }
    return 0;
  }

  say(`Unknown command "${command}".`);
  say(USAGE);
  return 2;
}
