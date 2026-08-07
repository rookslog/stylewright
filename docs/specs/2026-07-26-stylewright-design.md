---
type: spec
status: shipped
---

# stylewright — design

## 1. What this is

`stylewright` is a public repository of writing skills for coding agents. It also
supplies an installer. The installer places the skills on disk for Claude Code,
Claude Cowork, and Codex, at either user scope or project scope.

The skills fall into two tiers:

- **`standards/`** — each skill is distilled from a named external standard or
  style guide.
- **`craft/`** — each skill encodes writing discipline that has no external
  standard behind it.

The tiers are separately installable.

### Non-goals

- `stylewright` does not replace any official standard or controlled dictionary.
- `stylewright` does not implement a full conformance checker for any standard.
- `stylewright` does not re-ship skills that ship with a harness by default.

## 2. Authoring doctrine

This doctrine governs the `standards/` tier. It exists for two reasons. The first
reason is that the repository must be public without becoming a substitute for
the standard that it cites. The second reason is that a reader must be able to
audit every claim back to the standard that supports it.

**Amended 2026-07-27.** The original doctrine forbade every reproduced sentence.
That was too broad, and it worked against the second reason. A reviewer checking
a `G` row against a paraphrase must compare our wording to a memory of the rule.
A reviewer checking a quoted rule can see the answer. The rule now targets
wholesale reproduction, which is the risk, rather than quotation, which is
ordinary citation practice. See section 3.2.

Each `standards/` skill contains these parts:

1. **A digest, in our own words, and quotation where quotation is clearer.**
   State each rule in our own language when a paraphrase serves the reader. Quote
   the rule, with its identifier, when the exact wording is what the reader needs
   to check. Do not assemble enough quoted material to replace the source.
2. **A navigation map.** Map a question to a rule identifier and a search string,
   so that the reader can find the rule in the official document. State that the
   topic labels are paraphrases.
3. **A grounding matrix.** This file lives in the repository and does not install.
   See section 2.2.
4. **A boundary statement.** State that the skill does not replace the official
   source. Give the link to the source. Give the link to the grounding matrix.
5. **A `SOURCE.md` file.** Record the source name, the canonical URL, the license,
   the verification date, and the URL that supplied the license statement.
6. **A `LICENSE` file.** See section 2.3.

### 2.1 Source admission test

A standard qualifies for a skill when both conditions are true:

1. Its canonical text is readable at a public URL without payment.
2. Its reuse terms permit what the skill actually does.

The first condition alone is not sufficient. ASD-STE100 satisfies condition 1 and
constrains condition 2. Section 3.2 records the analysis.

This test excludes the Chicago Manual of Style, the AP Stylebook, ISO/IEC 26514,
and IEEE 1063. None of them is readable without payment.

### 2.2 Grounding matrix

Each `standards/` skill has a grounding matrix. This file traces every normative
statement in the skill back to the standard.

**The matrix stays in the repository. It does not install.** It is an audit
artifact for a reader who evaluates the skill. It is not context that an agent
needs while it writes. Installing it would spend context for no benefit.

**Location.** The matrix lives at `grounding/<tier>/<skill>.md`, outside every
skill directory.

Location is the mechanism, not an exclusion list. Four of the six installation
pathways in section 5 do not run our engine. They copy a skill directory as it is.
An exclusion list inside the engine would therefore fail for pathways 1 through 4.
A file that sits outside the skill directory cannot be copied by any of them.

The installed `SKILL.md` links to the matrix on GitHub. The audit artifact stays
one link away, and it costs the agent nothing.

Each row records:

| Column | Content |
|---|---|
| ID | `G-nn` for a grounded row. `E-nn` for an editorial row. `N-nn` for narrative. |
| Our guidance | The statement, quoted from our own `SKILL.md`. |
| Our anchor | The `SKILL.md` section that contains the statement. |
| Source rule | The rule identifier in the standard, such as `Rule 5.1`. |
| Source text | `unquoted`, or the rule's own words in quotation marks. ADR-0020. |
| Source location | The part and section in the standard. |
| Audited | `unaudited`, or the date a person read the row against the source and a digest of the row. ADR-0018. |

