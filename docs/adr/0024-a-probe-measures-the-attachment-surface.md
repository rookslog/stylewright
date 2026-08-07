---
type: adr
status: accepted
decided: 2026-08-07
issues: [21, 43]
---

# ADR-0024 — A probe arm enables the user source, and plants in the description

The first isolation probe ran on 2026-08-07 and derived a failure. Two
independent faults each produced it, and neither was a fact about the product.

This records three repairs, and they did not arrive by the same route. The
owner ratified the first two together: a probe arm enables the user source, and
the nonce goes in the frontmatter description. The third came out of repairing
them — a record collected under the wrong flags is a failed probe rather than a
broken file — and it is argued below, adversarially reviewed on the pull request
that carries it, and the owner's merge of that pull request is what ratifies it.
It has no separate sign-off, and the section that states it names what would
reopen it.

## The flag set suppressed the thing under test

A probe arm ran `--setting-sources ''`, inherited from the bench control, where
that spelling is what makes a no-guidance control possible.

A diagnostic pair then measured what it does to skills. Over one installed tree,
from the harness's own debug log:

```
--setting-sources ''    Loaded 0 unique skills (…, user: 0, project: 0, …)
--setting-sources user  Loaded 1 unique skills (…, user: 1, project: 0, …)
```

The empty spelling suppresses the user skill directory along with the settings.
So the acceptance test asked whether an installed skill is discoverable in a
configuration that has skills switched off, and it could only ever answer no.

**Decision.** A probe arm runs `--setting-sources user`. `bench/probe.mjs` holds
that value, in one place, beside the check that enforces it.

**Why isolation survives.** The argument turns on the home, not on the flag. A
probe arm's home is a throwaway empty one, so there is no operator CLAUDE.md and
no operator settings in it for `user` to admit. The same pair measured the other
half: the empty-home control under `user` loaded zero skills. The arms therefore
differ by the installed skill and by nothing else, which is what the one-variable
rule asks, and what the old spelling was reaching for by a route that did not
work.

**`bench/run.sh` does not follow.** Its control runs in the operator's real home,
where `user` would load their CLAUDE.md and their settings and destroy the
control. The two files spell the flag differently from now on, deliberately, and
the difference is which home each runs in. A future reader who "fixes" the
inconsistency reintroduces this decision's opposite.

## The plant site measured invocation, not discovery

The probe planted its nonce by appending to the installed `SKILL.md`. The same
debug log shows why that cannot work: the harness sends skills as an attachment
of names and descriptions, and a body loads only when the model invokes the
skill. The nonce was in a body nothing had reason to load, so the model answered
`NONE` against a skill that was discovered perfectly.

**Decision.** The nonce goes in the skill's frontmatter description.
`plantInDescription` rewrites that one line, and it refuses a file with no
frontmatter or no description rather than planting nothing and reporting a
failure that means nothing.

**What that makes the acceptance test mean.** Section 4.1 asks whether a harness
can surface an installed skill at all, and says in the same breath that it is not
proof of loading. The description is the surface those words name. The test now
means: the harness listed this skill to the model, under a probe arm's flags, in
a redirected home.

**What it deliberately excludes.** Invocation, selection and loading. Those are
section 4.2's, and section 4.2 keeps them entangled on purpose. The old plant
measured them with section 4.1's instrument, which is why its failure could not
be attributed: a body that never loads and a skill never discovered produce the
same answer. It took four call pairs to separate the two.

It also broke the design's division of labour. Section 4.2 accepts an entangled
headline figure precisely because the probe diagnoses discoverability alone
afterwards. Under a body plant, neither instrument isolated discovery, so that
sentence was false.

## The alternatives, and why not

**Keep the body plant as a stronger bar.** It is strictly stronger and it is
unusable: a failure attributes to nothing, and it depends on the skill's own
description matching the ask, so two skills are not comparable and the probe
measures the treatment rather than the harness.

**Record both, as two named plants.** Defensible, and the one option worth
revisiting. A description-pass beside a body-fail localises the failure to
selection, which is real diagnostic power. It costs two live calls per arm and a
record schema carrying two nonces and two derivations. Deferred until somebody
wants selection measured as a standing question rather than diagnosed when it
bites.

