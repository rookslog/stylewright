---
type: adr
status: accepted
decided: 2026-08-06
issues: [55, 72]
---

# ADR-0019 — A run states what it destroys, and holds the bytes until it commits

PR #54 made an install orphan-free. Every file the engine can create is
named by a record that reached the disk before the file did, so nothing
is left that no command can reach. It did not make an install
reversible, and two findings named the gap from two directions.

A run that fails part way through an update has already replaced some
files. Those hold this run's bytes, so the rollback removes them, and
the bytes they replaced are gone because no process held them. A run
killed after retirement has already deleted a path the record still
names. Both end in a record that over-claims. The engine repaired that
direction rather than preventing it: install restores an absent recorded
file, and uninstall tolerates one.

The repair leaves a real cost. The tree holds half of one release and
half of another, and the manifest names files that are not there until
some later command puts them back.

## What the alternatives were

**Leave it.** Orphan-free is the property that matters for safety, and
the repair invariant is real. It is also the state issue 55 was opened
to end, and every future release transition pays the cost again.

**Copy the file aside before overwriting it.** A copy can stop half way,
which is the fragment problem the staging name already exists to avoid,
one suffix along.

**Log the deletions only, and reconcile the record.** This closes the
retirement half. It cannot restore an overwritten file, because nothing
held its bytes.

**Decision.** A per-skill undo log answers both halves, so both are
decided together.

`pending[name]` has one shape with three named parts.

- `write` names each path the run will write, with the bytes it will put
  there. That is the statement PR #54 added, under a name.
- `keep` names each path the run will DESTROY — a file it overwrites and
  a file it retires alike — with the bytes that path held. Those bytes
  move to a second reserved name, `.stylewright-prev`, by rename, before
  the destination is touched.
- `committed` marks the direction. It is set in the same manifest write
  that records the skill.

## The invariants this rests on

**What proves a file is ours to delete** is unchanged. A file at a
stated write path goes when it holds exactly the bytes `write` names and
the manifest does not record that same content.

**What proves a file is ours to restore** is that the file under
`.stylewright-prev` holds exactly the bytes `keep` names. The hash is
taken before the rename that moved them, so a match proves these are the
bytes this run displaced. Content decides ownership, and the destination
decides direction: a matching file goes back where the destination is
absent, and goes away where it is not. Nothing is ever written over a
file standing at the destination, because that is either the copy this
run made or a version another run committed, and neither wants an older
version put on top of it. Leaving a matching file where it is instead
was the alternative, and it blocks every later install with a collision
at a name the user cannot be expected to explain.

**What a reading is still true about when it is acted on** comes from
the lock. One run holds a target directory, so nothing of ours moves
between the statement and its recovery. A person can still move
something, so every disposition is content-proved rather than
path-proved. A file at the reserved name that matches nothing is left
alone and named by the ordinary collision check, which is the
disposition `refuseStaleWrite` already gives the other file this tool
cannot prove it wrote.

**Nothing this run creates outlives a record that names it.** The
reserved name is derived from a path the statement carries, and the
statement is withdrawn only after those bytes are gone. So a file under
`.stylewright-prev` is reachable from a record written before it,
exactly as a staging file is.

## What it costs

A skill whose install destroys nothing writes one manifest at commit, as
before, so a first install is unchanged and the conformance suite still
compares equal manifests. A skill whose install replaces or retires
anything writes three: the record and the mark together, then the
withdrawal once the bytes are swept.

`--force` still costs reversibility in one place. A directory or a link
standing at a shipping path is cleared rather than moved aside, because
neither can be kept as the bytes of a file. That is the line `--force`
already draws.

One shipping path cannot be held either, with or without `--force`. A
release that replaces a directory of files with a file of the same name
must clear that directory, and clearing it takes the bytes moved aside
beneath it. The statement still NAMES those paths, so a rollback
withdraws them from the record rather than leaving it over-claiming.
That is the repair this engine already had, reached deliberately here
rather than by omission.

`pending` has never appeared in a published release. 0.2.1 predates
PR #54, so no manifest in the wild carries the older flat shape, and the
read refuses it rather than carrying a second shape forward.

## The reserved-name rule moved

A skill may ship neither reserved suffix. That rule ran per skill inside
the loop that copies them, so a later skill's bad name was refused after
an earlier skill had already been committed, and the command failed
without reporting the install that had happened. It is a rule about what
a request may contain, so it now runs over every named skill before the
first is touched, beside the portability check. That closes issue 72.

## What would reopen this

A failure injected at a boundary that leaves the tree holding parts of
two releases. `test/install.test.js` kills a real process at each
boundary the statement adds and asserts the next command lands on one
release. A boundary those tests do not reach is a gap in this decision,
not a new defect.
