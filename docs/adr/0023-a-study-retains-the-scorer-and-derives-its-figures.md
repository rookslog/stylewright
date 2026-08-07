---
type: adr
status: accepted
decided: 2026-08-06
issues: [21, 43]
---

# ADR-0023 — A study retains the scorer's output, and every figure derives from it

ADR-0006 named the store. Retained samples are committed to this repository.
Building the promotion path raised the question that decision left open: what
does a study record about its own analysis, and who states the number?

Section 3 of the measurement design asks a study manifest to name the scorer
revision, the command run, and its output. It also asks for an identifier per
published result, which is what `bench-study:<study>#<result>` resolves to. It
does not say who computes the number behind that identifier.

Two readings were available. The manifest could carry the figures, written
beside the command that produced them. Or the manifest could carry the command
and its output alone, with the figures computed from those bytes at read time.

**Decision.** The study manifest retains the scorer's command, its exit code,
and its output verbatim. It carries no figure of its own, and
`bench/study.mjs` refuses a manifest with a key that states one. A result
identifier is `<scenario>.<arm>.<statistic>.<metric>`, which names one cell of
the table the scorer already prints, and `deriveResults` reads it out of the
retained output.

This is the rule ADR-0013 already applies to a probe record. A record that
grades itself is the author's summary, and a reader is owed the evidence
instead. A figure typed beside its command is the same defect in a second
place, and it fails in the direction that matters: the number in the manifest
and the number in the output can disagree, and only one of them is evidence.

The audit status rides on every derived figure rather than sitting once at the
top. The scorer stamps its own status on every row for that reason, so a row
quoted out of the table cannot lose it.

**Consequences.** The scorer runs during promotion, after the copy and over the
promoted bytes, so every derived figure comes from exactly the files the tree
holds. It runs once per scenario, because a median across a correction and a
report is not a number.

An empty result set is not an audited set. A study whose scorer refused to
score it is retained as a failed attempt, and it derives no figure at all.

Three narrowings, stated rather than left to be discovered.

Promotion **refuses** an arm collected under `--rules user`. Section 3 permits
refusal or redaction, and redaction needs a chained manifest, a deterministic
rule, and a trusted step that no check can re-run. None of that is built, so
the refusal is total until it is.

A promoted study **cannot** carry section 4.2's full provenance. The platform,
the environment class, the stack digest, the delivery mode and the installed
pathway all come from a runner that does not exist, because installed delivery
is the half of issue #43 that stays open. The manifest names each of them as a
gap. Naming the absence is what stops a reader taking an injected figure for an
installed one.

The **citation** half of ADR-0009 is not here. Nothing yet checks that a marker
in `bench/README.md` resolves to a study, and nothing yet enforces the numeral
rule. `npm run check:studies` validates the studies a marker would point at,
which is the half that has to exist first. No study exists yet, so no marker
can resolve, and a reviewer holds the rest.

Amended 2026-08-06, after a review of the first implementation. The decision
above is unchanged. What changed is that the check now earns it.

**The retained output is re-run, not read.** Retaining the scorer's output and
deriving from it made the figure honest and left the output itself uncovered:
no digest reached it, and a reviewer edited one table cell from 45 to 12 while
the check exited zero and derived the figure as audited. So `check:studies`
re-runs each retained command over the promoted bytes and compares. The
manifest already pins the scorer, its digest, the command, and the arm digests,
which is what makes the re-run the same run rather than a new one.

Three consequences follow, and each closes a hole the re-run would otherwise
open. The scorer's digest is recomputed, and a drift refuses the re-run and
names both digests, because a comparison against a different scorer proves
nothing. The command is checked before it runs: it must name the recorded
scorer, and every path in it must land inside the study, or a rewired command
would reproduce its own retained output from bytes the study does not hold. And
`bench/study.mjs` now spawns, where the probe check does not. That is the cost
of the promise, and the promise was already written in two READMEs.

