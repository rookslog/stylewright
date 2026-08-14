# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- A grounding matrix disposes of one file, and `ground --check` reads every file
  a skill ships to a writer. `SKILL.md` keeps `grounding/<tier>/<skill>.md`, and
  a Markdown file under `references/` answers to a matrix that mirrors its path,
  such as
  `grounding/standards/simplified-technical-english/references/examples.md`. The
  two STE reference files installed on every pathway with no row disposing of a
  line in either, and one of them mapped real `Rule N.N` identifiers to topic
  labels with no `G` row anywhere. They carry 124 rows between them now, six of
  them `G` rows, every one `unaudited` and `unquoted`. A row space is per file
  because `Our anchor` names a heading, and two files in one skill can carry the
  same heading. A graded file with no matrix is an error naming the matrix to
  write, and so is a matrix that grades no file. A file under `references/` that
  is not Markdown is refused, because the walk reads Markdown alone. Every
  finding names the file it came from, beside the skill. ADR-0030 records the
  decision, and it amends ADR-0025's count from a note to an error. Issue #99.
- A blockquote is a unit the checker reads, rather than a construct it refuses.
  It is one block, from its first marker at column 0 to the first line without
  one, named by a designator such as `[quote 8f3a2b1c]` whose digest binds the
  quoted lines. That is the disposition a table and a fenced block already have.
  The old refusal was never about the marker: the walk merged the quote with its
  contents, so a quoted list reached a row as a paragraph carrying its own
  markers. A line directly under a quote is refused instead, because a reader
  continues a quote over a line that carries prose, and the walk holds no state
  to say when. Leave a blank line under a quote. An indented marker stays
  refused. `skills/standards/simplified-technical-english/references/examples.md`
  went from 113 units and 41 refusals to 113 units and none. ADR-0031 records
  the decision, and `test/gfm-render.test.js` holds every claim in it against
  `micromark`.
- A grounding matrix names the reading its audits answer to, above its table,
  as `**Source version:**` and a pin. The pin joins the row digest, so moving
  the source on voids every audit in the file at once. A `G` row cites a rule
  by number, and a rule number survives a new edition, so the row-only digest
  let a source bump leave every audit reading as current over an edition
  nobody had opened. A matrix with a `G` row carries the line, and a matrix
  without one is refused for carrying it. The pin is the whole paragraph, so a
  wrapped line binds every word a reader sees. `latest` and `HEAD` are refused,
  because a reader has to date those for themselves. A matrix whose source
  nobody has read declares `unread`, which names no reading, binds no digest,
  and refuses a recorded audit by name rather than printing one to paste. A
  scaffolded matrix starts there. Placement follows the
  quotation declaration: above the header row, outside raw HTML, once, and a
  second line refused rather than overruling the first. A declaration the check
  cannot read leaves the matrix naming no reading, and every audit in it reads
  stale. `rowDigest` takes the pin and refuses a caller that omits it, for the
  reason `checkSkill` refuses a caller that omits the day. ADR-0026 records the
  decision and amends ADR-0018's digest. Issue #73.
- The repository records who read its own prose, in `editorial/AUDITS.md`, and
  `npm run check:editorial` checks that record. A row names a document, the UTC
  day a person read it with `de-slop` and `compressed-deliberation` open, and a
  digest of the bytes they read. The check refuses a malformed row, a document
  the list does not govern, a document stamped twice, and a day the calendar
  does not carry or that lies ahead of the run. It reads the record and never
  the prose, because `de-slop` states in its own words that no check sees the
  moves it names. What it counts, coverage and staleness, prints as a note and
  fails nothing, so a document that changed since somebody read it blocks
  nothing. A stamp records a person, and an agent never writes one. The record
  ships with no rows, so the count reads zero of six until somebody reads a
  document and says so. The governed list lives in the checker rather than in
  the record, because a list the record carried would be a denominator the
  record could shrink. ADR-0027 records the decision, the gate it declined, and
  what would reopen it. Nothing installs from `editorial/`. Two published files
  do change: `src/ground.js` exports the day reader this check dates a reading
  with, and `package.json` names the new script. No behaviour in either moves.
- A test renders a grounding matrix through a real GFM parser and compares what
  a reader sees against what the checker read. Every claim this repository made
  about how a matrix renders came from a reading of the specification, and the
  contiguity hole on pull request #71 survived three review rounds because every
  attack came from that same reading. `micromark` and its GFM table extension
  join the development dependencies, and a test asserts that no module under
  `src/` or `bin/` imports either. ADR-0028.
