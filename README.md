# stylewright

[![ci](https://github.com/rookslog/stylewright/actions/workflows/ci.yml/badge.svg)](https://github.com/rookslog/stylewright/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/stylewright)](https://www.npmjs.com/package/stylewright)
[![license](https://img.shields.io/github/license/rookslog/stylewright)](LICENSE)

Writing skills for coding agents, distilled from named standards.

Install them into Claude Code, Claude Cowork, and Codex, at user scope or
project scope.

This document is written under the rules of one of the skills it ships. A
continuous-integration job checks it with `stylewright lint`.

## Why this exists

An agent writes documentation all day. It has no house style unless you give it
one. Most guidance you can give it is invented on the spot, and it changes each
time you ask.

`stylewright` gives an agent writing rules that come from somewhere. Each rule in
the `standards/` tier traces to a numbered rule in a published standard. You can
check the trace. That is the point.

## The two tiers

| Tier | What it means |
|---|---|
| `standards/` | Every skill is distilled from a named standard that you can read at a public URL. Every statement traces to a numbered rule. |
| `craft/` | Every skill encodes writing discipline that has no external standard behind it. The authority is ours, and the skill says so. |

Install one tier, the other, or both.

## Skills

| Skill | Tier | Source | License of the source |
|---|---|---|---|
| `simplified-technical-english` | standards | ASD-STE100 Issue 9 (2025) | (c) ASD 2025. All rights reserved. See the skill `SOURCE.md`. |
| `plain-language` | standards | Federal Plain Language Guidelines | CC0 1.0 Universal. Public domain. |

The `craft/` tier is empty today. More skills are in progress. See
`CONTRIBUTING.md` to add one.

### The standards disagree, and that is the point

`plain-language` tells you to use contractions. `simplified-technical-english`
tells you not to. Neither is wrong. One writes for a general public reader who
must act, and the other writes for a technician who follows a procedure.

Pick the standard that matches your reader, and follow one standard in one
document. The grounding matrix shows you which rule came from where, so you can
see exactly where two standards part company.

## Install

### With the installer

Run one command and answer four questions. You do not need to know the flags,
the directory layout, or the skill names.

```
npx stylewright install
```

The dialogue asks:

1. Which skills do you want. Every skill starts selected. Remove the ones you
   do not want.
2. Which platforms. The installer looks in your home directory first and
   pre-selects the agents that it finds.
3. Which scope, user or project. Each choice shows the directory that it
   resolves to.
4. Whether to go ahead. The summary shows every file destination before
   anything is written.

Answer nothing and press Enter four times to install everything to the agents
that you already use.

Skills already installed are marked in the list, so a replacement never
surprises you.

### With flags, for a repeatable command

Any selecting flag turns the dialogue off. Use this in a script or a dotfiles
repository.

```
npx stylewright install --tier standards --platform claude,codex --scope user
npx stylewright install --skill simplified-technical-english --platform claude
```

Repeat `--skill` to select more than one. Run `npx stylewright list` for the
names.

To run the code on the default branch instead of the last release, use
`npx github:rookslog/stylewright` in place of `npx stylewright`.

The installer copies files. It does not create symbolic links. A symbolic link
breaks when the clone moves.

### With Codex, and no installer

Codex ships a skill installer. Give it a path in this repository:

```
scripts/install-skill-from-github.py \
  --repo rookslog/stylewright \
  --path skills/standards/simplified-technical-english
```

### By hand

Copy the directory. This always works.

```
git clone https://github.com/rookslog/stylewright
cp -R stylewright/skills/standards/simplified-technical-english ~/.claude/skills/
```

### Where files go

| Platform | Scope | Path |
|---|---|---|
| `claude` | user | `~/.claude/skills` |
| `claude` | project | `./.claude/skills` |
| `cowork` | user | `~/.claude/skills` |
| `codex` | user | `~/.codex/skills` |
| `codex` | project | `./.codex/skills` |
| `agents` | user | `~/.agents/skills` |

Cowork reads the Claude directory. The two names resolve to one path.

## Commands

| Command | What it does |
|---|---|
| `install` | Copy skills to the platforms and scope that you select. |
| `update` | Copy new versions. Stop when a file has local edits. |
| `uninstall` | Remove only the files that the installer wrote. |
| `list` | Show the skills in this repository. |
| `doctor` | Report problems, such as one skill installed in two places. |
| `lint` | Check a Markdown file against the mechanical rules below. |
| `ground` | Check that each grounding matrix still matches its skill. |
| `new-skill` | Scaffold a new skill that passes both checks from the start. |

### Update is safe

The installer records a hash of each file that it writes. `update` compares the
hash first. When you have edited an installed skill, `update` stops and tells
you which files changed. Add `--force` to overwrite.

### Uninstall is exact

`uninstall` removes the recorded files and nothing else. A note that you added
to a skill directory stays.

## The lint

`stylewright lint` checks the part of ASD-STE100 that a program can check:

- Procedural sentences of no more than 20 words.
- Descriptive sentences of no more than 25 words.
- No semicolons.
- No contractions.
- Procedure steps that start with an imperative verb.

The lint skips code blocks, tables, link targets, and blockquotes. A blockquote
holds quoted material, and a before-and-after guide quotes text that is wrong on
purpose.

The lint does not check vocabulary. Vocabulary compliance needs the controlled
dictionary, which this repository does not ship.

## Grounding matrices

Each skill has a grounding matrix in `grounding/`. The matrix maps every
statement in the skill to its rule in the standard.

Rows come in two kinds:

- A **`G` row** traces to the standard. It names the rule, such as `Rule 5.1`.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.

The distinction is the point of the file. It shows you which instructions carry
the authority of the standard, and which carry only ours.

Matrices stay in this repository. They do not install with a skill. A matrix is
an audit record for a reader, and an agent does not need it while it writes.

`stylewright ground --check --all` fails when a skill changes and its matrix does
not.

## Licensing

Sources impose different licenses, so one license for the whole repository
cannot work.

- The engine, the tests, and the tooling are MIT. See `LICENSE`.
- Each skill in `standards/` carries the license of its source. See the `LICENSE`
  file in the skill directory.
- Each skill in `craft/` is MIT.

## Notices

No skill in this repository is affiliated with, endorsed by, or approved by the
owner of the standard that it cites.

`ASD-STE100` and `Simplified Technical English` are European Union registered
trademarks owned by the Aerospace, Security and Defence Industries Association of
Europe, number 017966390.

No skill reproduces rule text or dictionary entries from a standard. Each skill
states the rules in our own words and links to the official source.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It covers how to choose a source,
how to write a grounding matrix, and what a pull request needs.

Do not create skill files by hand. The scaffold puts them in the right places
and starts green on both checks.

```
node bin/stylewright.mjs new-skill plain-language --tier standards \
  --source "Federal Plain Language Guidelines" \
  --url "https://digital.gov/guides/plain-language" \
  --license "CC0 1.0"
```

Run every check before you open a pull request:

```
npm run check
```

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Report a
vulnerability privately, as described in [SECURITY.md](SECURITY.md).
