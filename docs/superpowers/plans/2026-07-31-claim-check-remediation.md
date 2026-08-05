# Remediation plan: close the gap between every claim and its check

Date: 2026-07-31. Status: proposed, revised once after review.

Two cross-vendor reviews of the whole repository returned sixteen findings on
2026-07-31. Reproducing the first returned a seventeenth. A third review, of the
first draft of this plan, returned two more defects that nobody had reported.
This plan disposes of nineteen findings and states what each release contains.

The ledger is eight `R` findings from the release-readiness lane, eight `D`
findings from the decisions lane, `M` from reproducing `R1`, and `P1` and `P2`
from the review of this plan. Every one of the nineteen carries a cluster, a
severity, and a release below.

## The diagnosis, and what it does not explain

Seventeen of the nineteen findings share a shape. The check is narrower in scope
than the claim it enforces, and the gap is where the defect lives.

| The claim | What the check covers |
|---|---|
| Every statement traces to a numbered rule. | Single-line `-` bullets only. |
| Install refuses to overwrite a file you wrote. | Skill files. The manifest bypasses the check. |
| Four of the six install pathways copy whole. | Three pathways work. Two are tested. |
| The conformance suite proves pathway parity. | It excludes the manifest before it compares. |
| `test/purity.test.js` enforces no `process.exit`. | It matches a substring. |
| `ground --check` verifies grounding. | The published package omits the matrices. |
| The skill cut median words from 173 to 59. | The samples were never kept. |

This repository sells claim discipline. The product fails its own thesis.

The first draft of this plan called that shape a root cause. It is not one. `P1`
and `P2` are the counterexample. The scaffold writes outside the repository, and
`uninstall --platform` removes the whole catalog. Neither behaviour had a claim
anywhere in the repository to be narrower than. A review that compares claims
against checks cannot find a dangerous behaviour that nobody wrote down.

So the shape is a review heuristic that organises what two lanes found. It is
not a mechanism, and it does not predict what a third lane will find. The
remaining defects need controls the heuristic does not name. Those are
filesystem transactions, command grammar, schema validation, artifact packaging,
benchmark provenance, and a policy gate.

## The disposition rule

Apply one rule to every finding that fits the shape. **Widen the check to the
claim, or narrow the claim to the check.** Never leave the gap open.

For a finding that fits no claim, name the control instead, and say which one.

A finding is not closed when the instance is patched. It is closed when the
class cannot recur.

## What the reviews found

Every finding below was verified against the files by the author of this plan.
`R1`, `P1`, and `P2` were reproduced end to end. No finding is relayed.

### Cluster 1: writes that escape their root

Severity: critical. Findings `R1`, `R4`, `M`, `P1`.

Two commands write to a path without checking what is already there.

`readManifest` and `writeManifest` use plain file operations. They follow a
symbolic link. The destination checks in `src/tree.js` never see them. A
manifest linked to a file elsewhere on disk is read through and then written
through. The link survives. The outside file is replaced with manifest JSON. No
`--force` is needed. The command reports success and exits zero.

Skill files are not affected. A linked `SKILL.md` is refused, and `--force`
replaces the link rather than writing through it.

`scaffoldSkill` has the same hole at a second site. It checks whether the skill
directory exists, and then writes every output with an unchecked call. The
grounding path is never checked at all. A grounding file linked outside the
repository is written through, and the link survives. An existing grounding
draft is replaced without a word. The author reproduced both.

Two more defects sit alongside the first. The manifest is written once, after
every copy, so an interrupted run leaves files that no record describes. A
manifest whose JSON is valid but whose shape is wrong crashes install with an
unhandled type error rather than an explanation.

**Disposition.** Widen the check across every write surface, not one file.
Inspect each destination and each ancestor with a call that does not follow a
link. Reject a manifest that is not a regular file. Validate the manifest shape
on read. Refuse to overwrite a grounding file the scaffold did not create.

The interrupted run needs a design and not a test. A single atomic manifest
write prevents a torn record. It does not prevent a valid record from
disagreeing with a half-updated tree. Choose one of two designs. Stage the whole
skill tree and commit it, or write a journal and recover from it on the next
run. Then inject a failure at each boundary and prove the recovery. Tests that
surround the current ordering measure the current ordering.

### Cluster 2: grounding coverage and grounding truth

Severity: critical for `D1`, major for `D2`.

`D1` is not yet fixed. Pull request 33 widened the extractor to account for
paragraphs and for wrapped list items, and it added the `N` row for narrative
that asserts no rule. It also traded one shape rule for three. Tables, headings,
and fenced blocks are now exempt by shape. A normative table or an imperative
heading recreates the defect the change was written to close. The same code
collapses identical units through a set, so one row can cover several
occurrences of the same sentence.