**A derived state that nothing reads is a comment.** `armState` derived whether
an arm covered its plan and nothing consulted it, so an arm whose manifest
recorded an abort promoted and derived figures marked audited. Gating promotion
would be the wrong repair, because the design retains a failed attempt on
purpose. The state propagates into the figures instead: every figure an unfit
arm had a hand in reads unaudited, with the reason on the figure. That is this
ADR's own rule for the audit status, applied to the other thing that
disqualifies a figure. An ungrouped `all` figure is disqualified by any unfit
arm, because a set the scorer did not group pooled all of them.

**Containment and inventory.** Every path a study manifest names is joined only
after `isBelow` admits it, because `path.join` collapses `..` in silence. Every
file the study holds is accounted for against the manifest, because scanning a
file's contents says nothing about whether the study claims to hold it. And a
study holds plain files only: filtering a walk on `isFile()` let a symbolic link
escape the scan entirely, and a link's target string is committed content like
any other byte.

Amended again 2026-08-07, after the re-run above turned out to be an execution
surface nobody had written down.

**`npm run check:studies` runs a program.** No text said so, including the
amendment that introduced it, and a reader would have had to infer it from a
`spawn` call. State it first, because everything below follows from it: a
routine repository check executes code, on a developer machine and in
continuous integration, and the thing it executes is chosen from a file that a
pull request can edit.

The first version chose that program from `manifest.scorer.path`. A reviewer
edited one study manifest and measured the result: a relative-escape path ran a
script outside the repository, under the operator's entire environment, which
echoed the retained output back so the check printed clean and exited zero.

Both gates that looked like gates were the same gate. `command[1]` was compared
against `manifest.scorer.path`, which is two fields of one file that one hand
wrote. And the digest verified whatever that field pointed at, so an attacker
supplying a script and recording its digest correctly passed. Neither was ever a
constraint on the attacker.

**The decision: there are two gates in front of the spawn, and they answer
different questions.**

The first is a literal. `bench/study.mjs` names `bench/score.mjs` as a constant,
refuses a study whose `scorer.path` is anything else, and refuses a command
whose program is anything else. The indirection is gone, so no edit to a study
can move what runs. The argument for dropping it is the design's own: a study
scored by some other program is by definition not reproducible in this tree, so
refusing it costs nothing that was ever worth having. `bench/retain.mjs` only
ever wrote that value, and the check now enforces what promotion promised.

The second is the digest, which is unchanged and now does the job it can
actually do: it says whether the one program is the revision the study was
scored under. It was never a gate on execution, and reading it as one is what
let the first design look safe.

**Two further limits on the spawn, because a gate is not a sandbox.** The child
is built an environment by name rather than handed this process's, so no
credential and no home directory reaches it — the allowlist `bench/collect-probe.mjs`
already settled on, for the reason a review measured there. And a child still
running at a deadline is killed and refused by name, because a hung re-run
takes `npm run check` with it and reads as a slow machine.

**Both spawns, not one.** This repository starts two child processes around a
study: the check re-runs the scorer, and the promotion runs it once over the
bytes it just copied. The first was built an environment by name and the second
inherited the operator's shell, which measured out at sixty variables including
a home directory and two credential names. Nothing there was exploitable, since
both spawns run the same literal scorer and the scorer reads no environment.
It is fixed because the sentence above says the child is built an environment by
name, and a rule that holds in one file and not its neighbour is a rule the next
reader applies to whichever file they opened. The promotion's spawn is also the
one with the larger blast radius, because its output is what gets committed.
One allowlist serves both, imported rather than copied.

**A refused study is never re-run.** The re-run was gated on the command's own
problems alone. Containment is a string predicate over `path.resolve`, which
resolves no symbolic links, so a link inside a study was refused by name and the
scorer still spawned and read through it. Refusing first is both simpler and
stronger, and it costs nothing: no reader believes a figure from a study the
check has already refused.

**The flip condition.** If this check ever needs to run a second program, the
literal becomes a list, and that list lives in code beside these gates rather
than in a study manifest. A study naming its own program is the design this
amendment retracts.

An arm manifest in `bench/out/` is replaced when a resumed run recomputes it,
because `run.sh` resumes an interrupted arm and the record should describe
where the arm ended. Nothing is edited in that replacement. A manifest inside a
promoted study is never touched, because promotion refuses a study directory
that already exists.
