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
bytes this run displaced. Content decides ownership. The destination
decides direction, and **only two things standing there supersede the
held bytes**.

- The copy this run made, which the deletion pass kept because a record
  names those bytes.
- A version another run committed, whose record is live.

Everything else leaves them held.

- **A file the user created after the interrupted run**, at a path that
  was empty because this run had emptied it. Nothing supersedes these
  bytes. For a retired path they are the only copy left on the machine,
  because no release ships them and no record can restore them.
- A directory, a link, or anything else that is not a plain file. The
  rule reaches these by the same clause, because it asks what content
  the destination holds and only a plain file holds any.

The first draft of this decision enumerated only the superseding two and
deleted the moved-aside file whenever anything occupied the destination.
That destroyed the user's only copy silently, and it made the two halves
of the statement disagree: the write half leaves an unmatched
destination standing for the collision check, and the keep half was
deleting a matched one. So a file whose destination holds content that
is neither the stated write nor a recorded hash stays where it is, and
the collision check names it at the next install.

Nothing is ever written over a file standing at the destination.

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

`--force` costs reversibility in two places, and both are stated rather
than discovered.

- A directory or a link standing at a shipping path is cleared rather
  than moved aside, because neither can be kept as the bytes of a file.
- A blocked ancestor that `--force` razes takes every recorded path
  beneath it, and those bytes sit behind a blocker this run refuses to
  walk through, so they cannot be moved aside at all.

In the second case the statement still NAMES the razed paths, with the
hash the record holds and nothing under the reserved name, so a rollback
withdraws them. That is the repair below, reached deliberately. The
razing also happens AFTER the statement rather than before it: putting a
destruction ahead of the record that names it is the one ordering this
engine exists to forbid, and doing it first left every pre-commit window
with a record no command could reconcile.

What `--force` does NOT do is dispose of a file at `.stylewright-prev`.
Force removes what stands in the way of a file it must write, and nothing
is written at that name — it is where this tool chooses to put bytes it
is choosing to preserve, and choosing to preserve one file must never
cost the user a different one. The run is refused and the file is named.
The staging name is the other way round, because the copy must have that
path, and PR #54 settled it there.

That refusal has one cost, and it falls on a population that should be
empty. A manifest an OLDER release wrote can RECORD a path spelled with
this suffix. No install can then move that skill forward: the collision
is real and `--force` no longer clears it. The exit is `uninstall`
followed by `install`, and the message says so — removing the file as
the ordinary advice suggests would strand the record that names it. No
skill this repository ships has ever carried such a name, and install
refuses to record one, so the case exists only for a manifest written
before that refusal did.

One shipping path cannot be held either, with or without `--force`. A
release that replaces a directory of files with a file of the same name
must clear that directory, and clearing it takes the bytes moved aside
beneath it. The statement still NAMES those paths, so a rollback
withdraws them from the record rather than leaving it over-claiming.
That is the repair this engine already had, reached deliberately here
rather than by omission.

**Two spellings can name one file.** A release that changes only the case
of a name retires `Notes.md` and ships `notes.md`, and a case-folding
target makes those one path — and their two reserved names one path as
well. So a set-aside asks the filesystem whether the destination still
holds the file the statement named, before it clears anything. A spelling
that folds onto one an earlier pass already moved answers no, and the
pass skips. Without that, the second pass cleared the reserved name the
first had just moved the user's bytes into, then threw a raw `ENOENT`.

The question is the same one PR #54's `recordedAs` asks — whether two
spellings reach one file is the filesystem's to answer, never the
platform's — but the answer here is cheaper. `recordedAs` compares device
and inode because it must say WHICH record reaches a file that exists.
This only needs to know whether the file the statement described is still
there, so existence and content settle it.

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
