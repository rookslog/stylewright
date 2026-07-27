# Source record

This skill is pinned to one model build. It is expected to date, and the record
below is what makes the dating visible.

- Target: Claude Opus 5, released 2026-07-24. Model id `claude-opus-5`.
- Evidence cutoff: 2026-07-27.
- Rights holder of the sources below: Anthropic PBC.
- Transformation: the problem statement is a digest of published vendor
  documentation, in our own words. The prescriptions are ours and cite nothing.

## What the sources are, and what each one licenses

A `G` row in the grounding matrix may trace only to the first group. A vendor
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
3. Re-run the baseline in `grounding/craft/compressed-deliberation.md`. A
   control that no longer reproduces the failure retires this skill.

## When this record expires

Any of these makes the skill stale rather than wrong, and it must be re-checked
before the next release:

- Anthropic changes the Opus 5 alias, the prompting guide, or the system card.
- A successor model ships and this repository has not re-run the baseline.
- The baseline stops reproducing the failure under a no-guidance control.
