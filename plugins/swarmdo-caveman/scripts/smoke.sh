#!/usr/bin/env bash
# swarmdo-caveman smoke — validates the vendored plugin without spending tokens.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

step "1. plugin.json is valid and named swarmdo-caveman"
name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/.claude-plugin/plugin.json')).name)" 2>/dev/null)
[[ "$name" == "swarmdo-caveman" ]] && ok || bad "name='$name'"

step "2. all four SKILL.md files present with frontmatter"
n=0
for sk in sdo-caveman sdo-caveman-compress sdo-cavecrew sdo-caveman-stats; do
  head -1 "$ROOT/skills/$sk/SKILL.md" 2>/dev/null | grep -q -- "---" && n=$((n+1))
done
[[ $n -eq 4 ]] && ok || bad "$n/4 skills valid"

step "3. compress pipeline imports (token-free modules)"
python3 -c "
import sys; sys.path.insert(0,'$ROOT/skills/sdo-caveman-compress')
from scripts.detect import detect_file_type, should_compress
from scripts import validate
" 2>/dev/null && ok || bad "python imports failed"

step "4. detect classifies natural language vs config correctly"
python3 -c "
import sys, tempfile, os
sys.path.insert(0,'$ROOT/skills/sdo-caveman-compress')
from pathlib import Path
from scripts.detect import detect_file_type
md = tempfile.NamedTemporaryFile(suffix='.md', delete=False, mode='w'); md.write('# Notes\n\nThis is a long natural language document about the project goals and how we should approach the work over time.\n'); md.close()
js = tempfile.NamedTemporaryFile(suffix='.json', delete=False, mode='w'); js.write('{\"a\":1}'); js.close()
assert detect_file_type(Path(md.name)) == 'natural_language', 'md misclassified'
assert detect_file_type(Path(js.name)) == 'config', 'json misclassified'
os.unlink(md.name); os.unlink(js.name)
" 2>/dev/null && ok || bad "detect misbehaved"

printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]]
