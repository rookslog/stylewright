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

A graded file with no matrix is an error, and so is a file under `grounding/`
that grades no file any skill ships.

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

**Three assumptions the one-file checker carried, and what each becomes.** Every
one of them was justified by there being exactly one graded file per skill, and
review found all three at once.

*Front matter is metadata.* True of `SKILL.md`, whose block the harness parses
and never shows a writer. No harness reads a reference file's prefix, so a
closed `---` block there was removed from the units and reported by nothing. A
rule written there shipped visible to the reader and invisible to the check. The
block is refused in any subject but `SKILL.md`, and it is still removed from the
units rather than graded, because a reader does not see those lines as the
paragraph the walk would make of them. `checkSkill` takes `subject` with no
default, so a caller that does not name the file it grades cannot be handed the
exemption. That is the rule `now` obeys, for its reason.

What the block renders as depends on the lines, and the reason stated here has
to survive every shape. `micromark` gives a thematic break and a setext heading
for a mapping, a list for a list, code for a fenced block, and a table for a
table. This ADR first named the mapping's render as the reason, and AGENTS.md,
the code and the author-facing message repeated it, so one shape's render stood
in four places as a fact about all of them. That is the comment explaining away
what the parser was never asked, which this repository forbids by name. The
oracle carries all five shapes now, and every one of those places states the
property they share: a reader sees the block's contents, and the walk reads no
unit from any line of it.

*The grounding tree is reachable from the catalogue.* It is not. A matrix whose
skill was deleted or renamed sits under a directory no catalogue entry names, so
walking out from each skill never visited it and the run stayed green over
exactly the stale record this ADR refuses. The scan walks `grounding/` and
derives the skill from the path, which also catches the same defect one level
up: a leftover `<tier>/<name>.md`. A stray is reported under the name its path
implies, because the catalogue is what it fell out of.

*A path names a file.* Only after `lstat` says so. A matrix is identified by its
path, so following a link there lets two graded files share one physical audit
record, or lets the check read a record from outside the grounding tree. The
stray scan cannot see either, because the link stands at exactly the pathname
the scan holds. This is the disposition the shipped-file allowlist already gives
a link at an allowed name. The type found is named in the finding, because a
directory at a matrix path and a link at one need different remedies.

That `lstat` answers for the LAST component and no other. A link standing as an
intermediate directory still lets the read resolve out of the tree, so the
findings printed would come from a foreign record. It is not a green run: `walk`
reports a linked directory as a file entry, so the component is a stray and the
gate fails. The limit is stated rather than closed, because closing it needs
`realpath` on both sides of a containment test, and a checkout reached through a
linked path — `/tmp` on macOS is one — would then be refused for its own layout.
The reading is wrong there and the verdict is not, and this is where a reader
finds that out.

*A spelling names a file.* Only where the filesystem agrees. A case-folding
filesystem resolves two spellings to one file, so a miscased matrix was read at
the held spelling and reported as a stray at the walked one, with a remedy
telling the author to delete the file the check had just used. The scan compares
the spelling first and the filesystem's own identity where the spelling misses,
which is the question the install engine already asks of a destination. The
identity comes from `lstat`, so a link never answers for its target, and it is
withheld where an inode reads zero.

## The count was a note, and it is an error now

ADR-0025 printed how many files under `references/` no row disposed of, as a
note that failed nothing, and it said not to promote the count to an error and
not to remove it. Both instructions carried the same reason: nothing could grade
those files, so an error would fail every release until #99 landed. This is #99.

The condition the note reported is now an error, per file, with the path of the
matrix to write. That is the opposite of quieting the output. A green run over a
file nobody has graded was the gap the number existed to report, and the gap is
closed by refusing rather than by counting. ADR-0025 is amended to say so.

## A unit is graded by what it says

Two rules were drawn while filling the column, and both are written into the
matrices that use them.

A heading is graded by its words rather than by being a heading. `One
instruction per sentence` states the constraint its section teaches, and an `N`
row over it retires a rule from review by calling it a title. The test is
whether the heading says what a writer must do. Seven headings in `examples.md`
do, six of them citing the rule the skill's own matrix already cites for the
same claim, and the seventh carrying our authority because Issue 9 has no
numbered pronoun rule. The rest name a subject, such as `Procedure`.

A table is one unit, so a table is one authority class. `rule-navigation.md`
carried one table whose `Read when` column is our own advice, and a `G` row over
that designator attributed every recommendation in it to Rules 1.1 through 9.4.
The designator cannot be split, so the FILE was: it carries a table of source
locations graded `G`, and a table of our advice graded `E`. The questions repeat
across both, which is the cost.

The `G` row claims the location and not the label. Its `Question` column stays
our own paraphrase of a topic, which the file says of itself, and a paraphrase
does not become the standard's by sitting beside a rule number. That is true of
every `G` row here: the guidance cell is always our words, and what the row
traces is the claim, not the wording. Splitting further would grade our own
question text against a rule, which is the defect pointing the other way.

## What this does not claim

Every row these matrices add starts `unaudited` and `unquoted`. Twelve `G` rows
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
