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
the `standards/` tier traces to a numbered rule in a published standard, and
anything that is not such a rule says so rather than borrowing the standard's
authority. You can check the trace. That is the point.

## The two tiers

| Tier | What it means |
|---|---|
| `standards/` | Every skill is distilled from a named standard that you can read at a public URL. Every statement is accounted for: it cites a numbered rule, or it is marked as our own guidance, or it is marked as narrative. |
| `craft/` | Every skill encodes writing discipline that has no external standard behind it. The authority is ours, and the skill says so. |

Install one tier, the other, or both.

## Skills

| Skill | Tier | Source | License of the source |
|---|---|---|---|
| `simplified-technical-english` | standards | ASD-STE100 Issue 9 (2025) | (c) ASD 2025. All rights reserved. See the skill `SOURCE.md`. |
| `plain-language` | standards | Federal Plain Language Guidelines | CC0 1.0 Universal. Public domain. |
| `compressed-deliberation` | craft | None. Anthropic documents the defaults, and our own baseline traces the inflation to the instruction stack above them. | No source wording is reproduced, so no reproduction right is relied on. See the skill `SOURCE.md`. |
| `navigable-references` | craft | None. The rule is ours, and no measurement stands behind it yet. See the skill `SOURCE.md`. | Not applicable. Nothing is reproduced. |

A craft skill has no standard behind it, so measurement is the only evidence its
rules can have. `bench/` holds that protocol, and `bench/README.md` states the
one rule that matters most: run the no-guidance control first. Ours came back
clean, which is how we learned the skill we were about to write would have been
aimed at the wrong thing.

Measurement is the evidence a craft rule can have, and not the evidence each one
already has. `navigable-references` ships with none, and its `SOURCE.md` says so
in those words. Read it as discipline that we assert.

More skills are in progress. See `CONTRIBUTING.md` to add one.

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

Run `update` with no flags. It reads the manifests that the installer wrote, so
it already knows which agents and scopes hold your skills.

The installer records a hash of each file that it writes. `update` compares the
hash first. When you have edited an installed skill, `update` stops and tells
you which files changed. Add `--force` to overwrite.

`update` also stops when a file sits at a path it is about to write and the
manifest never recorded it. That file is yours, and the tool does not know what
is in it.

A file that an earlier version installed, and that this version no longer
ships, is removed. Otherwise it stays on disk with no owner, and `uninstall`
cannot reach it.

An interrupted run leaves no file without an owner either. The installer records
the paths it is about to write, and what it will write there, before it writes
them. The next `install`, `update`, or `uninstall` clears what the interrupted
run left, and names each file it clears.

The cleanup removes a file only when it holds exactly what the interrupted run
was going to write there. A file you wrote at one of those paths does not match,
so it stays. Each copy also lands whole or not at all, which is why the content
is something the tool can check.

### One command at a time in a directory

A command holds the directory it works in, and a second command in the same
directory refuses rather than working from a picture the first has already
changed.

A command that is killed leaves the directory held. Every later command then
refuses and names the file to remove:

```
Another stylewright command is working in ~/.claude/skills. Run again when it
has finished, or remove ~/.claude/skills/.stylewright-lock if no other run is
active.
```

Remove that file when you are sure no other run is going, and the next command
clears up after the killed one. A command that finds a held directory while it
works out what to do names it and moves on, rather than reading a record that
another run may be changing. Whether a run is still alive is the one thing
this tool cannot check for you, and guessing it wrong deletes files that a live
run is still writing. `doctor` reports a held directory, so you can find one
without hunting.

Narrow it with `--skill`, `--platform`, or `--scope`. A skill that this
repository no longer ships is reported and left alone. Uninstall it by name
when you want it gone.

**What no-flag update covers.** User scope, plus this directory. A project
install in another directory cannot be discovered from here, so run `update`
in that project too.

### Uninstall is exact

`uninstall` removes the recorded files and nothing else. A note that you added
to a skill directory stays.

When the last skill goes, the manifest goes with it, and the empty `skills`
directory goes too. The agent's own directory stays, because the agent owns it.

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

Each skill has a grounding matrix in `grounding/`. The matrix disposes of every
unit of content in the skill, and each row says what that unit claims.

Rows come in three kinds:

- A **`G` row** traces to the standard. It names the rule, such as `Rule 5.1`.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients you and asserts no rule.

The distinction is the point of the file. It shows you which instructions carry
the authority of the standard, and which carry only ours.

The check confirms that a `G` row names a rule. It cannot confirm that the rule
says what the row says. A person read the source and wrote the row, and no
program has checked that reading.

So a `G` row carries the rule's own words too, in a `Source text` cell beside
the identifier. You compare two texts in one row, instead of comparing our
sentence against a 400-page PDF you have to find first. The cell says
`unquoted` until somebody quotes the rule, and a quotation is written in
quotation marks, so you can always tell which words the row claims are the
source's. No program checked that claim either. The marks say where a
quotation starts and stops, and the source says whether it is accurate.

Every matrix here says `unquoted` in every row today. Each one declares whether
it may quote its source at all, in a line you can read, and three of the four
say it may not. `stylewright ground --check` prints how many rows quote their
source, beside the audited count.

So each `G` row records its own audit. The `Audited` cell says `unaudited`, or
it carries the date a person read that row against the source and a digest of
the row they read. No run of the checker raises a row out of `unaudited`, and
editing any other cell in the row voids the audit. `stylewright ground --check`
prints how many `G` rows in each matrix carry a valid current audit, beside its
verdict. A date that is stale, malformed, or later than the day of the check
does not count toward it.

A clean check means the matrix matches the skill. It has never meant that a
person confirmed a citation. Read the printed count rather than the verdict,
because the count is the only line that reports the second thing.

Matrices ship at the root of the npm package, so the published `ground` command
has them to read. No install pathway copies them with a skill. A matrix is an
audit record for a reader, and an agent does not need it while it writes.

`stylewright ground --check --all` fails when a skill changes and its matrix
does not. Every heading, paragraph, list item, table and code block counts,
including the ones before the first heading. Front matter does not, because it
is metadata for the agent harness rather than instruction for a reader.

The check reads Markdown a line at a time, and it models no container. So it
states the forms it reads: a blank line, any construct at column 0, a line that
continues the paragraph above it, and an indented code block that stands on its
own. It refuses every other line and names it, rather than reading a blockquote
or a nested construct as the wrong unit.

Three constructs are refused at column 0 as well, because the check reads none
of them:

- A blockquote, whose contents the check reads as our own prose.
- A heading with no text, such as `#`, which opens no section.
- A list item with no content, such as `-`, which opens no item.

ADR-0016 records that decision.

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

A skill states the rules in our own words, quotes the source where the exact
wording is what you need to check, and links to the official document. No skill
carries enough of a standard to replace it.

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
