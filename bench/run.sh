#!/bin/zsh
# Collect samples for one arm of a style comparison.
#
#   bench/run.sh <arm-name> [--rules user|none] [--reps N] [--system FILE]
#
# An arm is one configuration. A comparison needs at least two, and one of them
# must be the no-guidance control. See bench/README.md for why.
#
# Samples land in bench/out/<arm-name>/<scenario>-<rep>.txt and are never
# overwritten, so an interrupted run resumes where it stopped.
set -e
HERE="${0:A:h}"
ARM="$1"; shift
[ -z "$ARM" ] && { print -u2 "usage: run.sh <arm-name> [--rules user|none] [--reps N] [--system FILE]"; exit 2 }

RULES=none
REPS=5
SYSTEM=
MODEL=opus

while [ $# -gt 0 ]; do
  case "$1" in
    --rules)  RULES="$2"; shift 2 ;;
    --reps)   REPS="$2";  shift 2 ;;
    --system) SYSTEM="$2"; shift 2 ;;
    --model)  MODEL="$2"; shift 2 ;;
    *) print -u2 "unknown flag: $1"; exit 2 ;;
  esac
done

# First field only. `claude --version` prints "2.1.220 (Claude Code)", and a
# `.meta` line is whitespace-delimited key=value, so the parenthetical would
# arrive as two more keys.
CLI_VERSION="$(claude --version 2>/dev/null | head -1 | awk '{print $1}')"

# Resolve and read the system prompt HERE, before anything changes directory.
# A relative path used to be expanded inside the sample subshell, after the cd,
# so `cat` failed, the flag received an empty string, and the arm ran with no
# guidance at all. It then scored like the control, which is the one result an
# arm can produce that looks like a finding and is not.
SYSTEM_SHA=none
if [ -n "$SYSTEM" ]; then
  SYSTEM="${SYSTEM:A}"
  [ -r "$SYSTEM" ] || { print -u2 "cannot read --system file: $SYSTEM"; exit 2 }
  SYSTEM_TEXT="$(< "$SYSTEM")"
  # `print -u2 --`, because the message starts with `--system` and print would
  # otherwise read it as its own flags.
  [ -n "$SYSTEM_TEXT" ] || { print -u2 -- "--system file is empty: $SYSTEM"; exit 2 }
  # Read ONCE, here. Every rep of every scenario then measures this same text
  # even if the file is edited while the arm runs.
  SYSTEM_SHA="$(print -r -- "$SYSTEM_TEXT" | shasum | cut -c1-12)"
fi

