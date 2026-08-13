---
type: adr
status: accepted
decided: 2026-08-13
issues: [69, 70]
---

# ADR-0029 — A continuation line states what it may begin with

ADR-0016 turned the extractor's grammar the right way round. The check states
the forms it reads and refuses every line outside them, so a shape nobody has
thought of fails because it is not among them.

The inversion reached one of the two paths. A line that BEGINS a block meets
the stated forms. A line that CONTINUES one was admitted whenever prose was
open, and the check then asked `shapeOf` what the line looked like. `shapeOf`
names five constructs and calls everything else a paragraph, so the
continuation path was a rejection list under a positive heading. An HTML block,
an HTML comment and a setext underline each reached a list item as the item's
own words, and `ground --check` reported clean. Issue 69 states it, and a
matrix row then disposed of a container and a directive together.

One pipe made it worse. `shapeOf` calls any line carrying a pipe a table row,
and the continuation path admitted every table row, so a single pipe anywhere
in a line licensed whatever else that line opened.

**Decision.** A continuation line states what it may BEGIN with. It carries the
prose of the line above it when its first character is a letter, a digit, or
ordinary sentence punctuation, and it is refused otherwise. A digit with a
marker's punctuation after it is a list marker rather than prose, and it is
refused where a reader would let that list interrupt.

The refusal names the line and says what the check cannot say: which container
the line opens. A lead character does not carry that, and guessing would put a
name on the reader's page that nothing checked.

`<` is the one character this loses something real on. `<script>` opens an HTML
block and interrupts the paragraph. `<span>` opens nothing, because a reader
does not let that kind interrupt one. A lead character cannot separate them
without the container state this check holds none of, and doubt reads as the
strict case everywhere else here, so both are refused. `-`, `*`, `_`, a
backtick, `~`, `=`, `+`, `#` and `|` are refused for the same reason one step
down: each opens a container under one reading of the rest of the line, and
emphasis or a code span or plain prose under another.

**What this does not reach.** A line at column 0 is admitted by the second form
of the grammar, which ADR-0016 states as any construct written at column 0.
That form admits an unknown container there as well: `Prose here.` over
`<script>` is one unit and no refusal, exactly as the indented case was. This
decision does not touch it, because inverting that form is a different change
with a different blast radius — it governs every line at column 0 and not only
the ones under open prose. Issue 111 carries it, with the shapes measured here.

**Two claims the parser corrected.** ADR-0028 holds that a claim about how
Markdown renders answers to a renderer rather than to a reading of the
specification. The grammar's claims about what interrupts a paragraph are that
kind of claim, so `test/gfm-render.test.js` now puts each shape through
`micromark` and asks. It corrected two on the day this was written. An
underline under a list item makes a setext HEADING inside the item, and not the
thematic break the first draft's comment named. And an ordered marker indented
under an item can be the list's next item rather than the lazy continuation the
first draft admitted, because a reader resolves the two by the width of the
open marker. The check holds no such state, so it refuses there.

One doubt stays open. `micromark` keeps `01. item` inside the paragraph above
it, and whether every reader does is unchecked here. The check takes the
reading that OPENS a list, because the two failures are not equal: a unit
somebody grounds twice costs a row, and a unit no row disposes of is the defect
this whole grammar exists to stop.

**Three shapes from issue 70 land under the same rule**, rather than under a
rule apiece, which is what ADR-0016 asks of a new shape. A marker padded five
columns holds an indented code block, so the padding is measured in columns and
the item is refused. An ordered marker that cannot interrupt a paragraph opens
no list, in the walk and in the grammar together, because they answered that
question differently and the grammar refused the marker the walk had just read
as prose. And a setext underline is validated with the shared column rule, so a
tab-indented one is no underline and makes no anchor.

**Consequences.** The cost falls on an author, who writes a continuation line
that begins with a word. It is writable around, and ADR-0016's flip condition
governs here too: a refusal a skill author cannot write around reopens issue 37
for a parser, and it is not another patch.

The shipped catalogue measures nothing about this rule. No skill here writes an
indented line at all, so the test that runs `checkAll` and asserts no refusal
cannot see over-refusal on this path. The parser oracle is what replaces it,
and it is the only evidence that the grammar admits the prose a reader admits.
AGENTS.md records that blind spot beside the others.

Decided 2026-08-13. Issues 69 and 70 state the shapes and the reproductions.
