---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0010 — The attempt ledger is public, and push time is its clock

Pre-registration by commit ordering is self-attested: commit dates are
author-controlled, so a rubric can be back-dated after the evidence it
judges exists. A pre-registration whose clock the author holds registers
nothing.

**Decision.** The ledger is `bench/samples/LEDGER.jsonl`, append-only, one
event per line, and every arm attempt is an entry — exploratory arms
included, so no registered attempt is invisible, and the ledger binds
only what enters it. An entry pre-registers the rubric,
the scenario frame and selection, the primary metric and scenario, the
repetition count, the predicted direction, and the stopping rule. An entry
counts as pre-registered only when its push precedes the first push that
carries any evidence file of an arm it governs — both ends of the
comparison are the server's facts. Push time is the server's fact and a
clone does not carry it, so a CI check verifies the ordering on the push
that carries an arm's evidence, and its verdict is appended to the ledger
as an attestation entry naming the study, because the manifest that push
carries cannot hold a verdict produced after it and a promoted study is
never edited. The attestation entry is an author-written line, so the
later static check verifies it against the forge's record of the run it
names, never against the entry alone.

**Consequences.** Pre-registration becomes checkable instead of asserted.
Failed, aborted, and abandoned attempts stay on the ledger, so a retried
run cannot quietly replace one and every registered attempt shows.
Selective reporting stays possible by leaving arms unregistered, and the
design names that as a deliberate breach no check detects rather than
hiding it. Measurement work must push before it runs, which is
the point. Two residues, and the design states both: the attestation
chain is as durable as the forge that issued it, the forge attests
publication order, never execution order, and the ledger binds only what
enters it — an unregistered attempt leaves no trace any check can find.

Decided 2026-08-05. Amended 2026-08-06: the boundary was first drawn at a
runner-written arm-start timestamp, and a retroactive review showed that
an author-controlled timestamp can be post-dated past any push, so the
boundary moved to the evidence's own first push. The same day, the
verdict moved from the study manifest into a ledger attestation entry,
because a push cannot carry the verdict it produces, and the visibility
claim narrowed to registered attempts. The mechanism is the measurement
design, section 5.
