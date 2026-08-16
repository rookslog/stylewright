# bench — measuring what a style skill actually does

A prescription in a craft skill is an `E` row. It has no standard behind it, so
measurement is the only evidence it can ever have. This directory holds the
protocol that produces that evidence.

It has two halves, and neither one substitutes for the other. The bench half is
reproducible and artificial. The field half is real and uncontrolled.

## Half one, the bench

Fixed scenarios, fresh context, several runs each, one variable at a time.

`run.sh` needs **zsh** and the `claude` CLI on `PATH`. Neither is a dependency of
this package, and nothing in `npm run check` invokes the runner, so continuous
integration never exercises this half. A Linux container without zsh will fail
every command below before the harness starts. The scorer is plain Node and runs
anywhere.

```
bench/run.sh control                       # no guidance at all
bench/run.sh with-skill --system skills/craft/compressed-deliberation/SKILL.md
node bench/score.mjs bench/out/control/report-*.txt --prompt bench/prompts/report.txt
node bench/score.mjs --compare bench/out/{control,with-skill}/report-*.txt
```

Five rules make the result mean something. Every one of them is here because it
was broken in this protocol's own first study run.

**Always run the control.** If output with no guidance already has the shape you
want, there is nothing to fix, and a skill written anyway will be credited for
behaviour it never caused. This is not hypothetical. The first baseline for
`compressed-deliberation` found a clean control across all fifteen runs, which
moved the whole investigation off the model and onto the instruction stack that
sat above it.

**Five runs is the floor.** A single sample tells you almost nothing. Spread
matters as much as the middle: when guidance binds, runs converge on one shape.
Five readings of five different shapes means the wording is not binding yet, and
more words will not fix that.

**Change one thing per arm, and change nothing while an arm is running.** An arm
is a configuration, not a hypothesis. Name it for what it holds. Both halves of
this rule were broken in the first study run here, and both broke a conclusion:
one arm carried two edited rule files rather than one, and a rule file was
rewritten 6 seconds into a five-run cell — an unaudited record, like every
figure in this file — so its last two runs measured the text the cell existed
to compare against.

**Let the scorer refuse.** `run.sh` writes a `.meta` file beside every sample
recording the hash of the injected system prompt, the hash of the operator rule
set, the prompt hash, the CLI version, the planned rep count, and the model build
that actually served the request. `score.mjs` reads them and **exits non-zero**
when any of the following holds:

- a sample has no sidecar, or a sidecar is missing any required field. Presence
  is checked before agreement, because a set where *every* sidecar lacked
  `model_id` used to compare an empty list of values, find no disagreement, and
  pass as audited.
- a treatment hash, model build, or CLI version varies inside one arm.
- the files are a subset of their arm, or the arm was collected below the
  five-run floor. A cell is a whole arm, not whatever the glob matched.
- `--prompt` names a file whose digest is not the `prompt_sha` the samples were
  collected against, which would score `echo` on text nobody answered.
- a sample has a non-empty `.err` beside it.

**The runner says when an arm stopped.** `run.sh` writes an arm manifest when
the arm ends, whether it covered its plan or aborted. The manifest names every
file the arm planned to hold and the digest of every file it holds, and it
states no verdict. `bench/arm-manifest.mjs` derives whether the arm finished
from those bytes, and `bench/retain.mjs` refuses to promote an arm that has no
manifest. Without one, a partial arm and a finished arm look the same to
anything downstream.

**`--compare` is how two arms are read together.** Scoring one arm at a time can
only establish consistency *within* a cell, so a control served by one build on
one scenario and a treatment served by another on a different scenario each pass
alone and are meaningless together. `--compare` permits the treatment fields to
differ, since differing is the comparison, while still requiring a shared prompt,
model build, and CLI version — and it refuses two arms carrying the *same*
treatment, which is not a contrast. It reports a median and range per arm and
never pools across them.

