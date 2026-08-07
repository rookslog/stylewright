# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Every grounding matrix carries an `Audited` column. A `G` row holds
  `unaudited`, or the date a person read that row against the source and a
  digest of the row they read. No run of the checker raises a row out of
  `unaudited`, and editing any other cell in the row reports the audit as
  stale. `ground --check` prints the audited count for each matrix beside its
  verdict, at a level that fails nothing. A clean check has never meant that a
  person confirmed a citation, and the count is what says so. The date is a UTC
  day, and the check refuses one later than the day it runs on, because nobody
  read a row on a day that has not arrived. ADR-0018 records the decision, and
  every `G` row ships unaudited. A row of another kind carries the cell empty.
- Every grounding matrix carries a `Source text` column. A `G` row holds
  `unquoted`, or the rule's own words in quotation marks, beside the identifier
  that names them. A reader then checks the row in place instead of opening the
  source to find the rule. The marks separate the source's words from ours, and
  a cell carrying neither them nor `unquoted` is refused, because our paraphrase
  under that heading claims an authority the source never gave it. The
  quotation joins the row digest, so writing one voids a recorded audit.
  `ground --check` prints how many rows quote their source, beside the audited
  count and at the same level. No threshold enforces the substitution limit,
  which is a judgment for the reader of that number. ADR-0020 records the
  decision. Every matrix ships `unquoted` throughout, and each says why in its
  own words.
- The grounding check reads the matrix table as a reader sees it. The header and
  the delimiter carry seven columns, every heading is checked by name, and an
  eighth cell is refused. Every row begins at column 0, a fenced row is an
  example rather than a record, and a row the check does not read is named
  rather than dropped. Each of those shapes used to leave the rendered column
  broken while the check reported the audits intact. The table must also be
  contiguous, because GFM ends one at the first blank line, heading, or break.
  When any of this fails, the run prints `not counted: the matrix table is
  broken` in place of the audited ratio, because a count taken over a table the
  reader cannot see reports on a file nobody has.
- `parseMatrix` changed meaning. It returns no rows when the text carries no
  table delimiter, where it used to return every line that looked like a row,
  and each row now carries an `extra` field holding any cells past the last.
  Nothing in this repository reads it other than the grounding check.

- The `navigable-references` skill, in the craft tier. It asks a writer to give
  every named thing a form the reader can follow, in the form the medium
  renders, and to find a line at the moment of citing it rather than from
  memory. No measurement stands behind it. Its `SOURCE.md` says so, and names
  the scenario a study would need.

### Changed

- The purity test parses each module in `src/` and inspects the syntax tree. It
  matched text before, so `const bye = process.exit`, a `new Date` that spreads
  an empty list, and a direct read of standard input all passed it. A reference
  to `process`, `Date`, `performance` or the global object now counts wherever
  it appears, and the test says in one place which constructs it rejects.
  The test also reads what a module pulls in, so `node:perf_hooks` cannot
  rename the clock and the `createRequire` in `node:module` cannot hide a
  module list. `Intl.DateTimeFormat` reads the clock without naming `Date`, so
  it counts too. Descriptor 0 counts through a reader the module aliased first,
  and as an `fd` option that no argument position names.

### Fixed

- **An install is now reversible per skill, not merely orphan-free.** A run
  that failed part way through an update used to leave the tree holding half of
  one release and half of another, with the record naming files that were not
  there. A run killed after retirement left the record naming a path it had
  already deleted. A run now states what it will DESTROY as well as what it
  will write, and moves those bytes to `.stylewright-prev` by rename before it
  touches the destination. A recovery puts them back. Where they are gone, the
  record stops naming the path. The statement carries a `committed` mark, set
  in the same manifest write that records the skill, so no recovery can roll
  back an install whose record has landed. A skill may ship a path ending in
  neither reserved suffix. ADR-0019 records the decision, and
  `test/install.test.js` kills a real process at each boundary the statement
  adds. A rollback frees the held bytes only where the destination holds
  something that supersedes them, so a file the user wrote at a path an
  interrupted run emptied never costs them the only copy of the old release.
  `--force` states what it razes before it razes it, refuses a user file at
  `.stylewright-prev` rather than deleting it, and completes a release that
  changes only the case of a name. A rollback reads the tree three times rather
  than once, so a release that turns a recorded file into a directory puts that
  file back, and one that turns a directory into a file stops the record naming
  the children it destroyed. An empty directory a killed recovery left behind no
  longer traps a skill in a state no command could leave. A file named
  `__proto__` is named by the statement like any other.
