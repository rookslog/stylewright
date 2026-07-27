# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

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
