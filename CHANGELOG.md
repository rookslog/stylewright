# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- The `navigable-references` skill, in the craft tier. It asks a writer to give
  every named thing a form the reader can follow, in the form the medium
  renders, and to find a line at the moment of citing it rather than from
  memory. No measurement stands behind it. Its `SOURCE.md` says so, and names
  the scenario a study would need.

### Fixed

- **A skill name is unique across both tiers, and a collision is now an error
  that names both directories.** The two tiers share one flat namespace, and
  every consumer selects by name alone. Install built a map keyed on the name,
  where the later tier won, so `--tier standards` could copy the craft skill of
  that name and record it as craft. `loadCatalog` now refuses a name that two
  tiers carry, which reaches install, update, `list`, and `ground --check` in one
  place. `new-skill` refuses a name the other tier already holds. `uninstall`
  reports the collision and carries on, because it answers what a target has
  installed and the manifest is the only thing that knows.

## 0.2.1 — 2026-08-04

### Added

- The `compressed-deliberation` skill, in the craft tier. It corrects one
  model's documented output defaults, and `SOURCE.md` beside it pins the model
  build and the date the skill expires. The seven statements that trace to
  Anthropic's own documentation describe the model. Every rule is ours.
- `bench/`, a protocol for measuring what a style skill does. Fixed scenarios,
  five runs each, and a scorer that refuses a set of samples it cannot vouch
  for. Its first rule is that a run with no guidance is mandatory, because this
  repository's own first baseline came back clean and moved the work off the
  model and onto the instruction stack above it. Its second is that the numbers
  say which sample to read, and never what the sample means.

### Fixed

- The published package ships `grounding/`, so `ground --check --all` has
  matrices to read after an npm install. The packed tarball held none, and the
  advertised command reported every skill as missing its matrix. A new suite
  packs the artifact, extracts it, and runs every advertised command, in its
  flag-driven shape, against the extracted copy.
- **A manifest that is a symbolic link no longer carries a write out of its
  directory.** `readManifest` and `writeManifest` used plain file calls, so the
  one destination in the tool that never went through `src/tree.js` was the one
  that could be redirected. A linked manifest was read through and replaced with
  manifest JSON, the link survived, the outside file was lost, and the command
  exited zero without `--force`. The manifest is now refused unless it is a
  regular file, and it is written beside its destination and renamed over it.
- **`new-skill` no longer writes through a link or over your work.** It checked
  whether the skill directory existed and then wrote six files, one of them the
  grounding matrix, which does not live under the skill directory and was never
  checked at all. A linked grounding path was written through and an existing
  draft was replaced without a word. Every destination and every ancestor is now
  checked first, each file is created with a flag that refuses an existing path,
  and a scaffold that fails part way takes back what it wrote.
- **A manifest of the wrong shape is refused where it is read.** A file whose
  JSON parsed and whose shape was wrong reached install and uninstall, and
  surfaced as an unhandled type error naming nothing. The error now names the
  file and the field.

## 0.2.0 — 2026-07-27

### Added

- Tests for the guided install dialogue. `src/prompt.js` had no coverage at all,
  so a major bump of `@inquirer/prompts` went green without executing a line of
  the code it changed. The three prompt calls are now injectable, and one test
  asserts the library still exports them.
- The `update` command. It was documented in the README and in `--help` from the
  first release, and the dispatcher did not know it. With no flags it reads the
  installer's own manifests and refreshes every skill it finds.

### Fixed

- `doctor` no longer reports a duplicate for the README's own install example.
  It groups by agent rather than by directory, because `--platform claude,codex`
  writes two directories on purpose and each agent reads one of them. Two copies
  that a single agent would load at once are still an error.
- `--skill` accepts a comma-separated list, as `--platform` always did. The
  earlier error named the whole string as one unknown skill and then listed its
  parts as available.
- `uninstall` removes its own manifest when the last skill goes, and removes the
  empty `skills` directory. The agent's own directory stays. It leaves a
  directory alone when it removed nothing from it.
- **`install` no longer destroys a file it did not write.** The drift check
  covered only paths already in the manifest, so a file you created at a path
  the skill also ships was overwritten with no warning. This affects `install`
  in 0.1.0, not only the new `update`. Pass `--force` to overwrite deliberately.
- `install` and `update` remove a file that an earlier version installed and
  this version no longer ships. It used to stay on disk unowned, where
  `uninstall` could not reach it and the agent kept loading it.
- The manifest records the release that last wrote it, rather than the release
  that created it. This now holds for `uninstall` as well as `install`.
- `update` rejects a misspelled `--platform`, `--scope`, or `--skill` instead of
  reporting that nothing is installed and exiting zero. It also rejects a
  platform and scope you named together that cannot pair, such as
  `--platform cowork --scope project`. It still passes over an unsupported
  pair that it enumerated itself.
- A flag that takes a value is an error unless the value names something.
  Neither `--skill` with nothing after it nor `--skill ,` is an empty
  selection: install read an empty filter as "take the whole tier" and
  uninstall read it as "every recorded skill".
- A symbolic link is refused at any path a skill ships, whether or not the
  manifest records that path. The check followed the link, read the path as
  free or as merely edited, and then wrote skill content outside the target
  directory.
- A release may replace a directory of files with a file of the same name, or
  a file with a directory of the same name. Neither transition could complete
  before: `copyFile` cannot write over a directory, and `mkdir` cannot write
  over a file.
- A file of yours sitting where a skill ships a directory is reported as a
  collision. `lstat` below a file component reports the path as absent, so no
  check saw it and the copy stopped with a raw filesystem error instead.
