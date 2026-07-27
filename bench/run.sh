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
    if [ -n "$SYSTEM" ]; then
      (cd "$WORK" && claude -p --model opus --setting-sources "$SOURCES" \
        --strict-mcp-config --append-system-prompt "$(cat "$SYSTEM")" \
        "$(cat "$p")" < /dev/null) > "$f" 2>&1
    else
      (cd "$WORK" && claude -p --model opus --setting-sources "$SOURCES" \
        --strict-mcp-config "$(cat "$p")" < /dev/null) > "$f" 2>&1
    fi
    print "$ARM/$scenario-$r $(wc -w < "$f") words"
  done
done