A `G` row traces to the standard. An **`E` row does not**. An `E` row marks
guidance that we added ourselves. The distinction is the point of the file. It
tells the reader which instructions carry the authority of the standard and which
instructions carry only ours.

Quoting our own `SKILL.md` is free of any license question, and it makes the file
machine-checkable.

**Anchors, not line numbers.** A line number drifts on the next edit. Each row
therefore anchors on a section heading and a quoted string. The engine can print
current line numbers on demand, but the file does not store them.

**Coverage.** Every normative statement in `SKILL.md` MUST appear in the matrix as
either a `G` row or an `E` row. An unlisted statement is a defect.

### 2.3 Licensing

Sources impose different licenses. One repository-wide license cannot satisfy them
all. Diátaxis is licensed CC BY-SA 4.0, and ShareAlike binds any adapted work.

Therefore:

- The engine, the tests, and the repository tooling are licensed MIT.
- Each `standards/` skill carries its own `LICENSE` file, set by its source.
- Each `craft/` skill is licensed MIT.
- The root `README.md` states this arrangement and lists each skill license.

### 2.4 Non-affiliation notice

Each `standards/` skill states that it is not affiliated with, endorsed by, or
approved by the owner of the standard. Where the standard's name is a registered
trademark, the notice identifies the trademark and its owner.

## 3. Skill roster

### 3.1 `standards/` — v1, licenses verified 2026-07-26

| Skill | Source | Verified license | Evidence |
|---|---|---|---|
| `simplified-technical-english` | ASD-STE100 Issue 9, January 2025 | © ASD 2025. All rights reserved. Enumerated grant. See 3.2. | Copyright page of the official PDF |
| `plain-language` | Federal Plain Language Guidelines | CC0 1.0 Universal. US Government work, public domain. | `LICENSE.md` in `GSA/plainlanguage.gov` |
| `google-devdocs-style` | Google developer documentation style guide | CC BY 4.0 for content. Apache 2.0 for code samples. | Footer of `developers.google.com/style` |
| `diataxis` | Diátaxis documentation framework | CC BY-SA 4.0. Daniele Procida. | `evildmp/diataxis-documentation-framework` |
| `normative-keywords` | RFC 2119 and RFC 8174 | IETF Trust Legal Provisions. See 3.3. | `trustee.ietf.org` TLP 5 |

**Canonical URL change.** `plainlanguage.gov/guidelines/` returns HTTP 301 to
`digital.gov/guides/plain-language`. The `plain-language` skill MUST cite the
current location. The source of record for the license is the GitHub repository.

### 3.2 ASD-STE100 analysis

The copyright page of Issue 9 states that no reproduction or publication of the
document, in whole or in part, may be made without the written authority of an
officer of ASD. It then grants irrevocable free reproduction rights to eight
enumerated categories of organization. An individual's public repository is not
among them.

`ASD-STE100` and `Simplified Technical English` are European Union registered
trademarks owned by ASD, number 017966390.

**Decision.** Ship the skill. Rules and procedures are methods rather than
expression. Naming a standard in order to discuss it is ordinary descriptive use.
Quoting a rule in order to state and check it is ordinary citation.

**Required controls.**

1. Quote a rule only with its identifier next to it, so a reader can check the
   quotation against the source.
2. Do not assemble a quoted set large enough to serve as the standard. The test
   is substitution: could a reader use our skill instead of buying or reading the
   source?
3. The controlled vocabulary splits in two. The approved and non-approved word
   pairs are method, and a lint dictionary may carry them. The definitions and
   usage notes attached to each entry are expression, and we do not reproduce
   them in bulk.
4. A non-affiliation and trademark notice, per section 2.4.
5. A grounding matrix that cites rule identifiers, per section 2.2. A matrix may
   also carry the quoted rule, which is what makes a `G` row checkable.

**The column exists and it is empty.** ADR-0020 added the `Source text` cell on
2026-08-06, and every row of the ASD matrix reads `unquoted`. Control 5 permits
the quotation. It does not decide it, because the operator approved continued
publication on 2026-08-04 on the stated condition that the skill reproduces no
rule text. `SOURCE.md` beside the skill carries that condition. Writing in the
column crosses it, so the operator reopens the decision or nobody fills it.

