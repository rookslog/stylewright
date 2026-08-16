# Grounding: subagent-returns

Disposes of every unit of content in `skills/craft/subagent-returns/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. The `Source text` cell carries the words of the rule it cites.
There is no `G` row here, so every cell in both columns is empty, and both are
waiting for the first row that cites anything.

**Quotation:** forbidden. There is no source, so there is nothing to quote. The
source record at `source/craft/subagent-returns.md` states the same status.
Anyone who finds a source for a rule here records it and its licence there
first, and edits this line in the same pass.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill subagent-returns`.

## There is no `G` row here

The skill this file grades came out of an operator request and nothing else. No
standard, no vendor documentation, and no published guidance says any of it.
Every prescription below is therefore an `E` row, including the ones that read
as obvious.

A vendor page reporting how much a model writes would not change that. Such a
page describes a model and prescribes nothing, which is the distinction
`grounding/craft/compressed-deliberation.md` records for the vendor material
its own skill used to carry. A contributor who finds a real source for a rule
here adds the source record before adding the row.

## Where the line between an `E` row and an `N` row falls here

A sentence that directs the reader, or that judges the reader's return, is an
`E` row. A sentence about this skill itself, or about what stands behind it, is
an `N` row.

Six of the headings are `E` rows, because each one carries the guidance of the
section under it rather than labelling it. `Carry the data, and not the journey`
instructs on its own, and `A failure is a result` asserts on its own. The five
label headings are `N`, and so is the title.

`Purpose` carries one row of each kind. Its first paragraph says what the
channel is, and its second tells the reader which messages these rules leave
alone, which directs and therefore grades `E`.

Doubt resolves to `E` here. An `E` row claims our own authority and an `N` row
claims none, so grading a directive as narrative retires it from review, which
is the defect `AGENTS.md` names. Grading a piece of scenery as guidance costs a
reviewer one reading.

## No measurement stands behind these rows

A craft rule can have only one kind of evidence, which is measurement.
`bench/README.md` in this repository holds that protocol. No arm has been run
for this skill. There is no control, no treatment, and no figure, so nothing
here may be read as an effect that we observed.

