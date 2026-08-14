---
type: adr
status: accepted
decided: 2026-08-12
issues: [88]
---

# ADR-0025 — A skill directory ships what something governs

`ground --check` disposes of every unit in `SKILL.md`. It opens no other file
in the skill directory. Four of the six install pathways copy that directory
whole, so every other file in it reaches a user ungraded.

Four releases shipped `SOURCE.md` that way. It carried numbered procedures at
whoever read it, including one that told a reader to download a PDF from a URL
and one that told a reader to run a bench arm. `AGENTS.md` already settled the
principle for the file that is graded: there are no exempt headings and no
exempt sections, and a heading called `Source` grades like any other. A whole
file named `SOURCE.md` was the same hiding place one level out.

## Decision

A skill directory ships `SKILL.md`, `LICENSE`, `agents/`, and `references/`,
and `ground --check` refuses any other file by name. The source record moved to
`source/<tier>/<name>.md`, beside the matrix.

The list states what may ship rather than what may not. ADR-0016 records why,
for the extractor: a rejection list is only as complete as its last review, and
three review rounds each found a shape the list did not name. The same holds for
a file. A false refusal costs an author one decision about what governs the
file. The other direction ships a rule nobody reviewed.

Location is the mechanism, not a filter. Four pathways run none of our code, so
an exclusion list inside the engine would not reach them. This is the mechanism
ADR-0007 chose for the matrix, and the source record now inherits it.

A name is not a file, so the check asks the filesystem what stands at each name
and refuses anything but a plain file. The install copy resolves a link and
ships the bytes on the other end of it, and nothing on the source side refuses
one: `installSkills` checks that each name can be recorded portably and then
calls `copyFile`. A study already answers this shape the same way.

The scaffold writes a record for both tiers. A craft skill has no standard
behind it, and that is precisely the thing its record states, so the tier that
looks like it needs no record is the tier whose record does the most work.

## Two files, two dispositions, and the test that separates them

The design document states the test in section 2.2: a matrix is an audit
artifact for a reader who evaluates the skill, and not context that an agent
needs while it writes. Applying it to each file that ships answers both cases.

A source record fails that test. It records a licence check, a transformation,
an expiry, and what a maintainer would do to re-check any of them. No writer
loads it while writing. It goes.

`references/` passes it. `SKILL.md` routes a writer into
`references/rule-navigation.md` to find a rule in the standard, and rows E-01
and E-02 of the STE matrix grade the sentences that do the routing. The matrix
disposes of the pointer and nothing disposes of what it points at. That is the
same defect as the source record, and it has the opposite fix: the answer to
ungraded context is to grade it, not to evict it.

Grading it is not this decision. `examples.md` yields 113 content units, and 41
of its lines are blockquotes that the extractor refuses today, so a matrix
cannot cover it until that grammar admits them. Issue #99 carries the work, and
ADR-0030 and ADR-0031 record how it landed.

## The count is a note, and it stays one

Until #99 lands, `ground --check` prints how many files under `references/` no
row disposes of, per skill that ships one. It is a note, so it fails nothing.

That is the disposition `audit-coverage` already has, and for the same reason
issue 40 gives: a green run over content nobody has graded is the thing the
number exists to report. Do not promote it to an error, which would fail every
release until #99 lands. Do not remove it to quiet the output, which would hide
what this decision could not finish.

**Amended 2026-08-14, when #99 landed.** A matrix disposes of every file under
`references/`, one matrix per file, so the reason above no longer holds: an
ungraded reference file is a defect a contributor can fix rather than a state
the repository is stuck in. The count is an error now, per file, naming the
matrix to write. ADR-0030 records the decision and the row-space question it
turned on, and ADR-0031 records the grammar change that made `examples.md`
gradeable. The two instructions above stand for any future note of this kind:
what replaced this one refuses more than it counted, and nothing was removed to
quiet the output.

## What was rejected

**Grade every installed file now.** The six source records carry 166 content
units between them, and `agents/openai.yaml` is YAML that the Markdown
extractor cannot read at all. Worse, grading a directive does not remove it. A
row beside "Download the PDF from the URL above" records that the instruction
ships. It does not stop an agent acting on it.

**Hold the source record to a directive-free form.** Whether a sentence directs
a reader is a judgment no checker makes reliably. The honest mechanical form is
fields only, which deletes the re-check procedures. Those procedures then move
to the repository anyway, which is this decision for half of each file.

**Ship the record and do nothing.** The hole widens with every file anyone
drops into a skill directory.

## What would flip each half

**The records.** Evidence that a reader needs the provenance in an installed
tree without the repository to hand. A compliance reader working offline is the
case. It does not apply today, because the shipped `LICENSE` carries the
copyright, the trademark, and the non-affiliation lines itself, and the record
carries only what a maintainer checks. If it ever applies, the answer is a
short directive-free notice that ships, with the procedures still in the
repository.

**`references/`.** Evidence that no installed user reads those files. The
argument for keeping them is that `SKILL.md` routes a writer into them. If that
routing turns out to be dead weight, eviction is simpler than grading, and this
decision reverses for that directory.
