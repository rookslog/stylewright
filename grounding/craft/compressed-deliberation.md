# Grounding: compressed-deliberation

Traces every statement in `skills/craft/compressed-deliberation/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill compressed-deliberation`.

## What the `G` rows are, and what they are not

The seven `G` rows below trace to Anthropic's own documentation of Claude Opus
5. They are the **problem statement** of this skill and nothing else. A vendor
saying that its model writes at length licenses a description of the model. It
licenses no rule about how anybody should write.

Every prescription here is therefore an `E` row, including the ones that read as
obvious consequences of a `G` row. The citations look authoritative, and that is
why the line has to hold.

`SOURCE.md` beside the skill carries the URLs, the sections read, the read date,
and the expiry conditions.

## Why no `G` row supports a word budget

Anthropic also published a postmortem in which brevity instructions to an
earlier Claude Code build reduced coding quality. That report is `A6` in
`SOURCE.md`. It is the reason `E-14` exists, and the reason this skill states
shapes rather than lengths. We carry the counterevidence rather than omit it.

## Baseline

These rules answer a measured baseline rather than an impression. It is recorded
on issue #23. The GREEN-phase arms reproduce from `bench/` in this repository;
the RED-phase ablation does not, because it ran from scratchpad scripts against
live uncommitted operator config, and `bench/out/` is not committed. Four
scenarios, five runs each, fresh context, median visible words.

**What survived review.** One result, and it is narrower than it first reads. On
one single-turn reporting prompt, `claude -p` with no operator instructions
produced 37 to 65 words, and the same harness carrying one operator's rule stack
produced 192 to 303. The ranges are disjoint. Separately, this skill's own text
cuts that scenario to 59 median words against 173 with no guidance, while all
five runs still report a bug seeded in the prompt.

Read that as a fact about a harness, not about a model. `claude -p` is the
Claude Code headless path, so "no operator instructions" is not "the stock
model", and one author's rule stack is not operator instructions in general.
Nothing here was measured in the agentic, tool-using, or file-writing regimes
that `G-02` and `G-03` name as the defect's worst ground, and those are the
regimes the skill is meant for.

**What did not survive.** Two adversarial reviews on 2026-07-27 struck more of
this record than they left.

- *Structure drives length, so measure `scaffold`.* Struck. Five of six arms
  score zero scaffold across 59 to 269 words.
- *A positive recipe generalises where a mandate with exemptions does not.*
  Struck, and it was this skill's stated reason for its own form. The
  comparison had 26 words of harness noise inside one arm's word counts, the
  rule text was edited while that arm was still running, the comparison arm was
  never run on the scenario that carried the generalisation, and the arm
  credited to the recipe contained a second, unattributed edit that was itself a
  mandate with an exemption. Decontaminated, the two forms are
  indistinguishable. The skill is still written as a recipe. That is now a
  choice, not a finding.
- *Cost fell without cutting findings.* Weakened. Detection of the seeded bug
  is five of five in every arm, but the skill's samples raise one distinct issue
  where the unguided samples raise two or three. What it drops is secondary and
  arguably out of scope under `E-09`. That judgment was made after seeing the
  divergence, so it is not evidence.
- *One rule carried most of the cost.* Holds for the largest contributor only.
  The ordering among the remaining five rules is one draw from overlapping
  distributions and should not be read as an attribution.

Five runs per cell, medians with no dispersion statistic, four prompts written
by the person who wrote the rules, one seeded bug in one scenario. Nothing here
is a controlled trial, and no `E` row should be read as one.

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| G-01 | Claude Opus 5 writes longer visible responses than earlier Opus models. | What this corrects | Response length and verbosity | A1, Prompting Claude Opus 5 |
| G-02 | It writes longer reports, summaries, and files to disk. | What this corrects | Written deliverable length | A1, Prompting Claude Opus 5 |
| G-03 | It announces what it is about to do more often during agentic work. | What this corrects | User-facing progress updates | A1, Prompting Claude Opus 5 |
| G-04 | It verifies its own work without being asked. | What this corrects | Task scope and over-verification | A1, Prompting Claude Opus 5 |
| G-05 | It narrates its own corrections more often. | What this corrects | Self-correction | A1, Prompting Claude Opus 5 |
| G-06 | It can widen a task past what the reader asked for. | What this corrects | Task scope and over-verification | A1, and A5 System Card pp. 86 to 87 |
| G-07 | A lower effort setting does not reliably shorten the visible answer. | What this corrects | Response length and verbosity | A1, and A3 migration guide |
| E-01 | Lead with the result, and not with the route you took to it. | The shape of a reply |  | Our own guidance |
| E-02 | Put the item that changes the reader's decision first, and let the rest go unsaid. | The shape of a reply |  | Our own guidance |
| E-03 | Say each thing once, in the place where the reader can act on it. | The shape of a reply |  | Our own guidance |
| E-04 | Write a claim as a sentence, and never as a section. | The shape of a reply |  | Our own guidance |
| E-05 | Do not restate the request, the context, or anything the reader just supplied. | The shape of a reply |  | Our own guidance |
| E-06 | Stop when the result and the support it rests on are on the page. | The shape of a reply |  | Our own guidance |
| E-07 | Report a finished change as the result, and then the evidence that the result holds. | Reporting finished work |  | Our own guidance |
| E-08 | Name what you verified in one clause, and not under a heading. | Reporting finished work |  | Our own guidance |
| E-09 | Report an unchecked risk only when it could bite, and lead with it. | Reporting finished work |  | Our own guidance |
| E-10 | Concede in the first sentence, and do not argue the point again. | Conceding a correction |  | Our own guidance |
| E-11 | Say what the correction changes downstream, and then stop. | Conceding a correction |  | Our own guidance |
| E-12 | Surface a decision only when you will stop and wait for the answer. | Surfacing a decision |  | Our own guidance |
| E-13 | Give the options, the recommendation, and the belief the recommendation rests on. | Surfacing a decision |  | Our own guidance |
| E-14 | Do not set a word budget, because a budget cuts substance before it cuts scaffolding. | What this skill does not ask for |  | Our own guidance |
| E-15 | Do not drop a finding to make a reply shorter. | What this skill does not ask for |  | Our own guidance |
| E-16 | Do not suppress the narration that a reader uses to intervene. | What this skill does not ask for |  | Our own guidance |
