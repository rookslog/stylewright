---
type: adr
status: accepted
decided: 2026-08-05
issues: [21, 43]
---

# ADR-0009 — A figure cites its study, and a check reads both directions

An earlier bench draft asked readers to check hashes themselves before
believing a comparison, and the person it relied on was the person it was
checking. That convention failed once in this repository already, and the
scorer exists because it did.

**Decision.** A published figure carries a `bench-study:<study>#<result>`
marker. A check verifies the marker resolves, the study validates under its
digests, and its scorer status is not unaudited. The inverse direction is
checked by proximity: in `bench/README.md`, any numeral in prose — single
digits included, because a median of 5 is a figure — must sit beside a
marker or the word unaudited, with inline code masked and an allowlist for
version, section, and step references. A figure written out in words
escapes the regex, and that named residue stays convention.

**Consequences.** An uncited number fails CI instead of review. The check
is a regex, not a prose parser, so it cannot be right about everything —
it is right about the cheap common case, and the design says exactly what
escapes it.

Decided 2026-08-05 after an adversarial review of design draft 3, which
supplied the proximity mechanism the earlier drafts lacked. The mechanism
is the measurement design, section 3.
