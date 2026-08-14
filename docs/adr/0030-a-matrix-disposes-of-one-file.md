---
type: adr
status: accepted
decided: 2026-08-14
issues: [99]
---

# ADR-0030 — A matrix disposes of one file

ADR-0025 settled that a skill directory ships only what something governs, and
it left one entry owed. `references/` is context that `SKILL.md` routes a writer
into while the writer works, so the answer to it is to grade it rather than to
evict it. Nothing graded it. `ground --check` opened `SKILL.md` by name and no
other file, so the two files under
`skills/standards/simplified-technical-english/references/` reached a user on
every install pathway with no row disposing of a line in either. One of them
carries a table of topic labels against real `Rule N.N` identifiers, which are
claims about the source that no `G` row anywhere answered for. Issue #99 states
it, and ADR-0025 printed a count in the meantime.

## Decision

A matrix disposes of ONE file. `ground --check` reads `SKILL.md` and every
Markdown file under `references/`, each against its own matrix.

The matrix for `SKILL.md` stays at `grounding/<tier>/<skill>.md`. The matrix for
any other graded file mirrors that file's own path, under a directory named for
the skill:

```
skills/standards/simplified-technical-english/references/examples.md
grounding/standards/simplified-technical-english/references/examples.md
```

A graded file with no matrix is an error, and so is a matrix under that
directory that grades no file the skill ships.

## Which file a row belongs to

The row space is what decides this, and it is the question issue #99 asks first.
`Our anchor` names a heading. Two files in one skill can carry the same heading,
and the skill's own `references/examples.md` carries `Contents` and `Procedure`
while `SKILL.md` carries `Purpose` and `Priorities`. A shared row space over two
files lets a row claim an occurrence in the file it was not written for, and the
check passes: the text matches, the anchor matches, and nothing else in the row
says which file the author meant.

Three answers were open.

**An eighth column naming the file.** The header and the delimiter carry seven
columns, every heading is checked by name, and an eighth cell is refused because
GFM drops it. Adding one is a change to every matrix, every row, and the render
contract, and it leaves the row space shared while making the file a cell a
typing mistake can move.

**A qualified anchor**, such as `references/examples.md § Contents`. The anchor
is compared against the heading the walk read, so this makes the comparison
parse a path out of a cell, and a row that omits the prefix silently reads as
the skill's own file.

**One matrix per file**, which is this decision. The file identity moves out of
the row and into the matrix's own path, where a filesystem holds it rather than
a cell. No column changes, no digest moves, and no recorded audit is touched.
The `Quotation` declaration and the `Source version` pin are per matrix already,
so each graded file declares what it may quote and which reading its audits
answer to, which is the honest shape when a reference file could answer to a
different edition than the skill.

`SKILL.md` keeps its path because every document, test, release and published
command names it, and moving six files buys symmetry and costs a migration that
answers no defect. The mapping lives in `matrixPathFor` in `src/catalog.js`, and
it is the one place that knows the layout.

## What the checker reads

`checkAll` walked the skill directory already, to refuse a file nothing governs.
It now grades every file that walk returns which `isGraded` names, and each
finding carries the file it came from. The command prints that file beside the
skill, because an anchor is a heading and two files in one skill can produce the
same line.

`references/` holds Markdown. A matrix disposes of the units a Markdown walk
reads, and the walk reads nothing else, so a file of another kind there is
refused by name. This is ADR-0025's allowlist one level down: the directory says
what may ship, and this says what may stand inside it.

## The count was a note, and it is an error now

ADR-0025 printed how many files under `references/` no row disposed of, as a
note that failed nothing, and it said not to promote the count to an error and
not to remove it. Both instructions carried the same reason: nothing could grade
those files, so an error would fail every release until #99 landed. This is #99.

The condition the note reported is now an error, per file, with the path of the
matrix to write. That is the opposite of quieting the output. A green run over a
file nobody has graded was the gap the number existed to report, and the gap is
closed by refusing rather than by counting. ADR-0025 is amended to say so.

## What this does not claim

Every row these matrices add starts `unaudited` and `unquoted`. Six `G` rows
across the two files cite a rule, and nobody has read one of them against the
standard. The matrices declare `**Quotation:** forbidden` for the reason the
skill's own matrix does, so no rule text moves into a cell.

Grading a claim does not check it. It records what the claim is, so a person can
read it against the source and stamp what they read. That is what the two files
had none of.

## What would flip it

Evidence that no installed user reads `references/`. ADR-0025 states this the
same way: the argument for keeping those files is that `SKILL.md` routes a
writer into them, and if that routing is dead weight then eviction is simpler
than grading. The matrices are then deleted with the files.

A skill that ships a reference a Markdown walk cannot read — a diagram, a data
table, a schema — meets the refusal above and needs a decision about what
governs it, which is ADR-0025's question rather than this one's.

Decided 2026-08-14. Issue #99 states the defect and the three questions.
