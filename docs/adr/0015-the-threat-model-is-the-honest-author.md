---
type: adr
status: accepted
decided: 2026-08-06
issues: [21, 43]
---

# ADR-0015 — The threat model is the honest author

Four review rounds on the measurement design each found a real attestation
gap, and each fix spawned the next: the manifest attested itself, then the
ledger line did, then the forge lookup accepted any green run, then the
ordering workflow could be replaced by the push it judges. Every finding
was correct, and the chain was never going to terminate, because every
control in a single-owner repository is held by the person the controls
would need to constrain. The design claimed checkability link by link and
never said against whom.

**Decision.** The measurement design defends against the honest author's
failure modes — drift, memory, post-hoc convenience, the reading that
flatters the result. Its mechanisms make dishonesty premeditated, visible,
or expensive. None makes it impossible, and the design says so: the author
controls the workflows, the rulesets, and the account they run under, and
a chain of custody cannot rise above the person who holds every key. What
the design promises instead is auditability — evidence, rubric, labels,
and ledger committed whole, so a stranger re-judges every claim without
trusting the author's summary. A review finding that only a dishonest
owner could exploit is disposed of as a named residue once the mechanism's
honest-author value is exhausted, not answered with a deeper mechanism.

**Consequences.** The review loop terminates against stated claims instead
of chasing an implicit adversarial model no single repository can satisfy.
Readers know what the bench promises and what it cannot. The flip is
recorded here: a bench meant to serve as a credential for third parties
who distrust the author needs attestation outside the repository — signed
transparency logs, independent runners — and that is a different project,
out of scope for this design.

Decided 2026-08-06. The statement is the measurement design, section 1.
