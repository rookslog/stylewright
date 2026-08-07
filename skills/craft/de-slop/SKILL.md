---
name: de-slop
description: Use when prose reads as machine-written, whatever produced it. Symptoms are a restated question, a triad where two items would do, a stack of qualifications, and a closing paragraph that re-says the page.
---

# de-slop

## Purpose

The defect this skill treats is a rhetorical move rather than a word, so every
rule here names a move. A move survives a model release. Whether a word does is
not settled.

## Cut the structure that performs thoroughness

- Cut the item that exists to make a pair into a triad.
- Cut a clause that adds a frame and no second idea.
- Do not announce a structure that the text then supplies anyway.
- Do not announce that a point is important. Show why it is, or cut it.

A frame with no second idea reads like this. "Not just a parser bug but a
design problem" promises two findings and delivers one, because the design
problem named is the parser bug under another name.

## Commit to the claim, or lower it

- Name the actor of every claim.
- Keep a claim and its evidence in one paragraph, or lower the claim.
- Cut a qualification that would not change what the reader does.
- Raise an objection only where the objection is real.

An invented counterposition gives an answer the shape of an argument without
the substance of one. The reader then spends attention on a position that
nobody holds.

## Open on the answer, and close when it is delivered

- Do not open the answer by restating the question.
- Do not close with a paragraph that re-says what the reader has just read.
- Delete a sentence that survives its own deletion.

The last rule is the one to reach for when the others do not fire. Remove the
sentence, read the paragraph again, and keep the sentence only if something
changed.

## Compression has a cost, so name it

- Cut a sentence for what it fails to carry, and never to reach a length.
- Keep a finding that a shorter answer would have dropped.

Anthropic reported in April 2026 that a system instruction imposing strict
brevity in Claude Code reduced coding quality, and reverted it. That is a
first-party report of compression paid for in correctness. It is why no rule
above sets a word budget, and why every rule above names a move instead.

## No rule here matches a word

No rule here is enforced by matching a word, and this skill ships no word list.

A word that one setting overuses is countable, and that makes it tempting to
ship. Two things argue against carrying it in a skill. A list of forbidden
words teaches an agent to swap each one for its nearest neighbour, which leaves
the defect and cleans the surface. A word may also recur in a setting rather
than in a model, which is the live reading here rather than a finding. On that
reading a shipped list dates faster than the moves above.

Counting belongs in `bench/score.mjs` in the stylewright repository, where a
scorer counts and asserts nothing. A word becomes a rule in a skill only after
a promoted study says it should.

## What stands behind these rules

Nothing measured. A craft rule has no standard behind it, so measurement is the
only evidence it can ever have, and no arm has been run for this skill.

Read every rule here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary say that this skill
works.

## How this differs from the other skills here

`plain-language` and `simplified-technical-english` each distil a published
standard, and each writes for a named reader. This skill has no standard and no
named reader.

The disagreement is about repetition. Both standards ask a writer to repeat, in
a summary, in a heading, or in one term used for one thing. This skill tells a
writer to cut a closing that re-says the page. A procedure and a safety notice
repeat on purpose, so the standard wins there and this skill yields.

`compressed-deliberation` treats one model's documented defaults, and it
expires when that model does. This skill carries no model pin and no expiry,
because a rhetorical move outlives any one build. Follow both.

## Boundary

This skill has no external standard behind it. Every rule in it is our own
editorial guidance, and the trace marks the rest as narrative that asserts no
rule. The trace lives in the stylewright repository at
`grounding/craft/de-slop.md`. It is not installed with this skill.