- `npm run check:probes` reads the harness trace a record retains, and prints
  `trace_agrees` and `managed_seen` beside every other derived flag. The
  reading parses `Loaded 1 unique skills` from the retained lines, and it
  agrees when the installed arm loaded at least one skill and the control
  loaded zero. It reads every such line rather than the first, because the
  harness repeats the line per session. It takes the count for the scope the
  probe installed into and never the total, because the total counts managed
  skills and a redirected home does not move the machine-global managed skills
  path. A disagreement blocks the pass, because a trace naming the loaded file
  is better evidence than either answer and better evidence that contradicts
  them cannot be a note. A reading the check cannot make is withheld instead,
  and `trace_withheld` names the cause as `absent`, `truncated`, or
  `unscoped`, because a `null` whose cause a reader cannot see is the wrong
  number one step removed. `managed_seen` is the largest managed count either
  trace states, and it blocks nothing: whether a skill that reached an arm from
  the machine spoils the arm is a judgment a record cannot answer. The
  derivation read the answers and the flags alone until now, so a control
  whose trace said it loaded a skill derived a pass on the strength of an
  answer that said nothing. ADR-0024 records the decisions and what would
  reopen each one. Issue #94.
- `TRACE_LINE_LIMIT` moved into `bench/probe.mjs`, beside the derivation that
  depends on it. The collector cuts the kept set at that bound, so a trace
  standing at it may be the prefix of a longer run. Reading the prefix as the
  whole trace let twenty sessions loading one skill certify a pass over a
  twenty-first that loaded zero. The bound decides a reading and never a
  record's validity, because refusing a record for its length made a probe a
  malformed file and would have retired committed evidence whenever somebody
  lowered the constant.
- `npm run check:probes` names a record it cannot read and counts it as
  `unread`. It counted an outcome only for a record that checked clean, so a
  record that became malformed left the census and the count described fewer
  records than the directory carried. A test pins each committed record's whole
  derived tuple, so an edit to the reading or its constants fails the suite
  rather than silently re-grading append-only evidence.
- `checkRecord` asks of a record what the collector could have produced.
  `identity.pathway` is validated as a combination rather than as two halves,
  so `cowork:project`, `agents:project` and `codex:user` are refused — the
  first two carry no project directory and the third has no runner, so no run
  of this collector could have written such a record. `targetProblems` in
  `src/targets.js` is the one table, and `resolveTarget`, `parsePathway` and
  the record check all read it. A record carrying a trace whose flag set never
  asked for one withholds as `unrequested`, and `managed_seen` withholds on the
  same condition, because a count published from those lines states something
  about a machine from bytes no recorded run could have produced. The `.claude`
  refusal on the trace path anchors at a segment boundary and ignores case, so
  a relative `.claude/trace.log` and a shouted `.CLAUDE/trace.log` are both
  refused. The filesystems this tool runs on fold case, so those two spellings
  name one directory.
- `npm run check:probes` prints its census before it sets a failing exit
  status. Every branch that counts a record `unread` also files a problem, so
  the total naming the unread denominator never printed on the one run it was
  built for.
- The probe's arm sequence moved out of `main`, into `runArms`, and three
  invariants ADR-0024 states as prose now have a test each. The debug path is
  derived under the throwaway root and a path outside it is refused. The trace
  file is read and removed on every arm rather than on the first alone, so no
  arm inherits the arm before it. One flag set is built above the loop, because
  a record carries one `flags` array and two sets would be true of neither arm.
  Each invariant had a surviving mutation that produced a well-formed record
  deriving PASS with its evidence misattributed, and each mutation now fails
  the suite. The extraction is what made them reachable, because `main` spawns
  a live harness. Issue #95.

### Changed

- `proportionate-execution` says how it differs from `de-slop`. Three of the
  four craft skills already related themselves to a neighbour, and `de-slop`
  has named this one since 0.3.0, so the closest pair was cross-referenced
  from one side. A reader who loads `proportionate-execution` now learns that
  the prose-shape lane exists. `de-slop` treats one passage of prose, and this
  skill governs a session, so it holds what an agent does as well as what it
  says. The matrix disposes of both new units, as `E-28` and `N-09`.
