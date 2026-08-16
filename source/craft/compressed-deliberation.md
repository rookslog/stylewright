# Source record for compressed-deliberation

This file stays in the repository. It does not install with the skill.

This skill is pinned to one model build. It is expected to date, and the record
below is what makes the dating visible.

- Target: Claude Opus 5, released 2026-07-24. Model id `claude-opus-5`.
- Evidence cutoff: 2026-07-27.
- Rights holder of the sources below: Anthropic PBC.
- Transformation: the problem statement is a digest of published vendor
  documentation, in our own words, and it lives in this record. The
  prescriptions are ours, they live in the skill, and they cite nothing.
- Reproduction check: **not performed.** No sentence from any source below is
  carried into the skill or into this record — the seven statements under "What
  the vendor documents" are one-line paraphrases of behaviour the documentation
  reports, written here from scratch — so nothing in this skill depends on a
  reproduction right. The governing terms of those pages have not been read, and
  no claim is made about what they permit. Anyone adding a quotation must read
  them first and replace this line with the check. Recorded 2026-07-27. The
  grounding matrix gained a `Source text` column on 2026-08-06 under ADR-0020.
  It carries no `G` row now, so no cell there quotes anything, and this
  unperformed check is why the first new one would read `unquoted`.

## What the vendor documents

These seven statements are what `A1`, `A3` and `A5` below report about the
target build. They describe the model. They prescribe nothing, and no rule in
the skill inherits their authority.

- Claude Opus 5 writes longer visible responses than earlier Opus models.
  `A1`, Response length and verbosity.
- It writes longer reports, summaries, and files to disk. `A1`, Written
  deliverable length.
- It announces what it is about to do more often during agentic work. `A1`,
  User-facing progress updates.
- It verifies its own work without being asked. `A1`, Task scope and
  over-verification.
- It narrates its own corrections more often. `A1`, Self-correction.
- It can widen a task past what the reader asked for. `A1`, Task scope and
  over-verification, and `A5` pages 86 to 87.
- A lower effort setting does not reliably shorten the visible answer. `A1`,
  Response length and verbosity, and `A3`.

The skill carried these seven as `G` rows until the 2026-08-16 editorial pass,
which found them to be half of one section and none of the guidance. They moved
here whole, so the provenance survives the move. The skill keeps the sentence a
reader acts on, and its grounding matrix now carries no `G` row and names no
source version. Restoring a citation to the skill takes a `G` row, a source
version and the reproduction check above, in one pass.

One claim did not come here whole. The skill used to say that files written to
disk are the case the vendor documents most clearly, and it attributed that to
this record. This record never said it, and nobody here has re-read `A1` to
settle it, so it stands here unverified and it is out of the skill. The claim
is also a judgment about coverage across pages rather than a rule, so no `G`
row could carry it: the `Source rule` cell would have to name an identifier
that says no such thing. What this repository does know is that it has tested
the file case and the agentic case least, and the skill now says that in its
own words.

## What the sources are, and what each one licenses

A `G` row in a grounding matrix may trace only to the first group. A vendor
saying that its model is verbose licenses a **description**, never a rule.

### Vendor documentation of the defaults

- `A1` — "Prompting Claude Opus 5".
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
  Sections read: Response length and verbosity, User-facing progress updates,
  Written deliverable length, Task scope and over-verification, Controlling
  subagent spawning, Self-correction. Read 2026-07-27.
- `A2` — the "What is new in Claude Opus 5" page, section Model behavior
  differences.
  https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5
  Read 2026-07-27.
- `A3` — "Migrating to Claude Opus 5".
  https://platform.claude.com/docs/en/about-claude/models/migration-guide
  Read 2026-07-27. Names the confound this skill has to respect: an instruction
  stack written for an earlier model compounds with a model that already
  verifies and narrates.
- `A5` — Claude Opus 5 System Card, pages 86 to 87.
  https://www-cdn.anthropic.com/b514064af1408018e64b1ad24e7d5e75850b4ffd/Claude%20Opus%205%20System%20Card.pdf
  Records an episode in which a request to explain became an unrequested fix,
  six tests, and two docstring edits, announced after the fact.

### Vendor evidence that argues against this skill

Recorded here because a skill that hides its counterevidence is not grounded.

- `A6` — "An update on recent Claude Code quality reports".
  https://www.anthropic.com/engineering/april-23-postmortem
  A prior harness episode in which brevity instructions reduced coding quality.
  It concerns Opus 4.6 and 4.7, not Opus 5. It is the reason this skill states
  a shape and not a word budget.
- `A4` — the launch post carries a selected testimonial calling Opus 5's
  responses clearer and more concise.
  https://www.anthropic.com/news/claude-opus-5

### Community reports

Read for the taxonomy of complaints. They establish that failure modes are
reported. They establish no prevalence, because there is no denominator. The
register is in the desk-research package named below, which stays outside this
repository.

## The desk-research package behind this record

`opus-5-writing-style-frustrations`, version 1.1, dated 2026-07-27, executed by
GPT-5.6 Thinking. It holds the claim ledger, the source register, and the
quotation dossier. Its own confidence ratings are load-bearing here: the length
and narration findings are rated high and first-party documented, and every
prose complaint is rated moderate or lower with prevalence unknown.

## How to re-check this record

1. Open each `A` URL above and confirm the named section still exists.
2. Confirm the model id and release date at
   https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5.
3. Re-run the baseline in `grounding/craft/compressed-deliberation.md`. The
   control was already clean, so what must still reproduce is the *contrast*:
   an operator instruction stack inflating the reply well past the no-guidance
   run. A contrast that has collapsed retires this skill.

## When this record expires

Any of these makes the skill stale rather than wrong, and it must be re-checked
before the next release:

- Anthropic changes the Opus 5 alias, the prompting guide, or the system card.
- A successor model ships and this repository has not re-run the baseline.
- The baseline contrast collapses, meaning an instruction stack no longer
  inflates the reply against a no-guidance run of the same prompt.
