# stylewright — design

**Date:** 2026-07-26
**Status:** design approved in session. Not yet implemented.
**Author:** Logan Rooks (with Claude)

## 1. What this is

`stylewright` is a public repository of writing skills for coding agents. It also
supplies an installer. The installer places the skills on disk for Claude Code,
Claude Cowork, and Codex, at either user scope or project scope.

The skills fall into two tiers:

- **`standards/`** — each skill is distilled from a named external standard or
  style guide that anyone can read at a public URL.
- **`craft/`** — each skill encodes writing discipline that has no external
  standard behind it.

The tiers are separately installable.

### Non-goals

- `stylewright` does not replace any official standard or controlled dictionary.
- `stylewright` does not implement a full conformance checker for any standard.
- `stylewright` does not re-ship skills that ship with a harness by default.

## 2. Authoring doctrine

This doctrine governs the `standards/` tier. It exists so that the repository can
be public without reproducing copyrighted rule text.

Each `standards/` skill contains these parts and no others:

1. **A paraphrased digest.** Restate each rule in our own words. Do not copy rule
   text from the source.
2. **A navigation map.** Map a question to a rule identifier and a search string,
   so the reader can find the rule in the official document. State that the topic
   labels are paraphrases.
3. **A boundary statement.** State that the skill does not replace the official
   source. Give the link to the source.
4. **A `SOURCE.md` file.** Record the source name, the canonical URL, the license,
   and the transformation applied.

### Exclusion rule

A standard qualifies for a skill only when its canonical text is free to read at a
public URL. A navigation map that points to a paywall gives the reader nothing.
It also makes the skill a substitute for the source instead of a pointer to it.

This rule excludes the Chicago Manual of Style, the AP Stylebook,
ISO/IEC 26514, and IEEE 1063.

### Precedent

The existing `simplified-technical-english` skill already follows this pattern.
Its `references/rule-navigation.md` states that the topic labels "are paraphrases,
not rule text", and its `SKILL.md` states that the guide "does not replace the
official standard or controlled dictionary."

## 3. Skill roster

### 3.1 `standards/` — v1

| Skill | Source | License |
|---|---|---|
| `simplified-technical-english` | ASD-STE100 Issue 9 | Free PDF. Unverified. |
| `plain-language` | US Federal Plain Language Guidelines | US government work. Public domain. Unverified. |
| `google-devdocs-style` | Google developer documentation style guide | CC BY 4.0. Unverified. |
| `diataxis` | Diátaxis documentation framework | CC BY-SA 4.0. Unverified. |
| `normative-keywords` | RFC 2119 and RFC 8174 | IETF. Free. Unverified. |

`simplified-technical-english` ports from the existing skill without change to its
content.

`diataxis` covers document architecture, not sentence style. It composes with the
other four skills instead of overlapping them.

`normative-keywords` is short. It gives specifications and decision records a
consistent use of MUST, SHOULD, and MAY.

### 3.2 `craft/` — v1

| Skill | Purpose |
|---|---|
| `de-slop` | Find and remove machine-writing patterns in documentation. |
| `adr-craft` | Write architecture decision records that record the rejected alternatives. |

The `craft/` tier stays small in v1. Harnesses already supply general
documentation and planning skills. The differentiator of this tier is anti-slop
discipline.

### 3.3 Roadmap

`microsoft-style`, `gov-uk-content-design`, `conventional-commits`,
`keep-a-changelog`, `runbook-craft`, `readme-craft`.

### 3.4 License verification gate

The license column above is **unverified**. Each entry MUST be verified against
the source before the repository becomes public. A wrong license claim on a public
repository is a legal risk, not a documentation defect.

Record each verification in the skill's `SOURCE.md` with the date and the URL that
supplied the license statement.

## 4. Repository layout

```
stylewright/
  README.md
  LICENSE
  skills/
    standards/<name>/
      SKILL.md
      SOURCE.md
      references/
      agents/openai.yaml
    craft/<name>/
      SKILL.md
      references/
      agents/openai.yaml
  .claude-plugin/marketplace.json
  plugins/
    standards/.codex-plugin/plugin.json
    craft/.codex-plugin/plugin.json
  bin/stylewright.mjs
  src/
  test/
    fixtures/
    conformance/
  docs/
  .github/workflows/
```

Skill paths MUST stay stable. Pathway 1 in section 5 addresses a skill by its
GitHub path. A path change breaks every install command that users have recorded.

### 4.1 Universal skill directories

One directory serves every platform. Platform-specific files travel with the
skill. Platforms that do not read a given file ignore it.

**Evidence.** The directory `~/.claude/skills/notebooklm-philosophical-inquiry/`
contains `agents/openai.yaml`, which is a Codex interface file. Claude Code lists
that skill as available. Reproduce with:

```
/bin/ls ~/.claude/skills/notebooklm-philosophical-inquiry/agents/
```

**Deferred.** A copy-time filter that removes platform-specific files could keep
each target clean. The evidence above shows that the stray file causes no failure,
so v1 does not add the filter. The manifest records the target platform, so a
filter can be added later without a breaking change.

