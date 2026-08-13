---
type: adr
status: accepted
issues: [93]
decided: 2026-08-12
---

# ADR-0027 — The craft tier is enforced by a recorded reading, and the count is a note

This repository sells writing skills, and its own prose is the first thing a
reader meets. `npm run lint:docs` reads that prose clean whatever shape it is
in. The 0.3.0 CHANGELOG section and parts of README read as slop to the owner
and passed every check we ship. So nothing stood between an author and a merge.

That is not a lint defect. `de-slop` says in its own `What a check can see`
section that a triad, a restatement and an invented objection are judgments
about content rather than shapes a program recognises. ADR-0021 decided the
same thing one level up. The skill carries mechanisms, the word-level layer
lives in `bench/score.mjs`, and the discipline lives in a writer or a reviewer.

## Decision

A reading is recorded, and the record is checked.

`editorial/AUDITS.md` holds one row per document that a person has read with
`de-slop` and `compressed-deliberation` open. The row carries the document, the
UTC day of the reading, and the first eight hex characters of the bytes that
were read. `npm run check:editorial` refuses a malformed row, a document the
list does not govern, a document stamped twice, and a day the calendar does not
carry or that lies ahead of the run.

`AGENTS.md` carries the other half, as one line: a pull request that changes a
governed document gets that reading.

**The check reads the record and never the prose.** It fails on a broken
record. It never fails on a document, however that document reads.

**What it counts prints as a note.** `editorial-coverage` says how many
governed documents carry a reading. `editorial-staleness` says how many have
changed since. Both fail nothing, and both inherit the disposition the
grounding notes carry: nobody promotes either to an error, and nobody removes
either to quiet the output. A green run over prose nobody has read is the gap
this issue reports, and the count is the answer to it.

## The stamp records a person, and that is the load-bearing rule

An agent never writes a row here. The rule sits in the record itself as well as
in this decision, so the file tells its reader before the reader writes.

This is the rule ADR-0018 already applies to a `G` row's audit cell, one file
over. No check there opens a source, so a date written for a reading nobody did
is that decision's worst defect. The same hole is here, and it is wider. A `G`
row is audited by a person by convention. A document in this repository is
usually edited by an agent, so the agent that wrote the prose is the party best
placed to stamp it, and a stamp it issues launders exactly the discipline the
stamp exists to record.

Nothing mechanical closes that hole. The commit names who wrote the row, which
is what ADR-0018 relies on, and it is what this decision relies on too.

## What is governed, and why the list lives in code

`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md` and
`bench/README.md`. These are the prose a reader meets and that we rewrite.

`docs/` is out. A past ADR keeps its wording, so a stamp there would go stale
by design and the count would measure the calendar. `skills/` is out. A
grounding matrix already disposes of every unit in one, and that record carries
its own audit column.

The list is a constant in `scripts/check-editorial.mjs`. A list the record
carried would be a denominator the record could shrink, and dropping a row
would then drop the document it names out of the count. `bench/study.mjs` names
its scorer as a literal for the same reason.

## The record ships empty

No row exists on the day this lands. The one-time pass over the 0.3.0 section
and README happened on the release branch, and this lane did not perform it, so
this lane may not stamp it. The coverage note therefore reads zero out of six
on every run until a person reads a document and says so.

An honest zero is the state this record starts in, the way every `Audited` cell
starts at `unaudited`.

## The alternatives

**A checklist line alone.** It is what `AGENTS.md` now carries, and on its own
nothing says whether the reading happened. This repository already learned that
in a narrower case. A prohibition on quotation was written as prose, and rule
text landed in a matrix whose owner forbade it while the gate stayed green.

**An advisory scorer report over changed documents.** ADR-0021 records that the
structural metrics are specific and insensitive, and that `scaffold` reads zero
in five of six arms. A report built from them would print noise beside prose
whose defects those metrics cannot see. Every number it printed would also be a
figure under ADR-0009, needing a study marker or the word unaudited.

**A gate.** The strongest form is section-granular, where the stamp covers a
heading and its content, a moved section fails the check, and a merge waits for
a fresh reading. It is the only option that would actually block. ADR-0021
decided that this repository's own prose acquires no new build-stopper, and a
gate diverges from that rather than extending it. Measured on the twenty-one
commits before this decision, README changed in eight, CHANGELOG in ten and
AGENTS.md in twelve, so the gate would ask for a fresh reading on roughly half
of all merges. Where an agent issues the stamp, that pressure buys a stamp
rather than a reading.

## What would reopen this

The count is the evidence. If coverage stays at zero for a release, or if
stamps appear at the same rate as the commits that move the documents they
name, then the recorded reading is not happening and the note is not making it
happen. The gate above is the answer at that point, and section granularity is
what keeps it from asking for a reading of a document that did not change.

Widening the governed list is a one-line change. It costs a wider denominator,
so a document joins the list when somebody intends to read it.

Decided on issue 93 (2026-08-12).
