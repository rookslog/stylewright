# Source record

This skill has no source. The record exists anyway, because the question a
reader asks of a craft skill is what stands behind its rules, and the answer
here has to be stated rather than left to be discovered.

- Source: none. No standard, no vendor documentation, and no published guidance
  says any of this.
- Rights holder: not applicable. Nothing is reproduced.
- Transformation: not applicable. Every rule is written from scratch, and the
  grounding matrix carries no `G` row.
- Reproduction check: not required, because no source wording is carried into
  the skill. Anyone who later adds a quotation must record the check here first.
- Recorded 2026-08-07.

A vendor page reporting that its own model writes at length would not become a
source for this skill. Such a page describes a model and prescribes nothing.
`compressed-deliberation` is the skill that carries that material, and its own
`SOURCE.md` holds the record for it.

## What evidence stands behind the rules

None that was measured. A craft rule has no standard behind it, so measurement
is the only evidence it can ever have, and `bench/README.md` in this repository
holds that protocol. No arm has been run for this skill. There is no control,
no treatment, and no figure to cite.

Read every rule here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary of this skill say that
it works.

ADR-0021 accepts that status deliberately. The rules here name structure and
commitment, which is the half of writing that the current scorer cannot read.
Its structural metrics are specific and insensitive, and `words` is the only
metric that has separated every pair measured. Waiting for metrics that do not
exist would hold the skill indefinitely.

## Why no word list ships with this skill

A word that one setting overuses is the most countable part of the defect this
skill treats, and ADR-0021 keeps it out of every skill directory. The signature
layer lives in `bench/score.mjs` instead, as a `signatures` metric that starts
empty.

A word becomes a rule in a skill only after it clears a promoted study under
the measurement design. Until then a scorer counts it and the product asserts
nothing about it.

## Where a measurement would live

`bench/` in this repository. A study of this skill needs a scenario that puts
the writer in a position where padding is the easy thing to write, and a metric
that reads structure rather than length.

1. Add a prompt to `bench/prompts/` that asks for such an answer.
2. Run the no-guidance control first, per the first rule in `bench/README.md`.
3. Run the same prompt with this skill injected, and keep both arms.
4. Score the arms and read the samples, because no metric here reads a
   rhetorical move.

The scorer in `bench/score.mjs` has no metric for a triad, a restatement, or an
invented objection. A study needs one added, and the metric has to be tested
against the control before anyone trusts it.

## When this record expires

Any of these makes the record stale, and it must be revised before the next
release:

- Somebody runs the measurement above. The result replaces the section that
  says there is none, whichever way the result goes.
- A study promotes a word to a rule under the measurement design. The sentence
  above saying that no word list ships then needs the exception written into it.
- A source turns up that supports one of these rules. A `G` row then needs the
  usual record, and this file is where it goes.
