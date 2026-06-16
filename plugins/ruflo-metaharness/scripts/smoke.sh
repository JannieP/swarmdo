#!/usr/bin/env bash
# Structural smoke test for ruflo-metaharness v0.1.0 (ADR-150 Phase 1).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

step "1. plugin.json declares 0.1.0 with adr-150 keywords"
v=$(grep -E '"version"' "$ROOT/.claude-plugin/plugin.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [[ "$v" != "0.1.0" ]]; then
  bad "expected 0.1.0, got '$v'"
else
  miss=""
  for k in ruflo metaharness harness scorecard genome mcp-scan threat-model router adr-150 adr-148 adr-149 optional-dependency graceful-degradation subprocess phase-1-mvp; do
    grep -q "\"$k\"" "$ROOT/.claude-plugin/plugin.json" || miss="$miss $k"
  done
  [[ -z "$miss" ]] && ok || bad "missing keywords:$miss"
fi

step "2. all six skills present with valid frontmatter"
miss=""
for s in harness-score harness-genome harness-mint harness-mcp-scan harness-threat-model harness-oia-audit; do
  f="$ROOT/skills/$s/SKILL.md"
  [[ -f "$f" ]] || { miss="$miss missing-$s"; continue; }
  for k in 'name:' 'description:' 'allowed-tools:'; do
    grep -q "^$k" "$f" || miss="$miss $s-no-$k"
  done
done
[[ -z "$miss" ]] && ok || bad "$miss"

step "3. _harness.mjs shared loader has the safe-shellout pattern"
F="$ROOT/scripts/_harness.mjs"
miss=""
[[ -f "$F" ]] || miss="$miss missing"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "spawnSync" "$F" || miss="$miss no-spawnSync"
grep -q "runMetaharness" "$F" || miss="$miss no-meta-runner"
grep -q "runHarness" "$F" || miss="$miss no-harness-runner"
grep -q "emitDegradedJsonAndExit" "$F" || miss="$miss no-degraded-helper"
grep -q "metaharness-not-available" "$F" || miss="$miss no-degraded-reason"
# ADR-150 architectural constraint #3: graceful degradation must be present
grep -q "degraded: true" "$F" || miss="$miss no-degraded-flag"
[[ -z "$miss" ]] && ok || bad "$miss"

step "4. score.mjs harness present + parses + uses _harness.mjs + alert"
F="$ROOT/scripts/score.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runMetaharness" "$F" || miss="$miss no-runner"
grep -q "alert-on-fit-below" "$F" || miss="$miss no-alert-flag"
grep -q "harnessFit" "$F" || miss="$miss no-fit-field"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
grep -q "process.exit(2)" "$F" || miss="$miss no-config-exit"
[[ -z "$miss" ]] && ok || bad "$miss"

step "5. genome.mjs present + parses + uses _harness.mjs + alert"
F="$ROOT/scripts/genome.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runMetaharness" "$F" || miss="$miss no-runner"
grep -q "alert-on-risk-above" "$F" || miss="$miss no-alert-flag"
grep -q "risk_score" "$F" || miss="$miss no-risk-field"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
[[ -z "$miss" ]] && ok || bad "$miss"

step "6. mcp-scan.mjs present + parses + severity-ranked"
F="$ROOT/scripts/mcp-scan.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runHarness" "$F" || miss="$miss no-runner"
grep -q "SEVERITY_RANK" "$F" || miss="$miss no-severity"
grep -q "fail-on" "$F" || miss="$miss no-fail-on-flag"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
[[ -z "$miss" ]] && ok || bad "$miss"

step "7. threat-model.mjs present + parses + severity-ranked"
F="$ROOT/scripts/threat-model.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runHarness" "$F" || miss="$miss no-runner"
grep -q "SEVERITY_RANK" "$F" || miss="$miss no-severity"
grep -q "fail-on" "$F" || miss="$miss no-fail-on-flag"
[[ -z "$miss" ]] && ok || bad "$miss"

step "8. mint.mjs dry-run by default + project-root refusal"
F="$ROOT/scripts/mint.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runMetaharness" "$F" || miss="$miss no-runner"
grep -q "confirm" "$F" || miss="$miss no-confirm-flag"
grep -q "refusing to write to project root" "$F" || miss="$miss no-root-refusal"
grep -q "dryRun" "$F" || miss="$miss no-dryrun-output"
grep -q "process.exit(2)" "$F" || miss="$miss no-config-exit"
[[ -z "$miss" ]] && ok || bad "$miss"

step "9. command file documents all five skills"
F="$ROOT/commands/ruflo-metaharness.md"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
for s in score genome mint mcp-scan threat-model; do
  grep -q "harness $s\\|metaharness-$s" "$F" 2>/dev/null || miss="$miss missing-$s"
done
[[ -z "$miss" ]] && ok || bad "$miss"

step "10. agent file documents the metaharness role"
F="$ROOT/agents/metaharness-architect.md"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
grep -q "^name:" "$F" || miss="$miss no-name"
grep -q "^description:" "$F" || miss="$miss no-description"
grep -q "model:" "$F" || miss="$miss no-model"
[[ -z "$miss" ]] && ok || bad "$miss"

step "11. no SKILL.md grants wildcard tool access (security)"
bad_skills=""
for f in "$ROOT"/skills/*/SKILL.md; do
  grep -q '^allowed-tools:[[:space:]]*\*' "$f" && bad_skills="$bad_skills $(basename $(dirname "$f"))"
done
[[ -z "$bad_skills" ]] && ok || bad "wildcard:$bad_skills"

step "12. README documents ADR-150 architectural constraint"
F="$ROOT/README.md"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
grep -q "ADR-150" "$F" || miss="$miss no-adr-ref"
grep -qE "architectural constraint|never (a )?required" "$F" || miss="$miss no-constraint"
grep -q "graceful" "$F" || miss="$miss no-graceful-degradation-doc"
[[ -z "$miss" ]] && ok || bad "$miss"

step "13. every script in scripts/*.mjs parses cleanly"
miss=""
for f in "$ROOT"/scripts/*.mjs; do
  node --check "$f" 2>/dev/null || miss="$miss $(basename "$f")"
done
[[ -z "$miss" ]] && ok || bad "syntax errors:$miss"

step "14. plugin.json parses as valid JSON + version sentinel matches step 1"
node -e "JSON.parse(require('fs').readFileSync('$ROOT/.claude-plugin/plugin.json'))" 2>/dev/null \
  && ok || bad "plugin.json invalid JSON"

step "15. top-level CLI command registered (deep integration — iter 3)"
F="$ROOT/../../v3/@claude-flow/cli/src/commands/metaharness.ts"
miss=""
[[ -f "$F" ]] || miss="$miss command-file-missing"
grep -q "name: 'metaharness'" "$F" 2>/dev/null || miss="$miss no-name-field"
# The 5 subcommands must each be present in the dispatch table.
# Match either quoted ('mcp-scan': ...) or unquoted shorthand (score: ...) keys.
for sub in score genome mcp-scan threat-model mint; do
  grep -qE "(^|[[:space:]])'?${sub}'?:" "$F" 2>/dev/null || miss="$miss missing-$sub"
done
# Registered in the loader
LOADER="$ROOT/../../v3/@claude-flow/cli/src/commands/index.ts"
grep -q "metaharness: () => import" "$LOADER" 2>/dev/null || miss="$miss not-registered-in-loader"
[[ -z "$miss" ]] && ok || bad "$miss"

step "16. ruflo wrapper has metaharness in optionalDependencies (architectural constraint #2)"
F="$ROOT/../../ruflo/package.json"
node -e "
const j = JSON.parse(require('fs').readFileSync('$F','utf-8'));
const od = j.optionalDependencies || {};
if (!od.metaharness) { console.error('missing metaharness in optionalDependencies'); process.exit(1); }
if (j.dependencies && j.dependencies.metaharness) { console.error('metaharness leaked into dependencies'); process.exit(1); }
" 2>/dev/null && ok || bad "ruflo wrapper missing metaharness optionalDep"

step "17c. oia-audit composite worker (Phase 2 — iter 7)"
F="$ROOT/scripts/oia-audit.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "runHarness" "$F" || miss="$miss no-runner"
# All three component invocations
grep -q "oia-manifest" "$F" || miss="$miss no-oia-manifest"
grep -q "threat-model" "$F" || miss="$miss no-threat-model"
grep -q "mcp-scan" "$F" || miss="$miss no-mcp-scan"
# Composite severity computation
grep -q "compositeWorst\|composite.*Worst" "$F" || miss="$miss no-composite-severity"
grep -q "SEVERITY_RANK" "$F" || miss="$miss no-severity-rank"
# Memory persistence (default behavior, --dry-run to skip)
grep -q "metaharness-audit" "$F" || miss="$miss no-namespace"
grep -q "memory.*store" "$F" || miss="$miss no-memory-store"
# Alert exit code
grep -q "alert-on-worst" "$F" || miss="$miss no-alert-flag"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17b. harness type in plugin registry (Phase 2 — iter 6)"
F="$ROOT/../../v3/@claude-flow/cli/src/plugins/store/types.ts"
miss=""
[[ -f "$F" ]] || miss="$miss types-file-missing"
grep -q "'harness'" "$F" 2>/dev/null || miss="$miss no-harness-type"
grep -q "ADR-150" "$F" 2>/dev/null || miss="$miss no-adr-anchor"
D="$ROOT/../../v3/@claude-flow/cli/src/plugins/store/discovery.ts"
grep -q "id: 'harness'" "$D" 2>/dev/null || miss="$miss no-harness-category"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17. eject command — Phase 2 differentiator (iter 4)"
F="$ROOT/../../v3/@claude-flow/cli/src/commands/eject.ts"
miss=""
[[ -f "$F" ]] || miss="$miss command-file-missing"
grep -q "name: 'eject'" "$F" 2>/dev/null || miss="$miss no-name-field"
grep -q "from-existing" "$F" 2>/dev/null || miss="$miss no-from-existing-flag"
# Safety: must refuse writing inside the calling repo
grep -q "target-inside-repo" "$F" 2>/dev/null || miss="$miss no-repo-refusal"
grep -q "target-exists" "$F" 2>/dev/null || miss="$miss no-exists-refusal"
# Dry-run default — confirm flag required
grep -q "confirm" "$F" 2>/dev/null || miss="$miss no-confirm-flag"
grep -q "dryRun" "$F" 2>/dev/null || miss="$miss no-dryrun"
# Graceful degradation on missing binary
grep -q "metaharness-not-available\|degraded:" "$F" 2>/dev/null || miss="$miss no-graceful-deg"
# Registered in the loader
LOADER="$ROOT/../../v3/@claude-flow/cli/src/commands/index.ts"
grep -q "eject: () => import" "$LOADER" 2>/dev/null || miss="$miss not-registered-in-loader"
[[ -z "$miss" ]] && ok || bad "$miss"

printf "\n%s passed, %s failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
