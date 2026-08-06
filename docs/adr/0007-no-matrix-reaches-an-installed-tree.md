---
type: adr
status: accepted
decided: 2026-08-04
---

# ADR-0007 — A grounding matrix never reaches an installed tree

A matrix is an audit record for a person, not context for an agent. Four of
the six install pathways copy directories whole, so location is the only
thing keeping a matrix out of an installed tree.

**Decision.** Matrices live in `grounding/`, outside `skills/`. They ship at
the root of the npm package, where the published `ground` command reads
them, and no install pathway delivers them. The plugin marketplace points
its `source` at `./skills` for the same reason.

**Consequences.** `test/package.test.js` asserts the npm boundary. The
marketplace manifest is part of this boundary, so a change to `source` is a
change to this decision. The first marketplace draft pointed `source` at the
repository root and shipped every matrix, which is the defect this ADR
exists to prevent.

Decided across the design spec (2026-07-26) and PR #48 (2026-08-04), where
the marketplace pathway was tested empirically.
