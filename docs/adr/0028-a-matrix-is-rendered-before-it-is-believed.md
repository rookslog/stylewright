---
type: adr
status: accepted
decided: 2026-08-12
issues: [76]
---

# ADR-0028 — A matrix is rendered before a claim about it is believed

Every claim this repository makes about how a grounding matrix renders was
read from the GFM specification and written into a comment. A blank line ends
a table. A short delimiter stops the block being a table at all. GFM drops the
cell past the last heading. Those claims hold up a design, because the rendered
column is the one that counts, and a check that reads a column no reader sees
reports on a file nobody has.

Nothing tested them. The contiguity hole survived three review rounds and an
eleven-attack harness on pull request #71, and every one of those attacks came
out of the same reading of the specification that missed it. A reviewer cannot
audit a comment against a renderer they never ran.

**Decision.** The test suite renders a matrix through a real GFM parser and
compares what a reader sees against what the checker read. `micromark` and
`micromark-extension-gfm-table` join `devDependencies`, and no module under
`src/` or `bin/` may import either. A test asserts that separation, so the
package keeps declaring one runtime dependency.

The comparison is structural. A rendered cell arrives as HTML, so the raw text
a row carries is not recoverable from it. What a reader sees is: how many
tables, which headings, how many rows, how many cells, and the identifier that
opens each row. That is what the design's own claim needs.

Two rules carry the shapes, rather than a verdict written out for each. A
matrix a reader sees damaged is called broken, whatever the damage, and both
counts are withheld. And wherever a table stands to a reader, the checker reads
no row that reader does not see. A shape nobody has thought of is covered
because the render decides, and not because a list names the shape. ADR-0016
states why this repository writes a test that way round.

**Why a dependency here and not in ADR-0016.** ADR-0016 turned down a
CommonMark parser for the skill extractor. That parser would have been a
RUNTIME dependency, shipped to every user, and it would have replaced a check
rather than measured one. This one ships to nobody and replaces nothing. It is
an oracle the tests hold the checker against, and the checker keeps reading
Markdown a line at a time.

`micromark` implements the dialect GitHub renders, which the specification's
own table extension defines, and neither package nor any of its transitive
dependencies declares a Node floor above the `20.11.0` in `engines`. `marked`
was the other candidate. It is one package rather than forty, and its GFM
table handling is its own rather than the reference implementation's, which is
the property that decides this: an oracle asserting the wrong grammar is worse
than no oracle.

**Consequences.** The parser corrected two claims on the day it landed. A line
of prose under a table does not end the table, because GFM reads it as another
row, so the checker is stricter there than a reader is. And renaming a heading
does not drop the rendered column, as a comment beside `readMatrix` said it
did. It renders under the new name, and the record is lost because `Notes` is
not the column an audit lives in. Both corrections are in the code and in
AGENTS.md.

The cost is forty development packages and a slower `npm ci`. The flip
condition is a divergence between this parser and GitHub itself. A matrix that
renders one way here and another way on a pull request page makes the oracle
the thing to fix, and the answer then is a different parser rather than a
comment explaining the difference.

Decided 2026-08-12. Issue 76 states the gap and what a first version asserts.