The bench runner drives one prompt, and every rule here governs a message that
one agent returns to another. So a study of this skill needs a runner that can
drive a delegation, which is the gap `source/craft/proportionate-execution.md`
already records for a session. The source record at
`source/craft/subagent-returns.md` states the same status.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| E-01 | The final message is the whole delivery | The final message is the whole delivery |  |  | Our own guidance, written as a section title |  |
| E-02 | Put every fact the caller needs into the final message, because nothing else you wrote reaches it. | The final message is the whole delivery |  |  | Our own guidance |  |
| E-03 | Point at a file the caller can open, rather than pasting the contents that file already holds. | The final message is the whole delivery |  |  | Our own guidance |  |
| E-04 | Paste the text whose exact wording the caller must act on, and summarise the rest. | The final message is the whole delivery |  |  | Our own guidance, and it bounds E-03 |  |
| E-05 | Fill the shape the caller asked for | Fill the shape the caller asked for |  |  | Our own guidance, written as a section title |  |
| E-06 | Fill the return format the spawn prompt gave, field for field. | Fill the shape the caller asked for |  |  | Our own guidance |  |
| E-07 | Add no section the caller did not ask for. | Fill the shape the caller asked for |  |  | Our own guidance |  |
| E-08 | Answer a three-line question in three lines, under no heading. | Fill the shape the caller asked for |  |  | Our own guidance |  |
| E-09 | Return the data itself where the caller named no shape, and do not invent a report around it. | Fill the shape the caller asked for |  |  | Our own guidance, and it covers the case the section leaves open |  |
| E-10 | Carry the data, and not the journey | Carry the data, and not the journey |  |  | Our own guidance, written as a section title |  |
| E-11 | Cut the restatement of the task, because the caller wrote it. | Carry the data, and not the journey |  |  | Our own guidance |  |
| E-12 | Cut the account of the order you worked in, and return what you found. | Carry the data, and not the journey |  |  | Our own guidance |  |
| E-13 | Cut the closing summary, because the caller has just read the message. | Carry the data, and not the journey |  |  | Our own guidance |  |
| E-14 | Say where each claim came from | Say where each claim came from |  |  | Our own guidance, written as a section title |  |
| E-15 | Mark a claim you inferred, in the clause that makes it. | Say where each claim came from |  |  | Our own guidance |  |
| E-16 | State a count beside the command or the file it came from, in the same clause. | Say where each claim came from |  |  | Our own guidance |  |
| E-17 | Report what a check reported, and never what you expect it to report. | Say where each claim came from |  |  | Our own guidance |  |
| E-18 | State what you did not cover in one line, and where the caller's shape has no room for it, the shape wins. | Say where each claim came from |  |  | Our own guidance, and it settles which of E-06 and this rule gives way |  |
| E-19 | A caller re-runs a measured claim cheaply and re-derives an inference expensively. A message that blurs the two moves that cost onto the caller. | Say where each claim came from |  |  | Our own guidance, and it judges a return that blurs the two |  |
| E-20 | A failure is a result | A failure is a result |  |  | Our own guidance, written as a section title |  |
| E-21 | Return a blocked run as data: what you attempted, what you observed, and the smallest thing that would let it continue. | A failure is a result |  |  | Our own guidance |  |
| E-22 | Name a step you skipped, because silence about it reads as a step you took. | A failure is a result |  |  | Our own guidance |  |
| E-23 | Leave the apology out, and let the failure state itself. | A failure is a result |  |  | Our own guidance |  |
| E-24 | Length answers to the caller's decision | Length answers to the caller's decision |  |  | Our own guidance, written as a section title |  |
| E-25 | Size the message to what the caller must decide, and not to the work it took. | Length answers to the caller's decision |  |  | Our own guidance |  |
| E-26 | Cut a line the caller would not act on. | Length answers to the caller's decision |  |  | Our own guidance, and it is the one mechanical test here |  |
| E-27 | Work you did buys no words. A long return is not a report on effort, and a caller reading one pays for every line of it. | Length answers to the caller's decision |  |  | Our own guidance, and it judges a return sized by effort |  |
| E-28 | Do not drop a finding to make the return shorter. | What this skill does not ask for |  |  | Our own guidance, and it bounds E-25 and E-26 |  |
| E-29 | Do not shorten a shape the caller asked for. | What this skill does not ask for |  |  | Our own guidance, and it bounds E-25 and E-26 |  |
| E-30 | `de-slop` treats one passage of prose and `compressed-deliberation` treats one reply, and each writes for a person. `proportionate-execution` governs a whole session. This skill treats the one message a calling agent receives. Follow all four. They do not disagree. | How this differs from the other craft skills |  |  | Our own guidance, and it instructs the reader to follow all four |  |
| E-31 | Read every rule here as discipline that we assert. Do not read any of it as an effect that we observed. | What stands behind these rules |  |  | Our own guidance, and it instructs the reader how to read the skill |  |
| E-32 | Read these rules for that message alone. A file you leave for another agent to open is a different channel, and the rules below do not govern it. | Purpose |  |  | Our own guidance, and it bounds what the trigger admits |  |
| N-01 | subagent-returns | subagent-returns |  |  | Section title, asserts no rule |  |
| N-02 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-03 | A calling agent reads the message you end on, and it reads nothing else you wrote. So that message is a return value the caller acts on, rather than a report a person reads at leisure. This skill holds it to what the caller needs. | Purpose |  |  | States what this skill treats and who reads it, asserts no rule |  |
| N-04 | What this skill does not ask for | What this skill does not ask for |  |  | Section title, asserts no rule |  |
| N-05 | How this differs from the other craft skills | How this differs from the other craft skills |  |  | Section title, asserts no rule |  |
| N-06 | What stands behind these rules | What stands behind these rules |  |  | Section title, asserts no rule |  |
| N-07 | Nothing measured. A craft rule has no standard behind it, so measurement is the only evidence it can ever have, and no arm has been run for this skill. | What stands behind these rules |  |  | States the evidence, asserts no rule |  |
| N-08 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
| N-09 | This skill has no external standard behind it. Every rule in it is our own editorial guidance, and the trace marks the rest as narrative that asserts no rule. The trace lives in the stylewright repository at `grounding/craft/subagent-returns.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