**Amended 2026-07-27.** Controls 1 to 3 replace two earlier controls that banned
every reproduced sentence and every dictionary entry. The earlier version applied
one category rule to two different acts. Quoting a rule to discuss it is not the
same act as shipping the rule set. The dictionary was treated as a single object
when its word pairs and its definitions carry different weight, and the word
pairs are the part with practical value for `stylewright lint`.

**This analysis is not legal advice.** It records the reasoning behind an accepted
risk. The operator accepted the original risk on 2026-07-26, and the amended
version on 2026-07-27.

### 3.3 RFC 2119 analysis

The IETF Trust Legal Provisions permit copying an RFC in full and without
modification. They also permit translation. They do not grant a license to modify
an IETF Document outside the IETF Standards Process.

**Decision.** Ship the skill as guidance plus a pointer. The skill teaches how to
apply normative keywords in the reader's own documents. It does not restate the
definitions from RFC 2119, and it does not reproduce them. It cites the RFC for
the definitions.

This is the ordinary practice of the specifications that use these keywords. They
reference RFC 2119 rather than restating it.

**Doctrine exception.** Section 2 requires a digest in our own words. A source that
forbids derivative works cannot have one. Such a skill ships the navigation map,
the grounding matrix, and our own applied guidance, with no digest. The matrix
marks the applied guidance as `E` rows, because it is ours and not the RFC's.

### 3.4 `craft/` — v1

| Skill | Purpose |
|---|---|
| `de-slop` | Find and remove machine-writing patterns in documentation. |
| `adr-craft` | Write architecture decision records that record the rejected alternatives. |

The `craft/` tier stays small in v1. Harnesses already supply general
documentation and planning skills. The differentiator of this tier is anti-slop
discipline.

A `craft/` skill has no source, so it ships no `SOURCE.md` and no navigation map.
It still has a grounding matrix, in which every row is an `E` row.

### 3.5 Roadmap

`microsoft-style`, `gov-uk-content-design`, `conventional-commits`,
`keep-a-changelog`, `runbook-craft`, `readme-craft`.

## 4. Repository layout

