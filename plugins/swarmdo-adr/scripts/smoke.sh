#!/usr/bin/env bash
# Structural smoke test for swarmdo-adr v0.2.0 (ADR-0001).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

# 1. plugin.json bump + new keywords
step "1. plugin.json declares 0.3.0 with new keywords"
v=$(grep -E '"version"' "$ROOT/.claude-plugin/plugin.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [[ "$v" != "0.3.0" ]]; then
  bad "expected 0.3.0, got '$v'"
else
  miss=""
  for k in lifecycle compliance causal-graph mcp; do
    grep -q "\"$k\"" "$ROOT/.claude-plugin/plugin.json" || miss="$miss $k"
  done
  [[ -z "$miss" ]] && ok || bad "missing keywords:$miss"
fi

# 2. All 4 skills present with valid frontmatter
step "2. skills (adr-create, adr-index, adr-review, adr-verify) present with name/description/allowed-tools"
miss=""
for s in adr-create adr-index adr-review adr-verify; do
  f="$ROOT/skills/$s/SKILL.md"
  [[ -f "$f" ]] || { miss="$miss missing-$s"; continue; }
  for k in 'name:' 'description:' 'allowed-tools:'; do
    grep -q "^$k" "$f" || miss="$miss $s-no-$k"
  done
done
[[ -z "$miss" ]] && ok || bad "$miss"

# 3. command covers all 7 subcommands
step "3. /adr command covers all 7 subcommands"
F="$ROOT/commands/adr.md"
miss=""
for sub in 'adr create' 'adr list' 'adr status' 'adr supersede' 'adr check' 'adr graph' 'adr search'; do
  grep -q "$sub" "$F" || miss="$miss '${sub#adr }'"
done
[[ -z "$miss" ]] && ok || bad "missing:$miss"

# 4. Agent references REFERENCE.md (ADR-098 Part 2 token-diet pattern)
step "4. agent references REFERENCE.md (token-optimization pattern)"
grep -q "REFERENCE.md" "$ROOT/agents/adr-architect.md" \
  && ok || bad "REFERENCE.md cross-reference missing"

# 5. adr-patterns namespace used consistently
step "5. adr-patterns namespace referenced in agent + skills"
miss=""
grep -q "adr-patterns" "$ROOT/agents/adr-architect.md" || miss="$miss agent"
grep -q "adr-patterns" "$ROOT/skills/adr-create/SKILL.md" || miss="$miss adr-create"
grep -q "adr-patterns" "$ROOT/skills/adr-index/SKILL.md" || miss="$miss adr-index"
[[ -z "$miss" ]] && ok || bad "missing in:$miss"

# 6. README pins to @swarmdo/cli v3.6
step "6. README pins @swarmdo/cli to v3.6"
grep -qE "@swarmdo/cli.*v3\.6|v3\.6.*swarmdo/cli" "$ROOT/README.md" \
  && ok || bad "Compatibility pin to v3.6 missing"

# 7. README has namespace coordination section
step "7. README defers to swarmdo-agentdb ADR-0001 namespace convention"
grep -q "Namespace coordination" "$ROOT/README.md" \
  && grep -q "swarmdo-agentdb" "$ROOT/README.md" \
  && grep -q "Namespace convention" "$ROOT/README.md" \
  && ok || bad "namespace coordination block incomplete"

# 8. ADR file exists with status Proposed
step "8. ADR-0001 exists with status Proposed"
ADR="$ROOT/docs/adrs/0001-adr-plugin-pattern.md"
[[ -f "$ADR" ]] && grep -qE "^status:[[:space:]]*Proposed" "$ADR" \
  && ok || bad "ADR missing or status != Proposed"

# 9. REFERENCE.md exists and is non-empty
step "9. REFERENCE.md exists and is non-empty"
[[ -s "$ROOT/REFERENCE.md" ]] && ok || bad "REFERENCE.md missing or empty"

# 10. No wildcard tool grants
step "10. no skill grants wildcard tool access"
bad_skills=""
for f in "$ROOT"/skills/*/SKILL.md; do
  grep -q '^allowed-tools:[[:space:]]*\*' "$f" && bad_skills="$bad_skills $(basename $(dirname "$f"))"
done
[[ -z "$bad_skills" ]] && ok || bad "wildcard:$bad_skills"

# 11. import + verify scripts present, executable, parse cleanly
step "11. scripts/import.mjs and verify.mjs executable + syntax-clean"
miss=""
for s in import.mjs verify.mjs; do
  f="$ROOT/scripts/$s"
  [[ -x "$f" ]] || miss="$miss $s-not-executable"
  node --check "$f" 2>/dev/null || miss="$miss $s-syntax-error"
done
[[ -z "$miss" ]] && ok || bad "$miss"

# 12. import.mjs handles both ADR formats + has issue-number false-positive guard
step "12. import.mjs supports v3 + plugin formats and strips issue numbers"
F="$ROOT/scripts/import.mjs"
miss=""
grep -q "extractAdrRefs" "$F" || miss="$miss no-extractAdrRefs"
grep -q "frontmatter\|YAML\|^---" "$F" || miss="$miss no-frontmatter-handling"
grep -q "#\\\\d+\|issue\|PR\\\\s*\\\\d" "$F" || miss="$miss no-issue-strip"
grep -q '\*\*Status\*\*' "$F" || miss="$miss no-v3-status-pattern"
[[ -z "$miss" ]] && ok || bad "$miss"

# 13. verify.mjs reports cycles + dangling refs and exits 1 on cycles
step "13. verify.mjs detects cycles + has fail-closed exit"
F="$ROOT/scripts/verify.mjs"
miss=""
grep -q "cycles" "$F" || miss="$miss no-cycle-detection"
grep -q "danglingRefs" "$F" || miss="$miss no-dangling-detection"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-exit"
[[ -z "$miss" ]] && ok || bad "$miss"

# 14. adr-index skill references the script (not direct MCP loop)
step "14. adr-index skill calls scripts/import.mjs"
F="$ROOT/skills/adr-index/SKILL.md"
grep -q "scripts/import\.mjs\|import\.mjs" "$F" \
  && ok || bad "skill does not invoke import.mjs"

# 15. adr-verify skill references verify.mjs
step "15. adr-verify skill calls scripts/verify.mjs"
F="$ROOT/skills/adr-verify/SKILL.md"
grep -q "scripts/verify\.mjs\|verify\.mjs" "$F" \
  && ok || bad "skill does not invoke verify.mjs"

printf "\n%s passed, %s failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
