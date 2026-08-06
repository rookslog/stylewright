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
event per line. An entry pre-registers the rubric, the fresh scenario, the
primary metric and scenario, the repetition count, the predicted
direction, and the stopping rule. An entry counts as pre-registered only
when it was pushed to the public repository before the earliest sample
timestamp it governs. The server's push time is the clock, and the check
compares it against the sidecars.

**Consequences.** Pre-registration becomes checkable instead of asserted.
Failed and abandoned attempts stay on the ledger, so a retried run cannot
quietly replace one. The cost is that measurement work must push before it
runs, which is the point.

Decided 2026-08-05. The mechanism is the measurement design, section 5.
