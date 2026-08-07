---
type: adr
status: accepted
decided: 2026-08-06
issues: [1, 21, 43]
---

# ADR-0021 — De-slop carries mechanisms, and signatures live in the scorer

The `de-slop` skill is the one this repository is named for, and it is the one
with no source behind it. Its rules carry our authority alone, so the shape of
the skill is the decision and not the wording of any single rule.

The word "slop" names three things, and they age at three different rates.

**Mechanisms.** Filler that defers the content. Structure that performs
thoroughness. A triad where two items would do. A "not just X but Y" frame that
buys a second clause with no second idea. Stacked hedges. Restating the
question as the opening of the answer. A closing paragraph that re-says what
the reader just read. These come from pressures every current model trains
under, so they survive a model release.

**Signatures.** Words and short phrases that recur in one setting and not
another. These are the most countable part of slop, which is why they are the
most tempting to ship and the most dangerous to bake in.

**The setting that produces them.** The first `compressed-deliberation`
baseline found a clean control across all fifteen runs, unaudited. That moved the
investigation off the model and onto the instruction stack above it, and
`bench/README.md` records it under its rule to always run the control. So a
signature is not known to be a property of a model. On the evidence this
repository holds, the instruction stack is the live hypothesis.

**Decision.** The skill carries mechanisms only. Every rule in it names a
structural or commitment defect, and no rule in it is enforced by matching a
word. A rule may quote a phrase to illustrate the move it names. It may not
ship a list that a checker matches.

**The body is a positive recipe.** The owner ruled this on issue #1 and it is
recorded here. The skill states a shape a writer works toward, and the named
defects sit beside it as departures from that shape.

The ruling turns on a conditional the earlier reading had flattened. Match the
form to the failure. De-slop treats wrong-shaped output, which takes a recipe.
Discipline under pressure takes a prohibition with the rationalisation it
answers, and `proportionate-execution` is the skill that carries that kind.
Forcing one form onto two failure types is the error the ruling corrects.

The cost travels with the choice, and the owner named it. A recipe constrains
the skeleton and says nothing about the filler, and nothing can check whether a
recipe was followed. So the departures stay in the skill, where a named failure
is still visible, and the check layer stays where this ADR already puts it.

No signature dictionary ships anywhere under `skills/`. The ban covers a list
assembled from what a model or an instruction stack was observed to overuse.
Such a list traces to a setting and to nothing else. It does not cover a
controlled vocabulary whose word pairs trace to a published standard. Those
stay governed by the three conditions in `AGENTS.md` and by their own licence
gate, and issue #19 carries the case.

The signature layer re-homes to the bench, as a `signatures` metric in
`bench/score.mjs`. That file already
owns this shape in its `HEDGE` and `MENU` lists, it sits outside every install
pathway, its change discipline is stated in `bench/README.md`, and
`test/score.test.js` encodes each definition. The metric starts empty by
construction.

**An entry carries a stated reference distribution.** The owner added this rule
when the decision was adopted. An entry names the corpus its expected rate was
measured against, and what that rate was, in this ADR and in a comment at the
metric. A frequency count with no denominator reads as evidence and is not
evidence. The corpus today is a handful of task prompts times five reps, so
topic dominates. That is the objection `compressed-deliberation/SOURCE.md`
levels at the community reports it refuses to grade, and this metric may not
earn the same one.

No entry exists yet, so this ADR records no distribution. The first entry
amends this section rather than recording its baseline somewhere else.

The shape of an entry is future work, and this ADR does not settle it. A bare
string in a list has nowhere to hold a corpus name, an expected rate, and the
study that produced them. The first entry therefore arrives with a shape
proposal, and the rule above is what that proposal has to satisfy.

A word becomes a lint rule only after it clears a promoted study under the
measurement design, section 5. Until then it is something the scorer counts,
and nothing the product asserts.

Provenance for a signature observation is the measurement design's existing
provenance. That is the platform, the environment class, and the committed
stack digest where the class is a representative stack. No new field is minted
for this. The variable that the fifteen-run clean control implicates is already
a first-class field, and a parallel one would record the same thing worse.

**The boundary with `compressed-deliberation`.** That skill is the model-pinned
lane, and it expires when the model it documents does. `de-slop` never grows a
model-named layer. The owner settled this on issue #1: a skill called
`de-slop-opus-5` "would date exactly as fast as a banned-word list, and for the
same reason", and the durable object is the rhetorical move. This ADR keeps
that split intact rather than reopening it under the word "dictionary".

## Consequences

The mechanisms are what the current scorer cannot see. The structural metrics
are specific and insensitive, `scaffold` reads zero in five of six arms, and
`words` is the only metric that has separated every pair measured. Those
figures are unaudited, and `bench/README.md` records them that way.

So `de-slop` ships unmeasured. That is the plan here, and not an accident.
ADR-0005 already holds that no craft rule claims measured effect until it is
measured. The skill says so in its own text and in its `SOURCE.md`. Landing
structural metrics first would hold the skill on work nobody has scheduled.

Issue #1 carried a block, and it is lifted here. It read "None of it ships
without the efficacy test in #21", and #21 is the efficacy test this skill has
not had.

The successor condition is ADR-0005's guard, which is narrower and enforceable
today. No rule here claims a measured effect. The skill says so in its own
text, `SOURCE.md` says so, and the matrix says so, so nothing ships that #21
would have to underwrite.

That lifts the block on shipping and it lifts nothing else. Issue #21 remains
the bar for ever claiming that this skill works. A study clears it, and no
amount of the skill being reasonable does. Read the two halves together or
neither holds.

`v0.3.0` therefore ships mechanism rules with no word list of any kind and no
new lint machinery. `stylewright lint` gains nothing, its exit code keeps one
tier, and this repository's own prose acquires no new build-stopper.

The signature work becomes bench work. It produces studies, and a study either
promotes a word to a rule or it does not. Nothing on disk is promotable today,
because `bench/samples/` holds only a README and `bench/out/` is not committed.
The lane waits on the retention mechanism that issue #43 carries.

A published signature count is a figure. ADR-0009's numeral check covers
`bench/README.md` alone, so a count quoted anywhere else carries a
`bench-study:<study>#<result>` marker or the word unaudited, as every other
figure does. Settling that now costs a sentence and settling it later costs an
argument.

The skill carries one worked example of the line between naming a move and
matching a pattern. A reviewer would otherwise ask whether a rule naming "not
just X but Y" has shipped a pattern. The distinction that holds is that the
skill names the move and the scorer holds the list.

## The alternative considered

Ship the word list with the skill, versioned and dated. It loses on four
counts.

It needs a dictionary format, a loader, rule-set scoping and a severity tier
that `src/lint.js` and `src/cli.js` do not have. The decision would not be
naming any of that as scope.

Its promised independent cadence is not deliverable. Install copies a skill
directory whole, and it skips the entire skill when one recorded file is
locally modified. A word list is the file a user is most likely to edit.

It would be the first ungraded prohibition list in the skill this repository
holds up as its grounding model.

And it delivers to an agent the one artefact that teaches the wrong lesson.
Given a list of forbidden words, an agent swaps each for its nearest neighbour
and produces the same defects with a cleaner surface. A scorer counts. It never
tells the agent anything.

Decided on issue #1 (2026-08-06).
