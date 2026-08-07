# Grounding: de-slop

Disposes of every unit of content in `skills/craft/de-slop/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. The `Source text` cell carries the words of the rule it cites.
There is no `G` row here, so every cell in both columns is empty, and both are
waiting for the first row that cites anything.

**Quotation:** forbidden. There is no source, so there is nothing to quote.
`SOURCE.md` beside the skill records the same status. Anyone who finds a source
for a rule here records it and its licence there first, and edits this line in
the same pass.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill de-slop`.

## There is no `G` row here, and there cannot be one

The skill this file grades is the one this repository is named for, and it is
the one with no source behind it. No standard, no vendor documentation, and no
published guidance says any of it. Every prescription below is therefore an `E`
row, including the ones that read as obvious.

A vendor page reporting that its own model writes at length would not change
that. Such a page describes a model and prescribes nothing, which is the
distinction `grounding/craft/compressed-deliberation.md` records for the seven
`G` rows it does carry. A contributor who finds a real source for a rule here
adds the source record before adding the row.

Three section titles are graded `E` rather than `N`. `Cut the structure that
performs thoroughness`, `Commit to the claim, or lower it` and `Open on the
answer, and close when it is delivered` are written as instructions, so calling
any of them a title would retire a rule from review by naming it scenery.

## Where the line between an `E` row and an `N` row falls here

A sentence that directs the reader, or that judges the reader's writing, is an
`E` row. A sentence about this skill itself, about what stands behind it, or
about the decision that shaped it, is an `N` row.

That line puts the whole of `No rule here matches a word` in `N` except one
row. `E-18` is the exception, because "a word becomes a rule in a skill only
after a promoted study says it should" is a rule this repository follows, and
ADR-0021 is where it was decided.

## No measurement stands behind these rows

A craft rule can have only one kind of evidence, which is measurement.
`bench/README.md` in this repository holds that protocol. No arm has been run
for this skill. There is no control, no treatment, and no figure, so nothing
here may be read as an effect that we observed.

