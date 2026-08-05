---
name: navigable-references
description: Use when you name a file, a document, a decision, or a discussion the reader may want to open. Symptoms are a bare filename, a label with no path, and a recalled line number.
---

# navigable-references

## Purpose

A writer who names something the reader cannot reach has moved the work of
finding it onto the reader. The writer already had the location open, and chose
a label instead. That is a writing defect, and not a gap in the tools.

No measurement stands behind this skill. `SOURCE.md` beside this file records
that, and it names where a measurement would live.

## Give the reference a form the reader can follow

- Name a thing the reader may want to open in the form the medium renders.
- Take the form from the medium you write into, and not from habit.
- Give the full form on the first mention, and the bare name after that.
- Let the reference carry the location, and do not also describe where the thing sits.

| Medium | Form | Why |
|---|---|---|
| A terminal | `path/from/root.md:line` | The terminal renders it clickable |
| A durable document | A stable identifier | A line number drifts on the next edit |
| A pull request or an issue | A Markdown link to the URL | Neither form above renders there |

The form changes with the medium, and with how long the reference has to
survive. A writer gets this wrong by picking one form and using it everywhere.
A path and a line inside a committed document is wrong within a week, and a
stable identifier in a terminal gives the reader nothing to click.

## Find the line at the moment you cite it

- Locate the line as you write the reference, and never cite one you recalled.

A recalled line is wrong after any edit above it. The reference then points at
unrelated text with full confidence. That is worse than no reference at all,
because it looks checked.

## What a check can see

A check can find a bare filename that carries no path, because that shape is
mechanical. It cannot tell you whether the path resolves, whether the line is
still the one you meant, or whether the identifier exists. Those need a reader
to follow the reference. `stylewright lint` carries no such check today, so
every rule above is yours to apply.

## How this differs from de-slop

`de-slop` treats prose that reads as machine-written, whatever produced it.
This skill treats one habit, one reference at a time, and its result is visible
without a judgment call. Either the reference resolves or it does not. Follow
both. They do not disagree.

## Boundary

This skill has no external standard behind it. Every rule in it is our own
editorial guidance, and the trace marks the rest as narrative that asserts no
rule. The trace lives in the stylewright repository at
`grounding/craft/navigable-references.md`. It is not installed with this skill.