- A skill directory ships `SKILL.md`, `LICENSE`, `agents/`, and `references/`,
  and `ground --check` refuses any other file by name. The matrix disposes of
  `SKILL.md` and opens no other file, so a second file beside it installed
  ungraded on every pathway. The source record moved out of the skill
  directory, to `source/<tier>/<name>.md` beside the matrix, and it no longer
  reaches an installed tree. Location is the mechanism, because four of the six
  install pathways run none of our code. The allowlist states what may ship
  rather than what may not, for the reason ADR-0016 gives about the extractor.
  Each shipped `LICENSE` and each `SKILL.md` that pointed at `SOURCE.md` now
  names the record's path in the repository. `ground --check` also prints how
  many files under `references/` no row disposes of, per skill that ships one.
  That count is a note and it fails nothing, the way the audited count does.
  ADR-0025 records both decisions, and issue #99 carries the grading work that
  closes the second.
- Two claims about GFM that the new render test corrected. A line of prose
  under a table does not end the table, so the check is stricter there than a
  reader is. Renaming a matrix heading renders the column under the new name
  rather than dropping it, and the record is lost either way.

### Fixed

- A continuation line in a skill states what it may begin with, and the
  grounding check refuses every other lead. The path admitted a line whenever
  prose was open and then asked what the line looked like, and anything the
  check did not recognise came back a paragraph, so an HTML block, an HTML
  comment and a setext underline each reached a list item as the item's own
  words with no refusal at all. One pipe was the widest hole: any line carrying
  one read as a table row, and every table row was admitted. A line now carries
  a letter, a digit or ordinary sentence punctuation, and the refusal names
  what the check cannot say, which is which container the line opens. The cost
  is a false refusal an author writes around. A backtick and a tilde are
  admitted where the walk's own fence test says the line opens no fence, and
  refusing them cost 166 false refusals across 574 real skill files, none of
  which opened a block. ADR-0029 records the inversion, the measurement, and
  what it does not reach: a line at column 0 is still admitted whatever it is,
  which issue #111 carries. Issue #69.
- A table with no pipe in it is refused rather than read as prose. GFM asks for
  no pipe at all when a table has one column, so `Prose here.` over `:-` is a
  table to a reader, and so are `:-:`, `-:`, `-|` and `|-`. The walk reads a
  table through its pipes, so it produced one prose unit and no refusal, and a
  table's contents could be grounded as the paragraph's own words. A colon or a
  pipe in the delimiter is what stops the line being a setext underline, so
  `---` under prose is still the heading both parsers say it is.
- A list marker padded five columns or more holds an indented code block, and
  the check refuses the item rather than reading the code as the item's prose.
  The padding is measured in columns, so a tab after the marker is worth what
  it is worth to a reader. Issue #70.
- An ordered marker that counts from anything but one opens no list where a
  paragraph is open and no list is, because a reader will not let that list
  interrupt the paragraph. `Prose` over `2. item` split one paragraph into two
  units and left a list open across the blank line below, so a standalone code
  block after it was refused for sitting under a list nobody wrote. Issue #70.
- A setext underline reads a trailing carriage return, so a CRLF checkout still
  carries its setext headings. The column rule that fixed the tab-indented
  underline named the space and the tab and dropped the `\r` that `\s` had
  carried, which stopped `sections` reading any setext heading on such a
  checkout: every unit below one re-anchored to the preamble with no refusal,
  and a procedural section stopped counting as procedural for `lint`.
- A setext underline is validated with the shared column rule, so an underline
  indented four columns is no underline. `Rules` over a tab and three dashes
  made a heading here while a reader keeps both lines as one paragraph, and
  every anchor below it moved. Issue #70.
- An empty list marker under an open ITEM is refused, because a reader sees the
  next item of the list there. One flag stood for that state and for an empty
  marker under an open paragraph, which is that paragraph's own words, so
  `- First.` over `-` over an indented directive rendered as two items and
  reached one matrix row as the first item's words.
- A matrix row splits on a pipe that an ODD run of backslashes precedes, which
  is what a reader's renderer does. A one-character lookbehind read `x\\|` as
  an escaped pipe, so the checker saw one cell where a reader sees two, and a
  row ending that way read as unclosed. The new render test found it.
- The test that holds `bench/probes/README.md` to the probe's flag constants
  asks how many arm invocations the file spells, and the answer is one. It
  asked whether the right spelling appeared somewhere, so a second copy that
  had gone stale sat beside a correct one and the check stayed green. A second
  test holds the block to what it deliberately omits, because the absence of
  `--debug-file` there is the claim that the flag is allowed and never
  required. Issue #95.

