---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0011 — A fresh scenario derives from material the author did not compose

A scenario written after the skill bounds tuning to the committed set. It
does nothing about the other direction: one person writes both, and a
scenario composed freely by the skill's author can be composed to a
position the skill handles well. A public repository cannot hold a test
set back, so secrecy is not available in either direction.

**Decision.** The fresh scenario each study pre-registers derives from
material the author did not compose: a field report, a real task from this
repository's history, or a prompt from an external corpus. Provenance
alone still permits searching a corpus until a favourable scenario turns
up, so the sampling frame and a deterministic selection rule are
registered before the skill is written, and the selection follows the
rule. The ledger records frame, rule, selection, and provenance.

**Consequences.** Both leak directions are bounded — scenario-to-skill by
ordering, skill-to-scenario by provenance plus fixed selection — and
neither bound is secrecy. Late disclosure remains the ceiling of what a
public repository can do, and the design says so instead of claiming
more.

Decided 2026-08-05. The mechanism is the measurement design, section 5.