- `uninstall` that removes nothing writes nothing. It used to create a skills
  directory and an empty manifest on a machine that had never installed one.
- `install` and `uninstall` refuse more than one `--scope` rather than acting
  on the first and dropping the rest in silence.
- `uninstall` accepts a skill name that this repository has withdrawn, as long
  as a selected manifest records it. `update` tells you to uninstall such a
  skill, and that advice was impossible to follow.
- **`uninstall` no longer deletes outside the target directory.** It reached
  `fs.rm` directly, so a symbolic link among a recorded path's directories sent
  the deletion through it. It now makes the checks `install` makes before it
  writes.
- `uninstall` no longer stops part-way when a recorded path has become a
  directory. It threw, having already deleted the earlier entries and without
  rewriting the manifest, so the files were gone and the records still claimed
  them.
- `uninstall` keeps a file you edited, and takes `--force` to remove it anyway.
  It promised to remove only what the installer wrote, and a file you rewrote
  is not that.
- `ground --check --skill` rejects a name it does not know. It contributed no
  findings and reported "Grounding clean.", so a typo turned a CI gate into a
  no-op that reported pass.
- `install`, `uninstall` and `update` exit non-zero when they changed nothing.
  An install that refused every skill was indistinguishable from one that wrote
  them all, and a scripted `update` that refreshed no file reported success.
- A directory whose name begins with two periods is removed when it empties.
  The check compared a relative path with `startsWith("..")`, so `..cache` read
  as an escape from the tree and kept its parents alive after the manifest
  entry had gone.
- `uninstall` reports a blocked ancestor rather than reading through it. Once
  the blocker is found the skill is refused whatever the file below turns out
  to be, and a self-referential link made the check throw instead of report.
- A filesystem error the engine cannot interpret prints a message rather than a
  stack trace.
- **A manifest may not name a path outside the directory it belongs to.** The
  manifest is a plain file that anyone can edit, and retirement turned a
  recorded path into a delete instruction. A recorded `../../../victim` with a
  matching hash removed that file with no `--force`, and a recorded `..` took
  the whole skills directory. A skill name must likewise be one directory name,
  because it is joined as one. A recorded path must also already be in normal
  form, because every consumer joins the text as recorded: `a/.` and `a/b/..`
  resolve to a directory, which is removed whole.
- **`--force` no longer removes a file the installer never wrote.** It means
  "remove or overwrite a file I edited". Where a directory of yours stood at a
  recorded path, `uninstall --force` deleted it and everything in it, and
  retirement during `install --force` did the same. The rule is now that force
  may clear what stands in the way of something it must write, and may not
  clear what merely stands where nothing is going.
- `uninstall` advises `--force` only where `--force` is the answer. A blocked
  ancestor, or a directory standing at a recorded path, is refused whether or
  not you pass it, and the advice sent you through the same command twice.
- `update` says what it changed before it says what it could not find. Naming
  one installed skill and one uninstalled one rewrote files and then reported
  only the missing one.
- `--scope user --scope user` names one scope, not two.
- The release workflow no longer reports success for a release it did not
  publish. A tag whose version is already on the registry now fails, with no
  way to accept it, because the branch that skipped the publish reported the
  skip as success. The `v0.1.0` run was green on every job while `npm publish`
  was skipped, so the trusted-publishing path it exists to exercise had never
  run. A release for a version that is already published is one `gh release
  create` by hand.
- The release workflow retries the registry before it calls a completed publish
  absent. The check ran immediately after an irreversible upload, and a
  registry read that lagged the write would have failed the job and taken the
  GitHub Release with it.

### Changed

- Authoring doctrine now permits quoting a source rule beside its identifier. The
  earlier doctrine banned every reproduced sentence, which was broader than the
  risk it managed and made every grounding matrix harder to audit. The limit is
  now substitution: a skill must not carry enough of a standard to replace it.
- A controlled vocabulary is treated as two things. The approved and non-approved
  word pairs are method, and a lint dictionary may carry them. The definitions
  and usage notes are expression, and we do not reproduce them in bulk.
- A skill may include a word list. The earlier prohibition ruled out the only
  part of a skill that `stylewright lint` can enforce. A list must give a reason
  per entry, warn rather than error, and not be the whole skill.

## 0.1.0 — 2026-07-27

First public release.

### Added

- The `stylewright` engine, with `install`, `update`, `uninstall`, `list`,
  `doctor`, `lint`, `ground`, and `new-skill`.
- A guided install dialogue, which runs when you pass no flags. It detects the
  agents on your machine, lets you select skills one by one, and shows every
  destination path before it writes.
- The `simplified-technical-english` skill, distilled from ASD-STE100 Issue 9.
- The `plain-language` skill, distilled from the Federal Plain Language
  Guidelines. It states where the two standards disagree, and why.
- Grounding matrices, which trace every statement in a skill to a numbered rule.
  A `G` row traces to the source. An `E` row is our own guidance.
- `stylewright lint`, which checks the part of ASD-STE100 that a program can
  check. Continuous integration runs it against our own documents.
- A conformance suite, which proves that the manual copy pathway and the engine
  pathway produce identical trees.
- The `new-skill` scaffold, which writes a skill that passes both checks from
  the start.

### Notes

- Install works by copy, never by symbolic link.
- `update` refuses to overwrite a file that you edited, unless you pass
  `--force`.
- `uninstall` removes only the files that the manifest records.
- Grounding matrices stay in the repository. No pathway installs them.