Pull request 33 also left `README.md:204` saying that the matrix maps every
statement to its rule in the standard, and that rows come in two kinds. Both
sentences are false after the change that was supposed to propagate them.

`D2` is a different problem and no code closes it. The checker confirms that a
`G` row cites something. It cannot confirm that the cited rule exists, that the
source says what the row claims, or that a paraphrase preserved an exception.

**Disposition.** Revise pull request 33 before it merges. Account for every
content form rather than exempting three by shape. Identify each occurrence
rather than each string. Correct `README.md:204` in the same commit.

Then narrow the claim. No mechanical check can establish that a citation is
true, so the repository must stop implying that one does. Record in each matrix
which rows a person checked against the source, and on what date. The reviewer
sampled the mappings and found no false `G` row, which is evidence about a
sample and not about a matrix.

The public wording moves in 0.2.1. The row by row human audit follows in 0.3.0.

### Cluster 3: the published package omits what a command reads

Severity: major. Finding `R3`.

`package.json` lists five entries under `files`. The `grounding` directory is
not one of them. A packed tarball holds thirty-four entries and no matrix. The
published command `ground --check --all` therefore has no data to read.
Continuous integration passes because it runs against a checkout.

The first draft of this plan resolved that by withdrawing the command, on the
grounds that shipping matrices contradicts the rule against a matrix inside
`skills/`. That reasoning was wrong. The rule exists because install pathways
copy skill directories whole. A `grounding/` directory at the package root sits
outside every skill directory, and `installSkills` copies only `skill.dir`. So
shipping the matrices breaks nothing.

**Disposition.** Widen the check first, and settle the architecture second. Add
a test that installs the packed artifact and runs every advertised command
against it. That test is correct under either answer.

Then choose. Ship the matrices in the package, or split the developer grounding
command away from the published command line. The second answer costs more,
because `npm run check:ground` runs through the same entry point and would need
its own. This plan does not settle that choice, and the test does not wait on
it.

### Cluster 4: pathway claims and conformance

Severity: major for `R5`, minor for `D8`.

`AGENTS.md` tells a reviewer that four of the six install pathways copy skill
directories whole. The design document states that only pathways one, four, and
five work today. The conformance suite defines two.

The suite asserts that the engine and a manual copy produce identical trees. It
reaches that result by removing the manifest from the comparison first.

**Disposition.** State all three numbers rather than replacing one with another.
Six pathways are designed, three work, and two are exercised by the conformance
suite. Saying only three erases the planned architecture instead of correcting
the false claim.

Then widen the check. Compare manifests rather than excluding them, and give
each pathway its own expected metadata. A manual copy cannot produce the engine
manifest, and the expectation should say so rather than hide it.

This finding also records a process failure. The author of this plan wrote the
false pathway count into the file that orients automated reviewers.

### Cluster 5: destructive operations that do not announce themselves

Severity: critical for `P2`, major for `R2`, `D7`, and `R8`.

`uninstall --platform claude --scope project` removes every installed skill. No
flag says so. `install` and `uninstall` share one default selection block in
`src/cli.js`, so an empty skill list means the whole catalog for both commands.
The author reproduced it. Three skills were removed and the directory was
deleted, and the command exited zero.

A bare interactive `uninstall` runs the install dialogue. The dialogue prints
`stylewright install` and asks `Install now?`. Confirming removes skills.

`--force` removes a directory and its contents when a file must be written at
that path. The documentation describes overwriting a file.

The help text omits `--force` from the uninstall line, and the command advises
users to pass it.

**Disposition.** Fix the grammar before the dialogue. Give each command its own
flag schema and reject a flag the command does not accept. Require an explicit
selection to uninstall, through `--skill`, through `--tier`, or through an
`--all` flag designed to be typed on purpose.

The dialogue fix follows. Give uninstall its own dialogue, because the install
dialogue is the wrong script. Document the recursive deletion, or require a
separate confirmation for it. List every flag a command accepts.

A dialogue alone would not have covered `P2`. A flag driven invocation never
reaches the dialogue. Listing every flag without changing the grammar documents
an accident.

### Cluster 6: a shared namespace with no uniqueness rule

Severity: major. Finding `D5`.

The two tiers share one flat namespace. The scaffold checks the selected tier
only. Installation rebuilds a map keyed on name, and the later entry wins.

A command that selects the standards tier can therefore install the craft skill
of the same name. No collision exists today, so this defect is latent.

