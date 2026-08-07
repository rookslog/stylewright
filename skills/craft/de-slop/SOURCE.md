# Source record

This skill has no source. The record exists anyway, because the question a
reader asks of a craft skill is what stands behind its rules, and the answer
here has to be stated rather than left to be discovered.

- Source: none. No standard, no vendor documentation, and no published guidance
  says any of this.
- Rights holder: not applicable. Nothing is reproduced.
- Transformation: no source wording is carried into the skill, and the grounding
  matrix carries no `G` row. Two rows rest on material somebody else reported
  rather than on a source read here, and both are recorded below. `E-16` states
  a vendor report relayed by the owner, and a survey package informed `E-10` and
  `E-11` without grading either.
- Reproduction check: not required, because no source wording is carried into
  the skill. Anyone who later adds a quotation must record the check here first.
- Recorded 2026-08-06.

A vendor page reporting that its own model writes at length would not become a
source for this skill. Such a page describes a model and prescribes nothing.
`compressed-deliberation` is the skill that carries that material, and its own
`SOURCE.md` holds the record for it.

## One row rests on a report nobody here has read

`E-16` states that Anthropic reported an April 2026 revert of a strict brevity
instruction in Claude Code, on the ground that it reduced coding quality. That
report is real and it is first-party. Nobody on this branch opened it.

The record it came from is `A6` in
`skills/craft/compressed-deliberation/SOURCE.md`, which carries the URL, and
the owner relayed the episode in a comment on issue #1 as the countertest this
skill must keep. So the provenance is a relay, and the row is graded `E` rather
than `G` for that reason alone. A `G` row would name a source location for a
page this branch never opened, which is the reading-nobody-did defect that the
`Audited` column exists to catch.

Promoting the row takes one thing. Open the URL in `A6`, record the read here
with its date and the sections read, and then the row may cite it. Until that
happens the skill states the report as a report and claims nothing further from
it.

## What was considered and not graded

The 2026-08-04 survey package on Claude Opus 5 default style shaped this skill
without grounding any row in it. It informed `E-11`, on announced importance,
and `E-10`, on invented opposition, and it is part of why the departures here
are sorted the way they are.

It grades nothing, and that is deliberate. The package rates its own prose
findings at moderate to low confidence with prevalence unknown. It has no
corpus study, no representative survey, and one matched prompt pair that it
declines to call a benchmark. A reader who saw official citations inside it
might take those rows for grounded ones, and they are not. Every row that
package touched is an `E` row.

## What evidence stands behind the rules

None that was measured. A craft rule has no standard behind it, so measurement
is the only evidence it can ever have, and `bench/README.md` in this repository
holds that protocol. No arm has been run for this skill. There is no control,
no treatment, and no figure to cite.

Read every rule here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary of this skill say that
it works.

ADR-0021 accepts that status deliberately. The shape here is a matter of
structure and commitment, which is the half of writing that the current scorer
cannot read. Its structural metrics are specific and insensitive, and `words`
is the only metric that has separated every pair measured. Waiting for metrics
that do not exist would hold the skill indefinitely.

Issue #1 blocked this skill on the efficacy test in issue #21, and ADR-0021
lifts that block. The successor condition is that no rule here claims a
measured effect, which this file and the skill both state. Issue #21 stays the
bar for ever claiming that the skill works.

## The form is a recipe, and that was a ruling

The body states a shape to write toward, and the named defects sit beside it as
departures from that shape. It is not a list of prohibitions, and an earlier
draft of this skill was.

The owner ruled on the form in a comment on issue #1. This skill treats
wrong-shaped output, which takes a positive recipe, and discipline under
pressure takes a prohibition with the rationalisation it answers.
`proportionate-execution` is the skill that carries the second kind. Forcing
one form onto both failure types is the error the ruling corrects.

One cost comes with the choice, and the owner named it. A recipe constrains the
skeleton and says nothing about the filler, and nothing can check whether a
recipe was followed. The departures are what keep a named failure in view, and
`bench/score.mjs` is where a mechanical check would live.

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
- Somebody reads the `A6` report behind `E-16`. That read is recorded here, and
  the row may then cite it.
- A source turns up that supports one of these rules. A `G` row then needs the
  usual record, and this file is where it goes.