An earlier draft of this file asked you to check the hashes yourself before
believing a comparison. That is what the person who wrote the defects had already
been asked to do. `--unaudited` scores anyway, for field samples, and stamps the
status on every row of the table — including `MEDIAN` and `RANGE` — because a
warning on stderr is lost the moment anyone redirects or pastes the output.

**Score the model, never the harness.** An early runner used `2>&1`, so a
26-word CLI warning — unaudited, again — landed inside the word counts of two
arms and no others. It
reversed the direction of the comparison those arms existed to make. The runner
now takes `--output-format json` and lifts the answer out of the `result` field,
so no harness line can reach a sample. Stderr goes to a sibling `.err`. It also
refuses to keep a sample from a run that reported `is_error`, because a failed
invocation leaves a short file, and short is the direction every treatment here
is meant to move.

**Read the samples.** Every number here is a proxy. Score to find which arm to
read and which sample inside it, then read that sample and say what changed. A
conclusion nobody read the text for is a guess with a table beside it.

### The scenarios

Each prompt puts the writer in a position where the failure is tempting and easy
to miss.

| Prompt | The position |
|---|---|
| `correction.txt` | A prior claim is wrong and the reader has just said so. |
| `report.txt` | A change is finished and verified, and the reader wants the result. |
| `follow-up.txt` | The reader asks one narrow question about earlier work. |
| `adjacent-bug.txt` | A narrow question, with a readable second bug beside it. |

`adjacent-bug.txt` is the only one with a right answer, and it exists to catch
the failure this whole protocol could otherwise reward: a skill that scores well
by dropping findings. Its seeded bug is a guard testing `raw === ''`, so a
whitespace-only input still throws.

**None of these asks for a long answer, and that is a real limit.** A benchmark
made only of short-answer positions cannot separate a reply that compressed from
one that truncated. Read `adjacent-bug` samples for what they omit as well as
what they find, and treat a scenario needing a genuinely long answer as missing
rather than unnecessary.

Add a scenario by dropping a `.txt` file in `prompts/`. Keep one position per
file, and keep the reader's own words in it, because the echo measure below
compares the reply against the prompt.

### The review arms

Issue #109 runs two arms over pull request diffs rather than over the four
positions above. The question is whether a fixed per-finding shape buys more
real findings per thousand output tokens, and what it drops to get them.

Every other scenario here is scored on shape alone. This one has a right
answer, and the answer is already in this repository. AGENTS.md disposes of
every review finding with a fenced verdict block, so a person has already said
which findings described a real defect. `bench/verdicts/` mines those blocks
and `bench/verdicts/README.md` carries the protocol. ADR-0032 records the
design.

```
node bench/review-arms.mjs --pr 112 --pr 118 --write
bench/run.sh review-baseline --prompts bench/review-prompts --reps 5
bench/run.sh review-compact --prompts bench/review-prompts --reps 5 \
  --system bench/review-contract.md
```

A scenario is one review round, and a round is one commit a reviewer read.
`review-arms.mjs` rebuilds that diff and writes the scenario file. It spends
nothing, it prints the byte size of each prompt before you buy it, and it
prints the commands rather than running them.

A run names its pull requests. Mining says which ones are eligible, and `--pr`
says which ones this run buys. The two are separate because each scenario costs
two arms of live calls.

Read the arms with `--review`, which needs the corpus:

```
node bench/score.mjs --compare --review bench/verdicts \
  --prompt bench/review-prompts/pr-118-r1.txt \
  bench/out/review-{baseline,compact}/pr-118-r1-*.txt
```

## Half two, the field

The bench cannot reach the two places the length problem is worst: long agentic
sessions with tool use, and files written to disk. Both need real work, so the
field protocol scores artefacts you already have.

- **Written deliverables.** Score any file the agent wrote.
  `node bench/score.mjs docs/some-report.md`. No prompt, so no echo figure.
- **Session replies.** Save a reply to a file and score it. The interesting
  moment is the one after a reader corrects you, or the one reporting finished
  work, because those are the positions the bench scenarios copy.
