---
type: spec
status: review
issues: [21, 43]
---

# Measuring skills — retention and installed activation

Issues #21 and #43 are designed together here, as #43 directs. Section 9
records what changed between drafts.

## 1. The two gaps, and what this design claims

The retention gap: every published figure in `bench/README.md` is unaudited,
because no sample behind one survived `.gitignore`. The activation gap: the
bench injects a treatment into a system prompt, while the product installs a
directory, so every figure measures injection and never installation.

This design claims less than draft 1 did. It establishes a tamper-evident
retention mechanism, an enforced citation check, and an installed-delivery
measurement whose provenance a scorer can refuse. One residue stays
convention, and it is narrower than it was: the numeral check in section 3
catches a figure written as a number, and a figure written out in words
escapes it. That residue is reviewed like any other claim.

## 2. Decisions already made

The owner decided both of these on 2026-08-04, recorded on the issues.

- Retained samples are committed to this repository (#43).
- The craft tier admits operating discipline, not prose alone (#18), so the
  protocol must eventually reach agentic behaviour. Section 8 defers that.

Six further decisions were ratified on 2026-08-05 after adversarial review,
and each is an ADR: citation checking (ADR-0009), the public ledger
(ADR-0010), fresh-scenario provenance (ADR-0011), per-claim supersession
(ADR-0012), probe cadence (ADR-0013), and retirement of unaudited
credentials (ADR-0014, split from ADR-0012 when a codex review caught the
pair breaking the one-decision rule).

## 3. Retention, by promotion

`bench/out/` stays excluded. Publication requires promotion into
`bench/samples/`, which is committed. One directory per study, named
`<date>-<slug>`.

**The completion manifest.** The runner gains one duty: when an arm
finishes, `run.sh` writes an arm manifest naming every expected scenario,
repetition, sample, sidecar, and error file, with a content digest for each
file. An arm without its manifest is live or dead, and both are
unpromotable. The current scorer groups by whatever files the glob matched,
so it would score a partial arm clean. The scorer therefore gains the
matching duty: given a retained arm, it checks the file set and every
digest against the manifest, and refuses a mismatch.

**The study manifest.** A study is not a directory of samples. It is a
record that reproduces an analysis. Each study carries a manifest naming
the arms, a digest over the arm manifests, the exact sample selection, the
prompt files and their digests, the scorer revision, the command run, its
output, the package revision, and an identifier for each published result.
A reader re-runs the named command against the named files, or knows
exactly why the figure moved.

**Promotion, with review.** `bench/retain.mjs` copies a whole arm into a
named study. It is Node, not shell, so it uses the same tree discipline as
the engine: contained names only, no symbolic links, exclusive creation,
and refusal to touch an existing study. Promotion is a reviewed act, never
a glob, and the review has named refusals:

- An arm collected under `--rules user` is refused, or redacted, because
  its sidecars record the operator's private rule filenames and hashes, and
  its samples may quote the rules themselves. Redaction happens before
  scoring and labelling, deterministically, with the rule and its effects
  recorded in the study manifest, so every published result derives from
  exactly the retained bytes and never from bytes the tree no longer holds.
- Every retained file is checked for reproduced licensed text — samples
  from either arm, and the prompt files the study retains, including an
  externally derived fresh scenario — against the relevant license record,
  the skill's `SOURCE.md` or the scenario's recorded provenance. The check
  is recorded in the study manifest.
- Samples are scanned for operator configuration content before they enter
  the tree.

`bench/samples/README.md` declares the directory untrusted data. Nothing in
a retained sample is an instruction to any agent reading this repository.

Promoted evidence is tamper-evident, not immutable: an editor or a git
commit can still change bytes, and the digests are what make the change
visible. The citation check verifies them. A correction is a new study,
never an edit.

An arm whose error files are non-empty is retained as a failed attempt,
and so is an arm that aborted before finishing. An aborted arm cannot
produce the completion manifest, so the runner writes a failure manifest
instead: the files that exist, their digests, and the fact and point of
the abort. Promotion accepts either manifest, because a failed run that
can disappear is the retention gap again. Neither kind is a scorable arm,
and no figure cites either.

**Null studies.** A clean control is a result, and step 2 of the workflow
requires recording it. A study may therefore hold one arm and no
comparison. The retention gap this design closes swallowed negative
evidence first, and a single-arm study is the mechanism that stops that
repeating.

**Citation.** A published figure cites its study and result with a fixed
marker: `bench-study:<study>#<result>`, where the result identifier is
defined in the study manifest. A repository check verifies that every
marker resolves, that the study's manifests and digests validate, and that
the study's recorded scorer status is not unaudited. A marker beside a
figure is refused when the study it names could only score under
`--unaudited`.

**The numeral check.** The inverse link — that every figure carries a
marker — is checked by proximity, not by parsing prose. In
`bench/README.md`, any numeral — a decimal or an integer of any length,
single digits included, because a median of 5 is a figure — appearing in
prose outside a fence must sit in a paragraph or table row that also
carries a `bench-study:` marker or the word unaudited. Inline code is
masked the way the linter masks it, and version strings, section
references, and step references live in an allowlist. This is a regex in
the shape of the checks `src/lint.js` already runs. A figure written out
in words escapes it, and that is the residue section 1 names.

**Supersession and retirement.** These are two decisions, and each has its
own ADR. Supersession (ADR-0012): a new figure supersedes an old one only
when a person judges the two comparable and links them, per claim. Blanket
supersession was a draft 1 claim, and it was wrong: a new study on a new
prompt or build measures a different thing. Retirement (ADR-0014): when
the first retained study lands, every unaudited figure in
`bench/README.md` — in a table row or in running prose, and the current
file publishes them in prose — moves into a dated historical appendix,
written so it cannot be quoted as a live row. The record is kept. The
credential is retired.

## 4. Activation, measured end to end

Draft 1 split activation into a cheap check and a delivery mode, and the
review broke both halves. The probe measured model self-report, which the
runner's own comments record as non-evidence. And a probe that passes once
says nothing about whether the skill reached any particular sample. This
draft keeps both pieces with narrower jobs.

### 4.1 The discoverability probe

The probe answers one question: can this harness, on this build, through
this pathway, surface an installed skill at all? It is a probe, not proof
of loading.

1. Install the skill through one real pathway into a pristine environment.
2. Plant a nonce, outside the content the canonical digest covers, or run
   the probe on a separate install from the one any study measures. The
   probed tree and the measured tree must not differ silently.
3. Ask the harness to repeat the nonce, and run the same ask against an
   identical environment with no skill installed.
4. Record both answers, the harness build, the served model identifier,
   the pathway, and the date.

A repeated nonce is evidence the text reached the context. The empty-home
control catches a probe that passes for the wrong reason. A harness trace
that names the loaded file is better evidence than either, and the probe
uses one wherever the harness offers it.

**Cadence and applicability.** Probe cadence is decoupled from publication:
the probe runs once per harness build per pathway, on a calendar, and the
record is committed. A probe applies to a study only when the harness
build and the served model are identical between them, and applicability
is identity, never ordering: a study on an older or merely different model
than the probe's is as unprobed as a study on a newer one. A status line
whose study has no applicable probe says unprobed, and the comparison is
computed, never hand-tracked. A probe result binds to the exact harness,
build, model, platform, and pathway it ran on, and the record says so.
Nothing generalises across pathways. The copy pathways share one static
conformance suite, which needs no live model, and each live pathway needs
its own probe.

### 4.2 Installed delivery

Stage two is one end-to-end measurement, deliberately undivided: discovery,
selection, loading, and effect, together, because together is how the
product ships. A treatment arm that resembles its control does not say
which link failed. It says the installed product did not change the output,
which is the honest headline figure. After the fact, the probe diagnoses
discoverability alone. Selection, loading, and effect stay entangled, and
no record this design retains separates them.

**Provenance.** The sidecar fields split into shared and
delivery-specific, because draft 4 required every field equal except
delivery mode, and that was unsatisfiable: an injected arm has no
installed tree, so a tree digest can never match across the contrast.

Shared fields, and a contrast requires them equal: the canonical digest of
the skill content, computed the same way for injected text and installed
files so the scorer compares content and not category, the package
revision, the platform, and the environment class. The last two also enter
the study manifest, because section 7 binds derived status to both and a
status command cannot derive what no record retains.

Delivery-specific fields, validated by arm type: the delivery mode itself,
and for an installed arm the pathway and the digest of the installed tree,
re-hashed before and after every invocation exactly as the runner already
re-hashes the injected treatment, with a sample collected across a drift
discarded. The scorer requires the shared fields equal, the
delivery-specific fields well-formed for their arm type, and refuses
anything less, exactly as it refuses a mixed build today.

**The isolation prerequisite.** The current runner isolates by working
directory and by suppressing configuration surfaces with invocation flags.
Whether an installed skill is even discoverable under those flags is
unknown, and it is load-bearing: if the installed arm must enable a
configuration surface the control suppresses, the arms differ by an
invocation flag as well as by delivery mode, and the one-variable rule is
unsatisfiable with the current runner. The isolation probe is therefore a
blocking prerequisite, not a deferred item. Its acceptance test: an
installed skill is discoverable under the exact flag set the control arm
runs, in a redirected home the harness fully respects. The design states,
per pathway, which flags each installed arm runs under, and implementation
does not start until the probe passes or fails.

**Environment equivalence, and what a figure generalises to.** Installed
runs get one pristine environment snapshot, cloned per arm, fingerprinted,
with the installed skill as the only difference. Where installation itself
writes configuration, the control arm receives a placebo installation
through the same pathway. But a pristine home is a configuration no user
runs, and this repository's own baseline records that a surrounding
instruction stack dominated the measured effect by a factor of five. So
every published figure names the environment class it generalises to, in
the derived status line and beside the figure. A second treatment arm
carrying a declared, committed, representative operator stack is the
mechanism for claims beyond the pristine class, and for the clean-control
case in section 5.

## 5. The workflow a new craft skill follows

This is issue #21 restated as steps, with the mechanisms above in place.

**The attempt ledger.** The ledger is `bench/samples/LEDGER.jsonl`,
append-only, one JSON object per line. An entry records an event: a rubric
registration, a scenario-frame registration, a scenario selection, an arm
attempt with its outcome, a promotion, an abandonment. Every arm attempt
is an entry, exploratory arms included, so no attempt is invisible. Every
entry carries the skill's canonical content digest and the digests of the
files it registers.

Ordering is not self-attested, and the boundary is the start of the arm,
not the completion of its samples: the runner records an arm-start
timestamp in the arm manifest, because the sidecar `at=` field is written
when an invocation returns, and a registration pushed mid-arm would pass a
completion-time comparison it should fail. An entry counts as
pre-registered only when it was pushed to the public repository before the
arm-start timestamp of every arm it governs. A back-dated commit changes
nothing the server recorded.

Push time is the server's fact, and a clone does not carry it, so
verification is contemporaneous: a CI check runs on the push that carries
a registration, compares the server's record against the ledger while the
server still attests it, and its verdict — run identifier, timestamp,
result — is recorded in the study manifest. The later static check
verifies the recorded attestation, not the vanished push event. The honest
residue: the attestation chain is as durable as the forge that issued it.

1. Run an exploratory control with no guidance, and read the samples. The
   attempt is on the ledger before it starts, like every arm.
2. Stop if the control is already clean, and promote it as a null study.
   A null study promoted from exploration is exploratory class, and its
   line says so: evidence that a control looked clean, never a
   confirmatory claim, because nothing about it was pre-registered. The
   confirmatory claim that no skill is needed takes a pre-registered
   control like any other confirmatory run. The ledger is what closes
   selection here: every exploratory attempt was registered before it
   started, so a clean control cannot be picked from attempts nobody can
   see. One documented exception: when the control is clean but the
   failure is real in a fuller stack — the case this repository's own
   baseline records — the investigation moves to a declared
   representative-stack control arm, and the skill measures against that
   arm and says so.
3. Register the fresh-scenario sampling frame and its deterministic
   selection rule, then write the skill only against a failure a control
   actually shows.
4. Register in the ledger, before any treatment arm starts: the judgment
   rubric, the fresh scenario the pre-registered rule selects from the
   pre-registered frame, the primary metric, the primary scenario, the
   repetition count, the predicted direction, and the stopping rule.
   Everything else the study reports is secondary and labelled secondary.
5. Collect the confirmatory control and the treatment in one declared
   window. The `at=` ranges of the two arms must overlap, and the scorer
   refuses a contrast whose arms are disjoint in time. Alternating
   repetitions within the window is better practice the current runner
   cannot yet enforce, and the overlap rule is what the sidecars can
   verify today.
6. Run the treatment through installed delivery where a probe has passed.
7. Promote every arm, including failed attempts, through the promotion
   review, before publishing anything.
8. Cite the study and result by marker wherever the figure appears.

Step 1 is also where field signal enters. A report from real usage is an
observation with no control arm, so it can show which failure to target,
and it can never confirm what a skill did (#57).

Step 4 puts the analysis ahead of the evidence it will judge. The rubric is
written before any treatment sample can motivate it. The pre-registered
primary metric and scenario close the forking paths: the bench prints
many numbers per study, and without a declared primary, an author reads
them all and publishes the one that moved. The stopping rule closes the
other door, extending an arm until a difference appears. The fresh
scenario bounds tuning to the committed set, and two rules keep it honest.
Provenance: the scenario derives from material the author did not
compose — a field report, a real task from this repository's history, a
prompt from an external corpus — because a scenario written freely can be
written to suit the skill. Selection: the frame and a deterministic rule
are registered at step 3, before the skill exists, because provenance
alone still permits searching a corpus until a favourable scenario turns
up, and a rule fixed before the skill closes that search. The ledger
records frame, rule, and selection. Late disclosure is still the ceiling:
a public repository cannot hold a test set back.

Step 5 exists because the exploratory control goes stale: a control
collected days before its treatment measures a service that may have
moved, whatever the sidecars say.

**Cost, stated.** One publication-tier study at the documented floor is
four scenarios by five repetitions by two arms: forty live calls injected,
eighty with an installed contrast, plus a human label per sample. The
owner ratifies the protocol knowing what one run costs.

A skill that ships before its measurement states that plainly in
`SOURCE.md`. Honesty about an unmeasured rule is the fallback, never the
goal. And the fallback is checked, not trusted: a static check verifies,
in both directions, that a skill's `SOURCE.md` status agrees with the set
of studies whose manifests cite its content digest. Shipping a skill,
writing unmeasured, and never promoting is a state the gate can see.

## 6. Judgment is human, and it is retained

The scorer counts shapes. A person still reads the samples and judges
whether substance survived, and that judgment is part of the study or the
study is incomplete. Each study retains the rubric the judge applied, the
per-sample labels, who judged, what was excluded and why, and the
qualitative conclusion. The compressed-deliberation baseline records what
happens otherwise: a scope judgment made after seeing the divergence,
worth nothing as evidence. Retention does not automate judgment. It makes
post-hoc narrowing visible.

The rubric is pre-registered by step 4 of the workflow, and the ledger's
push-time rule makes the timing checkable rather than self-attested.
Pre-registration timestamps the judgment. It does not purify it. The
rubric still embodies a view of what counts as failure, and retaining it
whole is what lets a later reader argue with that view.

## 7. Status, derived and scoped

A skill's maturity is not a badge. Every claim in section 4 binds to a
harness, a build, a model, a platform, and a pathway, and a single word
such as "tested" erases exactly those bindings. Status is a set of scoped
statements, in three classes.

- **Unmeasured**, hand-written in `SOURCE.md`, for a skill with no study.
  There is no evidence to compute from.
- **Measured without retained evidence**, hand-written and frozen, for a
  measurement whose samples were never kept. No study can ever be derived
  from it, and unmeasured would be false. The compressed-deliberation
  baseline in its grounding matrix is the one instance, and it stays.
- **Derived**, computed from a study or a probe that cites the skill. A
  derived line binds to the canonical content digest the study measured,
  and it carries the study's recorded conclusion — a null study derives a
  line that says the study found nothing, because a line that only says
  measured reads as a credential. A line is printed as stale when the
  skill's current content digest differs from the digest the study
  measured, and as unprobed when no probe matches the study's harness
  build and served model under the identity rule in section 4.1. The
  platform and environment class a line names come from the study
  manifest, which section 4.2 requires to carry both. Staleness is
  computed at read time. A derived line can go stale the moment the skill
  changes, and the computation is what makes that visible instead of
  silent.

Nothing aggregates the lines into a verdict. A reader who wants one reads
the studies.

**Packaging.** `status` is a repository command, like `check:ground`'s
repository half. `bench/` stays out of the published npm package, so no
study, sample, or ledger entry reaches an installed tree, and
`test/package.test.js` keeps asserting that boundary. #56 is scoped
accordingly. Shipping study manifests with the package is a future
decision, taken only with ADR-0007's test extended first.

## 8. What this design does not settle

- Agentic scenarios. Operating discipline (#18) shows up in multi-step
  work the current runner cannot drive. The runner grows that in a
  separate change, and until then no operating-discipline rule claims
  measured effect.
- Cost. Live installed runs are dearer than injection. Injection remains
  the drafting tool. Installed delivery is for publication runs.
- CI never runs a live model. The static checks this design adds — the
  citation and numeral check, the manifest and digest validation, the
  ledger ordering check, the `SOURCE.md` consistency check — join
  `npm run check` as they are implemented, each as a named script.
  Probes are a manual protocol with committed records.
- Sensitivity. Five repetitions is a floor the current runner enforces,
  not a power calculation. Severity at that N is asserted, not estimated,
  and the principles document says so plainly.

## 9. Drafts

- Draft 1 claimed both gaps closed. An adversarial cross-vendor review
  returned thirteen findings against it.
- Draft 2 disposed of all thirteen, and narrowed the claims to match.
- Draft 3 added the pre-registered rubric, the fresh scenarios, and
  derived status, as directed on 2026-08-05.
- Draft 4 disposed of an opus max-effort review of draft 3: seventeen
  findings, five challenged decisions. It retracted two false guarantees
  (immutable by construction, derived status cannot go stale), specified
  the attempt ledger with push-time ordering, enlarged the pre-registered
  payload, added the promotion review, the third status class, the
  numeral check, retirement of unaudited figures, probe cadence, and the
  isolation prerequisite. The five decisions became ADR-0009 through
  ADR-0013.
- Draft 5 disposed of a codex review of draft 4: fourteen findings, every
  one accepted. Failure manifests for aborted arms, ledger coverage of
  every arm with push-before-start and a contemporaneous attestation,
  probe applicability by identity, shared versus delivery-specific
  provenance with platform and environment class retained, the numeral
  check widened to every numeral, two classes of null study, license
  review over every retained file, redaction before scoring, sampling
  frames registered before the skill, retirement covering prose as well
  as tables, and ADR-0012 split into ADR-0012 and ADR-0014.
