#!/bin/sh
# Runs the logic tests. No dependencies beyond what macOS already ships: JavaScriptCore's jsc
# shell, which lives inside the system framework.
#
#   ./test/run.sh
#
# Exits non-zero if any check fails, so it can gate a commit. Note jsc's quit() ignores its
# argument and always exits 0, and an uncaught throw exits 3 — so neither is trustworthy on its
# own. Gating is done on the RESULT: sentinel run.js prints as its last line, which also catches
# the case where the script dies partway through.
cd "$(dirname "$0")/.."

JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
[ -x "$JSC" ] || JSC="$(command -v jsc || true)"

if [ ! -x "$JSC" ]; then
  echo "jsc not found. On macOS it ships at:"
  echo "  /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
  exit 127
fi

out=$("$JSC" test/run.js 2>&1)
printf '%s\n' "$out" | grep -v '^RESULT:'

case "$out" in
  *RESULT:OK*) exit 0 ;;
  *)           exit 1 ;;
esac
