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

Eight checks gate every pull request. `npm run check` runs all eight, and you
can run any one of them on its own.

```
npm test                # unit and conformance tests
npm run lint:docs       # our own writing rules, applied to our own documents
npm run check:ground    # every grounding matrix still matches its skill
npm run check:docs      # every document's front matter fits the schema
npm run check:probes    # every probe record carries what a reader derives from
npm run check:resident  # the resident fragment still matches its skill
npm run check:studies   # every promoted study still matches its own digests
npm run check:editorial # the editorial audit record, and what it counts
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
3. Fill in the `FILL IN` fields in `source/<tier>/<name>.md`. The scaffold
   writes that record beside the matrix, and not inside the skill.
4. Run the three checks above.

### Choose a source, for a standards skill

A source qualifies when both of these are true:

1. Anyone can read its canonical text at a public URL, without payment.
2. Its reuse terms permit a digest in our own words.

The first condition alone is not enough. Check the second before you write
anything. Record the license and the date that you checked it in the source record.

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
  found in the source record.

This limit is what lets the repository be public.

## Write the grounding matrix

Each row has an ID, the guidance quoted from your `SKILL.md`, the heading it sits
under, the source rule, the rule's own words, where that rule lives, and the
state of its audit.

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

Every row carries the last cell, including the rows that leave it empty. A row
written with six cells is refused, so a matrix without a `G` row cannot drop
the column. An eighth cell is refused too, because the render drops it.

The header and the delimiter carry seven columns as well, and the check reads
every heading by name. Write every row at column 0. A row indented or quoted is
not read, and the check names it rather than passing over it. Put an example row
inside a fenced block, which the check skips.

Editing any other cell in the row changes the digest. The check then reports
the audit as stale, because the words you read are no longer the words in the
row. Read the row against the source again, or write `unaudited`.

## The matrix names the reading its audits answer to

Write the source version above the header row, at column 0:

```
**Source version:** ASD-STE100 Simplified Technical English, Issue 9,
January 2025, read from the official PDF on 2026-07-26.
```

A `G` row cites a rule by number, and a rule number survives a new edition of
the standard. So the digest bound nothing about which edition you read, and
bumping the source left every audit in the file reading as current. The pin
joins the digest and closes that. Move the pin and every audit in the file goes
stale, which is what a new edition means for a reading of the old one.

Pin one reading. A versioned source names its version. A living source names a
commit, or the day you read it. A model target names the build and the evidence
cutoff. The check refuses a pin that means whichever reading a reader happens
to fetch, so do not write `latest` or `HEAD`.

The pin is the whole paragraph, so wrap the line where you like. It ends at the
blank line under it, at the next heading, at the table, and wherever the
renderer starts another block.

Write `unread` while nobody has read the source. It names no reading, so it
records none: every `G` row stays `unaudited`, and the check refuses an audit
under it rather than giving you a digest to paste. A scaffolded matrix starts
there.

A matrix with a `G` row carries the line. A matrix without one is refused for
carrying it, because no row there answers to a source. The placement rules are
the ones the quotation declaration obeys, and the section below states them:
above the table, outside raw HTML, and once. A second line is refused rather
than overruling the first. A source version the check cannot read leaves the
matrix naming no reading at all, and every audit in it reads stale.

`source/<tier>/<skill>.md` states the same thing in prose, for a reader. The
matrix carries the copy that binds, because no check here opens a second file.

## Quote the rule in the `Source text` cell

Write `unquoted` in the `Source text` cell of every `G` row, and leave the cell
empty on every other row. A reviewer then knows that nobody has put the rule's
words beside your paraphrase yet.

Quote the rule when the exact wording is what a reader must check. Write the
operative sentence in quotation marks, and nothing else in the cell.

The row below is invented. The Demo Standard does not exist, clause 4 says
nothing, and the sentence between the marks is made up for this page. No
example in this repository quotes a real standard, because a fabricated
sentence attributed to a real rule is the defect this column exists to prevent.

```
| G-01 | Use no more than 20 words in a sentence. | Procedures | DEMO-4 | "Keep to a maximum of 20 words." | The Demo Standard, clause 4 | unaudited |
```

The marks are not decoration. Words inside a pair are the source's and words
outside one are ours, so a row citing two rules writes `"a" and "b"`. Every
pair holds something, because an empty pair quotes nothing. A cell that carries
neither the marks nor the word `unquoted` is refused, because our own paraphrase
under a heading that reads `Source text` claims an authority the source never
gave it.

## The matrix declares whether it may quote at all

The cell grammar cannot say whether the source permits a quotation, and three
of our four sources do not. So each matrix declares it, at column 0, in a line
a reader sees:

```
**Quotation:** forbidden. The owner approved publication on the condition
that no rule text is reproduced.
```

The word is `permitted` or `forbidden`, and the reason follows it. Under
`forbidden` the check refuses every `Source text` cell but `unquoted`, whatever
else is true of that cell.

Write it above the header row, as ordinary prose at column 0, and name the state
once. Three shapes are refused, and each of them was accepted before somebody
attacked the check:

- A declaration under the table. A reader looking for the state of a file reads
  its opening prose, not a footnote to the rows.
- A declaration inside raw HTML. A permitting line inside a collapsed
  `<details>` is a line the reader on GitHub never sees. Up to three spaces of
  indent still open one, because a renderer treats those as HTML too.
- A reason that names a state again. `permitted for the dictionary only. Rule
  text is forbidden.` says both, and the check read it as permitted. The reason
  runs to the next heading or to the table, so moving the qualification to the
  next line or the next paragraph does not help. A fenced example inside it is
  skipped, so a matrix may show what a declaration looks like.

Write the state word on its own. `permitted-not` is not a declaration at all,
and a matrix carrying only that one reads as `forbidden`.

Every matrix carries the line, and a matrix that carries none is read as
`forbidden`. So is one whose only declaration is refused above. A default of
`permitted` would turn the rule off for whoever forgot the line. Two lines are
refused, and any `forbidden` among them governs even when that one is the
refused line, so lift a prohibition by editing it rather than by writing a
permitting line under it.

Do three things before you write a quotation, in this order:

1. Read `source/<tier>/<skill>.md` for that skill. It records what licence was
   checked and when. Some sources restrict reproduction beyond ordinary
   quotation, and one of ours does.
2. Record the check you made, in the same record, with the date. Then edit
   the declaration, and say there what changed.
3. Ask whether the matrix has started to replace the source. A quoted operative
   sentence per row is citation. Every rule quoted in full is republishing, and
   no number in the checker decides where that line falls. `check:ground` prints
   how many rows quote their source, and you hold the judgment.

The quotation is part of the row digest, so writing one voids a recorded audit.
That is deliberate. The quoted words are what the auditor read your sentence
against.

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
