# Grounding: proportionate-execution

Disposes of every unit of content in
`skills/craft/proportionate-execution/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. Every row starts at `unaudited`, and no run of the checker raises
it. A person who checks a row writes the date and the row's digest in place of
the word. Editing any other cell changes that digest, so the audit goes stale
and the check says so. So does moving the source version this file declares,
because an audit answers to one reading of the source.

The `Source text` cell of a `G` row carries the words of the rule it cites, in
quotation marks. Every row below reads `unquoted`, and that is the state the
declaration below requires.

**Quotation:** forbidden. `SOURCE.md` records that nobody has read the governing
terms of the vendor pages these rows cite, so no sentence of one may be carried
here. Read those terms and record the check, then edit this line.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill proportionate-execution`.

## What the `G` rows are, and what they are not

The five `G` rows trace to Anthropic's own documentation of Claude Opus 5. They
are the **problem statement** of this skill and nothing else. A vendor saying
that its model narrates its progress licenses a description of the model. It
licenses no rule about how anybody should work.

Every prescription here is therefore an `E` row, including the ones that read as
obvious consequences of a `G` row. The citations look authoritative, and that is
why the line has to hold.

Two of the five carry a hedge, and the hedge is load-bearing. The source says
that the model *tends to* announce its next step, and that its per-message output
is *often* longer. A row that drops either word states a tendency as a rule of
the model, which claims more than the source grants. That is this repository's
worst defect in its quiet form, and both hedges are back.

`SOURCE.md` beside the skill carries the URLs, the sections read, the read date,
and the expiry conditions.

## Why this skill governs conduct and not prose alone

Three of the rule sections govern what an agent does, and not only what it
writes. ADR-0005 in this repository decided that the craft tier admits operating
discipline, on this skill's own issue. The authority is still ours, and the
grade of every such row is `E`.

That decision carries a limit, and the limit is recorded here rather than left
to be discovered. No operating-discipline rule may claim measured effect until
the bench can drive a multi-step session. `E-02` states that limit inside the
skill, which is why it is a rule and not narrative.

## No measurement stands behind these rows

A craft rule can have only one kind of evidence, which is measurement.
`bench/README.md` in this repository holds that protocol. No arm has been run
for this skill. There is no control, no treatment, and no figure, so nothing
here may be read as an effect that we observed.

The bench cannot run one yet. Its runner drives a single prompt, and every rule
below is about a session of many steps. `SOURCE.md` beside the skill records
what a study would need, and ADR-0005 records that the gap was accepted
knowingly.

## Three section titles are graded `E`, and two are not

`Report a step when the reader can act on it`, `Do the work the request
defines`, and `Name a condition at the severity it carries` are written as
instructions. Calling any of them a title would retire a rule from review by
naming it scenery, so each is an `E` row.

`Narration a reader uses to intervene` and `What this skill does not ask for`
are noun phrases that instruct nobody, so both are `N` rows.

## Two paragraphs that scope the `G` rows are both `E`

`E-01` tells the reader that the `G` rows license no rule, and `E-02` tells the
reader that no measurement stands behind the rules either. Both instruct a
reader how to read what follows, so both are graded the same way. Grading one
`N` and the other `E` was an inconsistency the review caught.

`N-03` runs the other way. It states the skill's premise, that both decisions in
a session default to more than the task needs, and that generalizes past the one
model the sources document to any agent in a session. Its `Source location` cell
says so, because the trace is where an ungrounded premise has to be visible.

