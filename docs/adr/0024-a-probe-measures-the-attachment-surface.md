---
type: adr
status: accepted
decided: 2026-08-07
issues: [21, 43, 94, 95, 113]
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

Those three invariants were prose here and no test held them, because the arm
sequence lived inside a function that spawns a live harness. The section below
records the extraction that closed that, on issue #95.

The derivation did not read the trace either. The section below records the
reading that closed that, on issue #94.

## Amended 2026-08-13 — the trace is read, and a disagreement blocks

Two follow-through items above became one pull request, because both make a
retained trace count as evidence rather than as an attachment.

**The derivation reads the trace.** `deriveOutcome` gains `trace_agrees`. It
parses `Loaded (\d+) unique skills` from the retained lines, and the reading
agrees when the installed arm loaded at least one skill and the control loaded
zero. Every such line is read rather than the first, because the harness repeats
the line per session and a run that loaded one skill once and none the next time
has corroborated nothing.

**It reads the count for the scope the probe installed into, never the total.**
The total counts managed skills. A probe redirects `HOME`, and the harness
consults a machine-global managed skills path that `HOME` does not move, so on a
machine carrying one managed skill the control's total is 1 rather than 0. A
total-based reading blocked a valid probe through the very path `managed_seen`
declares non-blocking, which made this decision contradict itself. The record
names its pathway, the pathway names its scope, and `SCOPES` and the harness's
own source names coincide, so the reading takes that column. Excluding managed
by construction beats subtracting it, and reading `user:` for every pathway
would repeat the defect one column over on a project-scope probe.

**A disagreement blocks `passes`, and this is the decision the issue left
open.** The alternative was to report it beside the verdict as a note. Section
4.1 calls a trace naming the loaded file better evidence than either answer, and
better evidence that contradicts the answers cannot sit beside a pass without
making the word meaningless. The concrete case is the one that motivated the
issue: a control whose trace says `Loaded 1 unique skills` while its answer says
nothing derived PASS, and the contradiction sat in the same file.

**An unreadable trace is withheld, and it names why.** `trace_agrees` is `null`
wherever the evidence cannot answer, and `trace_withheld` carries the cause,
because a reader cannot act on a `null` without knowing which state produced it.
There are three causes. `absent` is an arm that kept no trace, which is every
record written before 2026-08-07 and would be a record from a harness that
offers none. `truncated` is an arm whose trace stands at `TRACE_LINE_LIMIT`, so
a disagreeing line past the cut is gone and the retained prefix would certify a
pass over evidence nobody has. `unscoped` is a retained line that does not name
the scope's own count, which leaves only the total.

`false` is reserved for the harness's own numbers contradicting the answers.
This corrects a reading in the first draft of this amendment, which blocked on a
trace that named no loading. That said the harness disagreed when the truth was
that the evidence was unreadable, and this repository already answers an
unreadable artifact by withholding the number and naming the cause rather than
by publishing a wrong one. The correction came out of the codex review of the
pull request carrying this section.

The cost is stated rather than hidden. A harness that stops printing per-scope
counts makes every probe unreadable instead of failing, and a record whose trace
is an empty list falls back to its answers, which is the state before this
reading existed. The exit is to move `TRACE_PATTERNS`, `LOADED_LINE` and
`sourceCount` onto the new wording.

**Measured effect on the committed records: none.** Two carry no trace and
derive `null`, so their verdicts stand. The third carries a trace that agrees.
The blocking reading therefore costs nothing today, and it is written down now
rather than the first time it would change an answer.

**The managed count is read off the same line, and it blocks nothing.** A probe
redirects `HOME`, and the harness consults a machine-global managed skills path
that `HOME` does not move, which is why `environment_class` names the home and
never the machine. `managed_seen` is the largest count either trace states.
Whether a managed skill reaching an arm spoils that arm is a judgment about what
stood in that path, and a record carries no way to ask, so the derivation owes a
reader the number and not a verdict. `check:probes` prints it on every line, for
the reason `ground --check` prints its own counts: a note nothing reads is a
comment.