- **Keep the pairs.** A field score is only worth recording next to what the
  reader wanted. Note in one line what the reply should have led with, then
  score it. That note is the label, and without labels the numbers accumulate
  without ever settling anything.

Field samples are uncontrolled. They cannot show that a skill caused anything.
They show whether the failure is still present, which is the question a bench
result cannot answer.

## What the scores mean

`node bench/score.mjs [--prompt FILE] [--compare] [--unaudited] SAMPLE...` prints one row per
sample, a median row, and a range row.

| Metric | What it counts | Read it as |
|---|---|---|
| `words` | Visible words, keeping code bodies and dropping fence delimiters. | The only metric that has separated every arm. Still the symptom, not the defect. |
| `scaffold` | Headings, standalone bold labels, and bold-led bullets. | Structure the reader did not ask for. Specific, and insensitive. See below. |
| `bullets`, `longestList` | Bullets in total, and the longest single run. | A long run means items of unequal weight presented as equals. |
| `hedges` | Phrases that flag something unverified, each counted once. | One is often load-bearing. Four means the load-bearing one is buried. |
| `menus` | Offers of a choice the reader did not request, counted per offer. | Each one is a decision handed back rather than made. |
| `signatures` | Listed words and short phrases, counted per occurrence. | Zero on every sample, because the list ships empty. See below. |
| `echo` | Share of the reply's prose word pairs that appear in the prompt's prose. | See the warning below. Not a restatement measure. |
| `noise` | Harness lines stripped from an older sample. | Non-zero means that arm may not be comparable to one scored at zero. |

`--review DIR` prints five more columns and needs the mined corpus. Without the
flag the table is exactly the one above, because a column of empty cells reads
as a measurement of nothing rather than as a mode nobody asked for.

| Metric | What it counts | Read it as |
|---|---|---|
| `anchors` | Distinct `path:line` places the reply names. | How much the arm claimed, whatever shape it claimed it in. |
| `confirmed` | Confirmed findings of that round the anchors reached. | A ceiling on agreement. See below. |
| `missed` | The rest of that round's confirmed findings. | A floor on what the arm dropped. It sums with `confirmed`. |
| `outTokens` | Output tokens the sidecar recorded. | Empty means the harness reported none, and the rate is withheld. |
| `perKtok` | `confirmed` per thousand output tokens. | Issue #109's primary metric. |

**Both counts are bounds, and neither identifies a finding.** A match is a file
path and a line within ten lines of the mined anchor, so two confirmed findings
close together in one file are not separable. Pull request #118 is that case:
three of its confirmed findings anchor within seven lines of each other, so one
stated line reaches all three. ADR-0032 states the rule and this failure mode.

The counterweight is the difference between the two arms' `missed` rows. It is
not a cell, because a cell would have to pick which baseline sample to subtract
and would then hide that choice inside one number.

Everything but `words` reads prose with fenced code removed, because a heading or
a bullet quoted inside a fence is the reader's material, not the writer's shape.
That includes `echo`, which briefly did not: on `adjacent-bug` a reply quoting the
supplied snippet drew most of its overlap from the code rather than from anything
the writer chose.
A bold-led bullet counts as both `scaffold` and `bullets`, deliberately: it is a
heading and a list item at once, and both are doing work.

`test/score.test.js` encodes each of these definitions as a test. The scorer
shipped without any, and a cross-vendor review then found six places where it
did not measure what this table said. Change a definition here and change the
test in the same commit, or the next reader is trusting prose over behaviour.

### `signatures` ships empty, and an entry needs a baseline first

A word that one setting overuses is the most countable part of the defect the
`de-slop` skill treats. It is also the most dangerous part to ship. ADR-0021
decides where it lives: here, and never in a skill directory.

The reason is what each artefact does. A list of forbidden words delivered to
an agent teaches it to swap each word for its nearest neighbour, which leaves
the defect and cleans the surface. A scorer counts, and it tells the agent
nothing.

