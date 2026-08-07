---
type: adr
status: accepted
decided: 2026-08-06
issues: [19]
---

# ADR-0020 — A `G` row carries the rule's own words

A `G` row states a rule in our words and names the rule beside it. A
reader who wants to know whether the row is honest has one route, and it
runs through the source: open ASD-STE100 Issue 9, find Rule 5.1 in 400
pages, and compare. Nobody does that, so nobody checks a `G` row.

ADR-0018 closed the half of this gap that a person can close. The
`Audited` cell records that somebody read the row against the source. It
records no evidence, so a reader who was not that person still has
nothing to compare, and the audit is a claim about a reading rather than
a way to repeat one.

The authoring doctrine changed on 2026-07-27 and made the other half
possible. It had forbidden every reproduced sentence, which was broader
than the risk it answered. It now targets wholesale reproduction, and it
names quotation with an identifier beside it as ordinary citation.
Section 3.2 of the design document states the control in its own words:
a matrix may carry the quoted rule, and that is what makes a `G` row
checkable.

**Decision.** Each row carries a `Source text` cell, directly beside
`Source rule`. It holds `unquoted`, or the words of the rule in quotation
marks. A row of any other kind leaves it empty, because only a `G` row
cites a source and only a `G` row has words of one to carry.

`unquoted` is the honest default and the state every row starts in, as
`unaudited` is for the cell two columns over. An empty cell would carry
the same meaning far less clearly, and it would not survive the column
being dropped: a matrix of `E` and `N` rows could then lose the column
from its header, its delimiter and every row with nothing left to
complain. That is the exact hole ADR-0018 records paying for once.

**The quotation is marked, and the mark is load-bearing.** The cell opens
and closes with a quotation mark, and the marks pair. Words inside a pair
are the source's and words outside one are ours, so a row citing two
rules writes `"a" and "b"`.

Unmarked text in a cell headed `Source text` is this repository's worst
defect wearing a new cell. Our own paraphrase, set beside a rule
identifier under that heading, borrows an authority the source never
granted, and no reader can tell it from a quotation. The marks are the
only thing that separates the two, so the check refuses a cell that
carries neither them nor the word `unquoted`.

**The quotation enters the row digest.** The quoted words are the copy of
the rule a person read our sentence against, so an audit that did not
cover them could survive their being rewritten. That is the stale-digest
defect one column over, and the answer is the same one: edit the cell and
the audit goes stale, and the check says so.

**The column is checked and the count is not a gate.** No program here
opens a source, so no program can say that a quotation is accurate, that
it is complete, or that it is the operative sentence. What the check can
say is whether the cell is one of the two things it may be, and it says
that.

The run prints how many `G` rows in each matrix carry the source's own
words, beside the audited count and at the same level. Both are notes and
neither fails anything. A matrix that quotes nothing is honest, and a
gate that failed on one would be red for every matrix from the day it
landed.

**No threshold enforces the substitution limit.** The limit is whether a
reader could use our skill instead of the source, and that is a judgment
about a body of quoted material rather than a property of any row. A
number here would either pass a matrix that has started republishing or
refuse one that has not. So the run reports the coverage and leaves the
judgment with the person who reads it, which is the same division of
labour the audited count already makes.

**Every column heading is checked, not the last one alone.** The earlier
check named `Audited` because that column was the record. A second column
now carries a claim about a source, and a heading is what tells a reader
which cell they are reading. Renaming one is losing a record whichever
column it is, so `matrix-header-column-name` replaces
`matrix-header-not-audited` and covers all seven.

## What this decision does not do

It quotes nothing. The column ships empty in every matrix in the
repository, and each matrix says why in its own words.

The reasons differ, and the difference is the point of recording them.
ASD reserves all rights, and the owner approved publication on 2026-08-04
on the stated condition that no rule text is reproduced, so filling that
column crosses a condition only the owner can lift. The vendor pages
behind `compressed-deliberation` have governing terms nobody has read,
which `SOURCE.md` records as an unperformed check. `navigable-references`
has no `G` row and can have none. The Federal Plain Language Guidelines
are CC0, so that matrix is the one where quoting raises no licence
question at all, and filling it is a content pass of its own.

A quotation is a claim, and claims arrive one at a time with the check
that supports each. Shipping the column without any is what lets the
first quotation be reviewed as a quotation.
