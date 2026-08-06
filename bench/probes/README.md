# probes — can a harness see an installed skill at all?

This directory holds probe records. A probe answers one question: can this
harness, on this build, through this pathway, surface an installed skill? It is
a probe, and it is not proof of loading. The measurement design defines it in
section 4.1, and `docs/adr/0013-probes-run-on-a-calendar-not-at-publication.md`
records why it runs on a calendar.

## The isolation probe

The bench runs its control arm inside a working directory, with the operator's
configuration suppressed by invocation flags. Section 4.2 of the measurement
design asks whether an installed skill is discoverable under those same flags.
The answer is load-bearing. If an installed arm must open a configuration
surface the control closes, the two arms differ by a flag as well as by
delivery mode, and the one-variable rule fails.

The acceptance test is that one sentence. An installed skill is discoverable
under the exact flag set the control arm runs, in a redirected home the harness
respects. `bench/probe.mjs` holds that flag set and refuses a record collected
under any other.

Every pathway runs the same flags, because the bench runs one control:

```
-p --model <alias> --setting-sources '' --strict-mcp-config --output-format json
```

## Collect a record

```
node bench/collect-probe.mjs --skill <name> --pathway claude:user --dry-run
node bench/collect-probe.mjs --skill <name> --pathway claude:user
```

The collector installs the skill into a throwaway redirected home through one
real pathway, plants a nonce in the installed copy, and asks that home and an
identical empty one to repeat it. It writes both answers verbatim, the planted
nonce, the identity tuple, and the date.

The nonce goes into a throwaway install, never into a tree a study measures.
That is the second of the two options section 4.1 allows, and it is the one
that keeps the probed tree and the measured tree from differing silently.

## The record states no outcome

A record carries bytes. `npm run check:probes` derives the outcome from them
and prints what it derived. The check refuses a record that states an outcome
of its own, because a record that grades itself is the author's summary, and a
reader is owed the evidence instead.

A probe derives a pass on three conditions together. The installed arm repeated
the nonce. The empty-home control did not, which catches a probe passing for the
wrong reason. And the flags were the control arm's.

A failure is a result. A record of a probe that failed stays here, and the
status a later reader computes says the probe failed rather than saying nothing.

## The harness must authenticate from outside the home

A redirected home holds no credentials, so a harness that reads its credentials
from the home refuses to run and answers that it is not logged in. Observed on
2026-08-06 on macOS, with the Claude Code CLI. Both arms recorded that answer,
and the record derives a failure, which is the honest reading: the probe never
reached the question it asks.

A home holding only an onboarding flag answers the same way, so onboarding
state is not what is missing. This machine keeps its token in the keychain and
has no credential file to copy.

Issue #68 carries the decision and both routes. Until it closes, the collector
copies nothing into either home, and the classes stay the two the measurement
design names. A home that may hold a credential is a class of its own, and it
gets its own name when someone decides what it holds.
Give the harness a credential the home does not supply, such as an API key in
the environment, and the probe reaches its question.