**An entry carries a stated reference distribution.** Naming a word is not
enough. The entry states the corpus its expected rate was measured against and
what that rate was, in ADR-0021 and in a comment beside the entry. Without a
baseline, "this setting overuses W" is a count with nothing to compare against.
That is the objection `source/craft/compressed-deliberation.md` levels at the
community reports it refuses to grade, and this metric may not earn it.

The corpus today makes the point concrete. It is a handful of task prompts
times five reps, so topic dominates any word frequency it produces.

A word leaves this file for a lint rule only after a promoted study under the
measurement design says it should. Until then the scorer counts it and the
product asserts nothing about it. A count published outside this file is a
figure like any other, so it carries a `bench-study:<study>#<result>` marker or
the word unaudited.

### Only `words` separates every arm, and that was a surprise

An earlier version of this file told you to lead with `scaffold`, on the
strength of one vivid sample that buried a real bug at item one of four under
the third heading. A cross-vendor review checked that against the collected
arms and it does not hold. Scored across six unaudited arms spanning 59 to
269 median words, `scaffold` reads zero in five of them and fires only on
the worst.

So the structural metrics are **specific and insensitive**. When `scaffold` or a
long `bullets` run fires, the sample is bad and you should read it. When they
read zero, that is not evidence the sample is fine — `green-control` scores
zero scaffold at 173 words against `green-skill`'s zero at 59, both
unaudited.

`words` is the only metric here that has separated every pair we have measured.
It is still the symptom rather than the defect, which is why the reading rule
above is not optional. The numbers tell you which sample to open. The reason a
reply is bad is always in the text.

Read every figure in this file as unaudited. The full arms behind them were
not kept, because `.gitignore` excludes the whole of `bench/out/`. A partial
subset survived on one machine, and a later pass over it put the control
median at 171, without provenance sidecars. That pass is not the same
measurement as the 173 above, so neither number corrects the other.

The store is named now, and it is `bench/samples/`. `bench/out/` stays
excluded, and a figure survives by promotion into a committed study.
`bench/samples/README.md` carries the command and the refusals, ADR-0006
records the owner's decision, and ADR-0023 records how a study is built. None
of the figures above can be promoted, because no arm behind one kept a sidecar.
They stay unaudited, and ADR-0014 retires them when the first retained study
lands.

### `echo` runs backwards, and here is the measurement

It was built to catch a reply that hands the request back before answering it.
It does the opposite. On the report scenario — unaudited, like every figure
here — the tight control scored 0.375 and the bloated arm scored 0.091,
because `echo` is a share of the reply. A short,
on-topic answer reuses the reader's own nouns and little else, so its share is
high. A long one dilutes the same reuse with new material.

It is kept because the absolute overlap is still informative and the ratio is
cheap to compute. It is not read as restatement, and a rising `echo` is not a
finding. Anyone who wants a restatement measure should count overlap in the
opening sentences alone, and should test it against a control before trusting
it, which is the same rule this file states for everything else.

## What this does not measure

Whether the reply was correct, whether it found what it should have found, or
whether the reader could act on it. Those need a person, and cutting them is how
a style metric starts rewarding empty writing. Anthropic has published one
episode in which brevity instructions reduced coding quality, recorded as `A6`
in the source file beside `compressed-deliberation`. Score `words` alongside a
correctness judgment, never instead of one.

The bench also delivers a treatment by appending it to the system prompt, while
the product installs a directory that a harness must choose to load. These
figures therefore measure injection, and never installation. Issue #43 carries
the installed-activation scenario, and it is still open. A promoted study says
so in its own manifest: it names the delivery mode, the platform, the
environment class and the installed pathway as gaps that no record carries.

Installed delivery waits on one question, and `probes/` holds the answer when
someone runs it. Can a harness see an installed skill under the flags the
control arm runs? Read `probes/README.md` before collecting an installed arm.