**Source version:** Anthropic's documentation of Claude Opus 5, model id
`claude-opus-5`, as read up to the evidence cutoff of 2026-08-06. The target is
a model build rather than a standard, so the build and the cutoff are what a
reading of these pages is a reading of.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| G-01 | Claude Opus 5 tends to announce what it is about to do during agentic work. | What this corrects | User-facing progress updates | unquoted | A1, Prompting Claude Opus 5 | unaudited |
| G-02 | It often writes more per message in an agentic session than earlier models did. | What this corrects | User-facing progress updates | unquoted | A1, Prompting Claude Opus 5 | unaudited |
| G-03 | It verifies its own work when nobody asked it to. | What this corrects | Task scope and over-verification | unquoted | A1, and A2 Model behavior differences | unaudited |
| G-04 | It can widen a task past the request, taking on steps nobody asked for. | What this corrects | Task scope and over-verification | unquoted | A1, Prompting Claude Opus 5 | unaudited |
| G-05 | It narrates a correction to its own earlier statement more often than earlier models did. | What this corrects | Self-correction | unquoted | A1, Prompting Claude Opus 5 | unaudited |
| E-01 | Anthropic publishes these as behaviours of Claude Opus 5. They describe the model. They prescribe nothing, and no rule below inherits their authority. | What this corrects |  |  | Our own guidance, and it states what the G rows do not license |  |
| E-02 | No measurement stands behind any rule below. The bench named in `SOURCE.md` cannot drive a multi-step session yet, so read every rule here as discipline we assert, and never as an effect we observed. | What this corrects |  |  | Our own guidance, and it instructs how to read the rules |  |
| E-03 | Report a step when the reader can act on it | Report a step when the reader can act on it |  |  | Our own guidance, written as a section title |  |
| E-04 | Report a discovery that changes what the reader would decide, and let a routine step pass unreported. | Report a step when the reader can act on it |  |  | Our own guidance |  |
| E-05 | Report a finished task by what changed, and not by the order you worked in. | Report a step when the reader can act on it |  |  | Our own guidance |  |
| E-06 | Report a correction to your own earlier statement when the error changes the reader's work. | Report a step when the reader can act on it |  |  | Our own guidance |  |
| E-07 | Absorb a mistake of your own that costs the reader nothing, and do not report it. | Report a step when the reader can act on it |  |  | Our own guidance |  |
| E-08 | Do the work the request defines | Do the work the request defines |  |  | Our own guidance, written as a section title |  |
| E-09 | Take the definition of done from the request, and not from what you noticed on the way. | Do the work the request defines |  |  | Our own guidance |  |
| E-10 | Finish the task as asked, and name a better task in one sentence rather than switching to it. | Do the work the request defines |  |  | Our own guidance |  |
| E-11 | Fix a defect outside the task only when the task cannot finish while that defect stands. | Do the work the request defines |  |  | Our own guidance |  |
| E-12 | Check what the result rests on, and do not add a second check to feel sure. | Do the work the request defines |  |  | Our own guidance |  |
| E-13 | Decide a small ambiguity yourself, and stop for one that changes what you would deliver. | Do the work the request defines |  |  | Our own guidance |  |
| E-14 | Ask before you widen the work, and never after the work is done. | Do the work the request defines |  |  | Our own guidance |  |
| E-15 | Name a condition at the severity it carries | Name a condition at the severity it carries |  |  | Our own guidance, written as a section title |  |
| E-16 | Describe a condition by what it costs the reader, and not by how it felt to hit. | Name a condition at the severity it carries |  |  | Our own guidance |  |
| E-17 | Keep the words failure, blocked, and critical for a condition that stops the work. | Name a condition at the severity it carries |  |  | Our own guidance |  |
| E-18 | Report a condition you recovered from as recovered, in the sentence that names it. | Name a condition at the severity it carries |  |  | Our own guidance |  |
| E-19 | State what happened and what it costs, and leave the urgency for the reader to set. | Name a condition at the severity it carries |  |  | Our own guidance |  |
| E-20 | Some narration is load-bearing. A reader who can stop you needs to know what you are about to do, and a rule that removes that narration costs the reader more than it saves. | Narration a reader uses to intervene |  |  | Our own guidance, and it governs how the rules above apply |  |
| E-21 | Say what you are about to do before an action the reader may want to stop. | Narration a reader uses to intervene |  |  | Our own guidance |  |
| E-22 | Say what a step will cost before you spend the reader's money or their afternoon. | Narration a reader uses to intervene |  |  | Our own guidance |  |
| E-23 | Keep the narration that lets a reader stop an action already underway, whatever the rules above would otherwise cut. | Narration a reader uses to intervene |  |  | Our own guidance, and the override reaches that narration alone |  |
| E-24 | Do not stop for approval on a call the request already settled. | What this skill does not ask for |  |  | Our own guidance |  |
| E-25 | Do not withhold a finding to keep a report short. | What this skill does not ask for |  |  | Our own guidance |  |
| E-26 | Do not soften a condition that is genuinely severe. | What this skill does not ask for |  |  | Our own guidance |  |
| E-27 | `compressed-deliberation` treats the shape of one written reply. This skill treats a session, so it governs the work you take on as well as what you say while working. Follow both. They do not disagree. | How this differs from compressed-deliberation |  |  | Relates two skills, and instructs the reader to follow both |  |
| E-28 | `de-slop` treats one passage of prose, whatever produced it. This skill governs a session, so it holds what an agent does as well as what it says. Follow both. They do not disagree. | How this differs from de-slop |  |  | Relates two skills, and instructs the reader to follow both |  |
| N-01 | proportionate-execution | proportionate-execution |  |  | Section title, asserts no rule |  |
| N-02 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-03 | An agent in a session decides two things over and over. What to do next, and what to say about what it did. Both decisions default to more than the task needs, and this skill holds each one to the size of the thing it serves. | Purpose |  |  | Purpose framing, asserts no rule. The generalization past the documented model to any agent is ours, and no source grounds it |  |
| N-04 | This skill is pinned to one model build. The record of what it targets, of what stands behind it, and of when it expires, is in `SOURCE.md` beside this file. | Purpose |  |  | Points at SOURCE.md, asserts no rule |  |
| N-05 | What this corrects | What this corrects |  |  | Section title, asserts no rule |  |
| N-06 | Narration a reader uses to intervene | Narration a reader uses to intervene |  |  | Section title, asserts no rule |  |
| N-07 | What this skill does not ask for | What this skill does not ask for |  |  | Section title, asserts no rule |  |
| N-08 | How this differs from compressed-deliberation | How this differs from compressed-deliberation |  |  | Section title, asserts no rule |  |
| N-09 | How this differs from de-slop | How this differs from de-slop |  |  | Section title, asserts no rule |  |
| N-10 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
| N-11 | Only the section named "What this corrects" traces to a published source, and it traces for description alone. Every rule in this skill is our own editorial guidance. The trace lives in the stylewright repository at `grounding/craft/proportionate-execution.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