# The operator's own rule files are a treatment too, whenever --rules user is in
# play, and they are the ones most likely to be edited between arms.
#
# Hash them PER FILE, not as one concatenation. A single digest over the set
# changes identically whether one file was edited or three were, so the defect
# this protocol actually retracted — an arm carrying two edited rule files while
# named for one — would still be invisible. The manifest names each file with
# its own hash, so a later reader can say which one moved.
# `--setting-sources user` enables the whole user source, which is settings AND
# CLAUDE.md and what it imports — not markdown alone. Hashing only the markdown
# left a treatment fingerprint that stayed equal while a settings change altered
# the invocation, so the sample was accepted under a fingerprint that did not
# describe it.
user_rules_manifest() {
  [ "$RULES" = user ] || { print none; return }
  for rf in ~/.claude/settings.json ~/.claude/settings.local.json ~/.claude/CLAUDE.md ~/.claude/*.md; do
    [ -r "$rf" ] || continue
    print -n "${rf:t}:$(shasum < "$rf" | cut -c1-8),"
  done
}

user_rules_sha() {
  [ "$RULES" = user ] || { print none; return }
  print -r -- "$(user_rules_manifest)" | shasum | cut -c1-12
}

# Reject anything that is not exactly `user` or `none`. This used to fall
# through to the control on any unrecognised value, so `--rules usr` collected a
# no-guidance arm under a treatment name and scored exactly like the control —
# the one result an arm can produce that looks like a finding and is not. That
# is the same failure the `--system` resolution above already had to fix, so it
# gets the same answer: exit rather than improvise.
case "$RULES" in
  user) SOURCES=user ;;
  none) SOURCES='' ;;
  *) print -u2 -- "--rules must be 'user' or 'none', got: $RULES"; exit 2 ;;
esac

# An empty --setting-sources suppresses the operator's own CLAUDE.md as well as
# settings. That is what makes a true no-guidance control possible without
# touching a live config. Verified 2026-07-27 two ways: by asking a run whether
# it carried a named operator rule file, and by planting a marker string in a
# temporary user CLAUDE.md and confirming it appears under `--setting-sources
# user` and not under `--setting-sources ''`. The second is the real warrant.
# The first is a model self-report about its own hidden context, which is not
# evidence, and it should not have been recorded here as though it were.

[ "$REPS" -ge 1 ] 2>/dev/null || { print -u2 -- "--reps must be a positive integer, got: $REPS"; exit 2 }
if [ "$REPS" -lt 5 ]; then
  # Below the documented floor is allowed, because a smoke test of the harness
  # itself is a real use. It is recorded in every `.meta` so the cell cannot
  # later be quoted as an ordinary arm.
  print -u2 "note: --reps $REPS is below the five-run floor. Recorded as undersized."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Resuming an arm under the same name with a different configuration keeps the
# old samples and generates only the missing ones, so the cell silently holds
# two conditions. The arm directory name is not a fingerprint. Compare against
# what is already there and refuse rather than resume.
existing="$(ls "$HERE/out/$ARM"/*.meta 2>/dev/null | head -1)"
if [ -n "$existing" ]; then
  was_system="$(sed -n 's/.*system_sha=\([^ ]*\).*/\1/p' "$existing")"
  was_rules="$(sed -n 's/.*rules=\([^ ]*\) .*/\1/p' "$existing")"
  was_rules_sha="$(sed -n 's/.*user_rules_sha=\([^ ]*\).*/\1/p' "$existing")"
  now_rules="$SOURCES"
  [ -z "$now_rules" ] && now_rules=''
  if [ "$was_system" != "$SYSTEM_SHA" ]; then
    print -u2 "arm '$ARM' already holds samples taken with system_sha=$was_system, not $SYSTEM_SHA."
    print -u2 "Resuming would mix two conditions under one name. Use a new arm name."
    exit 2
  fi
  if [ "$was_rules" != "$now_rules" ]; then
    print -u2 "arm '$ARM' already holds samples taken with rules='$was_rules', not '$now_rules'."
    print -u2 "Resuming would mix two conditions under one name. Use a new arm name."
    exit 2
  fi
  # The categorical value is not the treatment. Comparing only `user` against
  # `user` accepted a resume across an edited rule file and collected the rest
  # of the cell under a second treatment, leaving the scorer to catch it after
  # the samples had already been paid for.
  now_rules_sha="$(user_rules_sha)"
  if [ "$was_rules_sha" != "$now_rules_sha" ]; then
    print -u2 "arm '$ARM' already holds samples taken with user_rules_sha=$was_rules_sha, not $now_rules_sha."
    print -u2 "A rule file changed since this arm started. Use a new arm name."
    exit 2
  fi
fi

for p in "$HERE"/prompts/*.txt; do
  scenario="${p:t:r}"
  mkdir -p "$HERE/out/$ARM"
  for r in $(seq 1 "$REPS"); do
    f="$HERE/out/$ARM/$scenario-$r.txt"
    # Both artifacts, not just the sample. A `.txt` with no `.meta` beside it is
    # the wreckage of an interrupted run, and treating it as finished is how a
    # partial answer gets resumed over and scored as a complete one.
    [ -s "$f" ] && [ -s "$f.meta" ] && continue
    rm -f "$f" "$f.meta"
    # Hash BEFORE reading. Reading first left a window where an edit landed
    # between the read and the hash, so the model got the old text while both
    # the before and after hashes observed the new file and agreed — the
    # comparison passed and the metadata named a prompt that was never sent.
    prompt_before="$(shasum "$p" | cut -c1-12)"
    prompt_text="$(< "$p")"

    # Snapshot the live treatment BEFORE the model sees it. Hashing only
    # afterwards records the post-edit text against a sample generated from the
    # pre-edit text, and every later rep then agrees with that new hash — so the
    # cell reads consistent while actually straddling two treatments. That is
    # the retracted defect in its narrowest form, and a post-run hash cannot see
    # it. Both hashes are compared below.
    rules_before="$(user_rules_sha)"
    # `--output-format json` rather than plain stdout, for three reasons. The
    # model's answer arrives in a named `result` field, so no harness line can
    # ever land inside it. `is_error` distinguishes a short answer from a failed
    # run, which plain stdout cannot. And `modelUsage` names the build that
    # actually served the request, where `--model opus` is an alias that moves
    # under you between arms.
    raw="$WORK/raw.json"
    if [ -n "$SYSTEM" ]; then
      (cd "$WORK" && claude -p --model "$MODEL" --setting-sources "$SOURCES" \
        --strict-mcp-config --output-format json --append-system-prompt "$SYSTEM_TEXT" \
        "$prompt_text" < /dev/null) > "$raw" 2> "$f.err" || true
    else
      (cd "$WORK" && claude -p --model "$MODEL" --setting-sources "$SOURCES" \
        --strict-mcp-config --output-format json "$prompt_text" < /dev/null) > "$raw" 2> "$f.err" || true
    fi
    [ -s "$f.err" ] || rm -f "$f.err"

    # Nothing reaches the sample path until the run is known good. Writing
    # straight to `$f` left a partial answer from a failed invocation sitting
    # there looking like a successful short one — and short is the direction a
    # compression treatment is supposed to move, so the defect would have
    # confirmed the hypothesis.
    if ! MODEL_ID="$(node "$HERE/extract.mjs" "$raw" "$f.part" 2>"$f.extract.err")"; then
      print -u2 "FAILED $ARM/$scenario-$r — see $f.extract.err and ${f}.err"
      exit 1
    fi
    rm -f "$f.extract.err"

    # Re-hash and compare. A treatment that moved while the model was reading it
    # invalidates this sample and no other, so refuse this one rather than the
    # arm — but refuse loudly, because the edit probably touched neighbours too.
    rules_after="$(user_rules_sha)"
    prompt_after="$(shasum "$p" | cut -c1-12)"
    if [ "$rules_before" != "$rules_after" ] || [ "$prompt_before" != "$prompt_after" ]; then
      rm -f "$f.part"
      print -u2 "TREATMENT MOVED during $ARM/$scenario-$r — discarded."
      print -u2 "  rules  $rules_before -> $rules_after"
      print -u2 "  prompt $prompt_before -> $prompt_after"
      print -u2 "Nothing may be edited while an arm is running. Rerun this arm."
      exit 1
    fi

    mv "$f.part" "$f"

    # Provenance beside every sample. The treatment is HASHED, not named,
    # because a rule file edited while an arm is still running leaves a
    # correctly-named cell whose later reps measured different text. Differing
    # hashes within one arm mean that cell is contaminated; `score.mjs` refuses
    # such a set rather than trusting anyone to check.
    print "arm=$ARM scenario=$scenario rep=$r reps=$REPS rules=$SOURCES system=${SYSTEM:-none} system_sha=$SYSTEM_SHA user_rules_sha=$rules_after user_rules=$(user_rules_manifest) prompt_sha=$prompt_after model_id=$MODEL_ID cli=$CLI_VERSION at=$(date -u +%FT%TZ)" > "$f.meta"
    print "$ARM/$scenario-$r $(wc -w < "$f") words [$MODEL_ID]"
  done
done