## 5. Installation pathways

Six pathways share one engine. Four of the six need no engine code.

| # | Pathway | Cost | Serves |
|---|---|---|---|
| 1 | Codex native skill-installer | No code. Stable paths only. | Codex, one skill at a time |
| 2 | Claude plugin marketplace | JSON manifest | Claude Code and Cowork, one tier at a time |
| 3 | Codex plugin marketplace | JSON manifest | Codex, one tier at a time |
| 4 | Manual copy | No code. README text. | Users who do not run installers |
| 5 | `npx stylewright install` | The engine | Multi-platform, project scope, updates |
| 6 | `curl \| sh` and `make install` | Thin wrappers over #5 | Users who prefer these entry points |

### 5.1 Pathway 1 — Codex native

Codex ships a generic installer at
`~/.codex/skills/.system/skill-installer/`. It installs a skill from any GitHub
repository:

```
scripts/install-skill-from-github.py --repo <owner>/stylewright --path skills/standards/simplified-technical-english
```

This pathway costs no code. It requires only that skill paths stay stable.

### 5.2 Pathways 2 and 3 — plugin marketplaces

A plugin installs as one bundle. Therefore the repository ships **two** plugins,
`stylewright-standards` and `stylewright-craft`. The tier split and the plugin
split are the same split. Tier selection is free on these pathways.

### 5.3 Pathway 5 — the engine

Runtime: Node, distributed as `npx stylewright`.

Commands:

| Command | Function |
|---|---|
| `install` | Select tier, platform, and scope. Interactive, or driven by flags. |
| `update` | Re-copy skills. Refuse to overwrite an edited file unless `--force` is set. |
| `uninstall` | Remove only the files that the manifest records. |
| `list` | Show available skills and installed skills. |
| `doctor` | Report problems. |
| `lint` | Check a file against the mechanical rules in section 6.2. |

Install mechanism: copy, not symbolic link. A symbolic link breaks when the clone
moves. A symbolic link across the Cowork host and sandbox boundary is
also unsafe. The sandbox is a Linux virtual machine. It sees mounted folders with
different permissions than the host sees.

### 5.4 The manifest

The engine writes `<target>/.stylewright-manifest.json`. For each installed skill
it records the name, the tier, the `stylewright` release version, a content hash
of each installed file, and the pathway that installed it.

The manifest makes three operations possible:

- `update` compares the hash and detects a local edit before it overwrites.
- `uninstall` removes what the engine wrote, and nothing else.
- `doctor` detects a double install.

**Double install.** A user can install the same skill through a plugin and through
the engine. Both copies declare the same `name` in frontmatter. `doctor` MUST
detect this condition and report it.

**Unverified.** Two claims need a test before v1 ships:

1. That `/plugin marketplace add` accepts a remote repository that carries two
   plugins.
2. That a duplicate skill name across a plugin install and a `~/.claude/skills`
   install produces the collision described above.

## 6. Testing

### 6.1 Conformance suite

Six pathways can become six different behaviors. The conformance suite prevents
this.

Each pathway installs the same fixture skill into a temporary HOME directory. The
test compares the resulting directory tree and manifest across pathways. The trees
MUST be identical.

A pathway that fails the conformance suite MUST NOT ship.

### 6.2 The lint

`stylewright lint` checks the mechanical subset of ASD-STE100:

- Procedural sentences of no more than 20 words.
- Descriptive sentences of no more than 25 words.
- No semicolons.
- No contractions.
- Procedure steps that start with an imperative verb.

The lint does not check vocabulary. Vocabulary compliance needs the controlled
dictionary, which the repository does not ship.

The lint checks prose only. It MUST skip fenced code blocks, inline code spans,
link targets, and table cells. A table cell is not a sentence, so a sentence-length
rule does not apply to it.

The lint is a user-facing command and a continuous-integration check.

### 6.3 Dogfooding

Continuous integration runs `stylewright lint` against `README.md` and the files
in `docs/`. The repository therefore checks its own documentation with its own
tool.

This makes the dogfooding claim verifiable. Without the lint, the claim would be
an assertion with no receipt.

## 7. Decisions and their alternatives

| Decision | Chosen | Rejected |
|---|---|---|
| Repository thesis | Two tiers, separately installable | Standards only, anti-slop grab-bag |
| Install mechanism | Copy with a manifest | Symbolic links, build-then-copy, copy with a `--link` flag |
| Name | `stylewright` | `rubric`, `unslop`, `housestyle` |
| Engine runtime | Node, one engine, six pathways | Python engine, natives first, two engines |
| Lint scope | Mechanical subset, in continuous integration | No lint, lint deferred to v1.1 |

Two engines were rejected because a second implementation is a second thing to
drift.

## 8. Open items before v1

1. Verify every license in section 3.1. Record the result in each `SOURCE.md`.
2. Verify the two unverified claims in section 5.4.
3. Confirm that the name `stylewright` is available on npm and on GitHub.
