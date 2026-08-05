# Measuring skills — retention and installed activation

**Date:** 2026-08-04
**Status:** draft, for owner review. Not yet implemented.
**Issues:** #21 and #43, designed together as #43 directs.
**Author:** Claude, for Logan Rooks

## 1. The two gaps this closes

The bench can produce a figure that nobody can audit. Every published figure in
`bench/README.md` is marked unaudited today, because `.gitignore` excludes the
whole of `bench/out/` and no sample behind a figure survived. That is the
retention gap.

The bench also delivers a treatment by appending it to a system prompt. The
product copies a directory and depends on a harness to choose the skill. The
figures therefore measure injection, never installation. That is the activation
gap.

Issue #21 names the discipline that sits over both: no skill claims an effect
that no measurement observed. This design turns that discipline into mechanism.

## 2. Decisions already made

The owner decided both on 2026-08-04, recorded on the issues.

- Retained samples are committed to this repository (#43).
- The craft tier admits operating discipline, not prose alone (#18). The
  measurement protocol must therefore reach agentic behaviour, not only reply
  text.

## 3. Retention, by promotion

`bench/out/` stays excluded. It is a working directory, and most arms die as
drafts. What changes is that publication requires promotion first.

A new directory, `bench/samples/`, is committed. It holds one directory per
study, named `<date>-<slug>`. A study directory holds the arms behind one
published comparison: every sample, every `.meta` sidecar, and every `.err`.

A new script, `bench/retain.sh`, copies a whole arm from `bench/out/` into a
named study. Copy whole arms, never files. The scorer already refuses a subset
of an arm, so a partial promotion fails scoring where it is next read.

**The publication rule.** A figure may appear in a committed document only if
the arms behind it live under `bench/samples/`, cited by study name. The rule
covers `bench/README.md`, every grounding matrix baseline, and every skill
`SOURCE.md`.

The rule is convention first and check later. A mechanical check would need to
find every figure in prose, and that parser is not worth building now. What is
worth building now is small: the scorer accepts a `bench/samples/` path exactly
as it accepts a `bench/out/` path, so an auditor re-scores a published study
with one command.

The existing figures stay marked unaudited forever. Their samples are gone, and
promotion cannot reach backwards. The first study under this design supersedes
them.

## 4. Activation, measured in two stages

Stage one asks whether the installed skill reaches the model at all. Stage two
asks what it changes when it does. Separating them keeps a cheap check cheap.

### 4.1 Stage one, the activation check

1. Install the skill into an isolated agent home through one real pathway.
2. Launch the harness headless against that home.
3. Ask it to list the skills it can see, and record the answer.
4. Record the harness build beside the answer, because loading rules change.

This session ran exactly this check against the plugin-marketplace pathway on
2026-08-04, by hand, and it worked. The open question is isolation. The check
must not read the operator's own installed skills, or a stale cache could pass
the check for the wrong reason. Whether the harness respects a redirected home
for every configuration directory is unverified. Settling that is the first
implementation task, and it is a probe, not a design choice.

### 4.2 Stage two, delivery through installation

The bench gains one delivery mode. Today `run.sh` injects the skill text with a
`--system` flag. The new mode runs the same scenarios against a harness whose
isolated home holds the installed skill, with no injection.

The sidecar records the delivery mode, and the scorer refuses to compare arms
across modes unless the comparison names itself as exactly that: an
injection-versus-installation contrast. That contrast is the measurement issue
#43 asks for.

### 4.3 Agentic scenarios

The #18 decision widens what a treatment may target. The current scenarios are
single-turn replies. Operating discipline shows up in multi-step work: progress
narration, unrequested scope, escalation language. A scenario for those needs
tool use and several turns, which the current runner cannot drive.

This design names the gap and defers it. The runner grows agentic scenarios in
a separate change, after the retention and delivery mechanisms exist. Writing
the `#18` skill may precede its bench, but its `SOURCE.md` must then say so,
exactly as `navigable-references` will.

## 5. The workflow a new craft skill follows

This is issue #21 restated as steps, with the mechanisms above in place.

1. Run the control arm first, with no guidance, and read the samples.
2. Stop if the control is already clean, and record that result anyway.
3. Write the skill only against a failure the control actually shows.
4. Run the treatment arm through installed delivery where the harness allows.
5. Promote both arms into a study before publishing any figure.
6. Cite the study by name wherever the figure appears.

A skill that ships before its measurement states that plainly in `SOURCE.md`.
Honesty about an unmeasured rule is the fallback, never the goal.

## 6. What this design does not settle

- The isolation probe in 4.1. Unchecked, and everything in 4.2 leans on it.
- Correctness judgment stays human. The scorer counts shapes, and a person
  still reads the samples. Nothing here automates the reading rule.
- Cost. Live harness runs in stage two are slower and dearer than injection.
  The design accepts that for publication runs and keeps injection for drafts.
- CI never runs a live model. Activation checks are a manual protocol with
  committed records, because a network flake must not block an engine fix.