**Disposition.** Widen the check. Enforce global uniqueness in the catalog, and
refuse a scaffold that reuses a name from either tier.

### Cluster 7: evidence and efficacy claims

Severity: major. Findings `D3`, `D4`.

The bench refuses a sample without a provenance sidecar, refuses an undersized
arm, and refuses a mismatched prompt digest. It also ignores its own output
directory, so the samples behind the published result were never kept.

The reviewer scored the surviving local samples. They carry no sidecar, stamp as
unaudited, and give a control median of 171 rather than 173.

The bench also delivers the treatment by appending it to a system prompt. The
product copies a directory and depends on a harness to select and load it. The
benchmark therefore measures injection and not installation.

**Disposition.** Correct the claim where a reader meets it. The figure lives at
`bench/README.md:180`, inside the passage that teaches the reading rule. The
first draft of this plan proposed a caveat in a grounding matrix, which no
reader of that passage will ever open. Correct or withdraw the sentence in
0.2.1.

Retention needs a mechanism and not an intention. `.gitignore:6` excludes all of
`bench/out/`, so no sample behind a published figure can survive today. Name the
store before the next figure is published.

The installed activation scenario waits for 0.3.0, because the repository makes
no activation claim in the meantime.

### Cluster 8: enforcement that matches text rather than code

Severity: minor. Finding `R7`.

`test/purity.test.js` matches substrings. An aliased exit call, a date
constructor with arguments, or a direct read of standard input would pass.

**Disposition.** Widen the check. Parse each module and inspect the tree.

### Cluster 9: the version chore

Severity: none. Finding `R6`.

`package.json` and `src/version.js` both read `0.2.0`. The release workflow
refuses a tag that does not match.

The reviewer graded this a release blocker, and the first draft of this plan
called that grade wrong. Both readings hold, because they measure different
things. The guard fails closed, which is the guard working. The repository is
still not ready to cut a release until somebody moves the numbers.

**Disposition.** Assign the chore. Each release below updates `package.json`,
`src/version.js`, the changelog section, and the tag in one commit.

### Cluster 10: the ASD decision

Severity: major, and not technical. Finding `D6`.

Whether the ASD-STE100 skill ships is not a question this plan answers.

The skill reproduces no rule text. It carries a digest in our own words,
examples we invented, and a navigator of rule numbers with our own topic labels.
The reviewer could not determine infringement and said so.

The residual question is whether an operational digest of a standard reads as a
derivative work. No edit short of withdrawing the skill changes that. An earlier
proposal to cut the navigator was withdrawn, because the navigator is the file
that points hardest at the source.

**Disposition.** Gate the release on the decision, and leave the decision to the
repository owner. Version 0.2.1 republishes the skill to every user who
installs, so an unmade decision is a decision to publish again. The owner
answers before 0.2.1 is tagged.

**Decided 2026-08-04.** The owner ships the skill as it stands. The condition
is the one this cluster already states. The skill must not reproduce the
standard in full, and it reproduces no rule text today. The gate on 0.2.1 is
open. The skill `SOURCE.md` records the same decision beside the license it
qualifies.

## Releases

The manifest defect is live. Version 0.2.0 is published, and a user who installs
today can lose a file outside the install root. That governs the order below.

### 0.2.1, a correctness release

Contains cluster 1, cluster 3, and cluster 5 in full. These reach a user's disk.

It also contains the parts of two other clusters that state something false in
public. Those are the revised pull request 33 with `README.md:204`, from cluster
2, and the efficacy sentence at `bench/README.md:180`, from cluster 7.

Cluster 10 gates the tag rather than adding work to it.

### 0.3.0, the craft tier

Contains the rest of cluster 2, cluster 4, cluster 6, the rest of cluster 7, and
cluster 8, alongside the skills already planned for this milestone.

### 0.4.0, plugin marketplaces

Unchanged in content. It now follows two releases that it used to precede.

## What this changes in the tracker

The milestones describe a product whose foundation the reviews rejected. Four
milestones and twelve issues hold none of these nineteen findings.

Open one issue per cluster, against the release named above. Add the v0.2.1
milestone. Move issue 3 behind it.

## What this plan has not established

- Whether a fourth review lane finds a fourth class. The plan review found two
  defects that the two whole-repository lanes missed, and it looked at a
  document rather than at the code.
- Whether every `G` row states what its rule states. Nobody has audited the
  matrices rule by rule.
- Whether an installed skill activates when it should. No test installs a skill
  and leaves selection to the harness.
- Whether Windows path behaviour holds. Continuous integration does not run
  there.
