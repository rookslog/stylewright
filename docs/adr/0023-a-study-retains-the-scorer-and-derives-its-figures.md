---
type: adr
status: accepted
decided: 2026-08-06
issues: [21, 43]
---

# ADR-0023 — A study retains the scorer's output, and every figure derives from it

ADR-0006 named the store. Retained samples are committed to this repository.
Building the promotion path raised the question that decision left open: what
does a study record about its own analysis, and who states the number?

Section 3 of the measurement design asks a study manifest to name the scorer
revision, the command run, and its output. It also asks for an identifier per
published result, which is what `bench-study:<study>#<result>` resolves to. It
does not say who computes the number behind that identifier.

Two readings were available. The manifest could carry the figures, written
beside the command that produced them. Or the manifest could carry the command
and its output alone, with the figures computed from those bytes at read time.

**Decision.** The study manifest retains the scorer's command, its exit code,
and its output verbatim. It carries no figure of its own, and
`bench/study.mjs` refuses a manifest with a key that states one. A result
identifier is `<scenario>.<arm>.<statistic>.<metric>`, which names one cell of
the table the scorer already prints, and `deriveResults` reads it out of the
retained output.

This is the rule ADR-0013 already applies to a probe record. A record that
grades itself is the author's summary, and a reader is owed the evidence
instead. A figure typed beside its command is the same defect in a second
place, and it fails in the direction that matters: the number in the manifest
and the number in the output can disagree, and only one of them is evidence.

The audit status rides on every derived figure rather than sitting once at the
top. The scorer stamps its own status on every row for that reason, so a row
quoted out of the table cannot lose it.

**Consequences.** The scorer runs during promotion, after the copy and over the
promoted bytes, so every derived figure comes from exactly the files the tree
holds. It runs once per scenario, because a median across a correction and a
report is not a number.

An empty result set is not an audited set. A study whose scorer refused to
score it is retained as a failed attempt, and it derives no figure at all.

Three narrowings, stated rather than left to be discovered.

Promotion **refuses** an arm collected under `--rules user`. Section 3 permits
refusal or redaction, and redaction needs a chained manifest, a deterministic
rule, and a trusted step that no check can re-run. None of that is built, so
the refusal is total until it is.

A promoted study **cannot** carry section 4.2's full provenance. The platform,
the environment class, the stack digest, the delivery mode and the installed
pathway all come from a runner that does not exist, because installed delivery
is the half of issue #43 that stays open. The manifest names each of them as a
gap. Naming the absence is what stops a reader taking an injected figure for an
installed one.

The **citation** half of ADR-0009 is not here. Nothing yet checks that a marker
in `bench/README.md` resolves to a study, and nothing yet enforces the numeral
rule. `npm run check:studies` validates the studies a marker would point at,
which is the half that has to exist first. No study exists yet, so no marker
can resolve, and a reviewer holds the rest.

An arm manifest in `bench/out/` is replaced when a resumed run recomputes it,
because `run.sh` resumes an interrupted arm and the record should describe
where the arm ended. Nothing is edited in that replacement. A manifest inside a
promoted study is never touched, because promotion refuses a study directory
that already exists.
