---
type: adr
status: accepted
decided: 2026-08-06
issues: [40]
---

# ADR-0018 — A `G` row records its own audit

A `G` row claims the authority of a standard. `ground --check` confirms
that the row cites something, that our quotation still appears in
`SKILL.md`, and that it sits under the anchor the row names. It opens no
source. It therefore cannot say that the cited rule exists, that the rule
says what the row says, or that a paraphrase kept an exception the rule
carries.

Nobody has read the matrices rule by rule. A cross-vendor reviewer
sampled the mappings and found no false `G` row, which is evidence about
a sample. The repository nevertheless printed `Grounding clean.` over
every matrix, and a reader had nothing in the output or the file to tell
a checked citation from an unchecked one.

Three designs close that gap. A separate audit log beside each matrix
records what a person read and when. A row-level cell records the same
thing inside the row it describes. A stronger checker reads the source
and compares, which no license here permits for ASD-STE100 and which no
program can do for a paraphrase.

**Decision.** Each `G` row carries a sixth cell. It holds `unaudited`,
or a date and a digest. The date is the day a person read that row
against the source. The digest is the first eight hex characters of a
SHA-256 over the row's guidance, anchor, rule and location, joined by
newlines. A row of any other kind leaves the cell empty, because only a
`G` row cites a source.

The digest is the load-bearing part. A bare date beside a row id would
survive a rewrite of every other cell in that row, so an audit of words
nobody audited would keep reading as current. That is the defect an
ordinal designator had before ADR-0001's matrices named block contents
instead of block positions, and it is the same defect one column over.
Editing the guidance, the anchor, the rule or the location changes the
digest, and the check then reports `audit-stale` and names the digest to
write.

The cell names no auditor. The commit that wrote it does, and one record
of who is enough for a repository whose documents carry no byline.

**The date is a UTC day, and it cannot be in the future.** A calendar
date that has not arrived certifies a reading nobody could have done, and
`9999-12-31` satisfied every other rule while the coverage count called
the row read. So the check takes the current day from the command line,
where every other moment this program needs already comes from, and
refuses a later one. `checkSkill` throws when the caller omits the day
rather than defaulting, because a default turns the rule off for whoever
forgets the argument, and a gate that fails open on a missing argument is
a defect this repository has already paid for once.

The injected day obeys the calendar too. The first version read the
leading ten characters and asked no more, so `9999-99-99` arrived as the
upper bound, every real date sorted below it, and an audit dated
`9999-12-31` came back counted as read. A bound that is not a day cannot
bound anything, and applying the calendar to one of the two dates and not
the other was the same gap one argument over.

One reading of the cell serves both the findings and the count. Two
readings disagreed: a stamp that merely matched the pattern counted as
audited while the check called it stale or impossible.

**The count prints and fails nothing.** `ground --check` reports how many
`G` rows in each matrix carry a date, at a level the exit code ignores.
Making it an error would have turned the gate red for every matrix on the
day the column landed, and left a contributor one edit away from deleting
the line to get a green run. Making it silent would leave `Grounding
clean.` saying more than the check knows, which is the whole finding.

**Consequences.** The matrix now separates two claims that shared one
verdict. The check enforces the record's shape and its freshness. It does
not enforce that anybody audits anything, and it cannot, because the
audit is a person opening a book.

Every `G` row ships at `unaudited`, which is the true state on the day
this lands. A row of another kind ships with the cell empty, and writing
`unaudited` there is the defect the check reports as `e-row-has-audit`.
The row-by-row audit is human work, and this decision buys the place to
record it rather than the work itself. A reader who wants that number
reads it from the printed count, not from this file, because a number
written into prose goes stale on the next audit.

This rests on one belief. A per-row cell is cheap enough that an auditor
fills it in as they read. If auditing instead happens in long sittings
over whole matrices, a dated header per matrix would carry the same
information for far less editing, and the per-row digest would be
overhead. The evidence that flips this is a first audit pass that spends
more effort on cells than on sources.

Issue 19 proposes a quoted rule beside each identifier, which would make
an audit cheaper by putting the two texts side by side. It stays open.
This decision does not depend on it, and neither blocks the other.
