---
type: adr
status: accepted
decided: 2026-08-05
---

# ADR-0008 — Documents carry checked front matter, and decisions become ADRs

Four documents carried four different front matter shapes, and none was
checked. Major decisions lived scattered across issues, specs, and
`AGENTS.md`, with no stable identifier to cite.

**Decision.** Every document under `docs/` opens with YAML front matter, and
`npm run check:docs` refuses what the schema refuses. Specs and plans stay
public. A major decision is recorded as a numbered ADR in `docs/adr/`, in
the same pass as the decision, and `AGENTS.md` keeps the operative rule
while the ADR keeps the why.

**Consequences.** Metadata stops being a style argument, because CI holds
it. A one-ended supersession fails the check, so no document silently claims
to be current. The register only works if every future decision lands with
its ADR, and the reviewer holds a decision-bearing pull request to that.

Decided 2026-08-05, in session with the owner. The schema lives in
`CONTRIBUTING.md`.
