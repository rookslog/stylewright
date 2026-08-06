---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0012 — Supersession is per claim, and unaudited credentials retire

These were one decision in draft 3, and they are two. Refusing blanket
supersession is right: a new study on a new prompt or build measures a
different thing, so replacement is a comparability judgment a person makes
per claim. Leaving unaudited figures in published tables indefinitely is a
separate choice, and the repository's own record argues against it: a
status word beside a number is lost the moment the number is quoted
without it.

**Decision.** Supersession stays per claim, by a person, with an explicit
link. Separately, when the first retained study lands, every unaudited
figure moves out of the figures tables in `bench/README.md` into a dated
historical appendix written as prose, so it cannot be quoted as a row.

**Consequences.** The quantitative record survives — demotion, not
deletion. The grounding matrix's baseline narrative keeps its own status
class in the design (measured without retained evidence), so the most
honest evidence record in the repository stays legitimate.

Decided 2026-08-05. The mechanism is the measurement design, sections 3
and 7.
