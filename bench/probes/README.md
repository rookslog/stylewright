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
under the acceptance flag set, plus at most the trace flag, in a redirected home
the harness respects. `bench/probe.mjs` holds that flag set, and a record collected under
any other derives a failure rather than passing. It is kept, because a recorded
failure is a result.

That flag set changed on 2026-08-07, on measurement, and ADR-0024 records it.
The probe ran `--setting-sources ''` because the bench control does. A
diagnostic then measured what the empty spelling does to skills: the harness
logged `Loaded 0 unique skills` over an installed tree it was watching, and
`Loaded 1` over the same tree under `user`. The empty spelling suppresses the
user skill directory along with the settings, so the old test asked its question
in a configuration where skills are switched off.

Isolation survives, because a probe home is a throwaway empty one. There is no
operator configuration in it to suppress, so `user` admits nothing but the tree
the probe installed. Measured on the same pair: the empty-home control under
`user` loaded zero skills, so the two arms differ by the installed skill and
nothing else.

One thing a redirected home does not control. The harness also consults a
machine-global managed skills path, which `HOME` does not move, so the
environment class names the home and never the machine. The check reads that
count off each trace and prints it as `managed_seen`. The `d80e11b7` trace shows
`managed: 0` on both arms, which is a reading of that one run rather than a
property of the design.

`bench/run.sh` keeps `''`, and the difference is the home. Its control runs in
the operator's real home, where `user` would load their CLAUDE.md and their
settings and destroy the no-guidance control.

The collector drives the Claude Code harness, so it probes the pathways that
harness reads. A Codex pathway needs its own runner, and the collector refuses
it rather than attributing one harness's answer to another pathway.

Every pathway runs the same flags, because every pathway answers one question:

```
-p --model <alias> --setting-sources user --strict-mcp-config --output-format json
```

`bench/probe.mjs` holds that set as `REQUIRED_FLAGS` and `FIXED_VALUES`, and it
holds it once. The block above is a second spelling of it for a reader, so
`test/probe.test.js` holds this file to those constants. Edit the constants and
this block goes red until it follows.

A run adds one flag beyond the block, `--debug-file <path>`, which is how the
harness hands over the trace section 4.1 asks a record to carry. It is allowed
and never required, and it opens no configuration surface. A record collected
without it is a probe like any other, carrying no trace.

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

## Where the nonce goes, and what that makes this measure

The nonce goes in the skill's frontmatter description. The harness sends skills
to the model as an attachment of names and descriptions, and a `SKILL.md` body
loads only when the model invokes the skill. Measured 2026-08-07, from the
harness's own debug log.

So this probe measures the attachment surface, which is the job section 4.1
gives it: can this harness surface an installed skill at all. It measures
nothing about invocation, selection, or loading, and it is not meant to. Those
belong to section 4.2, which keeps them entangled on purpose.

The nonce used to sit in the body, and that made the probe measure invocation
with section 4.1's instrument. A discovered skill the model had no reason to
invoke answered NONE, exactly as an undiscovered one would, so a failure could
not be attributed to anything. The first record here is that failure, and it
stays. ADR-0024 records the move and the reasoning.

## The record states no outcome

A record carries bytes. `npm run check:probes` derives the outcome from them
and prints what it derived. The check refuses a record that states an outcome
of its own, because a record that grades itself is the author's summary, and a
reader is owed the evidence instead.

A probe derives a pass when both arms answered and four things then hold. The
installed arm repeated the nonce. The empty-home control answered and did not
repeat it, which catches a probe passing for the wrong reason. The flags were a
probe arm's. And the harness trace did not contradict what the answers claim.

Read that fourth condition as it is written. The gate is that the trace did not
disagree, and it is not that the trace agreed. A record whose trace the check
could not read passes on the strength of its answers, uncorroborated, and the
next section names every state that happens in. Stating the gate as agreement
would claim a corroboration the code does not require.

`armAnswered` in `bench/probe.mjs` defines what answering means, and every
check reads it from there. Saying only that the control did not repeat the nonce
is true of a control that never ran at all, which is the reading three review
rounds each caught in a different place.

A failure is a result. A record of a probe that failed stays here, and the
status a later reader computes says the probe failed rather than saying nothing.

## The record retains the harness trace

Section 4.1 asks a probe to record the harness trace where one exists, and calls
a trace that names the loaded file better evidence than either answer. Each arm
therefore carries a `trace` field, and the shape is the smallest one that holds
evidence: `null`, or the harness's own lines as a list of strings.

