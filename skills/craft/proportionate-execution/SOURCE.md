# Source record

This skill is pinned to one model build. It is expected to date, and the record
below is what makes the dating visible.

- Target: Claude Opus 5. Model id `claude-opus-5`.
- Evidence cutoff: 2026-08-06.
- Rights holder of the sources below: Anthropic PBC.
- Transformation: the problem statement is a digest of published vendor
  documentation, in our own words. The prescriptions are ours and cite nothing.
- Reproduction check: **not performed.** No sentence from any source below is
  carried into the skill. The five `G` rows are one-line paraphrases of
  behaviour the documentation reports, written here from scratch, so nothing in
  this skill depends on a reproduction right. The governing terms of those pages
  have not been read, and no claim is made about what they permit. Anyone adding
  a quotation must read them first and replace this line with the check.
  Recorded 2026-08-06. The grounding matrix declares quotation forbidden and
  every `G` row reads `unquoted`, for this reason.
- Audit status: the pages below were opened on 2026-08-06 while this skill was
  written. That is not the audit the matrix records. No person has read a row
  against its source, so every `G` row reads `unaudited`.

## What the sources are, and what each one licenses

A `G` row in the grounding matrix may trace only to the group below. A vendor
saying that its model narrates its progress licenses a **description**, never a
rule.

- `A1` — "Prompting Claude Opus 5".
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
  Sections read: User-facing progress updates, Task scope and over-verification,
  Self-correction, Controlling subagent spawning. Read 2026-08-06.
- `A2` — "What is new in Claude Opus 5", section Model behavior differences.
  https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5
  Read 2026-08-06. Carries the model id, and repeats the narration, delegation,
  and over-verification differences in one paragraph.

`A1` also carries example prompts that its author wrote for a reader to paste.
Several of our rules answer the same behaviour those examples answer, and a few
land near one in substance. None is copied, and none claims authority from one.
A rule that reads like vendor guidance is still an `E` row, because the vendor
wrote guidance for its own product and not a standard for anybody to cite.

`compressed-deliberation` beside this skill cites the same two pages, and its
own `SOURCE.md` carries a wider register including the system card and the
counterevidence. Read that record with this one. Neither skill supersedes the
other.

## What this record does not carry

The evidence package behind this skill stays outside this repository. It holds
community reports with no denominator, so it establishes that the behaviours are
complained about and it establishes no prevalence. Nothing in it grounds a `G`
row, and nothing in it is quoted here.

The Claude Opus 5 system card records an audited episode in which a request to
explain became an unrequested fix. That episode is cited in
`compressed-deliberation/SOURCE.md`, and it was not re-opened for this skill, so
no row here rests on it.

## What evidence stands behind the rules

None that was measured. The rules answer documented behaviour with discipline we
assert, and `bench/README.md` in this repository holds the protocol that would
test them. No arm has been run. There is no control, no treatment, and no figure
to cite.

ADR-0005 in this repository decided that the craft tier admits operating
discipline, and it named the cost in the same breath. The bench runner drives a
single prompt, and three of this skill's rule sections govern a session of many
steps. Until the runner can drive one, no rule here claims measured effect.

Do not read any rule as an effect that we observed, and do not let a later
summary of this skill say that it works.

## Where a measurement would live

`bench/` in this repository. A study of this skill needs a scenario that runs a
multi-step task with tools, and the current runner cannot drive one.

1. Add a scenario that gives the agent a task, a tool surface, and one defect
   sitting just outside the definition of done.
2. Run the no-guidance control first, per the first rule in `bench/README.md`.
3. Run the same scenario with this skill injected, and keep both arms.
4. Score three things separately. Count the steps narrated with no discovery,
   count the changes outside the definition of done, and read how each arm named
   the conditions it hit.

The scorer in `bench/score.mjs` has no metric for any of the three. Each needs
one added, and each metric has to be tested against the control before anyone
trusts it.

## When this record expires

Any of these makes the skill stale rather than wrong, and it must be re-checked
before the next release:

- Anthropic changes the Opus 5 alias, or either page named above.
- A successor model ships and this repository has not re-read the sources.
- The bench gains a multi-step runner. The section that says there is no
  measurement then has to be replaced by a result, whichever way it goes.

## How to re-check this record

1. Open both `A` URLs above and confirm the named sections still exist.
2. Confirm the model id at the `A2` URL.
3. Confirm that each `G` row in `grounding/craft/proportionate-execution.md`
   still says what the section it cites says.
