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

**Decision.** The discoverability probe binds to the identity tuple the
measurement design defines once, in section 4.1 — harness build, served
model, platform, pathway, environment class, and the committed stack
digest where the class is a representative stack — and runs on a calendar,
once per tuple it is scheduled to cover, with a committed record naming
every element, the outcome, and the date. A probe covers a study only
when every element of the tuple is identical between them and the probe
passed — identity, not ordering, because a study on an older or merely
different model is as unprobed as one on a newer, and nothing
generalises across any element. A recorded failure is a result, never
coverage. The comparison is computed at read time, never hand-tracked. Installed delivery stays publication-tier, and
injection stays the drafting tool.

**Consequences.** Probe cost is spread and scheduled instead of spiked and
skipped. A status line can say that its pathway's probe is stale, which is
a sentence the protocol could not previously form.

Decided 2026-08-05. Amended 2026-08-06: the applicability predicate first
compared build and model alone, which let one pathway's probe cover
another's study, contradicting the scope rule beside it. Platform and
pathway joined the identity, and a second round added the environment
class to the record and the predicate, because a pristine-home probe says
nothing about discovery under a representative stack. A third round
replaced the enumerated lists with the single identity tuple the design
defines once, scheduled cadence per tuple, and made a passing outcome a
condition of coverage, after three rounds each caught one enumeration
site missing one element. A fourth round refined the class to the
committed stack digest for representative stacks, and made the outcome
derivable from retained bytes rather than declared. The mechanism is the
measurement design, section 4.
