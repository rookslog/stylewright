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
included, so no attempt is invisible. An entry pre-registers the rubric,
the scenario frame and selection, the primary metric and scenario, the
repetition count, the predicted direction, and the stopping rule. An entry
counts as pre-registered only when it was pushed to the public repository
before the arm-start timestamp of every arm it governs — the start, not
the sample completion times, because a sidecar timestamp is written when
an invocation returns. Push time is the server's fact and a clone does not
carry it, so a CI check verifies the ordering on the push that carries the
registration, and its verdict is recorded in the study manifest. The later
static check verifies the recorded attestation.

**Consequences.** Pre-registration becomes checkable instead of asserted.
Failed, aborted, and abandoned attempts stay on the ledger, so a retried
run cannot quietly replace one and a clean control cannot be picked from
invisible attempts. Measurement work must push before it runs, which is
the point. The attestation chain is as durable as the forge that issued
it, and the design says so rather than claiming more.

Decided 2026-08-05. The mechanism is the measurement design, section 5.
