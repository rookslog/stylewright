---
type: adr
status: accepted
decided: 2026-07-31
---

# ADR-0003 — Every destination goes through the tree checks

Two write surfaces skipped the containment checks, followed a symbolic link
out of the tree, and replaced what they found. A check that most writes pass
through protects nothing, because the defect moves to the write that does
not.

**Decision.** Every destination passes through `src/tree.js` before anything
is written. New files are created with the `wx` flag. Replacements are
written beside the destination and renamed over it. A check and the write it
guards are two steps, so files are identified by open handle, not by path.

**Consequences.** A new write surface inherits the check or repeats the
defect, and a reviewer holds every new surface to this. The rule has caught
two defects since it was written.

Decided in the remediation plan
(`docs/plans/2026-07-31-claim-check-remediation.md`). The operative rules
live in `AGENTS.md`, under "Conventions worth knowing".
