---
type: adr
status: accepted
decided: 2026-08-14
issues: [99]
---

# ADR-0031 — A blockquote is a block

ADR-0016 refuses a construct the extractor does not model, and a blockquote at
column 0 was one of three it named. The reason was never the marker. The walk
read a quote's lines as the prose of the paragraph around them, so the container
and its contents merged: `> Make sure that the kit contains these parts:` over
four quoted list items reached one unit reading `> Make sure ... > > - one
gasket > - two clamps`, with the markers inside the author's sentence.

That refusal is what stopped issue #99. `references/examples.md` is a
before-and-after guide written in blockquotes, and it produced 113 units and 41
refusals, one for every quoted line. No matrix could cover it while the walk
refused the shape it is written in.

## Decision

The walk reads a blockquote as one BLOCK, from the first marker at column 0 to
the first line without one. Its unit is a designator, `[quote 8f3a2b1c]`, whose
digest names the contents, which is the disposition a table and a fenced block
already have. The exception at column 0 goes with it, because the grammar's
second form admits any construct there once the walk has a reading of it.

This is ADR-0016's rule applied forwards. That ADR asks which form the checker
reads a line as, and whether the grammar admits that form. The answer for a
quote was that the checker read it as prose and the grammar rightly refused
that. Giving it a reading a reader agrees with removes the refusal, and it adds
no rule naming the shape.

## What the digest holds and what it does not

A row over `[quote 8f3a2b1c]` says what the quote is, and the digest binds every
line inside it, so no word can change under a recorded row. What the row cannot
do is show a reader what the quote says, which is true of a table and a fenced
block too. `AGENTS.md` already answers that: a rule written as a table is still
a rule, and the row grades it whole.

Every quoted example in the shipped skill is graded as an `E` row rather than an
`N` row. The sentences inside a `Before` block are imperative — they are the
text to revise — and an `N` row over them would retire a directive from review
by calling it scenery.

## Where the quote ends

A reader ends a blockquote at a blank line and at a construct that interrupts a
paragraph. A reader CONTINUES it over a line that merely carries prose, which is
lazy continuation, and `micromark` keeps `Prose.`, `===`, an indented line and a
whole GFM table inside the quote that way.

Whether laziness applies depends on the block open INSIDE the quote, and this
walk holds no container state at all. So the block ends at the first line
without a marker, and a non-blank line there is refused as `a line directly
under a blockquote`. Doubt reads as the strict case, as it does everywhere else
in this check.

The cost is an over-refusal: a list, a fence, a thematic break and an HTML block
each end the quote for a reader whatever it holds, and the walk refuses them
anyway. The remedy is a blank line, every shipped file already has one, and
`test/gfm-render.test.js` pins the cost with the render beside it rather than
leaving it in this paragraph. A heading is the one follower the two readers
agree on with no blank line, and not because the walk decided it: the section
split takes a heading and everything under it into the next section.

A marker indented one to three columns is still a quote to a reader, and it
stays refused as `a blockquote that does not begin at column 0`. The walk claims
a construct at column 0 before it looks at an indent, which is the disposition
an indented table already has.

## The measurement

`references/examples.md` yielded 113 units and 41 refusals before, and 113 units
and no refusal after. The count is the same number because each quote already
collapsed into one merged unit. What changed is what the unit IS: a block whose
digest names the quoted lines, rather than a paragraph carrying its own markers.

The shipped catalogue is unchanged. No `SKILL.md` here writes a blockquote, so
the `checkAll` test that asserts no refusal says nothing about this path, and
the parser oracle is the only evidence either way. That blind spot is the one
ADR-0029 already records for the continuation grammar.

## What would flip it

A skill that needs the units INSIDE a quote graded separately — a quote holding
several rules, each needing its own row. The digest grades the block whole, so
that skill would be asking for container state, and the answer is ADR-0016's
flip condition rather than a rule for quotes: a real parser behind the
extractor, on issue 37.

Decided 2026-08-14. Issue #99 carries the measurement that motivated it.
