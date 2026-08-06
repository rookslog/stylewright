---
type: adr
status: accepted
decided: 2026-08-06
issues: [37]
---

# ADR-0016 — The extractor refuses what it cannot model

The grounding extractor reads Markdown one line at a time and holds no
stack of open containers. A heading, a list item, a fence or a table
nested inside a blockquote or under an indent is read as the wrong unit,
and a matrix written over that reading disposes of something the skill
does not say. Five review rounds on #33 each found a fresh shape and each
patched that shape alone. Round 5 returned four more. The instance was
never the defect.

Two designs close the class. A CommonMark parser behind the extractor
models containers, and every shape resolves at once. It adds a runtime
dependency to a package that has none, and the Node floor in `engines`
constrains which one. A canonical-form guard refuses a construct the
extractor does not model and names the line that carries it.

**Decision.** `ground --check` refuses what the extractor does not model.
The subset it reads is every construct written at column 0, a wrapped
continuation line, and an indented code block that stands on its own.
Anything else — a blockquote, an indented fence opener, a heading that
does not begin at column 0, a nested list item, a construct indented
under a list item — fails as `unmodelled-construct`, with the line
number and what to write instead. Refusing does not narrow what the
check sees. Every unit the extractor found before it still finds, and a
refusal is one more finding rather than a replacement for one.

**Amended 2026-08-06, on evidence.** The guard shipped as a list of the
shapes to reject, and three review rounds each found a shape the list
did not name: a child paragraph indented two spaces, a setext heading
the section split consumed, an empty list marker, a blockquoted table
row, a table indented three spaces, an empty heading. Every one was a
real hole, and each fix was a rule the next round walked around. A
rejection list is only as complete as its last review, and the shape it
misses passes in silence, which is the failure mode this ADR exists to
end.

So the test runs the other way. The check states the forms it READS and
refuses every line outside them. Those forms are a blank line, any
construct at column 0 other than a blockquote or an empty marker or an
empty heading, a line that continues the paragraph above it while
carrying prose, and an indented code block that stands on its own with
no list above it. A shape nobody has thought of is refused because it is
not among them, and not because a rule names it. That is the difference
that closes the class, and a test over an unenumerated shape is what
holds it.

**Consequences.** The narrowness sits at the point of use rather than in
a review round, which is the rule this repository sells about a check
never being narrower than the claim it enforces. The package adds
nothing to the dependency set it already declares, and that set stays at
one prompt library that the command line injects. The cost falls on the
author of a skill, who writes in the subset, and the shipped skills
already sit inside it.

This rests on one belief. The skills this repository ships, and the ones
its scaffold generates, stay inside that subset. A real skill that needs
a blockquoted list or a nested container to say what it means turns the
guard into an obstacle rather than a warning, and the parser becomes the
better answer. A refusal that a skill author cannot write around is the
evidence that flips this decision, and it reopens #37 rather than adding
a sixth patch.

A test runs `checkAll` over the shipped catalogue and asserts no
refusal, so the belief is measured on every run rather than held. It
caught the first draft of the grammar reading `017966390.`, a trademark
number that ends a paragraph in the ASD skill, as an empty list marker.
That was a fault in the grammar and not a cost of the design, and the
fix was to read an ordered marker as a Markdown reader does. A refusal
that survives such a fix is the flip, and this one did not.

Decided 2026-08-06. Issue 37 states the four shapes and the choice.
