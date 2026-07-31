# Remediation plan: close the gap between every claim and its check

Date: 2026-07-31. Status: proposed, under review.

Two cross-vendor reviews of the whole repository returned sixteen findings on
2026-07-31. A seventeenth came from reproducing the first. This plan disposes of
all seventeen and states what each release contains.

## The diagnosis

The findings are one defect repeated, not sixteen defects.

In every case the check is narrower in scope than the claim it enforces, and the
gap is where the defect lives.

| The claim | What the check covers |
|---|---|
| Every statement traces to a numbered rule. | Single-line `-` bullets only. |
| Install refuses to overwrite a file you wrote. | Skill files. The manifest bypasses the check. |
| Four of the six install pathways copy whole. | Three pathways exist. Two are tested. |
| The conformance suite proves pathway parity. | It excludes the manifest before it compares. |
| `test/purity.test.js` enforces no `process.exit`. | It matches a substring. |
| `ground --check` verifies grounding. | The published package omits the matrices. |
| The skill cut median words from 173 to 59. | The samples were never kept. |

This repository sells claim discipline. The product fails its own thesis.

## The disposition rule

Apply one rule to every finding. **Widen the check to the claim, or narrow the
claim to the check.** Never leave the gap open.

A finding is not closed when the instance is patched. It is closed when the
class cannot recur.

## What the reviews found

`R` numbers come from the release-readiness lane. `D` numbers come from the
decisions lane. `M` came from reproducing `R1`.

Every finding below was verified against the files by the author of this plan.
`R1` was reproduced end to end. No finding is relayed.

### Cluster 1: manifest integrity

Severity: critical. Findings `R1`, `R4`, `M`.

`readManifest` and `writeManifest` use plain file operations. They follow a
symbolic link. The destination checks in `src/tree.js` never see them.

A manifest linked to a file elsewhere on disk is read through and then written
through. The link survives. The outside file is replaced with manifest JSON. No
`--force` is needed. The command reports success and exits zero.

Skill files are not affected. A linked `SKILL.md` is refused, and `--force`
replaces the link rather than writing through it. The hole is the manifest
alone.

Two more defects sit in the same file. The manifest is written once, after every
copy, so an interrupted run leaves files that no record describes. A manifest
whose JSON is valid but whose shape is wrong crashes install with an unhandled
type error rather than an explanation.

**Disposition.** Widen the check. Reject a manifest that is not a regular file.
Validate the shape on read. Replace the manifest through a temporary file and a
rename, so no write passes through an existing link. Add tests that interrupt a
run at each boundary.

### Cluster 2: grounding coverage and grounding truth

Severity: critical for `D1`, major for `D2`.

`D1` is fixed in pull request 33. The checker now accounts for every paragraph
and every list item in a graded section. The matrix disposes of each unit as
`G`, `E`, or the new `N` for narrative that asserts no rule.

`D2` remains open and cannot be fixed the same way. The checker confirms that a
`G` row cites something. It cannot confirm that the cited rule exists, that the
source says what the row claims, or that a paraphrase preserved an exception.

**Disposition.** Narrow the claim. No mechanical check can establish that a
citation is true, so the repository must stop implying that one does. Record in
each matrix which rows a person checked against the source, and on what date.
The reviewer sampled the mappings and found no false `G` row, which is evidence
about a sample and not about a matrix.

### Cluster 3: the published package omits what a command reads

Severity: major. Finding `R3`.

`package.json` lists five entries under `files`. The `grounding` directory is
not one of them. A packed tarball holds thirty-four entries and no matrix.

The published command `ground --check --all` therefore has no data to read.
Continuous integration passes because it runs against a checkout.

**Disposition.** Widen the check. Add a test that installs the packed artifact
and runs every advertised command against it. Then either ship the matrices or
withdraw the command. Shipping the matrices contradicts the rule that a matrix
is an audit record for a person, so withdrawing the command from the published
package is the better answer.