**The bound lives with the reader, and it decides a reading and never a
record's validity.** `TRACE_LINE_LIMIT` moved from `bench/collect-probe.mjs`
into `bench/probe.mjs`, because the derivation is what has to know that a list
of exactly that length may be a prefix. A trace at or past the bound is
withheld, and at the boundary a complete run and a cut one are
indistinguishable, so the boundary itself is withheld.

An earlier draft of this section also had `traceProblems` refuse a record
carrying more lines than the collector would write. That looked like pinning the
coupling and it was this ADR's own inversion, one column over from the flag
case: it made such a probe a MALFORMED FILE rather than a failed or unreadable
one. Worse, lowering the constant would have retired committed evidence, and
`checkDirectory` counted an outcome only for a record that checked clean, so the
corpus would have left the census with nothing saying so. That is the
`unread-matrix-row` defect in the probe corpus. Two things answer it. Length is
an input to the reading alone. And the census NAMES a record it cannot read,
counting it as `unread`, so a denominator can no longer shrink quietly.

**A committed record is pinned to the reading it was committed under.** The
records under `bench/probes/` are append-only evidence and the reading around
them is ordinary code, so nothing stopped an edit to a constant from silently
re-grading them. `test/probe.test.js` pins each committed record's whole derived
tuple. Raising the bound would turn a trace cut at it into one that reads
complete, which is the codex finding restored by a one-line edit, and the pin is
what makes that a CI failure and a person's decision.

**A pathway no runner drives is refused, and that is not the flag rule
loosening.** The check validates the COMBINATION through `targetProblems` and
`HARNESS_FOR`, because reading the halves separately admitted `cowork:project`,
`agents:project` and `codex:user`. The distinction against the rule above is the
one the over-bound trace turned on. A record collected under the wrong FLAGS is
a run that HAPPENED, and refusing it throws away the evidence of this
repository's own failure. A pathway no runner drives is a file no run of this
collector could have written, because `parsePathway` throws before the first
call is paid for. A future runner arrives by adding its entry to `HARNESS_FOR`,
and the same commit that lets the collector produce such a record lets the check
accept it, because both read the one table. The residue: these tables can
shrink, and dropping a platform would retire every committed record naming it.
Nothing prevents that, and the corpus pin makes it loud rather than silent.

**The record check asks what the writer asks.** `identity.pathway` was validated
only as text while the whole reading is keyed on it, so a typo disabled the
trace check permanently and reported the cause as `unscoped` — a harness-wording
state. The RECORD's defect was reported as the HARNESS's, and a misattributed
cause is worse than a missing one. The same looseness admitted a record carrying
a trace whose own flag set never asked for one, which now withholds as
`unrequested`, and a `--debug-file` value whose FIRST segment is `.claude`,
which the guard now refuses.

**What would reopen the withholding.** A harness whose skill-loading line drops
the per-scope counts, or one that emits more than forty of those lines in an
ordinary run. The first makes every probe read `unscoped` and the second makes
every probe read `truncated`, and in both cases the probe stops answering rather
than starting to fail. Raising the bound is a decision about what a committed
record may carry, and it belongs here rather than in a patch.

**What would reopen the blocking.** A harness that prints a zero-loading line in
an ordinary run. Every `Loaded` line is read, so one later session that loaded
nothing makes the installed arm read `false` and every probe derive FAIL. That
contradicts the stance the paragraph above states, which is that a harness
change stops a probe answering rather than starting to fail, and the blocking
direction is the one place that stance does not hold by construction. The
reading is also non-monotonic there: the same harness behaviour blocks below the
bound and withholds at or above it, because withholding on truncation and
reading every line cannot both be strict. If that harness arrives, the exit is
to read the LAST loading line per arm rather than every one, and to say so here
rather than to relax the rule quietly.