## A wrong flag set is a failed probe, not a broken file

Moving the flag set exposed a conflation that had never been reachable. The
record check and the acceptance test were one function, so a probe whose arm ran
the wrong flags was refused as MALFORMED rather than derived as FAILED. The
first consequence was immediate and absurd: the record of the probe that
motivated this amendment could not survive it, and `check:probes` refused the
very evidence the amendment rests on.

That also broke a rule this design states everywhere else. A recorded failure is
a result, and it was a result for every failure except this one.

**Decision.** `checkRecord` reads the flag SHAPE — unknown flags, duplicates,
missing values, stray positionals. `deriveOutcome` reads the values, through
`isolationProblems`, and reports them as `isolated`. `flagShapeProblems` and
`isolationProblems` are two named readings of one walk.

Nothing is weakened, and this is worth stating precisely because it looks like a
relaxation. A record collected under the wrong flags still derives FAIL, still
prints as FAIL, and can never read as a pass. What changed is that it now reads
as evidence rather than as a corrupt file, which is what lets the failed record
and its replacement sit side by side.

**What would reopen this.** Two things, and neither has happened. A record that
is shape-invalid AND flag-wrong reads today as one undifferentiated failure, and
a reader who needs to tell a corrupt file from a wrong-flag run would need the
two readings reported separately rather than merged into one list. And the
coverage computation in section 7 does not exist yet. When it lands, it has to
adjudicate a tuple whose records disagree, and a machine reading `isolated=false`
beside `isolated=true` on the same tuple may need a rule this split does not
supply. Either one is a reason to revisit, and neither is a reason to fold the
two readings back into one.

## The record retains the trace, and that costs one flag

Added on review of the pull request that carries this ADR. Section 4.1 asks a
probe to record the harness trace where one exists, and calls a trace naming the
loaded file better evidence than either answer. No record carried one, while
four documents here quoted the harness's own skill-loading lines as the warrant
for the flag amendment above. The evidence for this ADR lived in a scratchpad.

**Decision.** An arm runs with `--debug-file`, and each arm retains the lines the
harness wrote about where it looked for skills and how many it loaded. The field
is `null` or a list of the harness's own lines, verbatim. A summary of a trace is
the author's word about the evidence, which this protocol refuses everywhere
else, so the shape does not admit one.

`--debug-file` is therefore ALLOWED beside the required set, and it is the only
flag that is. It opens no configuration surface — it redirects diagnostic output
to a file and changes nothing about settings, skills, MCP, or the model — so the
acceptance test still means what it meant. `--debug` would have served through
stderr, and its argument is optional, so it swallowed the prompt and cost a call
pair that bought nothing.

Both arms run through ONE path, one after the other, and the trace is read and
the file removed between them. Two paths would put a different value in each
arm's invocation, and a record carries one flag set, which would then be true of
neither arm.

Those three invariants are prose here and no test holds them, because the arm
sequence lives inside a function that spawns a live harness. Issue #95 carries
the extraction that makes them reachable, with the three surviving mutations
named. The `--debug-file` VALUE is the one part already enforced.

The derivation does not read the trace. `deriveOutcome` reads the answers and
the flags, so the better evidence is retained and not consulted, and issue #94
carries that work. A record whose control trace says `Loaded 1 unique skills`
derives PASS today on the strength of its answers alone.

## Consequences

The first record stays where it is. It is a faithful record of what the
instrument measured, a recorded failure is a result rather than coverage, and the
probe that replaces it is a different instrument asking a narrower question.

The record written between them stays too, and it carries one wrong field. Its
`nonce_plant` says the nonce was appended to `SKILL.md`, because the collector's
description of its own method had not followed the code. The run planted in the
frontmatter description. `bench/probes/README.md` carries the correction, and the
record is not edited, because a record is history.

The two generations stay distinguishable without a version field, because the
older record derives `isolated=false` and the newer one does not.

Both amendments are measurements, not deductions. Everything here binds to one
identity tuple and to nothing wider: harness build `2.1.222`, platform
`darwin-arm64`, pathway `claude:user`, environment class `empty-home`, and the
model each record names. Nothing generalises across any element of it, as
section 4.1 already says of everything else, and a reader who wants the served
build reads it from the record rather than from this sentence.
