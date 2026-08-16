---
type: adr
status: accepted
issues: [108, 109]
decided: 2026-08-16
---

# ADR-0032 — A review arm is scored against dispositions this repository already wrote

Issue #109 compares two review arms on one metric: confirmed findings per
thousand output tokens. Its counterweight is recall, so a confirmed finding the
compressed arm drops has to count against it.

Both halves need one thing the bench has never had. Something must say which
findings were real. A model's own label cannot: the treatment contract asks the
model to mark a finding `confirmed` when it traced the defect, and grading an
arm on its own claim measures its confidence rather than its accuracy.

This repository already holds the answer. AGENTS.md gives every review finding a
disposition, in a fenced `review-verdict` block, written by a person who read
the code. Issue #108 mines those blocks. This decision records how.

## The corpus, and the subset a run buys

A pull request is ELIGIBLE when the forge merged it and at least one of its
threads derives a disposition. `bench/mine-verdicts.mjs` refuses the rest and
names the cause.

Eligibility is not selection. A run names its pull requests with `--pr`, and
`bench/review-arms.mjs` builds those and no others. The two are separate because
they answer separate questions. Eligibility asks what the corpus may ever hold,
and the mining answers it once. Selection asks what to buy now, and only the
operator answers that, because each scenario costs two arms of live calls and
the first run exists to be read before anything scales. A `--pr` naming a pull
request the corpus does not hold is refused rather than skipped, so a typo
cannot quietly shrink a run to a size nobody chose.

A SCENARIO is one review round, and a round is one commit that a reviewer read.
The record pins the pull request's base and that commit, both forge facts, so
`git diff <base>...<review commit>` rebuilds the diff the reviewer saw.
`bench/review-arms.mjs` runs that command and writes the scenario file.

The merged diff was the obvious choice and it is wrong twice over. Every
accepted defect is fixed in it, so the ground truth is not there for an arm to
find. And the anchors point at line numbers that moved between the review and
the merge. Pinning the reviewed commit removes both problems at once, and it
removes all version drift from the matching rule below.

**Two limits, measured rather than predicted.**

This repository disposed of its earlier pull requests in bold prose, such as
`**ACCEPTED** — ...`, and moved to the fenced block later. The reader reads the
fenced form and nothing else. A prose matcher would read the word `ACCEPTED` in
any reply that discussed one, and a fenced block cannot be mistaken for
discussion. So the corpus is the pull requests disposed of under the fenced
discipline, and the refusal says `no-verdict-block` for the rest. If the corpus
ever needs the earlier pull requests, the answer is a second named block form,
never a matcher over prose.

Three of five mined rounds refuse for a second reason, and it is worth writing
down. The diffs under study are this repository's own, and they carry the
FIXTURES of the scan that promotion runs over every retained byte. One test
holds `sk-ant-oat01-LEAKEDCREDENTIAL0123`. Another holds `/Users/someone/`. The
scan is right and the corpus is smaller. Redaction is the measurement design's
other option, nothing here builds it, and ADR-0023 already refuses outright for
the same reason.

So the corpus is four eligible pull requests and two a clone can build today.
That is short of the three the first run is scoped to, and the shortfall is a
corpus fact rather than a tool fault. Two exits stay open. A later pull request
disposed of in fenced blocks becomes eligible by being mined. And redaction, if
anything ever builds it, returns the three refused rounds.

## A record states no disposition

The record retains the reviewer's comment, the anchor as the forge spelled it,
and every reply verbatim. `bench/verdicts.mjs` derives the verdict.
`npm run check:verdicts` prints what it derived, and it refuses a record
carrying a key that states one.

That is ADR-0013's rule for a probe record, applied to a second corpus. A record
that grades itself is the author's summary, and a reader is owed the evidence.

Two readings come off one thread, and each is withheld on its own cause. Naming
one cause for both would tell a reader the wrong thing about whichever half was
fine, which is the mistake `trace_withheld` fixed in ADR-0024. A withheld
reading fails nothing. The census counts it, names why, and prints before the
exit status is decided.

`ACCEPTED`, `ACCEPTED_MODIFIED` and `DEFERRED` are the words that CONFIRM a
finding. The first two say the defect was real and a fix landed. `DEFERRED`
says, in the discipline's own words, that the issue is real and was not fixed
here, so the arm reading that commit should still find it. `OBSOLETE` says an
earlier commit had already resolved it, so the defect is not in the tree the arm
reads. `DUPLICATE` says the disposition lives on another thread, and counting
both would count one defect twice. Every `REJECTED_` word says the finding was
wrong.

## The matching rule, and what it cannot do

