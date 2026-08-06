# Contributing to stylewright

Thank you for helping. This document tells you what a contribution needs and how
to check it before you open a pull request.

## The one rule that shapes everything

Every statement in a skill must trace to something. A `standards/` skill traces
to a numbered rule in a published source. A `craft/` skill traces to us, and
says so.

The grounding matrix in `grounding/` is where that trace lives. A reviewer reads
it to answer one question: does this instruction carry the authority of a
standard, or only ours?

## Find something to work on

- [Issues marked `good first issue`](https://github.com/rookslog/stylewright/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  need no context beyond this document.
- [Issues marked `help wanted`](https://github.com/rookslog/stylewright/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
  are open questions rather than settled work.
- [Milestones](https://github.com/rookslog/stylewright/milestones) show what
  each release is waiting on.

Say so on the issue before you start, so two people do not write the same skill.

Open a [discussion](https://github.com/rookslog/stylewright/discussions) when you
want to argue about a rule rather than propose one.

## Start here

```
npm ci
npm test
```

Three checks gate every pull request. Run all three before you push.

```
npm test              # unit and conformance tests
npm run lint:docs     # our own writing rules, applied to our own documents
npm run check:ground  # every grounding matrix still matches its skill
```

## Add a skill

Do not create the files by hand. The scaffold writes them in the right places
and starts green.

```
node bin/stylewright.mjs new-skill plain-language \
  --tier standards \
  --source "Federal Plain Language Guidelines" \
  --url "https://digital.gov/guides/plain-language" \
  --license "CC0 1.0" \
  --description "Use when writing for a general public audience."
```

For a skill with no external source:

```
node bin/stylewright.mjs new-skill readme-craft --tier craft
```

The two tiers share one namespace, so pick a name that neither tier holds. Every
command selects a skill by name alone. The scaffold refuses a name the other
tier already holds, and the catalog refuses to load a repository that carries
the same name twice.

Then do this:

1. Replace the placeholder rule in `SKILL.md`. Write one instruction in each line.
2. Add a matching row to the grounding matrix for every rule that you write.
3. Fill in the `FILL IN` fields in `SOURCE.md`.
4. Run the three checks above.

### Choose a source, for a standards skill

A source qualifies when both of these are true:

1. Anyone can read its canonical text at a public URL, without payment.
2. Its reuse terms permit a digest in our own words.

The first condition alone is not enough. Check the second before you write
anything. Record the license and the date that you checked it in `SOURCE.md`.

We rejected the Chicago Manual of Style, the AP Stylebook, ISO/IEC 26514, and
IEEE 1063. None of them is readable without payment, so a reader cannot check
our work against them.

Some sources forbid derivative work. The IETF Trust Legal Provisions do, for
example. A skill from such a source ships our own applied guidance and a pointer,
and no digest. Every row in its matrix is an `E` row.

### Quote the source, but never replace it

You may quote a rule. Put its identifier beside the quotation, so a reader can
check the quotation against the source. A quoted rule often makes a `G` row
easier to audit than a paraphrase, because the reader compares two texts instead
of comparing our wording against a memory of the rule.

The limit is substitution, not quotation. Ask one question: could a reader use
this skill instead of reading the source? If yes, you quoted too much.

Two specific limits:

- Do not reproduce the definitions and usage notes from a controlled vocabulary
  in bulk. The approved and non-approved word pairs are different. Those are
  method, and a lint dictionary may carry them.
- Check the license first. Some sources forbid derivative work, and a source may
  restrict reproduction beyond what quotation practice allows. Record what you
  found in `SOURCE.md`.

This limit is what lets the repository be public.

## Write the grounding matrix

Each row has an ID, the guidance quoted from your `SKILL.md`, the heading it sits
under, the source rule, where that rule lives, and the state of its audit.

- Use `G-nn` when the row traces to the source. Name the rule, such as `Rule 5.1`.
- Use `E-nn` when the guidance is ours. Leave the rule cell empty.

Write `unaudited` in the `Audited` cell of every `G` row. That is true on the
day you write the row, and no run of the checker changes it. Leave the cell
empty on every other row, because only a `G` row cites a source.

A person raises a row out of `unaudited`. Open the source, read the rule
against the row, and then record what you did. Clear the cell and run
`check:ground`. The finding names the digest of that row. Write the date of
your reading and that digest in the cell.

Write the date in UTC, which `date -u +%F` gives you. The check refuses a date
after the UTC day it runs on, because nobody read a row on a day that has not
arrived.

Editing any other cell in the row changes the digest. The check then reports
the audit as stale, because the words you read are no longer the words in the
row. Read the row against the source again, or write `unaudited`.

Quote your own `SKILL.md` exactly. `check:ground` compares the strings, so a
reworded rule fails the check until you update its row. That is the point.

Be honest about `E` rows. A `G` row that does not really trace to the source is
worse than no matrix, because it claims an authority that it does not have.

Write your `SKILL.md` in the Markdown the check models. Four forms pass: a
blank line, any construct written at column 0, a line that continues the
paragraph above it, and an indented code block that stands on its own. The
check reads a line at a time and models no container, so it refuses every
other line and names it. A blockquote, an empty marker and an empty heading
are refused at column 0 as well, because the check does not read those either.
ADR-0016 gives the reason. Report a skill that needs a container to say what
it means on issue 37.

## Write under the skills

Our own documents follow ASD-STE100. `npm run lint:docs` checks them:

- No semicolons.
- No contractions.
- Descriptive sentences of 25 words or fewer.
- Procedural sentences of 20 words or fewer.
- Steps that start with an imperative verb.

The lint skips code, tables, link targets, and blockquotes.

`CODE_OF_CONDUCT.md` is exempt. It is an unmodified third-party document, and
editing it to satisfy our linter would change a text that people recognize.

## Change the engine

Write the test first. Every module under `src/` is a pure function or a thin
wrapper over the filesystem, and no module in `src/` may do these things:

- Call `process.exit`.
- Read the wall clock.
- Reach for a terminal prompt.

The command-line layer owns the first. Pass time in as a parameter. This is what
keeps manifests comparable across install pathways in the conformance suite.

`src/prompt.js` is the one exception to the third rule, and it exists so that the
exception has exactly one address. It owns the dialogue, the command-line layer
injects it, and every other test replaces it. No other module in `src/` may
import a prompt library.

`test/purity.test.js` enforces all three. The rule is checked, not advisory.

## Cut a release

Only a maintainer does this. Pushing a `v*` tag publishes to npm and opens a
GitHub Release.

1. Move the `Unreleased` items in `CHANGELOG.md` under a new heading, in the
   form `## 0.2.0 — 2026-08-01`.
2. Set the same number in `package.json` and in `src/version.js`.
3. Run `npm run check`.
4. Commit, then tag with `git tag v0.2.0` and push both the branch and the tag.

The workflow re-runs every check against the tagged commit, refuses a tag that
disagrees with `package.json`, publishes over OIDC, and takes the release notes
from the section that you wrote in step 1.

There is no npm token in this repository. npm trusts the workflow itself, so a
release needs no secret and carries a provenance attestation.

## Write a document

Documents live under `docs/`, in three kinds. A **spec** designs something. A
**plan** sequences building it. An **adr** records one major decision, with
its reasons, so the decision has a stable identifier to cite.

Every document opens with YAML front matter, and `npm run check:docs` holds
it to the schema. Start from this:

```yaml
---
type: spec
status: draft
issues: [21, 43]
---
```

- `type` is `spec`, `plan`, or `adr`, and it must match the directory.
- `status` is `draft`, `review`, `accepted`, `shipped`, or `superseded`.
- `issues` is optional, and names the issues the document serves.
- A spec or plan is named `YYYY-MM-DD-slug.md`. The filename is the date.
- An ADR is named `NNNN-slug.md` and carries `decided: YYYY-MM-DD` instead.
- A superseded document names its successor in `superseded-by`, the
  successor names it in `supersedes`, and the check reads both ends.

There is no author field. The schema refuses one.

A pull request that makes a major decision records it as an ADR in the same
pass. The ADR keeps the why. `AGENTS.md` keeps the operative rule.

## Report a defect in a rule

A wrong rule identifier in a matrix is a real defect. Open an issue with the
skill name, the row ID, and the correct rule. Cite where you checked.

We would rather hear that a `G` row is wrong than keep a trace that does not
hold.

## Licensing of your contribution

The engine, the tests, and the tooling are MIT. Each `standards/` skill carries
the license of its source. A `craft/` skill is MIT.

When you open a pull request, you agree that we may publish your contribution
under those terms.
