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

while [ $# -gt 0 ]; do
  case "$1" in
    --rules)  RULES="$2"; shift 2 ;;
    --reps)   REPS="$2";  shift 2 ;;
    --system) SYSTEM="$2"; shift 2 ;;
    *) print -u2 "unknown flag: $1"; exit 2 ;;
  esac
done

# Resolve and read the system prompt HERE, before anything changes directory.
# A relative path used to be expanded inside the sample subshell, after the cd,
# so `cat` failed, the flag received an empty string, and the arm ran with no
# guidance at all. It then scored like the control, which is the one result an
# arm can produce that looks like a finding and is not.
if [ -n "$SYSTEM" ]; then
  SYSTEM="${SYSTEM:A}"
  [ -r "$SYSTEM" ] || { print -u2 "cannot read --system file: $SYSTEM"; exit 2 }
  SYSTEM_TEXT="$(< "$SYSTEM")"
  # `print -u2 --`, because the message starts with `--system` and print would
  # otherwise read it as its own flags.
  [ -n "$SYSTEM_TEXT" ] || { print -u2 -- "--system file is empty: $SYSTEM"; exit 2 }
fi

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
    if [ -n "$SYSTEM" ]; then
      (cd "$WORK" && claude -p --model opus --setting-sources "$SOURCES" \
        --strict-mcp-config --append-system-prompt "$SYSTEM_TEXT" \
        "$prompt_text" < /dev/null) > "$f" 2>&1
    else
      (cd "$WORK" && claude -p --model opus --setting-sources "$SOURCES" \
        --strict-mcp-config "$prompt_text" < /dev/null) > "$f" 2>&1
    fi
    print "$ARM/$scenario-$r $(wc -w < "$f") words"
  done
done