```
stylewright/
  README.md
  LICENSE                                   # MIT, for engine and tooling
  skills/
    standards/<name>/                       # installs verbatim
      SKILL.md
      SOURCE.md
      LICENSE
      references/
      agents/openai.yaml
    craft/<name>/                           # installs verbatim
      SKILL.md
      LICENSE
      references/
      agents/openai.yaml
  grounding/                                # repo only, never installs
    standards/<name>.md
    craft/<name>.md
  .claude-plugin/marketplace.json
  plugins/
    standards/.codex-plugin/plugin.json
    craft/.codex-plugin/plugin.json
    # UNRESOLVED: the pathway 3 layout. The marketplace path is verified now,
    # see §5.2. What is not verified is how a plugin at `plugins/<tier>/`
    # would reach skills at `skills/<tier>/`: the documentation shows a
    # plugin reading skills from its own root, and no documented field
    # points one outside it. Blocked on a live experiment — see issue #3.
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

**Verified 2026-07-27 against the Claude Code documentation** (issue #2). One
repository publishing two plugins is the documented case: *"To publish multiple
plugins under one marketplace name, list them all in a single
`marketplace.json`."* Two corrections to section 4's layout follow:

- A plugin's `source` path resolves against the **marketplace root**, the
  directory holding `.claude-plugin/`, not against `.claude-plugin/` itself.
  `metadata.pluginRoot` sets a prefix so entries can name a bare directory.
- The Codex marketplace manifest lives at `.agents/plugins/marketplace.json`.
  **Verified 2026-08-04 against the OpenAI developer documentation** (issue
  #3), which also resolves the sample spec's self-contradiction: `hooks` is a
  supported field. What stays unverified is narrower. The documentation shows
  a plugin reading skills from its own root, and no documented field points a
  plugin at a directory outside that root. Skill paths must stay stable, so
  pathway 3 is blocked on that question now, not on the manifest path.

A per-plugin `.claude-plugin/plugin.json` is optional, and where present only
`name` is required.

### 5.3 Pathway 5 — the engine

Runtime: Node, distributed as `npx stylewright`.

| Command | Function |
|---|---|
| `install` | Select tier, platform, and scope. Interactive, or driven by flags. |
| `update` | Re-copy skills. Refuse to overwrite an edited file unless `--force` is set. |
| `uninstall` | Remove only the files that the manifest records. |
| `list` | Show available skills and installed skills. |
| `doctor` | Report problems. |
| `lint` | Check a file against the mechanical rules in section 6.2. |
| `ground` | Check or print a grounding matrix. See section 6.3. |

Install mechanism: copy, not symbolic link. A symbolic link breaks when the clone
moves. A symbolic link across the Cowork host and sandbox boundary is
also unsafe. The sandbox is a Linux virtual machine. It sees mounted folders with
different permissions than the host sees.

### 5.4 The manifest

The engine writes `<target>/.stylewright-manifest.json`. For each installed skill
it records the name, the tier, the `stylewright` release version, a content hash
of each installed file, and the pathway that installed it.

It also records what a run is **about to** write, under `pending`, and clears
that record in the same write that records the files. **Added 2026-08-05 (issue
#49).** One atomic manifest write stops a torn record. It does not stop a valid
record from disagreeing with the tree, because the copies happened before it.
A run states its paths first, so every file it can create is named by a record
that reached disk before the file did, and the next command clears what an
interrupted run left. The statement records the content as well as the path, and
the cleanup removes a file only when it holds exactly what the interrupted run
was going to write there, so a file the user wrote at one of those paths stays. The write that commits the record refuses a manifest
that appeared or changed since the read, and it compares while a temporary file
with a fixed name holds off every other writer.

**One command at a time holds a target directory.** Everything above reads the
tree and then acts on what it read, and a second run inside the directory
invalidates the reading in between. A run killed while holding the directory
leaves the lock behind, and every later command refuses and names the file. That
cost is deliberate: telling a live run from a dead one needs a facility Node does
not expose, and a guess deletes a live run's files.

The manifest makes three operations possible:

- `update` compares the hash and detects a local edit before it overwrites.
- `uninstall` removes what the engine wrote, and nothing else.
- `doctor` detects a double install **that the engine itself wrote**, which is
  the only kind it can see. Narrowed 2026-07-27 by the amendment below. The
  earlier wording promised the plugin-plus-engine case. That case is both
  invisible to the manifest and not a conflict.

**Double install.** A user can install the same skill through a plugin and through
the engine. Both copies declare the same `name` in frontmatter.

**Amended 2026-07-27 (issue #2). There is no collision.** Claude Code namespaces
plugin skills: *"Plugin skills use a `plugin-name:skill-name` namespace, so they
cannot conflict with other levels."* The two copies are two invocations —
`/stylewright-standards:plain-language` and `/plain-language` — and the platform
reports nothing, because by its model nothing is wrong. The precedence rule it
does state governs the other levels: enterprise over personal over project, and
any of them over a bundled skill.

What survives is narrower, and it is ours rather than the platform's: **our
manifest cannot see a plugin-installed copy**, so `update` and `doctor` reason
about half of what is on disk. `doctor` should say so, rather than report a
conflict that the platform does not have.

**Tested 2026-08-04 (issue #3).** A local `claude plugin marketplace add`
against this repository, then an install of each tier, loaded exactly the
declared skills under the plugin namespace: `stylewright-standards:plain-language`,
`stylewright-standards:simplified-technical-english`, and
`stylewright-craft:compressed-deliberation`. Each plugin's `source` is
`./skills`, so the cache holds the skills tree and nothing else. The `skills`
field in each entry then selects the one tier that loads from it.

The first draft pointed `source` at the marketplace root. Its cache held the
whole repository, grounding matrices included, which is the defect section 2.2
exists to prevent. Review caught it, and the retest of the scoped form found
no `grounding` path in either plugin cache.

## 6. Testing

### 6.1 Conformance suite

Six pathways can become six different behaviors. The conformance suite prevents
this.

Each pathway installs the same fixture skill into a temporary HOME directory. The
test compares the resulting directory tree and manifest across pathways. The trees
MUST be identical.

The suite also asserts that **no installed tree contains a grounding matrix**. The
fixture skill has one. Section 2.2 keeps grounding files outside every skill
directory, and this assertion is what proves that the arrangement holds for all
six pathways.

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

### 6.3 The grounding check

`stylewright ground --check <skill>` verifies the grounding matrix:

1. Every quoted string in `grounding/<tier>/<skill>.md` still appears in
   `SKILL.md`.
2. Every quoted string appears under the section that the row names.
3. Every normative statement in `SKILL.md` appears in some row.
4. Every `G` row carries a source rule identifier. Every `E` row carries none.

Check 1 is what stops silent drift. When the skill text changes and the matrix
does not, the check fails.

`stylewright ground --print <skill>` prints the matrix with current line numbers
resolved. The line numbers are generated and are never stored.

### 6.4 Dogfooding

Continuous integration runs three checks against the repository itself:

1. `stylewright lint` against `README.md` and the files in `docs/`.
2. `stylewright ground --check` against every skill.
3. The conformance suite.

The repository therefore checks its own documentation with its own tool. This
makes the dogfooding claim verifiable. Without these checks, the claim would be an
assertion with no receipt.

## 7. Decisions and their alternatives

| Decision | Chosen | Rejected |
|---|---|---|
| Repository thesis | Two tiers, separately installable | Standards only, anti-slop grab-bag |
| Install mechanism | Copy with a manifest | Symbolic links, build-then-copy, copy with a `--link` flag |
| Name | `stylewright` | `rubric`, `unslop`, `housestyle` |
| Engine runtime | Node, one engine, six pathways | Python engine, natives first, two engines |
| Lint scope | Mechanical subset, in continuous integration | No lint, lint deferred to v1.1 |
| ASD-STE100 | Ship, with controls per 3.2 | Rename the skill, exclude it, request written permission first |
| RFC 2119 | Guidance plus pointer, no digest | Reproduce verbatim with legends, drop the skill |
| Licensing | Per-skill licenses, MIT engine | One repository-wide license |
| Traceability | A grounding matrix per skill, checked in continuous integration | No traceability, prose citations only |
| Grounding location | `grounding/` at the repository root | Inside the skill directory with an engine exclusion list |

Two engines were rejected because a second implementation is a second thing to
drift.

## 8. Open items before v1

1. Verify the two unverified claims in section 5.4. Both concern the plugin
   marketplace pathways, which are not built yet.
2. Build pathways 2, 3, and 6. Only pathways 1, 4, and 5 work today.
Resolved later on 2026-07-27:

- The repository is public at `github.com/rookslog/stylewright`. Discussions,
  private vulnerability reporting, and Dependabot security updates are on.
- `stylewright@0.1.0` is published to npm, so pathway 5 runs as
  `npx stylewright`. Verified end to end against the registry: the published
  tarball carries both skills and no grounding matrix.
- Releases run from a `v*` tag through `.github/workflows/release.yml`. npm
  authenticates the workflow as a trusted publisher over OIDC, so the repository
  holds no npm token and each release carries a provenance attestation. The
  workflow refuses a tag that disagrees with `package.json`.

Resolved on 2026-07-26:

- All five source licenses verified. Results in section 3.1.
- The name `stylewright` is free. The npm registry returns HTTP 404 for it, and a
  GitHub search returns no matching project.

Resolved on 2026-07-27:

- The repository owner is the GitHub account `rookslog`. The operator renamed
  `loganrooks` to `rookslog` on 2026-07-27, then claimed the released
  `loganrooks` handle with a second account. That claim holds the redirects for
  the remotes that still carry the old owner segment.
- The Code of Conduct contact is `logansrooks+conduct@gmail.com`.
- Two skills now ship: `simplified-technical-english` and `plain-language`.
- The `plain-language` canonical URL moved. `plainlanguage.gov` returns HTTP 301
  to `digital.gov`, which carries a curated subset and states no license. The
  source of record is the archived repository `GSA/plainlanguage.gov`.
- Contributor surfaces added: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CHANGELOG.md`, issue and pull request templates, and the
  `new-skill` scaffold.