- **`doctor` tells a recorded install apart from an unfinished one.** A
  statement left after the record landed reported as an install that did not
  finish, which told the user their skill was half installed when it is whole.
  It now reports as `unswept-install`, naming the version still on disk.
- **A reserved shipped name is refused before the first skill is copied.** The
  rule ran per skill, inside the loop that installs them, so a later skill's
  bad name was refused after an earlier skill had already been committed — and
  the command then failed without ever reporting the install that had happened.
  It joins the portability check in the preflight that runs over every named
  skill.
- **`ground --check` refuses the Markdown it cannot model, instead of reading it
  wrongly.** The extractor reads a line at a time and holds no stack of open
  containers, so a heading, a list item, a fence or a table nested inside a
  blockquote or under an indent became the wrong unit, and a matrix over that
  reading disposed of something the skill does not say. Five review rounds each
  patched one shape and the next one arrived. The check now reads a stated
  subset — every construct at column 0, a wrapped continuation line, and an
  indented code block that stands on its own — and reports anything else as
  `unmodelled-construct` with its line. Every unit it saw before it still sees.
  ADR-0016 records the choice of a guard over a Markdown parser, and the
  evidence that would flip it. The guard states the forms it reads rather than
  the shapes it rejects, because a rejection list is only as complete as its
  last review, and three review rounds each found a shape the list did not
  name. A shape nobody has thought of is refused because the grammar does not
  admit it.

- **A skill name is unique across both tiers, and a collision is now an error
  that names both directories.** The two tiers share one flat namespace, and
  every consumer selects by name alone. Install built a map keyed on the name,
  where the later tier won, so `--tier standards` could copy the craft skill of
  that name and record it as craft. `loadCatalog` now refuses a name that two
  tiers carry, which reaches install, update, `list`, and `ground --check` in one
  place. `new-skill` refuses a name the other tier already holds. `uninstall`
  reports the collision and carries on, because it answers what a target has
  installed and the manifest is the only thing that knows.
- **An install records what it is about to write before it writes it.** The
  engine copied every file and wrote one record at the end, so a run that was
  killed in between left files on disk that no record named. `uninstall` removes
  what the manifest records, so nothing could reach them. A run now states which
  paths it will write, commits that statement to the manifest, and copies after.
  The next `install`, `update`, or `uninstall` clears what an interrupted run
  left, and says which files it cleared. `doctor` reports the directory until
  one of them runs. The statement records what the run was going to write at
  each path, and the cleanup removes a file only when it holds exactly that, so
  a file you wrote at one of those paths stays. Each copy lands whole or not at
  all, through a staging name and a rename.
- **One stylewright command at a time works in a directory.** A second command
  in the same directory refuses rather than acting on a picture the first has
  already changed. Every way two runs could spoil each other — a cleanup that
  cleared a record its writer was still working under, an undo that withdrew
  another run's record, a deletion decided from a picture a commit had overtaken
  — needed the tree to be read and changed in one step, which no filesystem
  offers. A command killed mid-run leaves the directory held, and every later
  command refuses and names the file to remove. Whether a run is still alive is
  the one judgement this tool will not make for you, because making it wrongly
  deletes files a live run is still writing. `doctor` reports a held directory,
  and so does any command that finds one while working out what to do.
- **A manifest write answers to the read that preceded it.** `writeManifest`
  chose between creating and replacing by classifying the path afresh, which is
  a different question from whether the file is still the one the command read.
  Two first-time installs into one directory therefore both succeeded, and the
  second replaced the first's record while the first's files stayed on disk. The
  decision now comes from the read, and a manifest that appeared or changed
  since is refused rather than replaced. The comparison is made while a
  temporary file with a fixed name holds off every other writer, and the rename
  that commits the manifest is what releases it. Creating and replacing take the
  same path, so the manifest is never half written: a run killed mid-write used
  to leave a truncated file that every later command failed to parse. The same rule governs the
  removal of the manifest when the last skill goes. `uninstall` reconciles
  instead of refusing, because by then it has already deleted the files.

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
