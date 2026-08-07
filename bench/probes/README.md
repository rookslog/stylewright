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
CLAUDE_CODE_OAUTH_TOKEN=... node bench/collect-probe.mjs --skill <name> --pathway claude:user
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

`armAnswered` in `bench/probe.mjs` defines what answering means, and every
check reads it from there. Saying only that the control did not repeat the nonce
is true of a control that never ran at all, which is the reading three review
rounds each caught in a different place.

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

ADR-0017 settles it, and there are two routes. Run `claude setup-token` once and
set `CLAUDE_CODE_OAUTH_TOKEN`, which bills a subscription. Or set
`ANTHROPIC_API_KEY`, which bills the API. Either one reaches the arm as
environment over an empty home, so neither changes the isolation.

Set both and the subscription wins. The collector hands the arm exactly one
credential, so the route a record names is the route that served it.

An arm inherits a named list of variables, that one credential, and its
redirected home. Nothing else reaches it. The list is an allowlist because the
first version subtracted the few names it knew, and a review measured an auth
token, a base URL, and a Bedrock credential all reaching the harness while the
record named the API key. If your shell sets a variable that configures another
route, the collector refuses by name rather than guessing, and it never reads
what any of them hold.

Two things about that list are unverified. Nobody has run the probe on a real
Windows host, and nobody has checked that the list carries everything the
harness needs to start. A variable it omits and the harness wants shows up as a
probe that failed, in a committed record, which is the outcome this protocol
prefers to a silent difference.

Nothing here reads, prints, or records what either variable holds. The check
refuses a record carrying anything shaped like a credential, by either route,
and it never quotes back what it matched. A record is committed, and a leaked
credential would be published.

A record names its route, and the route is not part of the identity tuple. Two
routes can bill and rate-limit differently, so silence would leave a reader
unable to ask whether that mattered. The tuple stays as section 4.1 defines it,
because splitting probe coverage by route on an unmeasured suspicion would cost
more than it buys. ADR-0017 carries the reasoning and the condition that would
change it.

That is the environment class, and the record names it `empty-home`. It is
named for the home and not for the route, because both routes build the same
environment — a class named for one of them would carry the route into the
identity tuple, and every run of the other route would be labelled wrongly. A
home that HELD a credential would be a different environment, so it would need
its own class name to compare as one.
Give the harness a credential the home does not supply, by either route above,
and the probe reaches its question.
