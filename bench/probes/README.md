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

The collector drives the Claude Code harness, so it probes the pathways that
harness reads. A Codex pathway needs its own runner, and the collector refuses
it rather than attributing one harness's answer to another pathway.

Every pathway runs the same flags, because the bench runs one control:

```
-p --model <alias> --setting-sources '' --strict-mcp-config --output-format json
```

## Collect a record

```
node bench/collect-probe.mjs --skill <name> --pathway claude:user --dry-run
ANTHROPIC_API_KEY=... node bench/collect-probe.mjs --skill <name> --pathway claude:user
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

A probe derives a pass when both arms answered and three things then hold. The
installed arm repeated the nonce. The empty-home control answered and did not
repeat it, which catches a probe passing for the wrong reason. And the flags
were the control arm's.

An arm answered when a build is named, the harness reported no error, and the
answer carries text. `armAnswered` in `bench/probe.mjs` is the definition, and
every check reads it from there. Saying only that the control did not repeat the
nonce is true of a control that never ran at all, which is the reading three
review rounds each caught in a different place.

A failure is a result. A record of a probe that failed stays here, and the
status a later reader computes says the probe failed rather than saying nothing.

One residue, stated. The record is the author's own file, like every other
record in this protocol. The check derives the outcome from the bytes, and it
never attests that the run happened as the bytes describe. Section 5 of the
measurement design names that floor, and ADR-0015 records why the design stops
there rather than building a deeper mechanism.

## The harness authenticates from the environment

A redirected home holds no credentials, so the harness refuses to run in one
and answers that it is not logged in. Observed on 2026-08-06 on macOS, with the
Claude Code CLI, on an empty home and again on a home holding only an
onboarding flag.

ADR-0017 settles it. Set `ANTHROPIC_API_KEY` in the shell that runs the
collector, and both homes stay empty. The collector refuses to run without the
key, and nothing here reads, prints, or records its value. The check refuses a
record that carries anything shaped like a key, because a record is committed
and a leaked key would be published.

That is the environment class, and the record names it `api-key-empty-home`. A
home holding a credential would be a different environment, so it would need
its own class name to compare as one.
Give the harness a credential the home does not supply, such as an API key in
the environment, and the probe reaches its question.
