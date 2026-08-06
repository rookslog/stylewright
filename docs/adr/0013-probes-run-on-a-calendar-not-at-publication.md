---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0013 — Probes run on a calendar, and staleness is computed

A probe triggered only by the publication it gates lands its whole cost on
one person at the moment of maximum deadline pressure. A protocol shaped
that way never runs, and its pathways stay unprobed while the design
speaks of them as covered.

**Decision.** The discoverability probe runs once per harness build per
pathway, on a calendar, with a committed record naming the build, the
served model, the pathway, and the date. A probe applies to a study only
when the harness build and the served model are identical between them —
identity, not ordering, because a study on an older or merely different
model is as unprobed as one on a newer. The comparison is computed at read
time, never hand-tracked. Installed delivery stays publication-tier, and
injection stays the drafting tool.

**Consequences.** Probe cost is spread and scheduled instead of spiked and
skipped. A status line can say that its pathway's probe is stale, which is
a sentence the protocol could not previously form.

Decided 2026-08-05. The mechanism is the measurement design, section 4.
