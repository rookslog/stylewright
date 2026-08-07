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

## Amended 2026-08-06 — the matrix declares whether it may quote

The first version of this decision left the prohibition in prose. Review
substituted rule text into the matrix whose owner had forbidden exactly
that, and the whole gate stayed green. The no-threshold reasoning above
covers the substitution JUDGMENT, which is a question about a body of
quotation. It does not cover a prohibition somebody has already recorded,
which is a binary an owner decided and which any contributor who had not
read the prose was one cell away from crossing.

So each matrix declares its state, at column 0, in a line a reader sees:
`**Quotation:** permitted` or `**Quotation:** forbidden`, with the reason
beside it. Under `forbidden` the check refuses every `Source text` cell
but `unquoted`, whatever else is true of that cell — a well-formed
quotation of the real rule is the case it exists to refuse.

The declaration is required, and an absent one reads as `forbidden`. A
default of `permitted` would turn the rule off for whoever forgot the
line, and a gate failing open on a missing argument is a defect this
program has paid for once already. A second declaration is refused and
any `forbidden` among them governs, because a prohibition that could be
lifted by adding a line under it is worth no more than the cell it
replaced. A declaration inside a fenced block is an example and not a
state, so `CONTRIBUTING.md` can show the line without a matrix quoting
that page declaring itself.

Crossing the owner's condition now takes an edit to the declaration and
its stated reason. That is a decision about the source, made where the
reason lives, rather than an edit to one row among a hundred.

**A declaration is read where a reader finds it.** The first version read
the line wherever it sat, and review then got a permitting line accepted
under the table and again inside a collapsed `<details>`. Both are the
container asymmetry this repository already refuses for a matrix row,
pointing the other way: there, a row the reader saw as an example counted
as a record, and here, a line the reader never sees carries one. So the
declaration sits above the header row and outside raw HTML, and one that
does not is refused.

A declaration also names its state once. `permitted for the dictionary
only. Rule text is forbidden.` read as permitted while saying both, so
the reason may carry neither state word. The whole paragraph is read
rather than the first line, because a check that read one line would move
the qualification down a line rather than refuse it.

Each of these is refused AND reads as forbidden. A finding that left the
quotation standing would have given the attacker everything the attack
was for, so an unreadable declaration governs nothing and the file falls
back to the same default an absent one gets.

**A refused cell is not a quotation, wherever the refusal came from.**
The coverage count applied that to a malformed cell and not to a
prohibited one, so a forbidden matrix printed `1 of 39` beside the
finding refusing that very cell. A count contradicting the finding above
it is worse than either alone.

**Every pair holds something.** `""` and `"   "` opened and closed with a
mark and passed, so a row could claim to quote its rule while quoting
nothing. The coverage count also counted any cell that merely differed
from `unquoted`, so a refused cell raised the number that reports how
much of the source the file carries. It counts well-formed quotations
now.

## What this decision still does not check

**The marks carry a claim, not an accuracy.** A well-formed quotation of
a sentence the source never wrote passes, and so does one rule's sentence
placed beside another rule's identifier. Nothing here can tell either
from a true quotation, because no program in this repository opens a
source. The `Audited` cell is where a person records that they checked,
and it is the only thing that speaks to accuracy. Read the marks as
saying which words the row CLAIMS are the source's.

**The checker pairs marks left to right, and a reader does not.** In
`"he said "x" here"` a reader sees one quotation with a nested one. The
checker sees two pairs with `x` between them, outside both. The reading
disagrees with the reader's, which is the failure this file names in
other places, so a nested mark is a shape to avoid rather than one the
grammar handles. Nothing refuses it today.

**The declaration is read a line at a time, and a renderer is not.**
This is the residue as a CLASS rather than as a list, and naming it is
what lets this decision close.

Four rounds of review each found one more place where the checker's
reading and a reader's diverge: a row inside a blockquote, a row indented
four spaces, a declaration under the table, a declaration inside a
collapsed `<details>`, an indented `<details>`, a state word inside
`permitted-not`. Each was real and each was patched. The supply is not
exhausted, because the checker models no container and Markdown has many.

ADR-0016 already settled how this repository answers that. The grammar
states the forms it reads and refuses the rest, and a new shape is a
question about which form the checker read it as, never an occasion for a
rule that names the shape. The declaration inherits that. Its guards are
stated the same way round: it is read where it is found, above the table,
outside HTML, naming its state once, and every divergence outside those
reads as forbidden.

A fifth shape therefore goes to the issue #37 and #70 track, which
carries the Markdown-versus-renderer class and the decision that closes
it. It does not come back here as a sixth guard. Patching one variant
produced the next one five rounds running on the extractor, and the same
arithmetic holds one file over. What this decision owns is the direction:
doubt reads as forbidden, so an unmodelled shape costs a false refusal
rather than a quotation nobody sanctioned.

**A quoted row and an audited row are counted separately, and the pair is
not.** A row can carry the source's words and no audit, which is a row
whose quotation nobody has checked. The two notes report two numbers, and
a reader who wants the overlap counts it by hand.

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