An arm's finding matches a mined disposition when the file paths are equal and
the arm's line falls within ten lines of the disposition's anchor range.

The instrument reads both arms the same way. It collects every distinct
`<path>:<line>` the reply names. The treatment fixes a per-finding shape and the
baseline fixes nothing, so a parser for the treatment's shape would measure the
two arms with two instruments and the comparison would be worthless.

**The failure mode, stated.** The window makes the match many to one. Two
accepted findings less than twenty lines apart in one file are not separable,
and pull request #119 is exactly that case: its two threads anchor at line 437
and at lines 437 through 445 of one file, so a single stated line near 440
matches both. A disposition is counted once however many anchors reach it, so
the numerator cannot inflate. What can inflate is agreement: an anchor placed
near a defect for an unrelated reason still matches it.

So the two counts are BOUNDS and not identifications. `confirmed` is a ceiling
on what an arm found. `missed` is a floor on what it dropped. A study that
reports them says so beside the figure.

Two further limits. A finding that names a file and no line states no anchor,
and the count is lower by exactly that. A path with no extension, such as a
Makefile, is outside the form the reader reads.

## The scorer cells

`bench/score.mjs --review <dir>` prints five more columns, and only under that
flag. A column of empty cells on every style run would read as a measurement of
nothing rather than as a mode nobody asked for.

- `anchors` — distinct places the reply names. It says how much the arm claimed.
- `confirmed` — how many of the round's confirmed findings those anchors
  reached, counted per finding.
- `missed` — the rest of that ground truth. `confirmed` and `missed` always sum
  to it.
- `outTokens` — the output tokens the sidecar recorded.
- `perKtok` — `confirmed` per thousand output tokens. Issue #109's primary
  metric.

The counterweight issue #109 asks for is the difference between the two arms'
`missed` rows. It is not a cell. A cell would have to choose which baseline
sample to subtract from which treatment sample, and every such choice is
arbitrary in a way the single number would then hide. Two arms print two medians
and two ranges, and a reader subtracts with both spreads in front of them.

`check:studies` derives one figure per cell of that table, unchanged. The
corpus is retained INSIDE a promoted study and the retained command names the
promoted copy, because `commandProblems` refuses a path outside the study and
because a re-run against the live corpus would reproduce a figure from bytes the
study does not hold. The prompts are retained for that reason and the argument
transfers whole.

## Where the token count comes from, and what is unverified

`bench/extract.mjs` has read `modelUsage[<build>].outputTokens` since it was
written, with `output_tokens` as a second spelling. That is how the runner picks
which build answered. It now reports the number as well, and `bench/run.sh`
records it as `output_tokens` in every sidecar.

**This is not verified under a review invocation, and verifying it costs a
metered call.** So the protocol carries the absence rather than assuming
against it. `extract.mjs` writes the word `absent` when neither spelling is
there, never a zero, because a zero is a run that emitted nothing and `absent`
is a harness that reported nothing. `reviewMetrics` then withholds `perKtok`
rather than dividing, a withheld cell derives no figure, and the median is taken
over the samples that carry a count.

`--review` requires the field to be PRESENT in every sidecar and admits `absent`
as its value. Those are the two halves ADR-0024 separates. A field a check reads
is a field the check requires. A protocol choice about the value decides a
reading and never a record's validity.

## Two deviations, recorded rather than left to be found

The treatment reaches the model as an appended system prompt, through
`bench/run.sh --system`, and not as the user prompt the issue's own invocation
shape shows. The scorer requires both arms to share a prompt digest, so
delivering the contract inside the prompt would make the arms incomparable by
this bench's own rule. `bench/README.md` already states what the system-prompt
channel costs: every figure here measures injection and never installation.

The review arms run through `bench/run.sh`, with a new `--prompts` flag, rather
than through a second runner. A second runner would be a second copy of every
refusal that file carries, and the first of them to drift would be the one that
stopped catching a mixed cell. Resuming an arm under a different prompt
directory needs no new refusal: the other set's scenario names differ, so
`armState` reports its files as unexpected, the arm does not cover its plan, and
`check:studies` marks every figure it touched unaudited.

## Consequences

`npm run check:verdicts` joins `npm run check` and the continuous integration
gate together, as a named script, because a check that exists locally and not in
the gate is the defect PR #59's review caught.

No figure exists. The arms have not run, and running them spends the operator's
usage. Nothing in this change starts a model call, and `bench/review-arms.mjs`
prints the commands rather than running them.

**The flip condition.** If a review arm's findings ever need matching by
content rather than by position, this rule is the wrong instrument and a new
ADR replaces it. Widening the window is not the answer. A wider window buys
agreement it cannot distinguish from coincidence, and the bound would stop
bounding anything.
