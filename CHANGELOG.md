# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

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
