import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { resolveTarget, PLATFORMS } from './targets.js';
import { installSkills } from './install.js';
import { uninstallSkills } from './uninstall.js';
import { doctor } from './doctor.js';
import { lintText } from './lint.js';
import { checkAll } from './ground.js';
import { scaffoldSkill } from './scaffold.js';
import { VERSION } from './version.js';

const USAGE = `stylewright ${VERSION}

  install    [--tier standards|craft|all] [--skill <name>]...
             [--platform ${PLATFORMS.join(',')}] [--scope user|project] [--force]
  uninstall  --skill <name>... [--platform ...] [--scope ...]
  list
  doctor
  lint       <path>...
  ground     --check (--all | --skill <name>)
  new-skill  <name> --tier standards|craft
             [--source "<name>"] [--url <url>] [--license "<license>"]
             [--description "<one sentence>"]
`;

function parseFlags(argv) {
  const flags = { _: [], skill: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      flags._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key === 'force' || key === 'check' || key === 'all') {
      flags[key] = true;
      continue;
    }
    const value = argv[++i];
    if (key === 'skill') flags.skill.push(value);
    else flags[key] = value;
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
  const flags = parseFlags(rest);
  const say = (s) => stdout.write(`${s}\n`);

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

  if (command === 'install' || command === 'uninstall') {
    const catalog = await loadCatalog(repoRoot);

    // The guided dialogue is the DEFAULT. Any flag that selects targets or
    // skills opts out of it, so a scripted command stays non-interactive.
    const flagDriven = Boolean(flags.platform) || Boolean(flags.tier) || flags.skill.length > 0;

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
      say('Pass --platform when you use --tier or --skill. Omit all flags for the guided install.');
      return 2;
    }

    const scope = flags.scope ?? 'user';
    let names = flags.skill;
    if (!names.length) {
      const tier = flags.tier ?? 'all';
      names = catalog.filter((s) => tier === 'all' || s.tier === tier).map((s) => s.name);
    }
    if (!names.length) {
      say('No skills selected.');
      return 2;
    }

    const known = new Set(catalog.map((s) => s.name));
    const unknown = names.filter((n) => !known.has(n));
    if (unknown.length) {
      say(`Unknown skill: ${unknown.join(', ')}.`);
      say(`Available: ${[...known].join(', ')}.`);
      return 2;
    }

    for (const platform of String(flags.platform).split(',')) {
      const targetDir = resolveTarget({ platform, scope, home, cwd });
      if (command === 'install') {
        const res = await installSkills({
          repoRoot, targetDir, names, now, force: Boolean(flags.force),
        });
        for (const n of res.installed) say(`installed ${n} -> ${targetDir}`);
        for (const s of res.skipped) {
          say(`skipped ${s.name}: ${s.reason} (${s.files.join(', ')}). Use --force to overwrite.`);
        }
      } else {
        const res = await uninstallSkills({ targetDir, names });
        for (const n of res.removed) say(`removed ${n} from ${targetDir}`);
        for (const n of res.missing) say(`not installed: ${n} in ${targetDir}`);
      }
    }
    return 0;
  }

  say(`Unknown command "${command}".`);
  say(USAGE);
  return 2;
}
