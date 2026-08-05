---
type: adr
status: accepted
decided: 2026-07-26
---

# ADR-0002 — Install copies, and never creates a symbolic link

A symbolic link breaks when the clone moves. Across the Cowork host and
sandbox boundary it is unsafe, because the two sides resolve it differently.

**Decision.** Every install pathway places a copy of each file. No pathway
creates a symbolic link, and the engine refuses to follow one it finds.

**Consequences.** An installed tree drifts from the repository as either
side changes, so `update` exists, and the manifest records what was placed
in order to detect the drift. Freshness is bought with an explicit command
instead of a link that breaks silently.

Decided in the design spec (`docs/specs/2026-07-26-stylewright-design.md`,
section on the install mechanism).
