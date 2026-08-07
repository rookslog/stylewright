# Grounding: navigable-references

Disposes of every unit of content in
`skills/craft/navigable-references/SKILL.md`.

- A **`G` row** traces to an external source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. The `Source text` cell carries the words of the rule it cites.
There is no `G` row here, so every cell in both columns is empty, and both are
waiting for the first row that cites anything.

**Quotation:** forbidden. There is no source, so there is nothing to quote.
Anyone who finds one for a rule here records the source and its licence first,
and edits this line in the same pass.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill navigable-references`.

## There is no `G` row here, and there cannot be one

No standard, no vendor documentation, and no published guidance says any of
this. The rule is ours. Every prescription below is therefore an `E` row,
including the ones that read as obvious, and a later contributor who finds a
source for one of them must add the source record before adding the row.

Two section titles are graded `E` rather than `N`. `Give the reference a form
the reader can follow` and `Find the line at the moment you cite it` are
written as instructions, so calling either one a title would retire a rule from
review by naming it scenery.

The table is a unit of its own, named by `[table 32549560]`. It prescribes a
form per medium, so it is an `E` row and not an `N` row. Its designator names
the contents, so rewriting a cell in it breaks this row.

## No measurement stands behind these rows

A craft rule can have only one kind of evidence, which is measurement.
`bench/README.md` in this repository holds that protocol. No arm has been run
for this skill. There is no control, no treatment, and no figure, so nothing
here may be read as an effect that we observed.

What the skill has instead is a result a reader can check without a bench: the
reference resolves, or it does not. That is a property of the rule rather than
evidence for it, and `SOURCE.md` beside the skill records the same status.

| ID | Our guidance | Our anchor | Source rule | Source text | Source location | Audited |
|---|---|---|---|---|---|---|
| E-01 | A writer who names something the reader cannot reach has moved the work of finding it onto the reader. The writer already had the location open, and chose a label instead. That is a writing defect, and not a gap in the tools. | Purpose |  |  | Our own guidance |  |
| E-02 | Give the reference a form the reader can follow | Give the reference a form the reader can follow |  |  | Our own guidance, written as a section title |  |
| E-03 | Name a thing the reader may want to open in the form the medium renders. | Give the reference a form the reader can follow |  |  | Our own guidance |  |
| E-04 | Take the form from the medium you write into, and not from habit. | Give the reference a form the reader can follow |  |  | Our own guidance |  |
| E-05 | Give the full form on the first mention, and the bare name after that. | Give the reference a form the reader can follow |  |  | Our own guidance |  |
| E-06 | Let the reference carry the location, and do not also describe where the thing sits. | Give the reference a form the reader can follow |  |  | Our own guidance |  |
| E-07 | [table 32549560] | Give the reference a form the reader can follow |  |  | Our own guidance, one form per medium |  |
| E-08 | The form changes with the medium, and with how long the reference has to survive. A writer gets this wrong by picking one form and using it everywhere. A path and a line inside a committed document is wrong within a week, and a stable identifier in a terminal gives the reader nothing to click. | Give the reference a form the reader can follow |  |  | Our own guidance |  |
| E-09 | Find the line at the moment you cite it | Find the line at the moment you cite it |  |  | Our own guidance, written as a section title |  |
| E-10 | Locate the line as you write the reference, and never cite one you recalled. | Find the line at the moment you cite it |  |  | Our own guidance |  |
| E-11 | A recalled line is wrong after any edit above it. The reference then points at unrelated text with full confidence. That is worse than no reference at all, because it looks checked. | Find the line at the moment you cite it |  |  | Our own guidance |  |
| E-12 | A check can find a bare filename that carries no path, because that shape is mechanical. It cannot tell you whether the path resolves, whether the line is still the one you meant, or whether the identifier exists. Those need a reader to follow the reference. `stylewright lint` carries no such check today, so every rule above is yours to apply. | What a check can see |  |  | Our own guidance |  |
| E-13 | `de-slop` treats prose that reads as machine-written, whatever produced it. This skill treats one habit, one reference at a time, and its result is visible without a judgment call. Either the reference resolves or it does not. Follow both. They do not disagree. | How this differs from de-slop |  |  | Our own guidance, and it instructs the reader to follow both |  |
| N-01 | No measurement stands behind this skill. `SOURCE.md` beside this file records that, and it names where a measurement would live. | Purpose |  |  | Points at SOURCE.md, asserts no rule |  |
| N-02 | This skill has no external standard behind it. Every rule in it is our own editorial guidance, and the trace marks the rest as narrative that asserts no rule. The trace lives in the stylewright repository at `grounding/craft/navigable-references.md`. It is not installed with this skill. | Boundary |  |  | Describes the trace, asserts no rule |  |
| N-03 | navigable-references | navigable-references |  |  | Section title, asserts no rule |  |
| N-04 | Purpose | Purpose |  |  | Section title, asserts no rule |  |
| N-05 | What a check can see | What a check can see |  |  | Section title, asserts no rule |  |
| N-06 | How this differs from de-slop | How this differs from de-slop |  |  | Section title, asserts no rule |  |
| N-07 | Boundary | Boundary |  |  | Section title, asserts no rule |  |
