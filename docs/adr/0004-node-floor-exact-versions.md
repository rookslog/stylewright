---
type: adr
status: accepted
decided: 2026-07-27
---

# ADR-0004 — The Node floor is tested at exact versions, and enforced

A CI matrix naming `20` and `22` resolves to the newest release of each
major, so it never tests the floor it advertises. A dependency needing more
than the floor would print a warning and pass.

**Decision.** `engines` names the floor. The CI matrix tests the exact
versions advertised, `20.11.0` and `22.0.0`. `.npmrc` sets `engine-strict`,
so an engine mismatch fails `npm ci` instead of warning.

**Consequences.** Raising the floor is deliberate: `package.json` and both
workflow matrices change together. Changing matrix versions renames the CI
jobs, and the branch ruleset requires those names, so the ruleset changes in
the same pass or every pull request blocks.

Decided in `d6c80d5` (2026-07-27). The operative rules live in `AGENTS.md`,
under "The Node floor is enforced, and how".
