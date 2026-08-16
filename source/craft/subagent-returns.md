# Source record for subagent-returns

This file stays in the repository. It does not install with the skill.

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
- Recorded 2026-08-16.

## Where the skill came from

An operator asked for a skill that holds a subagent to a smaller return. The
request named the failure and not the rules, so every rule here is ours.

The rules answer one property of the channel. A calling agent sees the final
message and no part of the run behind it, so a fact left out of that message is
a fact the caller never had. Nothing in this record establishes that property
as measured. It is how the harnesses this repository targets behave, and a
reader who finds one that behaves otherwise has found the limit of the skill.

## What evidence stands behind the rules

None that was measured. A craft rule has no standard behind it, so measurement
is the only evidence it can ever have, and `bench/README.md` in this repository
holds that protocol. No arm has been run for this skill. There is no control,
no treatment, and no figure to cite.

Read every rule here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary of this skill say that
it works.

## Where a measurement would live

`bench/` in this repository, and it needs a runner that does not exist. Every
rule here governs a message one agent returns to another, so an arm has to spawn
a subagent and keep what it returned. The runner drives one prompt today, which
is the gap `source/craft/proportionate-execution.md` records for a session.

1. Build a runner that spawns a subagent and retains the returned message.
2. Run the no-guidance control first, per the first rule in `bench/README.md`.
3. Run the same delegation with this skill injected, and keep both arms.
4. Score what the caller had to re-derive from each return, and read the samples.

The scorer in `bench/score.mjs` has no metric for that. A study needs one
added, and the metric has to be tested against the control before anyone
trusts it.

## What a shorter return costs

A rule that cuts a return can cut a finding with it. `de-slop` records the
Anthropic report of an April 2026 brevity instruction that reduced coding
quality in Claude Code, and that report is the countertest here too. So the
skill sets no length, and two rules under `What this skill does not ask for`
refuse the trade outright.

Nobody on this branch opened that report. `A6` in
`source/craft/compressed-deliberation.md` carries the URL, and no rule in this
skill cites it.

## When this record expires

Any of these makes the record stale, and it must be revised before the next
release:

- Somebody runs the measurement above. The result replaces the section that
  says there is none, whichever way the result goes.
- The bench runner learns to drive a delegation. The section above then states
  a gap that has closed.
- A source turns up that supports one of these rules. A `G` row then needs the
  usual record, and this file is where it goes.
