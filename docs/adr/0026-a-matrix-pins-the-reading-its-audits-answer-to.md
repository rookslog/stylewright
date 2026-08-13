---
type: adr
status: accepted
decided: 2026-08-12
issues: [73]
---

# ADR-0026 — A matrix pins the reading its audits answer to

ADR-0018 gave each `G` row an `Audited` cell. The cell holds the day a
person read that row against the source, and a digest of the row they
read, so editing the row voids the audit.

The digest binds the row. It binds nothing about the source. A `G` row
cites a rule by number, and a rule number survives a new edition of the
standard, so moving `SOURCE.md` from ASD-STE100 Issue 9 to a later issue
changes no cell in any row. Every audit in the file stays current and
counted, over an edition nobody has opened. A review of PR #71 found
this, and issue 73 records it.

Nothing live is false yet. Every `G` row in this repository ships
`unaudited`, so there is no audit for a source bump to invalidate. That
is why the fix lands now: no existing digest migrates, and arming the
trap after a first audit pass would cost that pass.

## What was considered

| Option | What it buys | What it costs |
|---|---|---|
| A declaration in the matrix | The pin sits beside the rows it binds, and one file answers the question | The version is stated in two files |
| A field in `SOURCE.md` | One statement of the version, in the record that already holds the licence | The checker opens a second file, and a matrix outside `skills/` has to find it |
| A dated audit header per matrix | The version sits beside the date already, and there is no per-row editing | It replaces ADR-0018's per-row record, which no evidence yet says to replace |
| Defer | Nothing to unwind | The trap arms itself on the first audit pass |

**Decision.** The matrix declares the reading, at column 0, as `**Source
version:**` and a pin. The pin joins the row digest as a sixth input, so
moving it voids every audit in the file at once.

The declaration inherits ADR-0020's placement doctrine whole. It sits
above the header row, outside raw HTML, and it is stated once. A second
declaration is refused rather than overruling the first. Doubt reads as
the strict case, as it does for quotation: a declaration the check cannot
read leaves the matrix naming no reading, the digest binds the empty pin,
and every recorded audit reads stale.

A matrix with a `G` row carries the line, and a matrix without one is
refused for carrying it. Only a `G` row claims a source, and a pin no row
answers to is a line nobody maintains.

The pin is the whole paragraph, collapsed, and it ends at the blank line
under it. Reading the first line alone bound `Issue 9, January` while the
file said `Issue 9, January 2025`, because house style wraps at eighty
columns. That is the checker and the reader disagreeing about the record,
which is the defect every other rule in `src/ground.js` exists to stop.

A pin names one reading. A versioned source names its version. A living
source names a commit, or the day somebody read it. A model target names
the build and the evidence cutoff, which is what `compressed-deliberation`
and `proportionate-execution` already record in prose. `latest` and
`HEAD` are refused, because a reader has to date those for themselves,
and the refusal is a loose word match that fails closed.

## What this amends

ADR-0018 defined the digest over the row alone. It now covers the row and
the matrix's pin. ADR-0020 had already added the `Source text` cell to
it, so the digest reads five cells and the pin, and ADR-0018's own text
names four. Read this decision and ADR-0020 for the current definition.

`unread` is the state of a matrix whose source nobody has opened, and it is
the spelling `unaudited` and `unquoted` already give their own cells. It names
no reading, so it binds no digest and it refuses a recorded audit by name.
Every case where the check cannot read a pin takes that road, and the remedies
print no digest there. Without it the scaffold wrote a placeholder, which
passes every word test there is, and an audit recorded under one bound to the
placeholder while the run stayed green.

## What it costs

The version is stated twice, in `SOURCE.md` as prose for a reader and in
the matrix as the pin that binds. That duplication is accepted. The
alternative is a checker that opens a second file to grade the first, and
`ground --check` reads one file per matrix today.

The check reads what the pin says. It cannot read whether the pin is
true, and a pin naming an edition nobody opened passes, exactly as a
well-formed quotation of a sentence the source never wrote passes. The
`Audited` cell is the only thing that speaks to that.

**What would flip this.** An owner who wants one statement of the version
rather than two. The `SOURCE.md` field then becomes the right option, and
the living-source question has to be answered first: a repository that
publishes no edition number needs a commit or a date of reading, and
`SOURCE.md` records neither as a field today.