**The arm sequence is extracted.** `runArms` in `bench/collect-probe.mjs` holds
the three invariants above, and `main` calls it. It builds one flag set above
the loop, derives the debug path under the throwaway root, and reads then
removes the file on every arm rather than on the first alone. A caller-supplied
path outside the root is refused. `test/probe.test.js` holds each invariant, and
each of the three mutations issue #95 named now fails the suite.

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

## Amended 2026-08-14 — flag presence is a value reading

The split above fixed one half of the case it names. `checkRecord` read the
flag NAMES as well as the structure, so it refused a record that omitted a
required flag and a record that named a flag outside the set. Only a wrong
VALUE reached the acceptance test.

That left the guarantee false in the shape it was written. A record omitting
`--strict-mcp-config` was a broken file. So was a record carrying `--verbose`.
The flag set had already moved once, on this ADR, and the next move that adds
or removes a NAME rather than a value would make every committed record
malformed again. Issue 113 reports it, and an adversarial review of pull
request #110 found it.

**Decision.** Allowlist membership and required-flag presence move to the value
reading. `isolationProblems` now reads the names, the presence and the values,
and `deriveOutcome` reports all three as `isolated`. `flagShapeProblems` keeps
structural impossibility alone: flags that are not a non-empty array, an entry
that is not a string, an element that is neither a flag nor a flag's value
named by position alone, a flag stated twice whatever its name, a value-taking
flag at the end of the list, and a flag sitting where another flag's value
belongs. The operator ruled on 2026-08-14, on the fork issue 113 states.

The guarantee now holds whole. A record collected under the wrong flags derives
FAIL, prints as FAIL, and can never read as a pass, and that covers the omitted
flag and the unknown flag as well as the wrong value.

**The principle, stated once.** A check may refuse a record on a STABLE
IDENTITY fact of the collector. The pathway combination is one, and it stays a
shape refusal untouched, because no run of this collector could have written a
pathway no runner drives. A check may not refuse a record on a VERSIONED
PROTOCOL CHOICE. Flag names, required presence and `TRACE_LINE_LIMIT` are all
such choices. Each one moves when this repository amends the protocol, and a
check that refuses on it retires committed evidence on the day it moves. So a
versioned choice decides a READING, and never a record's validity. This
generalises the `TRACE_LINE_LIMIT` rule the section above already states.

**The named set moves, and the invocation grammar does not.** A review of the
pull request carrying this section drew the line one notch too far, and this
records the correction. `armFlags` returns a LITERAL array, so a record's flag
list alternates flags with their values, states each flag once, and floats no
element between them — under every revision, whatever the set becomes. The
grammar is therefore a stable identity fact and it stays on the shape side, and
only membership and presence moved. Two cases were wrong for one round. A
duplicated UNKNOWN flag escaped the shape check entirely, because the
membership branch returned before the duplicate branch ran, so a rule that
names no flag was read only for the flags this repository currently knows. And
a floating positional moved value-side with the names, though no revision can
produce one.

**A shape message names a position and never an element.** The positional
refusal used to quote the element back. `redact` withheld the whole line when
that element was credential-shaped, which was safe and unreadable. A position
carries nothing of the record, so the diagnostic survives the case it was built
for. The duplicate message still names the flag, because a dash-led token IS
the flag rather than a value it carries, and `redact` at emission covers the
one case where such a token is credential-shaped.

**What the parse does not change.** Every element is still consumed. An unknown
flag consumes one element under both readings, so the two walks see the same
list. `flagsSeen` now holds every flag the walk read in a flag position rather
than every ALLOWED one, which is what lets the duplicate check see a name this
repository does not know, and no consumer's question changes answer.

**What would reopen this.** The corpus admits records from this repository's
own collector and from nothing else, which is what makes an unknown flag a
protocol question rather than an authenticity question. If `bench/probes/` ever
admits a record from outside that collector, the allowlist becomes a genuine
authenticity surface, and refusing an unknown flag would then be a claim about
where the file came from rather than about which protocol version wrote it.
Revisit this decision on that day.
