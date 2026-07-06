#!/usr/bin/env bash
# swarmdo-ponytail smoke — validates the vendored plugin structure.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

step "1. plugin.json is valid and named swarmdo-ponytail"
name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/.claude-plugin/plugin.json')).name)" 2>/dev/null)
[[ "$name" == "swarmdo-ponytail" ]] && ok || bad "name='$name'"

step "2. all six SKILL.md files present with frontmatter name"
n=0
for sk in ponytail ponytail-audit ponytail-debt ponytail-gain ponytail-help ponytail-review; do
  grep -q "^name: $sk" "$ROOT/skills/$sk/SKILL.md" 2>/dev/null && n=$((n+1))
done
[[ $n -eq 6 ]] && ok || bad "$n/6 skills valid"

step "3. core skill declares intensity levels"
grep -q "lite|full|ultra\|lite, full\|lite|full" "$ROOT/skills/sdo-ponytail/SKILL.md" && ok || bad "intensity levels missing"

step "4. MIT license declared"
grep -q "license: MIT" "$ROOT/skills/sdo-ponytail/SKILL.md" && ok || bad "license line missing"

printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]]
