---
type: adr
status: accepted
decided: 2026-08-06
issues: [21, 43, 68]
---

# ADR-0016 — A probe authenticates from the environment, over an empty home

The measurement design asks the isolation probe to run in a redirected home.
A redirected home holds no credentials, so the harness refused to run and
answered that it was not logged in. Both arms recorded that answer, and the
probe never reached the question it asks.

Copying a credential into the home was the obvious repair, and it does not
work here. This platform keeps its token in the keychain and has no credential
file to copy. The only home-side candidate carries servers, project history,
and account state in one file, and that content shapes behaviour, which is
what a pristine control exists to exclude.

**Decision.** A probe run authenticates from `ANTHROPIC_API_KEY` in the
environment, over a home that stays empty. The owner sets the key. The
collector reads its presence and refuses to run without it, and no part of
this repository reads, writes, prints, or records the value. The environment
class in the identity tuple is `api-key-empty-home`, named for how the arm
authenticates, because a home that held a credential would be a different
environment and needs a different name to compare as one. `check:probes`
refuses a record carrying anything shaped like a key, since a record is
committed and a leaked key would be published.

**Consequences.** The probe reaches its question, and every arm runs over a
home with nothing in it, which is the strongest form of the pristine class the
design describes. Probe runs bill the API rather than a subscription, and the
design already prices installed delivery as publication-tier work. A
representative-stack probe stays unbuilt, and the collector refuses to label a
record with a class it did not construct.

Decided 2026-08-06, on issue #68. The mechanism is the measurement design,
section 4.