### Cluster 4: pathway claims and conformance

Severity: major for `R5`, minor for `D8`.

`AGENTS.md` tells a reviewer that four of the six install pathways copy skill
directories whole. The design document states that only pathways one, four, and
five work today. The conformance suite defines two.

The suite asserts that the engine and a manual copy produce identical trees. It
reaches that result by removing the manifest from the comparison first.

**Disposition.** Narrow the claim, then widen the check. State three pathways
until more exist. Compare manifests rather than excluding them, and give each
pathway its own expected metadata.

This finding also records a process failure. The author of this plan wrote the
false pathway count into the file that orients automated reviewers.

### Cluster 5: destructive operations that do not announce themselves

Severity: major. Findings `R2`, `D7`, `R8`.

A bare interactive `uninstall` runs the install dialogue. The dialogue prints
`stylewright install` and asks `Install now?`. Confirming removes skills.

`--force` removes a directory and its contents when a file must be written at
that path. The documentation describes overwriting a file.

The help text omits `--force` from the uninstall line, and the command advises
users to pass it.

**Disposition.** Widen the check and correct the text. Give uninstall its own
dialogue. Document the recursive deletion, or require a separate confirmation
for it. List every flag a command accepts.

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

**Disposition.** Narrow the claim first, then widen the check. State in the
grounding matrix that the published figure cannot be reproduced from this
repository. Retain sample sets behind any future published figure. Add a
scenario that installs the skill and leaves selection to the harness.

### Cluster 8: enforcement that matches text rather than code

Severity: minor. Finding `R7`.

`test/purity.test.js` matches substrings. An aliased exit call, a date
constructor with arguments, or a direct read of standard input would pass.

**Disposition.** Widen the check. Parse each module and inspect the tree.

### Cluster 9: the version chore

Severity: none. Finding `R6`.

`package.json` and `src/version.js` both read `0.2.0`. The release workflow
refuses a tag that does not match.

The reviewer graded this a release blocker. That grade is wrong. A guard that
fails closed is the workflow working. This is a chore in the release step.

## Releases

The manifest defect is live. Version 0.2.0 is published, and a user who installs
today can lose a file outside the install root. That governs the order below.

### 0.2.1, a correctness release

Contains cluster 1, cluster 3, and cluster 5. These three are what reach a
user's disk and a user's expectations. Nothing else waits on them.

### 0.3.0, the craft tier

Contains cluster 2, cluster 4, cluster 6, cluster 7, and cluster 8, alongside
the skills already planned for this milestone.

Pull request 33 is part of this release.

### 0.4.0, plugin marketplaces

Unchanged in content. It now follows two releases that it used to precede.

## What this changes in the tracker

The milestones describe a product whose foundation the reviews rejected. Four
milestones and twelve issues hold none of these seventeen findings.

Open one issue per cluster, against the release named above. Add the v0.2.1
milestone. Move issue 3 behind it.

## The decision this plan does not make

Whether the ASD-STE100 skill ships is not a technical question, and this plan
does not answer it.

The skill reproduces no rule text. It carries a digest in our own words,
examples we invented, and a navigator of rule numbers with our own topic labels.
The reviewer could not determine infringement and said so.

The residual question is whether an operational digest of a standard reads as a
derivative work. No edit short of withdrawing the skill changes that. An earlier
proposal to cut the navigator was withdrawn, because the navigator is the file
that points hardest at the source.

This decision belongs to the repository owner.

## What this plan has not established

- Whether every `G` row states what its rule states. Nobody has audited the
  matrices rule by rule.
- Whether an installed skill activates when it should. No test installs a skill
  and leaves selection to the harness.
- Whether Windows path behaviour holds. Continuous integration does not run
  there.
- Whether the reviews missed a class. Two lanes agreed on the disease, which is
  weaker evidence than two lanes disagreeing and then converging.