The lines are kept verbatim and they are selected, not summarised. A run keeps
what the harness said about where it looked for skills and how many it loaded,
which is the sentence four documents here quote as the warrant for the flag
amendment. The rest of a debug log runs to megabytes of transport detail, a
record is committed, and a summary of a trace is the author's word about the
evidence rather than the evidence.

`null` and an empty list are different states. `null` says no log reached the
collector, and an empty list says a log was written and named no skill loading.
Every record collected before 2026-08-07 carries `null`, and so would a record
from a harness that offers no trace at all.

## The derivation reads the trace, and a disagreement blocks

The check parses `Loaded 1 unique skills` from the retained lines and prints
what it read as `trace_agrees`. The reading agrees when the installed arm loaded
at least one skill and the control loaded zero. It reads every such line rather
than the first, because the harness repeats the line per session and a run that
loaded one skill once and none the next time corroborates nothing.

It reads the count for the scope the probe installed into, and never the total.
The total counts managed skills, and a redirected home does not move the
machine-global managed path. So on a machine carrying one managed skill the
control's total is 1 rather than 0, and a reading off the total would block a
valid probe through the very path this file calls uncontrollable. The record
names its pathway, and the pathway names the column.

A disagreement blocks the pass. Section 4.1 calls a trace naming the loaded file
better evidence than either answer, and better evidence that contradicts the
answers cannot sit beside a pass as a note. The case that motivated this: a
control whose trace says it loaded a skill while its answer stays silent derived
a pass, and the contradiction sat in the same file.

## What the check withholds, and why it says so

A reading this check cannot make is withheld rather than turned into a failure.
`trace_agrees` reads `null` and `trace_withheld` names the cause, because a
reader cannot act on a `null` without knowing which state produced it.

- `absent`. The arm kept no trace. Every record collected before 2026-08-07
  carries this, and grading those would judge an old instrument by a new one.
- `truncated`. The arm's trace stands at the retained-line bound, so a
  disagreeing line past the cut is gone. The prefix would otherwise certify a
  pass over lines nobody has.
- `unscoped`. A retained line does not name the scope's own count, so the only
  number left is the total.
- `unrequested`. The record carries a trace and its own flag set never asked
  for one, so nothing in that run could have written the lines it holds.

`false` means one thing only. The harness's own numbers contradict what the
answers claim. A withheld reading passes, so a probe in any of the four states
above is corroborated by its answers alone.

Two residues follow, and this file states them rather than hiding them. A
harness that stops printing the per-scope counts makes every probe unreadable
instead of failing. A record whose trace is an empty list falls back to its
answers, which is the state before this reading existed. The answer to both is
to move the patterns in `bench/collect-probe.mjs` and `bench/probe.mjs` onto the
harness's new wording.

The check also prints `managed_seen`, which is the largest managed count either
trace states. It blocks nothing. A managed skill that reached an arm came from
the machine and not from the redirected home, and whether that spoils the arm
depends on what stood in that path, which a record carries no way to ask. The
number is what a reader needs to ask the question at all. ADR-0024 records both
decisions.

## The records here, and what each one is

`0969efef` derives FAIL. It is the first probe, collected under
`--setting-sources ''` with the nonce in a `SKILL.md` body, and both faults are
in it.

`bfbea42b` derives PASS and carries one wrong field. Its `nonce_plant` says the
nonce was appended to `SKILL.md`, and the run that wrote it planted in the
frontmatter description. The collector's string had not followed the code. The
record stays as it was written, because a record is history and not a draft, and
this paragraph is the correction.

`d80e11b7` derives PASS, describes its own method truthfully, and retains the
trace. The harness logged `Loaded 1 unique skills` over the installed arm's home
and `Loaded 0` over the control's.

Read that trace for what it settles, which is one half of the argument and not
both. Both arms ran under `user`, so the pair corroborates that the redirected
home is respected and that the two arms differ by the installed skill alone. It
says nothing about the empty spelling. The measurement that `''` loads zero
skills over an installed tree came from a scratchpad diagnostic, and no
committed record carries it.

One thing a committer checks by hand. A retained `Loading skills from:` line
carries absolute paths, and the throwaway home sits under the temporary
directory, so the committed line names whatever `TMPDIR` resolved to. On macOS
that is an opaque per-user token. On Windows the temporary directory sits under
the user profile, so the line would carry the account name. The check scans a
record for credential shapes and asks nothing about operator identifiers, and
issue #114 carries that decision.

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
