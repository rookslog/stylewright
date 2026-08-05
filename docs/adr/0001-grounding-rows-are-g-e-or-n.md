---
type: adr
status: accepted
decided: 2026-07-26
---

# ADR-0001 — Every unit in a graded skill is a G, E, or N row

A skill that cites a published standard borrows authority. Nothing may borrow
authority it was not granted, and nothing may hide from the question.

**Decision.** Every unit of content in a graded section is disposed of in a
grounding matrix. A `G` row cites a numbered rule in the source. An `E` row is
our own guidance, and says so. An `N` row is narrative that asserts no rule.
CI checks the trace.

**Consequences.** Labelling our advice `G` is the worst defect this
repository can ship. The checker must account for every unit, not only the
ones shaped like bullets. Tables and fenced blocks carry content digests, so
a block cannot be rewritten while its row stays clean.

Decided in the design spec (`docs/specs/2026-07-26-stylewright-design.md`,
section 2). Amended 2026-07-31 to remove every exemption and account for
every unit (`75f80d3` and the commits around it). The operative rules live in
`AGENTS.md`, under "A grounding matrix that lies".
