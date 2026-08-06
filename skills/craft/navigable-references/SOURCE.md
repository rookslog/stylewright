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
- Recorded 2026-08-04.

## What evidence stands behind the rules

None that was measured. A craft rule has no standard behind it, so measurement
is the only evidence it can ever have, and `bench/README.md` in this repository
holds that protocol. No arm has been run for this skill. There is no control,
no treatment, and no figure to cite.

Read every rule here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary of this skill say that
it works.

What the skill has instead is a result the reader can check one reference at a
time. The reference resolves, or it does not. That is a property of the rule
and not evidence for it.

## Where a measurement would live

`bench/` in this repository. A study of this skill needs a scenario that puts
the writer in a position to name a file, a decision, or a prior discussion,
where a label is the easy thing to write.

1. Add a prompt to `bench/prompts/` that asks for such a report.
2. Run the no-guidance control first, per the first rule in `bench/README.md`.
3. Run the same prompt with this skill injected, and keep both arms.
4. Score how many named things carry a followable form, and read the samples.

The scorer in `bench/score.mjs` has no metric for this. A study needs one
added, and the metric has to be tested against the control before anyone
trusts it.

## When this record expires

Any of these makes the record stale, and it must be revised before the next
release:

- Somebody runs the measurement above. The result replaces the section that
  says there is none, whichever way the result goes.
- This repository ships a check for a bare filename. The skill states that
  `stylewright lint` carries no such check, and that sentence then becomes
  wrong.
- A source turns up that supports one of these rules. A `G` row then needs the
  usual record, and this file is where it goes.
