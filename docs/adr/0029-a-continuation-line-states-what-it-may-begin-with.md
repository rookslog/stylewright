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
strict case everywhere else here, so both are refused. `-`, `*`, `_`, `=`, `+`,
`#` and `|` are refused for the same reason one step down: each opens a
container under one reading of the rest of the line, and emphasis or plain
prose under another.

**A backtick and a tilde are admitted, and they are the line this draws.** A
fenced block is the only block either character opens, it needs three of them,
and the walk already tests every line for one. So the grammar asks that test
rather than stating a second reading of the character, and admitting the lead
adds no claim at all. Fewer than three is a code span, which is inline.

That is the stopping rule, and it is why `*`, `=`, `#` and `-` stay refused
even though each has a reading that could be written. Admitting one of those
means writing a NEW test for a thematic break, an ATX heading or a setext
underline, and a test written for this rule is a claim this rule now carries.
`-` is the clearest case: an underline under a list item makes a setext heading
INSIDE that item, which is a container a dash lead cannot be cleared of.

**The cost is measured, not imagined.** A first version refused the backtick
too, on the reasoning that the cost was a false refusal for a character nobody
thought of. Across 574 unique `SKILL.md` files on one machine that version
added 223 refusals in 113 files and dropped none, and NONE of the 223 opened a
block: each was rendered twice, once as written and once with the lead changed
and every other byte held, and the block-level tag sequence was identical every
time. 166 of the 223 were a wrapped line beginning with a code span, which is
this repository's own register. A rule that fires 223 times and is right zero
times is not a long tail, and `unmodelled-construct` is an error rather than a
warning.

Reusing the fence test leaves 55, in 24 files, still none of them opening a
block: 34 begin with `<`, 15 with `*`, five with `=` and one with `#`. The
largest share is the character this decision argues for by name. That residue
is the accepted cost, and it is stated here so the next reader weighs the
measured number rather than this decision's first guess at it.

**What this does not reach.** A line at column 0 is admitted by the second form
of the grammar, which ADR-0016 states as any construct written at column 0.
That form admits an unknown container there as well: `Prose here.` over
`<script>` is one unit and no refusal, exactly as the indented case was. This
decision does not touch it, because inverting that form is a different change
with a different blast radius — it governs every line at column 0 and not only
the ones under open prose. Issue 111 carries it, with the shapes measured here.

It reaches none of the matrix reader either. Issue 115 reports a matrix row
without a leading pipe passing every gate at once, and issues 116 and 117
report the constructs the skill walk still reads differently from a reader.
None of those is this decision's, and each is on `main` unchanged.

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

**How the oracle must be read.** A tight list drops the `<p>` around an item's
paragraph, so the render of `- Context.` over `  <script>` is byte-identical
whether the HTML interrupted that paragraph or sits in it as inline markup.
Reading that render as evidence of either is the mistake, and a review round
made it in both directions at once. A second item makes the list loose, the
paragraphs get their tags back, and `<p>Context.</p>` standing beside the
`<script>` block is the interruption itself. `micromark` and pandoc 3.10 both
render it that way, and both keep `- Context.` over `  plain words` inside one
`<p>`. So the claim that an HTML block interrupts the item stands, and the test
asserts the item's own content rather than a substring of the whole page.

**`01.` is settled, against the oracle.** pandoc 3.10 lets `01. item`
interrupt the paragraph above it, and the CommonMark rule it implements is that
an interrupting list must start at 1, which `01.` does. `micromark` is the
outlier and keeps the line in the paragraph. The check follows pandoc and
splits, which is also the safer direction: a unit somebody grounds twice costs
a row, and a unit no row disposes of is the defect this whole grammar exists to
stop. The disagreement is pinned by a test rather than left in this paragraph,
so an upgrade that moves it fails rather than passing in silence.

**Three shapes from issue 70 land under the same rule**, rather than under a
rule apiece, which is what ADR-0016 asks of a new shape. A marker padded five
columns holds an indented code block, so the padding is measured in columns and
the item is refused. An ordered marker that cannot interrupt a paragraph opens
no list, in the walk and in the grammar together, because they answered that
question differently and the grammar refused the marker the walk had just read
as prose. And a setext underline is validated with the shared column rule, so a
tab-indented one is no underline and makes no anchor.

**Consequences.** The cost falls on an author, who writes a continuation line
that begins with a word. Every refusal measured above is writable around by
reflowing the line, so ADR-0016's flip condition is NOT met and this reopens
nothing. That condition still governs: a refusal a skill author cannot write
around reopens issue 37 for a parser, and it is not another patch. The measured
count is the thing to watch instead, because a rule that is wrong 55 times out
of 55 is a nuisance an author learns to route around rather than a check they
trust.

The shipped catalogue measures nothing about this rule. No skill here writes an
indented line at all, so the test that runs `checkAll` and asserts no refusal
cannot see over-refusal on this path. The parser oracle is what replaces it,
and it is the only evidence that the grammar admits the prose a reader admits.
AGENTS.md records that blind spot beside the others.

Decided 2026-08-13. Issues 69 and 70 state the shapes and the reproductions.
