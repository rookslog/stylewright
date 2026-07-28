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
# play, and they are the ones most likely to be edited between arms. Hash the
# set so a contaminated cell is visible afterwards rather than invisible.
user_rules_sha() {
  [ "$RULES" = user ] || { print none; return }
  cat ~/.claude/CLAUDE.md ~/.claude/*.md 2>/dev/null | shasum | cut -c1-12
}

# An empty --setting-sources suppresses the operator's own CLAUDE.md as well as
# settings. That is what makes a true no-guidance control possible without
# touching a live config. Verified 2026-07-27 by asking a run whether it carried
# a named operator rule file; it did not.
[ "$RULES" = user ] && SOURCES=user || SOURCES=''

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for p in "$HERE"/prompts/*.txt; do
  scenario="${p:t:r}"
  mkdir -p "$HERE/out/$ARM"
  for r in $(seq 1 "$REPS"); do
    f="$HERE/out/$ARM/$scenario-$r.txt"
    [ -s "$f" ] && continue
    prompt_text="$(< "$p")"
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
    mv "$f.part" "$f"

    # Provenance beside every sample. The treatment is HASHED, not named,
    # because a rule file edited while an arm is still running leaves a
    # correctly-named cell whose later reps measured different text. Differing
    # hashes within one arm mean that cell is contaminated; `score.mjs` refuses
    # such a set rather than trusting anyone to check.
    print "arm=$ARM scenario=$scenario rep=$r rules=$SOURCES system=${SYSTEM:-none} system_sha=$SYSTEM_SHA user_rules_sha=$(user_rules_sha) prompt_sha=$(shasum "$p" | cut -c1-12) model_id=$MODEL_ID cli=$CLI_VERSION at=$(date -u +%FT%TZ)" > "$f.meta"
    print "$ARM/$scenario-$r $(wc -w < "$f") words [$MODEL_ID]"
  done
done
