# Grounding: compressed-deliberation

Disposes of every unit of content in
`skills/craft/compressed-deliberation/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. The `Source text` cell carries the words of the rule it cites.
There is no `G` row here, so every cell in both columns is empty, and both are
waiting for the first row that cites anything.

**Quotation:** forbidden. Nobody has read the governing terms of the vendor
pages behind this skill, so no sentence of one may be carried here. The source
record at `source/craft/compressed-deliberation.md` names those pages. Read
their terms, record the check there, and edit this line in the same pass.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill compressed-deliberation`.

## The vendor material left the skill, and the `G` rows went with it

Seven `G` rows used to carry Anthropic's documentation of Claude Opus 5 into
the skill as its problem statement. They described a model, they licensed no
rule, and a paragraph beside them said so. Together they were most of one
section and none of the guidance.

That description now sits in `source/craft/compressed-deliberation.md`, which
already held the URLs, the sections read, the read date and the expiry
conditions. The skill keeps the sentence a reader acts on, which is that the
rules aim at the whole stack rather than at the model alone. So no row here
cites anything, and this file declares no source version, because a pin no row
answers to is a line nobody maintains.

Read that as a change of scope rather than a retraction. The vendor pages still
say what they said, and the source record still cites them. A contributor who
wants one cited here again adds the `G` row, the source version and the
quotation check in one pass.

## Why no rule here sets a word budget

Anthropic also published a postmortem in which brevity instructions to an
earlier Claude Code build reduced coding quality. That report is `A6` in the
source record. It is the reason `E-14` exists, and the reason this skill states
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
produced 192 to 303. The ranges are disjoint.

Separately, and on a **different** scenario, this skill's own text cuts the
`adjacent-bug` prompt to 59 median words against 173 with no guidance, while all
five runs still report the bug seeded in that prompt. The two results are not
two views of one measurement, and the reporting scenario was never run against
the skill. The samples behind both figures were not kept, so the comparison is
unaudited, and `bench/README.md` records that status beside every figure it
publishes.

Read that as a fact about a harness, not about a model. `claude -p` is the
Claude Code headless path, so "no operator instructions" is not "the stock
model", and one author's rule stack is not operator instructions in general.
Nothing here was measured in the agentic, tool-using, or file-writing regimes
that the source record names as the defect's worst ground, and those are the
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
  arguably out of scope under `E-13`. That judgment was made after seeing the
  divergence, so it is not evidence.
- *One rule carried most of the cost.* Holds for the largest contributor only.
  The ordering among the remaining five rules is one draw from overlapping
  distributions and should not be read as an attribution.

Five runs per cell, medians with no dispersion statistic, four prompts written
by the person who wrote the rules, one seeded bug in one scenario. Nothing here
is a controlled trial, and no `E` row should be read as one.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| E-01 | Read the rules below as aimed at the whole stack you are running inside, and not at the model alone. Our own baseline found an unguided run already clean, and an operator instruction stack above it was what inflated the reply. The source record carries the vendor's documentation of the defaults this skill answers, and that documentation describes a model rather than prescribing anything. | What this corrects |  |  | Our own guidance, and it instructs the reader what the rules aim at |  |
| E-02 | Apply the rules to an agentic session, or to a file written to disk, on their reasoning and not on our evidence. What we measured is single-turn replies, one prompt each, five runs, so those two cases are the ones we have tested least. | What this corrects |  |  | Our own guidance, and it states the evidence the rules rest on |  |
| E-03 | Lead with the result, and not with the route you took to it. | The shape of a reply |  |  | Our own guidance |  |
| E-04 | Put the item that changes the reader's decision first, and let the rest go unsaid. | The shape of a reply |  |  | Our own guidance |  |
| E-05 | Say each thing once, in the place where the reader can act on it. | The shape of a reply |  |  | Our own guidance |  |
| E-06 | Write a claim as a sentence, and never as a section. | The shape of a reply |  |  | Our own guidance |  |
| E-07 | Do not restate the request, the context, or anything the reader just supplied. | The shape of a reply |  |  | Our own guidance |  |
| E-08 | Stop when the result and the support it rests on are on the page. | The shape of a reply |  |  | Our own guidance |  |
| E-09 | **Conceding a correction.** Concede in the first sentence, do not argue the point again, say what the correction changes downstream, and then stop. | The shape of a reply |  |  | Our own guidance, for one situation a reply is written in |  |
| E-10 | **Surfacing a decision.** Surface one only when you will stop and wait for the answer. Give the options, the recommendation, and the belief it rests on. | The shape of a reply |  |  | Our own guidance, for one situation a reply is written in |  |
| E-11 | Report a finished change as the result, and then the evidence that the result holds. | Reporting finished work |  |  | Our own guidance |  |
| E-12 | Name what you verified in one clause, and not under a heading. | Reporting finished work |  |  | Our own guidance |  |
| E-13 | Report an unchecked risk only when it could bite, and lead with it. | Reporting finished work |  |  | Our own guidance |  |
| E-14 | Do not set a word budget, because a budget cuts substance before it cuts scaffolding. | What this skill does not ask for |  |  | Our own guidance |  |
| E-15 | Do not drop a finding to make a reply shorter. | What this skill does not ask for |  |  | Our own guidance |  |
| E-16 | Do not suppress the narration that a reader uses to intervene. | What this skill does not ask for |  |  | Our own guidance |  |
| E-17 | `de-slop` treats prose that reads as machine-written, whatever produced it. This skill treats one model's documented defaults, and it expires when that model does. Follow both. They do not disagree. | How this differs from de-slop |  |  | Our own guidance, and it instructs the reader to follow both |  |
| N-01 | compressed-deliberation | compressed-deliberation |  |  | Section title, asserts no rule |  |
| N-02 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-03 | Deliberation is not the product. Monitoring, qualifying, verifying, managing scope and correcting course are all real work, and a reader wants the edited result of that work rather than a transcript of it. | Purpose |  |  | Purpose framing, asserts no rule |  |
| N-04 | This skill is pinned to one model build. The record of what it targets, and of when it expires, lives in the stylewright repository at `source/craft/compressed-deliberation.md`. It is not installed with this skill. | Purpose |  |  | Points at the source record, asserts no rule |  |
| N-05 | What this corrects | What this corrects |  |  | Section title, asserts no rule |  |
| N-06 | The shape of a reply | The shape of a reply |  |  | Section title, asserts no rule |  |
| N-07 | Reporting finished work | Reporting finished work |  |  | Section title, asserts no rule |  |
| N-08 | What this skill does not ask for | What this skill does not ask for |  |  | Section title, asserts no rule |  |
| N-09 | How this differs from de-slop | How this differs from de-slop |  |  | Section title, asserts no rule |  |
| N-10 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
| N-11 | Every rule in this skill is our own editorial guidance, and no part of it traces to a published source. The trace lives in the stylewright repository at `grounding/craft/compressed-deliberation.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
