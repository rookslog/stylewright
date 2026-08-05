---
type: adr
status: accepted
decided: 2026-08-04
issues: [43]
---

# ADR-0006 — Retained samples are committed to this repository

Every published bench figure was unaudited, because no sample behind one
survived `.gitignore`. Evidence that cannot be re-read is not evidence.

**Decision.** Samples behind a published figure are promoted into
`bench/samples/` and committed. Promotion is explicit, immutable, and
recorded, per the measurement design.

**Consequences.** The repository grows with its evidence, and that is the
point: a skeptical reader re-reads the samples instead of trusting the
number. Raw model output enters the tree, so promotion is a deliberate act
with a review, never a glob.

Decided on issue #43 (2026-08-04). The mechanism is the measurement design
(`docs/specs/2026-08-04-measurement-design.md`, section 3).