## 0.3.0 — 2026-08-07

### Added

- The `navigable-references` rule also ships as a resident fragment, installed
  by name as `stylewright-resident`. A skill loads when its trigger matches,
  and this rule applies to every sentence, so no trigger fires reliably. The
  fragment is an ordinary manifest-recorded file under the target directory, so
  it inherits the tree checks, the pending journal, drift refusal, `--force`,
  and exact uninstall. The tool prints the one import line and never writes to
  your instruction file. `doctor` gains `resident-not-imported`, which reports a
  fragment that no instruction file imports, and `resident-double-delivery`,
  which reports a rule delivered as both an installed skill and an imported
  fragment at once. Each check compares the exact line this tool told you to
  paste, spelled for the file it reads, so a mark in one scope cannot answer
  for a fragment in another. A write into your instruction file could never
  detect the inactive state. The check reads no Markdown, so a copy of the line
  inside a code fence counts as an import, and a file it cannot read counts as
  no import. The fragment is generated from the skill, and
  `npm run check:resident` fails a checkout where the two disagree. No tier
  selects the fragment, and it installs for `claude` and `cowork` only, because
  this repository has verified no import form for Codex. ADR-0022 records the
  decision and states both directions, and issue #24 keeps what the pilot
  leaves open.
- Every grounding matrix carries an `Audited` column. A `G` row holds
  `unaudited`, or the date a person read that row against the source and a
  digest of the row they read. No run of the checker raises a row out of
  `unaudited`, and editing any other cell in the row reports the audit as
  stale. `ground --check` prints the audited count for each matrix beside its
  verdict, at a level that fails nothing. A clean check has never meant that a
  person confirmed a citation, and the count is what says so. The date is a UTC
  day, and the check refuses one later than the day it runs on. ADR-0018
  records the decision, and every `G` row ships unaudited. A row of another
  kind carries the cell empty.
- Every grounding matrix carries a `Source text` column. A `G` row holds
  `unquoted`, or the rule's own words in quotation marks, beside the identifier
  that names them. A reader then checks the row in place instead of opening the
  source to find the rule. The marks separate the source's words from ours, and
  a cell carrying neither them nor `unquoted` is refused, because our paraphrase
  under that heading claims an authority the source never gave it. The
  quotation joins the row digest, so writing one voids a recorded audit.
  `ground --check` prints how many rows quote their source, beside the audited
  count and at the same level. No threshold enforces the substitution limit,
  which is a judgment for the reader of that number. Every pair holds
  something, because an empty pair quotes nothing.
- Every grounding matrix declares whether it may quote its source, as
  `**Quotation:** permitted` or `**Quotation:** forbidden` at column 0, with
  the reason beside it. Under `forbidden` the check refuses every `Source text`
  cell but `unquoted`. A recorded prohibition used to live in prose alone, so
  rule text substituted into the matrix whose owner forbade rule text left the
  gate green. The line sits above the header row, outside raw HTML, and names
  its state once, because a permitting line was accepted under the table, again
  inside a collapsed `<details>`, and again qualified into meaning both. An
  absent declaration reads as `forbidden`, so does an unreadable one, and a
  second one is refused rather than lifting the first. ADR-0020 records both
  decisions. Every matrix ships `unquoted` throughout, and five of the six
  forbid quotation.
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

- The `proportionate-execution` skill, in the craft tier. It holds an agent in a
  session to the size of the task: report a step the reader can act on, do the
  work the request defines, and name a condition at the severity it carries. It
  keeps the narration a reader relies on to intervene, which is the one case the
  first three rules must not cut. Five `G` rows describe behaviour Anthropic
  documents in Claude Opus 5, and every rule answering them is ours. ADR-0005
  admitted operating discipline to this tier, and it forbids a measured claim
  until the bench can drive a multi-step session. No arm has been run, and the
  skill `SOURCE.md` says so.
- The `de-slop` skill, in the craft tier, and the skill this repository is named
  for. It names rhetorical moves rather than words. The body is a positive
  recipe, which the owner ruled on issue #1: it states the shape of a finished
  passage in five parts, and the named defects sit beside it as departures from
  that shape. A prohibition list is the right form for discipline under
  pressure, which is the lane `proportionate-execution` carries, and forcing one
  form onto both failure types was the error. It ships no signature word list,
  no part of the shape is enforced by matching a word, and ADR-0021 keeps that
  kind of list out of every skill directory, because a list of forbidden words
  teaches an agent to swap each word for its nearest neighbour and leaves the
  defect behind a cleaner surface. A controlled vocabulary from a published
  standard is a different artefact and keeps its existing gate. The skill also
  states what compression costs, and names the April 2026 Claude Code brevity
  revert that Anthropic reported. No measurement stands behind it, and ADR-0021
  accepts that rather than holding the skill on structural metrics the scorer
  does not have.
