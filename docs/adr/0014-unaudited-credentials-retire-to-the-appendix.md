---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0014 — Unaudited credentials retire to a historical appendix

A status word beside a number is lost the moment the number is quoted
without it — the repository's own bench records learned that on stderr
warnings. An unaudited figure left in the published narrative indefinitely
is a credential waiting to be quoted bare.

**Decision.** When the first retained study lands, every unaudited figure
in `bench/README.md` — in a table row or in running prose, and the current
file publishes its figures in prose — moves into a dated historical
appendix, written so it cannot be quoted as a live result.

**Consequences.** The quantitative record survives: demotion, not
deletion. The grounding matrix's baseline narrative keeps its own status
class in the design (measured without retained evidence), so the most
honest evidence record in the repository stays legitimate. Split from
ADR-0012 when a review caught one ADR carrying two decisions.

Decided 2026-08-05. The mechanism is the measurement design, section 3.