The rules this skill carries are the half the current scorer cannot see. The
structural metrics there are specific and insensitive, and `words` is the only
metric that has separated every pair measured. ADR-0021 accepts that this skill
ships unmeasured rather than waiting on metrics that do not exist. `SOURCE.md`
beside the skill records the same status.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| E-01 | Cut the structure that performs thoroughness | Cut the structure that performs thoroughness |  |  | Our own guidance, written as a section title |  |
| E-02 | Cut the item that exists to make a pair into a triad. | Cut the structure that performs thoroughness |  |  | Our own guidance |  |
| E-03 | Cut a clause that adds a frame and no second idea. | Cut the structure that performs thoroughness |  |  | Our own guidance |  |
| E-04 | Do not announce a structure that the text then supplies anyway. | Cut the structure that performs thoroughness |  |  | Our own guidance |  |
| E-05 | Do not announce that a point is important. Show why it is, or cut it. | Cut the structure that performs thoroughness |  |  | Our own guidance |  |
| E-06 | A frame with no second idea reads like this. "Not just a parser bug but a design problem" promises two findings and delivers one, because the design problem named is the parser bug under another name. | Cut the structure that performs thoroughness |  |  | Our own guidance, the worked example for E-03 |  |
| E-07 | Commit to the claim, or lower it | Commit to the claim, or lower it |  |  | Our own guidance, written as a section title |  |
| E-08 | Name the actor of every claim. | Commit to the claim, or lower it |  |  | Our own guidance |  |
| E-09 | Keep a claim and its evidence in one paragraph, or lower the claim. | Commit to the claim, or lower it |  |  | Our own guidance |  |
| E-10 | Cut a qualification that would not change what the reader does. | Commit to the claim, or lower it |  |  | Our own guidance |  |
| E-11 | Raise an objection only where the objection is real. | Commit to the claim, or lower it |  |  | Our own guidance |  |
| E-12 | An invented counterposition gives an answer the shape of an argument without the substance of one. The reader then spends attention on a position that nobody holds. | Commit to the claim, or lower it |  |  | Our own guidance, the reason behind E-11 |  |
| E-13 | Open on the answer, and close when it is delivered | Open on the answer, and close when it is delivered |  |  | Our own guidance, written as a section title |  |
| E-14 | Do not open the answer by restating the question. | Open on the answer, and close when it is delivered |  |  | Our own guidance |  |
| E-15 | Do not close with a paragraph that re-says what the reader has just read. | Open on the answer, and close when it is delivered |  |  | Our own guidance |  |
| E-16 | Delete a sentence that survives its own deletion. | Open on the answer, and close when it is delivered |  |  | Our own guidance |  |
| E-17 | The last rule is the one to reach for when the others do not fire. Remove the sentence, read the paragraph again, and keep the sentence only if something changed. | Open on the answer, and close when it is delivered |  |  | Our own guidance, and it tells the reader how to apply E-16 |  |
| E-18 | Counting belongs in `bench/score.mjs` in the stylewright repository, where a scorer counts and asserts nothing. A word becomes a rule in a skill only after a promoted study says it should. | No rule here matches a word |  |  | Our own guidance, and ADR-0021 decided it |  |
| E-19 | Read every rule here as discipline that we assert. Do not read any of it as an effect that we observed, and do not let a later summary say that this skill works. | What stands behind these rules |  |  | Our own guidance, and it instructs the reader how to read the skill |  |
| E-20 | The disagreement is about repetition. Both standards ask a writer to repeat, in a summary, in a heading, or in one term used for one thing. This skill tells a writer to cut a closing that re-says the page. A procedure and a safety notice repeat on purpose, so the standard wins there and this skill yields. | How this differs from the other skills here |  |  | Our own guidance, and it rules on which skill wins |  |
| E-21 | `compressed-deliberation` treats one model's documented defaults, and it expires when that model does. This skill carries no model pin and no expiry, because a rhetorical move outlives any one build. Follow both. | How this differs from the other skills here |  |  | Our own guidance, and it instructs the reader to follow both |  |
| N-01 | de-slop | de-slop |  |  | Section title, asserts no rule |  |
| N-02 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-03 | Some prose reads as machine-written whatever produced it. The defect is a rhetorical move rather than a word, so every rule here names a move. A move survives a model release. A word does not. | Purpose |  |  | States what this skill treats, asserts no rule |  |
| N-04 | No measurement stands behind this skill. `SOURCE.md` beside this file records that, and it names where a measurement would live. | Purpose |  |  | Points at SOURCE.md, asserts no rule |  |
| N-05 | This skill names that move. It ships no pattern that matches it, and the section below says why. | Cut the structure that performs thoroughness |  |  | Describes this skill and points below, asserts no rule |  |
| N-06 | No rule here matches a word | No rule here matches a word |  |  | Section title, asserts no rule |  |
| N-07 | Every rule above names a structure or a commitment. No rule here is enforced by matching a word, and this skill ships no word list. | No rule here matches a word |  |  | Describes this skill, asserts no rule |  |
| N-08 | A word that one setting overuses is countable, and that makes it tempting to ship. Two things argue against carrying it in a skill. A list of forbidden words teaches an agent to swap each one for its nearest neighbour, which leaves the defect and cleans the surface. A word also recurs in a setting rather than in a model, so a shipped list dates faster than the moves above. | No rule here matches a word |  |  | Argues for the decision above, asserts no rule |  |
| N-09 | What stands behind these rules | What stands behind these rules |  |  | Section title, asserts no rule |  |
| N-10 | Nothing measured. A craft rule has no standard behind it, so measurement is the only evidence it can ever have, and no arm has been run for this skill. | What stands behind these rules |  |  | States the evidence, asserts no rule |  |
| N-11 | How this differs from the other skills here | How this differs from the other skills here |  |  | Section title, asserts no rule |  |
| N-12 | `plain-language` and `simplified-technical-english` each distil a published standard, and each writes for a named reader. This skill has no standard and no named reader. | How this differs from the other skills here |  |  | Relates three skills, asserts no rule |  |
| N-13 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
| N-14 | This skill has no external standard behind it. Every rule in it is our own editorial guidance, and the trace marks the rest as narrative that asserts no rule. The trace lives in the stylewright repository at `grounding/craft/de-slop.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
