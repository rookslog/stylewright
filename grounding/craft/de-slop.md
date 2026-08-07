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

`E-16` is the row where the `G` question was live, and it is the one row here
that carries a fact we did not establish. Anthropic reported the Claude Code
brevity revert, and the report reached this branch through the owner's comment
on issue #1 rather than through anyone here opening the page. A `G` row would
name a source location for a document nobody on this branch has read, which is
the defect the `Audited` column exists to catch, one column over. So the row is
`E`, the unit states the report as a report, and `SOURCE.md` records where it
came from and what it would take to promote the row.

## The body was rewritten, so the IDs start again

An earlier draft of this skill was a list of prohibitions, and the owner ruled
that this failure type takes a positive recipe instead. Almost no unit survived
that rewrite unchanged, so the numbering restarts in document order rather than
preserving the gaps an earlier two-row edit had left. A reviewer holding IDs
from the prohibition draft should read this table fresh.

## Where the line between an `E` row and an `N` row falls here

A sentence that directs the reader, or that judges the reader's writing, is an
`E` row. A sentence about this skill itself, about what stands behind it, or
about the decision that shaped it, is an `N` row.

Two consequences worth stating. The five parts of the shape are `E` rows and so
is each departure beside them, because a departure names a defect in the
reader's passage even though it is written as description rather than as a
prohibition. The form changed and the authority did not.

And `No part of this matches a word` grades almost entirely `N`, because it
argues for a decision about this repository rather than telling a writer
anything. `E-19` is the exception, because "a word becomes a rule in a skill
only after a promoted study says it should" is a rule this repository follows,
and ADR-0021 is where it was decided.

## No measurement stands behind these rows

A craft rule can have only one kind of evidence, which is measurement.
`bench/README.md` in this repository holds that protocol. No arm has been run
for this skill. There is no control, no treatment, and no figure, so nothing
here may be read as an effect that we observed.

