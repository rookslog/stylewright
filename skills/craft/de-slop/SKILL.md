---
name: de-slop
description: Use when prose reads as machine-written, whatever produced it. Symptoms are a restated question, a triad where two items would do, a stack of qualifications, and a closing that re-says the page.
---

# de-slop

## Purpose

The defect this skill treats is a rhetorical move rather than a word, so this
skill gives a shape to write toward rather than a vocabulary to avoid. A move
survives a model release. Whether a word does is not settled.

## The shape of a finished passage

- Open on the thing itself, so the first sentence carries the result.
- Give each sentence one idea that the passage needs.
- Name the actor of a claim, and hold the claim at the strength its evidence carries.
- Let the structure follow the content, so a list appears where the items are parallel.
- End at the last sentence that carries weight.

A passage with all five is finished, whatever else could be said about it.

## What a departure looks like

Read these to recognise a shape you are already in, and not as a list to check
against.

- **The opening.** A passage that restates the question has spent its first sentence on words the reader wrote.
- **One idea.** A triad where two items would do buys a clause and adds no idea. So does a "not just X but Y" frame whose Y restates X. "Not just a parser bug but a design problem" promises two findings and delivers one.
- **The claim.** An invented counterposition gives an answer the shape of an argument without the substance of one. A stack of qualifications buries the one that would change what the reader does. A passive verb with no actor leaves nobody holding the claim.
- **Earned structure.** A heading over two sentences, and a sentence announcing that a point is important, each perform a thoroughness the content has not reached.
- **The end.** A closing paragraph that re-says the page gives the reader a second reading of the first.

Remove the sentence, read the passage again, and keep the sentence only if
something changed.

## Compression has a cost, so name it

The shape above is not a shorter passage. It is a passage whose length is its
content.

Anthropic reported in April 2026 that a system instruction imposing strict
brevity in Claude Code reduced coding quality, and reverted it. That is a
first-party report of compression paid for in correctness. So the shape above
sets no length, and a finding that a shorter passage would have dropped stays
in.

## No part of this matches a word

This skill ships no word list. A list of forbidden words teaches an agent to
swap each one for its nearest neighbour, which leaves the defect and cleans the
surface.

## What a check can see

Nothing here, today. `stylewright lint` carries no check for any part of the
shape above, because a triad, a restatement and an invented objection are
judgments about content rather than shapes a program recognises.

## How this differs from the other skills here

`plain-language` and `simplified-technical-english` each distil a published
standard and write for a named reader. This skill does neither, and the
disagreement is about repetition. Both standards ask a writer to repeat, in a
summary, in a heading, or in one term used for one thing. This skill ends a
passage at its last load-bearing sentence. A procedure and a safety notice
repeat on purpose, so the standard wins there and this skill yields.

`compressed-deliberation` treats one model's documented defaults, and it
expires when that model does. `proportionate-execution` governs a session, so
it holds what an agent does as well as what it writes. This skill treats one
passage of prose, whatever produced it, and it carries no model pin. Follow all
three. They do not disagree.

## Boundary

This skill has no external standard behind it, and no arm has been run for it.
Every rule in it is our own editorial guidance, and measurement is the only
evidence a craft rule can ever have. The trace marks the rest as narrative that
asserts no rule. It lives in the stylewright repository at
`grounding/craft/de-slop.md`, and it is not installed with this skill.

Read the shape here as discipline that we assert. Do not read any of it as an
effect that we observed, and do not let a later summary say that this skill
works.
