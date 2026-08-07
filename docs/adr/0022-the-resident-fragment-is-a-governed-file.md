---
type: adr
status: accepted
decided: 2026-08-07
issues: [24, 25, 18]
---

# ADR-0022 — The resident fragment is a governed file, and doctor detects it

A skill loads when a trigger matches. The navigable-reference rule has a
trigger in its front matter, and that trigger is every sentence that names a
file, a document, or a decision. A trigger that diffuse is a trigger that fires
unreliably. The rule's worst moment is the moment the writer did not notice
that the rule applied.

The failure this decision prevents is a user who believes a rule is active when
it is not. That framing settles the mechanism. A write can only assert that the
rule is resident. A check can detect whether it is.

## Decision

The resident fragment ships as an ordinary file inside the target directory
this tool already governs. It installs under a reserved directory name,
`stylewright-resident`, beside the skill directories.

It is a manifest-recorded path under `targetDir`. So it inherits `contained`,
the tree checks, the `pending` journal, retirement, drift refusal, `--force`,
and exact uninstall. It adds no write class, no record type, and no path
vocabulary.

`src/install.js` joins the fragment to the catalog by name, in `selectable`.
Every byte it writes goes through `installUnderLock`, which is the one code
path every skill takes.

The tool never edits `AGENTS.md` or `CLAUDE.md`. It prints the one import line
for the user to paste, and stops there.

## The rejected alternative is rejected for good

An earlier design wrote the import into the user's instruction file, inside a
marked region that uninstall would remove. A maximum-effort adversarial review
refused it, and the refusal is final.

The reason is the framing above. A region write asserts residency. It cannot
report that the user deleted the region, moved it under the wrong heading, or
never had the file the tool wrote to. It also puts this tool's parser inside a
file it does not own, where a shape it models wrongly costs the user their own
work.

Do not reintroduce any write to an instruction file.

## Placement, and why the name says what it is

The fragment sits inside the installed `skills/` directory, because that is the
directory this tool governs and the only one its machinery reaches. A file
under that directory that is not a skill would be read as one by a harness that
globs it.

So the fragment takes a reserved subdirectory whose name says what it is, and
it ships no `SKILL.md`. `loadCatalog` never sees it, so `ground --check` never
grades it as a skill.

The fragment carries no rule of its own. Every line but the header comment is
copied out of `skills/craft/navigable-references/SKILL.md`, and the matrix at
`grounding/craft/navigable-references.md` disposes of each of those lines
already, as rows E-02 through E-11. A generated copy of graded text is not a
new ungraded prohibition.

## One source, and a check that holds it

One rule now has two delivery forms, and two forms of one rule drift.

The skill is the source. `src/resident.js` generates the fragment from two
named sections of it. `npm run check:resident` fails when the shipped fragment
and the skill disagree, and `npm run check` runs it. The CI gate runs it as a
named step, because a check that exists locally and not in the gate is the
defect PR #59 caught.

The generator refuses a renamed section rather than emitting a shorter
fragment. A rule that quietly stopped shipping is this decision's own failure,
one level in.

## Doctor gains two findings

`resident-not-imported` warns when the fragment is installed and no instruction
file that platform reads imports it. This check is the thesis of the decision.
Detecting the inactive state is the thing a region write could never do.

It reads a file for one substring, so it needs no Markdown model, and a false
negative costs a warning rather than a corrupted file. It behaves the same on
every install pathway, including the four that copy skill directories whole.

`resident-double-delivery` warns when the fragment is imported and the
`navigable-references` skill is installed for the same agent. `update` does not
retire a skill this repository still ships, and the duplicate check compares
skill directories only. So a double-delivered rule would otherwise stay silent
on every existing install.

Both checks read instruction files, and they treat what they read as data.
Nothing in `src/doctor.js` interprets that content, acts on it, or writes to
those files. `targets.js` names the files each platform reads, and the list is
wide on purpose. This repository carries `CLAUDE.md` and `AGENTS.md` together,
with one importing the other, and a check that read only the first would raise
a false alarm against a user who did everything right.

## The skill stays, and the pilot is opt-in

`skills/craft/navigable-references/` stays as the alternate delivery. The
fragment is the documented default for this rule, and README says so.

No tier selection reaches the fragment. `--tier all` still means every skill,
so a plain install of everything cannot deliver one rule twice. A user asks for
the fragment by name.

The fragment installs for `claude` and `cowork` only. `@path` is a Claude Code
feature, and this repository has verified no import form for Codex. Issue #24
holds that question open. An import line that silently fails is worse than no
resident layer, so install refuses the platforms where the line would do
nothing.

## What the pilot does not include

No fragment catalogue, and no way to browse or select fragments. No composition
of several fragments. No ordering rules, no per-fragment enable and disable,
and no second payload. Everything else stays in issue #24.

## Consequences

The user pastes one line, and some users will not. That cost is accepted. An
unpasted line is a state the user can see and `doctor` can report. A silently
failed import is neither.

The dual-form state is explicit rather than emergent. Two delivery forms of one
rule exist on purpose, the default is named, and the tool reports a user who
carries both.

`stylewright-resident` becomes a reserved name. The scaffold refuses it, and
install refuses a catalog that takes it.

## What this decision does not settle

**The premise is measurable, and nobody has measured it.** "The trigger fires
unreliably" is a claim about installed delivery. The measurement design at
`docs/specs/2026-08-04-measurement-design.md` defines the discoverability probe
and the activation study for exactly this. Changing the delivery form forks the
identity tuple, so a study run after the switch cannot separate the rule's
effect from the delivery's. Measuring before the switch is cheaper than
measuring after it, and this decision does not say which happens.

**The pilot names a stopping condition and does not yet collect it.** The
`resident-not-imported` finding is the natural one, as the share of installs
where the fragment is present and unimported. No telemetry exists, and none is
proposed here, so the reading comes from users who report it.

**The Codex question shrinks and does not vanish.** It no longer gates a write,
because the tool writes nothing into an instruction file. It decides which
platforms the fragment installs to, and what the printed line says. Issue #24
carries it.

**The issue #18 interaction stays open.** ADR-0005 settled that the craft tier
admits operating discipline, and it committed that no such rule claims measured
effect until the bench drives agentic work. Several narration rules share this
rule's diffuse-trigger profile. If the fragment is their home too, this pilot
carries more than one rule, and that commitment applies to all of them.
