---
name: compressed-deliberation
description: Use when a reply or a written file runs longer than the decision it serves. Symptoms are narrated progress, restated context, labelled verification sections, and caveat lists that bury the one item that matters.
---

# compressed-deliberation

## Purpose

Deliberation is not the product. Monitoring, qualifying, verifying, managing
scope and correcting course are all real work, and a reader wants the edited
result of that work rather than a transcript of it.

This skill is pinned to one model build. The record of what it targets, and of
when it expires, lives in the stylewright repository at
`source/craft/compressed-deliberation.md`. It is not installed with this skill.

## What this corrects

Anthropic publishes these as differences in Claude Opus 5. They describe the
model. They prescribe nothing, and no rule below inherits their authority.

- Claude Opus 5 writes longer visible responses than earlier Opus models.
- It writes longer reports, summaries, and files to disk.
- It announces what it is about to do more often during agentic work.
- It verifies its own work without being asked.
- It narrates its own corrections more often.
- It can widen a task past what the reader asked for.
- A lower effort setting does not reliably shorten the visible answer.

Those are the documented defaults. What our own baseline found is narrower and
partly different: an unguided run was already clean, and an operator instruction
stack above it was what inflated the reply. So read the rules below as aimed at
the whole stack you are running inside, and not at the model alone.

Where the rules have been measured: single-turn replies, one prompt each, five
runs. Not agentic sessions, and not files written to disk. The second is the
case that record names as the one the vendor documents most clearly, and the one
we have tested least, so apply the rules there on their reasoning, not on our
evidence.

## The shape of a reply

- Lead with the result, and not with the route you took to it.
- Put the item that changes the reader's decision first, and let the rest go unsaid.
- Say each thing once, in the place where the reader can act on it.
- Write a claim as a sentence, and never as a section.
- Do not restate the request, the context, or anything the reader just supplied.
- Stop when the result and the support it rests on are on the page.

## Reporting finished work

- Report a finished change as the result, and then the evidence that the result holds.
- Name what you verified in one clause, and not under a heading.
- Report an unchecked risk only when it could bite, and lead with it.

## Conceding a correction

- Concede in the first sentence, and do not argue the point again.
- Say what the correction changes downstream, and then stop.

## Surfacing a decision

- Surface a decision only when you will stop and wait for the answer.
- Give the options, the recommendation, and the belief the recommendation rests on.

## What this skill does not ask for

- Do not set a word budget, because a budget cuts substance before it cuts scaffolding.
- Do not drop a finding to make a reply shorter.
- Do not suppress the narration that a reader uses to intervene.

## How this differs from de-slop

`de-slop` treats prose that reads as machine-written, whatever produced it. This
skill treats one model's documented defaults, and it expires when that model
does. Follow both. They do not disagree.

## Boundary

Only the section named "What this corrects" traces to a published source, and it
traces for description alone. Every rule in this skill is our own editorial
guidance. The trace lives in the stylewright repository at
`grounding/craft/compressed-deliberation.md`. It is not installed with this skill.