- A `signatures` metric in `bench/score.mjs`, beside `hedges` and `menus`. It
  counts listed words and short phrases per occurrence, and it ships with an
  empty list, so it reads zero on every sample. The bench is where a count of
  this kind belongs, because no install pathway copies it and a scorer tells an
  agent nothing. An entry carries a stated reference distribution before it
  counts against anything, in ADR-0021 and in a comment at the metric, because
  a frequency with no denominator reads as evidence and is not evidence. A word
  becomes a lint rule only after a promoted study says it should.
- The `navigable-references` skill, in the craft tier. It asks a writer to give
  every named thing a form the reader can follow, in the form the medium
  renders, and to find a line at the moment of citing it rather than from
  memory. No measurement stands behind it. Its `SOURCE.md` says so, and names
  the scenario a study would need.

- **Retention has a mechanism.** `bench/samples/` was named as the store on
  2026-08-04 and nothing could reach it, so every figure in `bench/README.md`
  stayed unaudited. `bench/run.sh` now writes an arm manifest when an arm
  stops, finished or aborted, naming every file the arm planned to hold and
  the digest of every file it holds. The manifest states no verdict, and
  `armState` derives whether the arm covered its plan. `bench/retain.mjs`
  promotes whole arms into a committed study through `src/tree.js`, and it
  refuses an arm with no manifest, an arm whose files disagree with it, an arm
  collected under `--rules user`, a sidecar naming the operator's own rule
  files or an absolute path to the system prompt, a retained file carrying
  operator configuration or anything credential shaped, a prompt that changed
  after the samples answered it, a promotion with no recorded license check,
  and a study directory that already exists. Redaction is the design's other
  option for a `--rules user` arm and nothing builds it, so that refusal is
  total.

- **A promoted study states no figure, and the check recomputes every one.**
  The scorer runs after the copy, over the promoted bytes, one scenario at a
  time, and the study manifest retains its command and its output verbatim.
  `npm run check:studies` derives one figure per cell of the scorer's own
  table, under `<scenario>.<arm>.<statistic>.<metric>`. It then re-runs each
  retained command over the promoted bytes and compares, because the retained
  table was the one promoted artifact no digest covered and every figure
  derives from it. That re-run executes a program, so the check runs
  `bench/score.mjs` by literal name and refuses a study or a command naming
  anything else. A scorer whose digest has moved refuses the re-run and names
  both digests. Every child of either spawn gets an environment built by name,
  with no credential and no home directory, and the re-run gets a deadline that
  kills it. A study already refused for any reason is never re-run, because
  containment resolves no symbolic links. A command naming a file outside the
  study is refused before it runs, and so is a command element that is not a
  string. Stdout, stderr and the
  exit code are all compared, because none of the three carries a digest.
  Every path the manifest names is checked for containment, every file
  the study holds is accounted for, and a symbolic link inside a study is
  refused rather than skipped. An arm that did not cover its plan still
  promotes, and every figure it had a hand in reads unaudited with the reason
  on the figure. ADR-0023 records the decision, the deferred redaction, and the
  provenance a study cannot yet carry, which it names as gaps rather than
  inventing.

### Changed

- `bench/run.sh` records the system prompt as a path inside the repository
  rather than as an absolute one. A sidecar is promoted into a public tree, and
  an absolute path names the operator's own filesystem.

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

- **`node bench/score.mjs` did nothing on Windows.** Its entry guard compared
  `import.meta.url` against a `file://` URL glued together from
  `process.argv[1]`, and the two spellings can never match there. Nothing in
  continuous integration ran the scorer as a command, so the defect stayed
  invisible until promotion spawned it and a study derived no figure from a run
  that reported success. Every entry point here now compares paths through
  `fileURLToPath`, and a test holds the whole of `bench/` to it.

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
  to leave a truncated file that every later command failed to parse. The same
  rule governs the removal of the manifest when the last skill goes.
  `uninstall` reconciles instead of refusing, because by then it has already
  deleted the files.

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