The shape this skill carries is what the current scorer cannot see. The
structural metrics there are specific and insensitive, and `words` is the only
metric that has separated every pair measured. ADR-0021 accepts that this skill
ships unmeasured, and it records why the block issue #1 carried is lifted on
that basis. `SOURCE.md` beside the skill records the same status.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| E-01 | Open on the thing itself, so the first sentence carries the result. | The shape of a finished passage |  |  | Our own guidance |  |
| E-02 | Give each sentence one idea that the passage needs. | The shape of a finished passage |  |  | Our own guidance |  |
| E-03 | Name the actor of a claim, and hold the claim at the strength its evidence carries. | The shape of a finished passage |  |  | Our own guidance |  |
| E-04 | Let the structure follow the content, so a list appears where the items are parallel. | The shape of a finished passage |  |  | Our own guidance |  |
| E-05 | End at the last sentence that carries weight. | The shape of a finished passage |  |  | Our own guidance |  |
| E-06 | A passage with all five is finished, whatever else could be said about it. | The shape of a finished passage |  |  | Our own guidance, and it states when the shape is met |  |
| E-07 | Read these to recognise a shape you are already in, and not as a list to check against. | What a departure looks like |  |  | Our own guidance, and it tells the reader how to use the rows below |  |
| E-08 | **The opening.** A passage that restates the question has spent its first sentence on words the reader wrote. | What a departure looks like |  |  | Our own guidance, the departure from E-01 |  |
| E-09 | **One idea.** A triad where two items would do buys a clause and adds no idea. So does a "not just X but Y" frame whose Y restates X. | What a departure looks like |  |  | Our own guidance, the departure from E-02 |  |
| E-10 | **The claim.** An invented counterposition gives an answer the shape of an argument without the substance of one. A stack of qualifications buries the one that would change what the reader does. A passive verb with no actor leaves nobody holding the claim. | What a departure looks like |  |  | Our own guidance, the departure from E-03 |  |
| E-11 | **Earned structure.** A heading over two sentences, and a sentence announcing that a point is important, each perform a thoroughness the content has not reached. | What a departure looks like |  |  | Our own guidance, the departure from E-04 |  |
| E-12 | **The end.** A closing paragraph that re-says the page gives the reader a second reading of the first. | What a departure looks like |  |  | Our own guidance, the departure from E-05 |  |
| E-13 | One test settles most of them. Remove the sentence, read the passage again, and keep the sentence only if something changed. | What a departure looks like |  |  | Our own guidance, and it is the one mechanical test here |  |
| E-14 | Compression has a cost, so name it | Compression has a cost, so name it |  |  | Our own guidance, written as a section title |  |
| E-15 | The shape above is not a shorter passage. It is a passage whose length is its content. | Compression has a cost, so name it |  |  | Our own guidance, and it refuses a reading of the shape |  |
| E-16 | Anthropic reported in April 2026 that a system instruction imposing strict brevity in Claude Code reduced coding quality, and reverted it. That is a first-party report of compression paid for in correctness. So the shape above sets no length, and a finding that a shorter passage would have dropped stays in. | Compression has a cost, so name it |  |  | Our own guidance, on a report SOURCE.md records as unread here |  |
| E-17 | Counting belongs in `bench/score.mjs` in the stylewright repository, where a scorer counts and asserts nothing. A word becomes a rule in a skill only after a promoted study says it should. | No part of this matches a word |  |  | Our own guidance, and ADR-0021 decided it |  |
| E-18 | Read the shape here as discipline that we assert. Do not read any of it as an effect that we observed, and do not let a later summary say that this skill works. | What stands behind this shape |  |  | Our own guidance, and it instructs the reader how to read the skill |  |
| E-19 | The disagreement is about repetition. Both standards ask a writer to repeat, in a summary, in a heading, or in one term used for one thing. This skill ends a passage at its last load-bearing sentence. A procedure and a safety notice repeat on purpose, so the standard wins there and this skill yields. | How this differs from the other skills here |  |  | Our own guidance, and it rules on which skill wins |  |
| E-20 | `compressed-deliberation` treats one model's documented defaults, and it expires when that model does. `proportionate-execution` governs a session, so it holds what an agent does as well as what it writes. This skill treats one passage of prose, whatever produced it, and it carries no model pin. Follow all three. They do not disagree. | How this differs from the other skills here |  |  | Our own guidance, and it instructs the reader to follow all three |  |
| N-01 | de-slop | de-slop |  |  | Section title, asserts no rule |  |
| N-02 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-03 | The defect this skill treats is a rhetorical move rather than a word, so this skill gives a shape to write toward rather than a vocabulary to avoid. A move survives a model release. Whether a word does is not settled. | Purpose |  |  | States what this skill treats and what form it takes, asserts no rule |  |
| N-04 | The shape of a finished passage | The shape of a finished passage |  |  | Section title, asserts no rule |  |
| N-05 | What a departure looks like | What a departure looks like |  |  | Section title, asserts no rule |  |
| N-06 | No part of this matches a word | No part of this matches a word |  |  | Section title, asserts no rule |  |
| N-07 | No part of the shape above is enforced by matching a word, and this skill ships no word list. | No part of this matches a word |  |  | Describes this skill, asserts no rule |  |
| N-08 | A word that one setting overuses is countable, and that makes it tempting to ship. Two things argue against carrying it in a skill. A list of forbidden words teaches an agent to swap each one for its nearest neighbour, which leaves the defect and cleans the surface. A word may also recur in a setting rather than in a model, which is the live reading here rather than a finding. On that reading a shipped list dates faster than the shape above. | No part of this matches a word |  |  | Argues for the decision above at the strength ADR-0021 states it, asserts no rule |  |
| N-09 | What a check can see | What a check can see |  |  | Section title, asserts no rule |  |
| N-10 | Nothing here, today. `stylewright lint` carries no check for any part of the shape above, because a triad, a restatement and an invented objection are judgments about content rather than shapes a program recognises. | What a check can see |  |  | States what the tool does not do, asserts no rule |  |
| N-11 | So this skill is the generative half on its own. A reader applies it while writing, and no build fails when a passage departs from it. | What a check can see |  |  | Describes how this skill reaches a reader, asserts no rule |  |
| N-12 | What stands behind this shape | What stands behind this shape |  |  | Section title, asserts no rule |  |
| N-13 | Nothing measured. A craft rule has no standard behind it, so measurement is the only evidence it can ever have, and no arm has been run for this skill. | What stands behind this shape |  |  | States the evidence, asserts no rule |  |
| N-14 | How this differs from the other skills here | How this differs from the other skills here |  |  | Section title, asserts no rule |  |
| N-15 | `plain-language` and `simplified-technical-english` each distil a published standard, and each writes for a named reader. This skill has no standard and no named reader. | How this differs from the other skills here |  |  | Relates three skills, asserts no rule |  |
| N-16 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
| N-17 | This skill has no external standard behind it. Every rule in it is our own editorial guidance, and the trace marks the rest as narrative that asserts no rule. The trace lives in the stylewright repository at `grounding/craft/de-slop.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
