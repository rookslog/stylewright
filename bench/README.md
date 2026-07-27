# bench — measuring what a style skill actually does

A prescription in a craft skill is an `E` row. It has no standard behind it, so
measurement is the only evidence it can ever have. This directory holds the
protocol that produces that evidence.

It has two halves, and neither one substitutes for the other. The bench half is
reproducible and artificial. The field half is real and uncontrolled.

## Half one, the bench

Fixed scenarios, fresh context, several runs each, one variable at a time.

```
bench/run.sh control                       # no guidance at all
bench/run.sh with-skill --system skills/craft/compressed-deliberation/SKILL.md
node bench/score.mjs bench/out/control/report-*.txt --prompt bench/prompts/report.txt
```

Four rules make the result mean something.

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

**Change one thing per arm.** An arm is a configuration, not a hypothesis. Name
it for what it holds.

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

Add a scenario by dropping a `.txt` file in `prompts/`. Keep one position per
file, and keep the reader's own words in it, because the echo measure below
compares the reply against the prompt.

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

`node bench/score.mjs [--prompt FILE] SAMPLE...` prints one row per sample and a
median row.

| Metric | What it counts | Read it as |
|---|---|---|
| `words` | Visible words. | The symptom, not the defect. Never the target on its own. |
| `scaffold` | Headings, and standalone bold labels that act as headings. | The defect. Structure the reader did not ask for. |
| `bullets`, `longestList` | Bullets in total, and the longest single run. | A long run means items of unequal weight presented as equals. |
| `hedges` | Phrases that flag something unverified. | One is often load-bearing. Four means the load-bearing one is buried. |
| `menus` | Offers of a choice the reader did not request. | Each one is a decision handed back rather than made. |
| `echo` | Share of the reply's word pairs that appear in the prompt. | See the warning below. Not a restatement measure. |

`scaffold` leads the table on purpose. In the baseline, length followed
structure rather than the other way round, and the worst sample was not the
longest one. It was the one that put a real bug at item one of four, under the
third heading.

### `echo` runs backwards, and here is the measurement

It was built to catch a reply that hands the request back before answering it.
It does the opposite. On the report scenario the tight control scored 0.375 and
the bloated arm scored 0.091, because `echo` is a share of the reply. A short,
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
