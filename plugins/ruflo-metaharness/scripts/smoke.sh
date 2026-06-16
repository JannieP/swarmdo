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
# All 8 subcommands must each be present in the dispatch table.
# Match either quoted ('mcp-scan': ...) or unquoted shorthand (score: ...) keys.
for sub in score genome mcp-scan threat-model oia-audit audit-list audit-trend mint; do
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

step "17r. _harness.mjs npx-argv regression guard (iter 27 fix lock)"
F="$ROOT/scripts/_harness.mjs"
miss=""
# THE BUG WAS: passing '-y metaharness@latest' as a single argv token
# to spawnSync. Lock the array-form invocation so it can't regress.
# A correct invocation looks like:
#   spawnSync('npx', ['-y', 'metaharness@latest', ...], ...)
# A broken one looks like:
#   spawnSync('npx', ['-y metaharness@latest', ...], ...)
# OR:
#   execCli('-y metaharness@latest', args, opts)
if grep -qE "execCli\(\s*['\"]-y metaharness@latest['\"]" "$F" 2>/dev/null; then
  miss="$miss bug-regressed-string-form"
fi
# Confirm the fix is in place
grep -q "execCli(\[\s*'-y'\s*,\s*'metaharness@latest'" "$F" 2>/dev/null || \
  grep -q "execCli(\[ *'-y', 'metaharness@latest'" "$F" 2>/dev/null || miss="$miss no-array-form-fix"
# cwd + env pass-through (added by iter 27)
grep -q "cwd: opts" "$F" || miss="$miss no-cwd-passthrough"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z10. end-to-end pipeline roundtrip (iter 47 — caught iter-38 schema bug)"
F="$ROOT/scripts/test-pipeline-roundtrip.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Five stages (anti-shrink guard)
for stage in 'Stage 1' 'Stage 2' 'Stage 3' 'Stage 4' 'Stage 5'; do
  grep -q "$stage" "$F" || miss="$miss missing-${stage// /-}"
done
# Asserts the critical invariant: self-roundtrip overall === 1
grep -q "self-roundtrip overall === 1" "$F" 2>/dev/null || miss="$miss no-self-match-assert"
# Distinguishes "test cannot run" (exit 2) from "test failed" (exit 1)
grep -q "process.exit(2)" "$F" 2>/dev/null || miss="$miss no-cannot-run-exit"
# oia-audit fix is in place: dispatches metaharness for score+genome
OIA="$ROOT/scripts/oia-audit.mjs"
grep -q "score', 'metaharness'" "$OIA" 2>/dev/null || miss="$miss no-metaharness-engine-score"
grep -q "genome', 'metaharness'" "$OIA" 2>/dev/null || miss="$miss no-metaharness-engine-genome"
grep -q "runMetaharness" "$OIA" 2>/dev/null || miss="$miss no-runMetaharness-import"
# Runtime: the roundtrip test must pass when metaharness is installed,
# or exit 2 (test-cannot-run) when it isn't. Both are smoke-green.
node "$F" >/dev/null 2>&1
CODE=$?
[[ "$CODE" == "0" || "$CODE" == "2" ]] || miss="$miss roundtrip-test-failed:$CODE"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z9. MCP success-semantic footnote + audit_trend file inputs (iter 46)"
miss=""
WRAPPER="$ROOT/../../v3/@claude-flow/cli/src/mcp-tools/metaharness-tools.ts"
# Success-semantic constant declared + appended to 8 descriptions = 9 occurrences
COUNT=$(grep -c "MCP_SUCCESS_SEMANTIC" "$WRAPPER" 2>/dev/null; true)
[[ "$COUNT" == "9" ]] || miss="$miss footnote-count:$COUNT-expected-9"
# audit_trend now exposes baselineFile / currentFile
grep -q "baselineFile" "$WRAPPER" 2>/dev/null || miss="$miss no-baseline-file"
grep -q "currentFile" "$WRAPPER" 2>/dev/null || miss="$miss no-current-file"
# alertOnDistanceBelow exposed (iter 38 distance gate)
grep -q "alertOnDistanceBelow" "$WRAPPER" 2>/dev/null || miss="$miss no-distance-input"
# Phase 4 has the file-input assertion
T="$ROOT/scripts/test-mcp-tools.mjs"
grep -q "audit_trend file-input path: success === true" "$T" 2>/dev/null || miss="$miss no-file-input-assert"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z8. ruflo doctor checks the integration layer, not just upstream (iter 45)"
miss=""
DOC="$ROOT/../../v3/@claude-flow/cli/src/commands/doctor.ts"
# New function present
grep -q "function checkMetaharnessIntegration" "$DOC" 2>/dev/null || miss="$miss no-integration-check"
# Registered in allChecks
grep -q "checkMetaharnessIntegration, // iter 45" "$DOC" 2>/dev/null || miss="$miss not-in-allchecks"
# Alias in componentMap
grep -q "'metaharness-integration': checkMetaharnessIntegration" "$DOC" 2>/dev/null || miss="$miss no-component-alias"
# Verifies the 5 critical files
for f in _harness _similarity similarity _spike-similarity harness-similarity; do
  grep -q "${f}" "$DOC" 2>/dev/null || miss="$miss check-missing-${f}"
done
# Runtime smoke: similarity({}, {}) call present
grep -q "mod.similarity({}, {})" "$DOC" 2>/dev/null || miss="$miss no-smoke-call"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z7. MCP wrapper success semantic fix (iter 44 — exitCode is the source of truth)"
miss=""
WRAPPER="$ROOT/../../v3/@claude-flow/cli/src/mcp-tools/metaharness-tools.ts"
# runScript signature includes success now
grep -q "success: boolean" "$WRAPPER" 2>/dev/null || miss="$miss no-success-type"
grep -q "success = exitCode === 0" "$WRAPPER" 2>/dev/null || miss="$miss no-exitcode-derived-success"
# All 8 handlers use r.success, NOT !r.degraded
COUNT_OLD=$(grep -c "success: !r.degraded" "$WRAPPER" 2>/dev/null; true)
[[ "$COUNT_OLD" == "0" ]] || miss="$miss old-pattern-still-present:$COUNT_OLD"
COUNT_NEW=$(grep -c "success: r.success" "$WRAPPER" 2>/dev/null; true)
[[ "$COUNT_NEW" == "8" ]] || miss="$miss new-pattern-count:$COUNT_NEW-expected-8"
# Runtime anchors: iter 44 success assertions present
T="$ROOT/scripts/test-mcp-tools.mjs"
grep -q "iter 44 fix" "$T" 2>/dev/null || miss="$miss no-iter44-anchors"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z6. test-mcp-tools.mjs Phase 4 positive-case (iter 43 — output-shape gate)"
F="$ROOT/scripts/test-mcp-tools.mjs"
miss=""
grep -q "Phase 4 — positive-case" "$F" 2>/dev/null || miss="$miss no-phase-4"
grep -q "similarity positive case" "$F" 2>/dev/null || miss="$miss no-similarity-positive"
grep -q "similarity data has numeric.*overall" "$F" 2>/dev/null || miss="$miss no-overall-assert"
grep -q "similarity components.cosine numeric" "$F" 2>/dev/null || miss="$miss no-cosine-assert"
grep -q "similarity components.categorical numeric" "$F" 2>/dev/null || miss="$miss no-categorical-assert"
grep -q "similarity alertBelow=0.99 → exitCode 1" "$F" 2>/dev/null || miss="$miss no-alert-assert"
grep -q "audit_trend bad-keys path exits 2" "$F" 2>/dev/null || miss="$miss no-trend-exit-assert"
# Runtime: full test passes (90+ assertions now expected)
node "$F" >/dev/null 2>&1 || miss="$miss runtime-fails"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z5. CLI dispatcher round-trips flags (iter 42 — fixes existing bug)"
miss=""
DISP="$ROOT/../../v3/@claude-flow/cli/src/commands/metaharness.ts"
# Reconstruction logic literal markers (anti-deletion)
grep -q "reconstructedFlags" "$DISP" 2>/dev/null || miss="$miss no-reconstruction"
grep -q "ctxFlags" "$DISP" 2>/dev/null || miss="$miss no-ctx-flags-read"
grep -q "toKebab" "$DISP" 2>/dev/null || miss="$miss no-kebab-helper"
# SKIP_KEYS list documents which flags don't propagate
grep -q "SKIP_KEYS" "$DISP" 2>/dev/null || miss="$miss no-skip-set"
# Comment explains the fix
grep -q "iter 42" "$DISP" 2>/dev/null || miss="$miss no-iter42-marker"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z4. bench-similarity.mjs — perf characterization + regression gate (iter 41)"
F="$ROOT/scripts/bench-similarity.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# 3 fixture categories declared (anti-shrink guard)
for cat in CHEAP TYPICAL RICH; do
  grep -q "const ${cat} = {" "$F" 2>/dev/null || miss="$miss missing-fixture-${cat}"
done
# Imports from the production module, not the spike
grep -q "from './_similarity.mjs'" "$F" 2>/dev/null || miss="$miss not-using-production-module"
# Gate flag exposed
grep -q -- "--max-mean-us" "$F" 2>/dev/null || miss="$miss no-gate-flag"
# Runtime: quick bench succeeds (low iter count so smoke stays fast)
node "$F" --iters 10000 --max-mean-us 50 >/dev/null 2>&1 || miss="$miss runtime-fails-or-overhead-blew-50us"
# Runtime: gate trips on absurd ceiling, exit 1 path exercised
if node "$F" --iters 10000 --max-mean-us 0.0001 >/dev/null 2>&1; then
  miss="$miss gate-failed-to-trip"
fi
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z3. metaharness-ci.yml has the similarity-tests job (iter 40 — CI gate enforcement)"
F="$ROOT/../../.github/workflows/metaharness-ci.yml"
miss=""
[[ -f "$F" ]] || miss="$miss workflow-missing"
grep -q "^  similarity-tests:" "$F" 2>/dev/null || miss="$miss no-job-header"
grep -q "Unit tests — _similarity.mjs" "$F" 2>/dev/null || miss="$miss no-unit-step"
grep -q "Spike invariants still hold" "$F" 2>/dev/null || miss="$miss no-spike-step"
grep -q "CLI skill — file-input round-trip" "$F" 2>/dev/null || miss="$miss no-cli-skill-step"
grep -q "audit-trend structural-distance integration" "$F" 2>/dev/null || miss="$miss no-trend-step"
grep -q "Graceful fallback when fingerprint missing" "$F" 2>/dev/null || miss="$miss no-fallback-step"
grep -q "Distance alert gate exits 1" "$F" 2>/dev/null || miss="$miss no-alert-step"
# CLAUDE.md documents the new MCP tool + subcommand
CMD="$ROOT/../../CLAUDE.md"
grep -q "mcp__claude-flow__metaharness_similarity" "$CMD" 2>/dev/null || miss="$miss claude-md-no-mcp-tool"
grep -q "ruflo metaharness similarity" "$CMD" 2>/dev/null || miss="$miss claude-md-no-subcommand"
grep -q -- "--alert-on-distance-below" "$CMD" 2>/dev/null || miss="$miss claude-md-no-distance-flag"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z2. _similarity.mjs unit tests (iter 39 — library-grade testability)"
F="$ROOT/scripts/test-similarity.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# 8 phases enumerated (anti-shrink guard)
for phase in 'Phase 1' 'Phase 2' 'Phase 3' 'Phase 4' 'Phase 5' 'Phase 6' 'Phase 7' 'Phase 8'; do
  grep -q "$phase" "$F" || miss="$miss missing-${phase// /-}"
done
# Phase 8 regression anchor — exact spike numbers must be hard-coded
grep -q "0.8296" "$F" || miss="$miss no-spike-overall-anchor"
grep -q "0.9987" "$F" || miss="$miss no-spike-cosine-anchor"
# Runtime: full unit-test pass (this is the actual gate)
node "$F" >/dev/null 2>&1 || miss="$miss unit-tests-fail"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17z. ADR-152 §3.1 deep integration — oia-audit fingerprint + audit-trend structuralDistance (iter 38)"
miss=""
# oia-audit captures score + genome AND surfaces a fingerprint{score,genome}
OIA="$ROOT/scripts/oia-audit.mjs"
grep -q "score = runOne(\['score'" "$OIA" 2>/dev/null || miss="$miss no-score-capture"
grep -q "genome = runOne(\['genome'" "$OIA" 2>/dev/null || miss="$miss no-genome-capture"
grep -q "fingerprint: {" "$OIA" 2>/dev/null || miss="$miss no-fingerprint-field"
# audit-trend imports the production similarity module and surfaces a verdict
AT="$ROOT/scripts/audit-trend.mjs"
grep -q "from './_similarity.mjs'" "$AT" 2>/dev/null || miss="$miss no-similarity-import"
grep -q "structuralDistance" "$AT" 2>/dev/null || miss="$miss no-structural-distance-field"
grep -q "near-identical\|minor-drift\|moderate-drift\|major-drift" "$AT" 2>/dev/null || miss="$miss no-verdict-thresholds"
grep -q -- "--alert-on-distance-below" "$AT" 2>/dev/null || miss="$miss no-distance-alert-flag"
# Runtime: graceful fallback when fingerprint missing (no crash on old records)
TMPOLD=$(mktemp); TMPNEW=$(mktemp)
cat > "$TMPOLD" <<'JSON'
{"startedAt":"2026-06-01T00:00:00Z","composite":{"worst":"clean"},"components":{"oiaManifest":{},"threatModel":{},"mcpScan":{"json":{"findings":[]}}}}
JSON
cat > "$TMPNEW" <<'JSON'
{"startedAt":"2026-06-15T00:00:00Z","composite":{"worst":"clean"},"components":{"oiaManifest":{},"threatModel":{},"mcpScan":{"json":{"findings":[]}}},"fingerprint":{"score":{"harnessFit":82,"recommendedMode":"CLI + MCP","archetype":"typescript-sdk-harness","template":"vertical:coding"},"genome":{"repo_type":"node_mcp_ci","agent_topology":["maintainer","tester"],"risk_score":0.3}}}
JSON
OUT=$(node "$AT" --baseline "$TMPOLD" --current "$TMPNEW" --format json 2>/dev/null)
echo "$OUT" | grep -q '"verdict": "unavailable"' || miss="$miss no-graceful-fallback"
# Runtime: structural-distance path emits a numeric overall when both have fingerprints
cp "$TMPNEW" "$TMPOLD"
OUT2=$(node "$AT" --baseline "$TMPOLD" --current "$TMPNEW" --format json 2>/dev/null)
echo "$OUT2" | grep -q '"verdict": "near-identical"' || miss="$miss no-near-identical-self"
echo "$OUT2" | grep -q '"distance": 0' || miss="$miss self-distance-not-zero"
rm -f "$TMPOLD" "$TMPNEW"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17y. ADR-152 production — _similarity.mjs module + similarity.mjs skill + MCP tool + dispatcher (iter 36)"
miss=""
# Production module
MOD="$ROOT/scripts/_similarity.mjs"
[[ -f "$MOD" ]] || miss="$miss module-missing"
node --check "$MOD" 2>/dev/null || miss="$miss module-syntax-error"
grep -q "export function similarity" "$MOD" 2>/dev/null || miss="$miss no-export-similarity"
grep -q "export function projectToVec" "$MOD" 2>/dev/null || miss="$miss no-export-projectToVec"
grep -q "export function cosine" "$MOD" 2>/dev/null || miss="$miss no-export-cosine"
grep -q "DEFAULT_WEIGHTS" "$MOD" 2>/dev/null || miss="$miss no-default-weights"
grep -q "cosine: 0.6" "$MOD" 2>/dev/null || miss="$miss weight-cosine-drift"
grep -q "categorical: 0.25" "$MOD" 2>/dev/null || miss="$miss weight-categorical-drift"
grep -q "jaccard: 0.15" "$MOD" 2>/dev/null || miss="$miss weight-jaccard-drift"
# CLI skill
SKL="$ROOT/scripts/similarity.mjs"
[[ -x "$SKL" ]] || miss="$miss skill-not-executable"
node --check "$SKL" 2>/dev/null || miss="$miss skill-syntax-error"
grep -q "from './_similarity.mjs'" "$SKL" 2>/dev/null || miss="$miss skill-not-using-module"
grep -q -- "--per-dimension" "$SKL" 2>/dev/null || miss="$miss no-per-dimension-flag"
grep -q -- "--alert-below" "$SKL" 2>/dev/null || miss="$miss no-alert-below-flag"
# SKILL.md
SK="$ROOT/skills/harness-similarity/SKILL.md"
[[ -f "$SK" ]] || miss="$miss skill-md-missing"
grep -q "^name: harness-similarity" "$SK" 2>/dev/null || miss="$miss skill-md-name-wrong"
grep -q "^allowed-tools:" "$SK" 2>/dev/null || miss="$miss skill-md-no-allowed-tools"
# Dispatcher
DISP="$ROOT/../../v3/@claude-flow/cli/src/commands/metaharness.ts"
grep -q "similarity: 'similarity.mjs'" "$DISP" 2>/dev/null || miss="$miss no-dispatcher-entry"
# MCP tool registered
MCP="$ROOT/../../v3/@claude-flow/cli/src/mcp-tools/metaharness-tools.ts"
grep -q "name: 'metaharness_similarity'" "$MCP" 2>/dev/null || miss="$miss no-mcp-tool"
# Smoke-runtime sanity: production module reproduces spike LEGAL×SUPPORT score
TMPA=$(mktemp); TMPB=$(mktemp)
cat > "$TMPA" <<'JSON'
{"score":{"harnessFit":78,"compileConfidence":92,"taskCoverage":65,"toolSafety":88,"memoryUsefulness":70,"estCostPerRunUsd":0.04,"recommendedMode":"CLI + MCP","archetype":"compliance-harness","template":"vertical:legal"},"genome":{"repo_type":"node_mcp_ci","agent_topology":["contract-analyst","redline-reviewer","risk-rater","compliance-officer"],"risk_score":0.45,"test_confidence":0.7,"publish_readiness":0.6}}
JSON
cat > "$TMPB" <<'JSON'
{"score":{"harnessFit":75,"compileConfidence":90,"taskCoverage":70,"toolSafety":90,"memoryUsefulness":72,"estCostPerRunUsd":0.05,"recommendedMode":"CLI + MCP","archetype":"compliance-harness","template":"vertical:support"},"genome":{"repo_type":"node_mcp_ci","agent_topology":["triager","kb-searcher","responder","risk-rater","compliance-officer"],"risk_score":0.40,"test_confidence":0.75,"publish_readiness":0.65}}
JSON
OUT=$(node "$SKL" --a "$TMPA" --b "$TMPB" --format json 2>/dev/null | grep '"overall"' | head -1)
echo "$OUT" | grep -q "0.8296" || miss="$miss runtime-overall-mismatch:$OUT"
# Self-similarity check via the production module
SELF=$(node "$SKL" --a "$TMPA" --b "$TMPA" --format json 2>/dev/null | grep '"overall"' | head -1)
echo "$SELF" | grep -qE '"overall": 1[,]?$' || miss="$miss runtime-self-not-one:$SELF"
rm -f "$TMPA" "$TMPB"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17x. ADR-152 spike — similarity invariants verified at structural level (iter 35)"
F="$ROOT/scripts/_spike-similarity.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# The 3-component similarity formula matches ADR-152's decision
grep -q "0.6 \* cos + 0.25 \* cat + 0.15 \* jac" "$F" || miss="$miss weight-formula-drift"
# Both invariants explicit
grep -q "selfMatch" "$F" || miss="$miss no-invariant-1"
grep -q "verticalAffinity" "$F" || miss="$miss no-invariant-2"
# 3 fixtures (LEGAL/SUPPORT/DEVOPS) — anti-regression
for fix in LEGAL SUPPORT DEVOPS; do
  grep -q "const ${fix} = {" "$F" || miss="$miss missing-fixture-${fix}"
done
# Fail-closed on invariant violation
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
# ADR-152 status updated to Accepted
ADR152="$ROOT/../../v3/docs/adr/ADR-152-genome-similarity-search.md"
grep -q "Status\*\*: Accepted" "$ADR152" 2>/dev/null || miss="$miss adr152-not-accepted"
# ADR-151 §3.1 marker upgraded
PARENT151="$ROOT/../../v3/docs/adr/ADR-151-harness-intelligence-layer.md"
grep -q "ACCEPTED iter 35" "$PARENT151" 2>/dev/null || miss="$miss adr151-marker-stale"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17w. ADR-152 Genome Similarity Search drafted (iter 34, Phase 3 critical-path)"
F="$ROOT/../../v3/docs/adr/ADR-152-genome-similarity-search.md"
miss=""
[[ -f "$F" ]] || miss="$miss adr-missing"
# Must reference its parent
grep -q "ADR-151" "$F" 2>/dev/null || miss="$miss no-parent-link"
# Must enumerate the 9 numerical features used in the cosine
for field in harnessFit compileConfidence taskCoverage toolSafety memoryUsefulness risk_score test_confidence publish_readiness estCostPerRunUsd; do
  grep -q "$field" "$F" 2>/dev/null || miss="$miss missing-feature-${field}"
done
# Composite weights documented
grep -q "0.6.*cosine.*0.25.*categorical.*0.15.*jaccard" "$F" 2>/dev/null || miss="$miss no-weights"
# Smallest-spike contract present
grep -q "Smallest demonstrable spike" "$F" 2>/dev/null || miss="$miss no-spike-contract"
# Cross-link from ADR-151 updated to DRAFTED
PARENT151="$ROOT/../../v3/docs/adr/ADR-151-harness-intelligence-layer.md"
grep -q "ADR-152-genome-similarity-search.md" "$PARENT151" 2>/dev/null || miss="$miss adr151-not-updated"
grep -qE "DRAFTED iter 34|ACCEPTED iter 3[0-9]" "$PARENT151" 2>/dev/null || miss="$miss adr151-no-progress-marker"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17v. ADR-151 Phase 3 scope shell drafted (iter 33)"
F="$ROOT/../../v3/docs/adr/ADR-151-harness-intelligence-layer.md"
miss=""
[[ -f "$F" ]] || miss="$miss adr-missing"
# Must enumerate all 5 sub-capabilities
for cap in "Genome Similarity Search" "Harness Recommendation Engine" "Fleet-Wide Architecture Drift Detection" "Cross-Harness Capability Graph" "Plugin Compatibility Analysis"; do
  grep -q "$cap" "$F" 2>/dev/null || miss="$miss missing-cap-${cap// /-}"
done
# Architectural inheritance from ADR-150 explicit
grep -q "Architectural Inheritance from ADR-150" "$F" 2>/dev/null || miss="$miss no-inheritance-section"
# All 4 constraints repeated
for rule in Removable "Optional in package.json" "Graceful degradation" "CI gate"; do
  grep -q "$rule" "$F" 2>/dev/null || miss="$miss missing-rule-${rule// /-}"
done
# Scope-only status (no code yet)
grep -q "Status.*Proposed.*scope-only\|scope-only" "$F" 2>/dev/null || miss="$miss no-scope-only-marker"
# ADR-150 cross-link present
grep -q "ADR-150" "$F" 2>/dev/null || miss="$miss no-adr150-link"
# ADR-150 status now references ADR-151
PARENT="$ROOT/../../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md"
grep -q "ADR-151" "$PARENT" 2>/dev/null || miss="$miss adr150-no-back-ref"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17u. .harness/manifest.json + README documents witness gap (iter 32)"
F="$ROOT/../../.harness/manifest.json"
README="$ROOT/../../.harness/README.md"
miss=""
[[ -f "$F" ]] || miss="$miss missing-manifest"
node -e "JSON.parse(require('fs').readFileSync('$F','utf-8'))" 2>/dev/null || miss="$miss invalid-json"
# Manifest must list both security-critical files
node -e "
const m = JSON.parse(require('fs').readFileSync('$F','utf-8'));
const files = m.files || {};
if (!files['.harness/mcp-policy.json']) { console.error('no policy fingerprint'); process.exit(1); }
if (!files['.claude/settings.json']) { console.error('no settings fingerprint'); process.exit(1); }
// Sha256 hashes are 64 hex chars
for (const [k, v] of Object.entries(files)) {
  if (!/^[0-9a-f]{64}\$/.test(v)) { console.error('bad sha256 for', k); process.exit(1); }
}
" 2>/dev/null || miss="$miss manifest-shape-invalid"
[[ -f "$README" ]] || miss="$miss missing-readme"
grep -q "witness-signing-key\|witness signing\|WITNESS_SIGNING_KEY" "$README" 2>/dev/null || miss="$miss no-witness-doc"
grep -q "ADR-150" "$README" 2>/dev/null || miss="$miss no-adr-anchor"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17t. .harness/mcp-policy.json present + default-deny (iter 30 — closes no-policy HIGH)"
F="$ROOT/../../.harness/mcp-policy.json"
miss=""
[[ -f "$F" ]] || miss="$miss missing-policy-file"
node -e "JSON.parse(require('fs').readFileSync('$F','utf-8'))" 2>/dev/null || miss="$miss invalid-json"
# Required fields per metaharness mcp-scan source
node -e "
const j = JSON.parse(require('fs').readFileSync('$F','utf-8'));
const must = { defaultDeny: true, auditLog: true, requireApprovalForDangerous: true };
for (const [k, v] of Object.entries(must)) {
  if (j[k] !== v) { console.error('missing or wrong:', k, '=', j[k]); process.exit(1); }
}
// toolTimeoutMs must be positive
if (!Number.isFinite(j.toolTimeoutMs) || j.toolTimeoutMs <= 0) {
  console.error('toolTimeoutMs not positive'); process.exit(1);
}
// maxToolCallsPerTurn must be positive (clears 'no-call-budget' finding)
if (!Number.isFinite(j.maxToolCallsPerTurn) || j.maxToolCallsPerTurn <= 0) {
  console.error('maxToolCallsPerTurn not positive'); process.exit(1);
}
// ADR-150 anchor present
if (!JSON.stringify(j).includes('ADR-150')) {
  console.error('no ADR-150 anchor in policy'); process.exit(1);
}
" 2>/dev/null || miss="$miss policy-shape-invalid"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17s. mint.mjs cwd-based scaffolding (iter 27 fix for upstream --target bug)"
F="$ROOT/scripts/mint.mjs"
miss=""
# The fix uses dirname(target) as cwd + basename(target) as the CLI name
grep -q "const parentDir = dirname(ARGS.target)" "$F" || miss="$miss no-parent-dir"
grep -q "const cliName = basename(ARGS.target)" "$F" || miss="$miss no-cli-name"
# The CLI invocation MUST pass cliName (not ARGS.name) + use cwd: parentDir
grep -q "'new', cliName" "$F" || miss="$miss no-cli-name-passed"
grep -q "cwd: parentDir" "$F" || miss="$miss no-cwd-set"
# And MUST NOT include the silently-ignored --target flag
if grep -qE "'--target',\s*ARGS\.target" "$F" 2>/dev/null; then
  miss="$miss --target-flag-leaked-back"
fi
# Cross-reference to the upstream issue
grep -q "agent-harness-generator/issues/9\|0.1.12\|iter 27" "$F" || miss="$miss no-bug-context-anchor"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17q. test-with-openrouter — GCP-secret × scaffold × lifecycle e2e (iter 26)"
F="$ROOT/scripts/test-with-openrouter.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Pulls the secret from GCP Secret Manager (not from env file)
grep -q "gcloud secrets versions access" "$F" || miss="$miss no-gcp-fetch"
grep -q "OPENROUTER_API_KEY" "$F" || miss="$miss no-secret-name"
# Verifies the key against OpenRouter (live HTTP)
grep -q "openrouter.ai/api/v1" "$F" || miss="$miss no-openrouter-http"
# Scaffold + lifecycle commands
grep -q "metaharness@latest.*new\|metaharness new\|'test-harness'" "$F" || miss="$miss no-scaffold-call"
grep -q "harness.*doctor\|harness', 'doctor\|\\['doctor'" "$F" || miss="$miss no-doctor-call"
grep -q "harness.*score\|'score'" "$F" || miss="$miss no-score-call"
# Anti-regression: scaffold MUST cd into a temp dir (--target is ignored
# by metaharness@0.1.11+ which writes to \$CWD/<name>; iter 26 fix)
grep -q "cwd: fixture\|cwd: opts.cwd" "$F" || miss="$miss no-cwd-fix"
# Never echo the raw key
grep -q "apiKey.slice(0, 7)" "$F" || miss="$miss key-may-leak"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17p. bench-recordpair-overhead — measures + gates iter-12 default-path cost (iter 24/25)"
F="$ROOT/scripts/bench-recordpair-overhead.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Benchmark targets the exact iter-12 source pattern
grep -q "CLAUDE_FLOW_ROUTER_PARALLEL_LOG === '1'" "$F" || miss="$miss no-flag-literal"
# Both flag-OFF and flag-ON variants measured
grep -q "FLAG OFF" "$F" || miss="$miss no-off-variant"
grep -q "FLAG ON" "$F" || miss="$miss no-on-variant"
# Uses performance.now() not Date.now() for sub-μs resolution
grep -q "performance.now" "$F" || miss="$miss no-perf-now"
# Reports per-call overhead in nanoseconds (the meaningful unit)
grep -q "meanNsPerCall\|ns per route" "$F" || miss="$miss no-ns-reporting"
# iter 25 — CI regression gate (exits 1 above threshold)
grep -q "max-overhead-ns" "$F" || miss="$miss no-gate-flag"
grep -q "REGRESSION" "$F" || miss="$miss no-regression-message"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
# Wired into the CI workflow with a 500ns threshold
CI="$ROOT/../../.github/workflows/metaharness-ci.yml"
grep -q "max-overhead-ns 500" "$CI" 2>/dev/null || miss="$miss not-wired-to-ci"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17o. test-mcp-tools runtime contract test (ADR-150 — iter 23)"
F="$ROOT/scripts/test-mcp-tools.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Asserts the runtime contract literally: { success, data, degraded, exitCode }
grep -q "result has 'success'" "$F" || miss="$miss no-success-assertion"
grep -q "result has 'data'" "$F" || miss="$miss no-data-assertion"
grep -q "result has 'degraded'" "$F" || miss="$miss no-degraded-assertion"
grep -q "result has 'exitCode'" "$F" || miss="$miss no-exitcode-assertion"
# All 8 tool names enumerated (similarity added in iter 36, runtime-tested iter 37)
for tool in metaharness_score metaharness_genome metaharness_mcp_scan metaharness_threat_model metaharness_oia_audit metaharness_audit_list metaharness_audit_trend metaharness_similarity; do
  grep -q "${tool}" "$F" || miss="$miss missing-${tool}"
done
# Count assertion must match the iter-36 expansion (7 → 8)
grep -q "tools.length === 8" "$F" || miss="$miss tool-count-assertion-stale"
# Graceful skip when dist absent (so the script is smoke-runnable pre-build)
grep -q "SKIPPED" "$F" || miss="$miss no-skip-doc"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17n. CLAUDE.md documents MetaHarness integration (ADR-150 discoverability — iter 22)"
F="$ROOT/../../CLAUDE.md"
miss=""
[[ -f "$F" ]] || miss="$miss claude-md-missing"
grep -q "^## MetaHarness Integration (ADR-150)" "$F" || miss="$miss no-section-header"
# Architectural constraint anchor
grep -q "Ruflo remains operational if every MetaHarness package is removed" "$F" || miss="$miss no-constraint-quote"
# All 4 rules documented
grep -q "no-metaharness-smoke.yml" "$F" || miss="$miss no-ci-gate-ref"
# Command surface + tool surface enumerated
grep -q "npx ruflo metaharness score" "$F" || miss="$miss no-cli-example"
grep -q "mcp__claude-flow__metaharness_" "$F" || miss="$miss no-mcp-tool-list"
# Routing + parallel-log integration both mentioned
grep -q "CLAUDE_FLOW_ROUTER_NEURAL\|CLAUDE_FLOW_ROUTER_PARALLEL_LOG" "$F" || miss="$miss no-routing-flags"
# 3-criteria gate
grep -q "quality > 2% AND cost < 1% AND latency < 5%" "$F" || miss="$miss no-3-criteria-gate"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17m. metaharness MCP tools registered (ADR-150 deepest integration — iter 20)"
F="$ROOT/../../v3/@claude-flow/cli/src/mcp-tools/metaharness-tools.ts"
miss=""
[[ -f "$F" ]] || miss="$miss tools-file-missing"
# All 7 tools declared (5 static-analysis + 2 audit-observability — iter 20, 21)
for tool in metaharness_score metaharness_genome metaharness_mcp_scan metaharness_threat_model metaharness_oia_audit metaharness_audit_list metaharness_audit_trend; do
  grep -q "name: '${tool}'" "$F" || miss="$miss missing-${tool}"
done
# ADR-150 architectural-constraint anchor: zero static @metaharness/* import
grep -q "from '@metaharness/" "$F" && miss="$miss static-metaharness-import-LEAK"
# Subprocess isolation + locator
grep -q "locatePluginScripts" "$F" || miss="$miss no-locator"
grep -q "child_process" "$F" || miss="$miss no-subprocess"
# Registered in mcp-client.ts
CLIENT="$ROOT/../../v3/@claude-flow/cli/src/mcp-client.ts"
grep -q "import { metaharnessTools }" "$CLIENT" || miss="$miss not-imported-in-client"
grep -q "\.\.\.metaharnessTools" "$CLIENT" || miss="$miss not-spread-in-registry"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17l. test-graceful-degradation drill (ADR-150 rule #3 — iter 19)"
F="$ROOT/scripts/test-graceful-degradation.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Asserts the contract literal: exit 0 AND degraded:true
grep -q 'exit code = 0' "$F" || miss="$miss no-exit-0-assertion"
grep -q '"degraded".*true' "$F" || miss="$miss no-degraded-true-assertion"
# Skills covered (all 5 metaharness-binary-dependent ones)
for sub in score genome mcp-scan threat-model oia-audit; do
  grep -q "name: '${sub}'" "$F" || miss="$miss missing-${sub}"
done
# Unreachable-registry stub (no actual network)
grep -q "npm_config_registry" "$F" || miss="$miss no-registry-stub"
grep -q "no-such-registry" "$F" || miss="$miss no-fake-host"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17k. init + hooks discovery surfaces metaharness (iter 18)"
INIT="$ROOT/../../v3/@claude-flow/cli/src/commands/init.ts"
HOOKS="$ROOT/../../v3/@claude-flow/cli/src/commands/hooks.ts"
miss=""
# init.ts Next-steps points at metaharness score
grep -q "metaharness score.*5-dim\|metaharness score)\`} for a 5-dim" "$INIT" 2>/dev/null || miss="$miss init-no-metaharness-tip"
grep -q "ADR-150" "$INIT" 2>/dev/null || miss="$miss init-no-adr-anchor"
# hooks.ts worker-dispatch trigger list includes oia-audit
grep -q "testgaps, oia-audit" "$HOOKS" 2>/dev/null || miss="$miss hooks-trigger-list-missing"
grep -q "ruflo metaharness oia-audit" "$HOOKS" 2>/dev/null || miss="$miss hooks-tip-missing"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17j. audit-list — enumerate metaharness-audit records (iter 16)"
F="$ROOT/scripts/audit-list.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
grep -q "metaharness-audit" "$F" || miss="$miss no-namespace"
grep -q "audit-trend" "$F" || miss="$miss no-trend-pointer"
grep -q "limit\|since" "$F" || miss="$miss no-filters"
grep -q "newest first" "$F" || miss="$miss no-sort-doc"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17i. audit-trend — diff two oia-audit snapshots (iter 15)"
F="$ROOT/scripts/audit-trend.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Severity rank present + correct ordering
grep -q "SEVERITY_RANK = { clean: 0, low: 1, medium: 2, high: 3 }" "$F" || miss="$miss no-severity-rank"
# Both file-input AND memory-key-input paths
grep -q "baseline-key\|baselineKey" "$F" || miss="$miss no-mem-key-input"
grep -q "current-key\|currentKey" "$F" || miss="$miss no-current-key"
# Findings set-diff (fingerprint-based)
grep -q "fingerprint\|new Set" "$F" || miss="$miss no-findings-diff"
# Alert flag + exit semantics
grep -q "alert-on-worsening" "$F" || miss="$miss no-alert-flag"
grep -q "process.exit(1)" "$F" || miss="$miss no-fail-closed"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17h. doctor integration — checkMetaharness in standard health checks (iter 14)"
F="$ROOT/../../v3/@claude-flow/cli/src/commands/doctor.ts"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
# The check function exists, with ADR-150 anchor
grep -q "async function checkMetaharness" "$F" || miss="$miss no-check-function"
grep -q "ADR-150" "$F" || miss="$miss no-adr-anchor"
# Registered in BOTH the allChecks array AND the componentMap
grep -q "checkMetaharness, // ADR-150" "$F" || miss="$miss not-in-allChecks"
grep -q "'metaharness': checkMetaharness" "$F" || miss="$miss not-in-componentMap"
# Help text mentions it
grep -q "metaharness)" "$F" || miss="$miss not-in-help-text"
# Graceful: never throws; returns warn (not fail) on missing
grep -q "status: 'warn'" "$F" || miss="$miss no-graceful-warn"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17g. parallel-pipeline e2e integration test (ADR-150 — iter 13)"
F="$ROOT/scripts/test-parallel-pipeline.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# Exercises all three layers (recorder ↔ JSONL ↔ analyzer)
grep -q "router-parallel-recorder.ts" "$F" || miss="$miss no-recorder-coverage"
grep -q "router-parallel-analyze.mjs" "$F" || miss="$miss no-analyzer-coverage"
# Asserts the 3 thresholds from ADR-150 review-round-1 are EXACTLY those
grep -q "qualityThresholdPct === 2" "$F" || miss="$miss no-quality-threshold-assertion"
grep -q "usdThresholdPct === 1" "$F" || miss="$miss no-cost-threshold-assertion"
grep -q "latencyThresholdPct === 5" "$F" || miss="$miss no-latency-threshold-assertion"
# Both promotable + non-promotable paths exercised
grep -q "promotable.*true\|verdict.promotable === true" "$F" || miss="$miss no-promotable-assertion"
grep -q "exits 1\|status === 1" "$F" || miss="$miss no-non-promotable-assertion"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17f. model-router.ts wires recordPair() (ADR-150 last-mile, iter 12)"
F="$ROOT/../../v3/@claude-flow/cli/src/ruvector/model-router.ts"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
# Lazy loader registered
grep -q "loadParallelRecorder" "$F" || miss="$miss no-lazy-loader"
grep -q "router-parallel-recorder" "$F" || miss="$miss no-recorder-import"
# Env-gated (additive, off-by-default)
grep -q "CLAUDE_FLOW_ROUTER_PARALLEL_LOG === '1'" "$F" || miss="$miss no-env-gate-in-router"
# Call site present
grep -q "mod.recordPair({" "$F" || miss="$miss no-recordPair-call"
# Never-throws guarantee (ADR-150 rule #3)
grep -qE "try \{[[:space:]]*$|\\.catch\\(" "$F" || miss="$miss no-fail-safe"
# Both arms attributed (bandit + ser)
grep -q "thompson-bandit" "$F" || miss="$miss no-bandit-tag"
grep -q "metaharness-router-hybrid\|bandit-only" "$F" || miss="$miss no-ser-tag"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17e. router-parallel-recorder TS module (ADR-150 SelfEvolvingRouter recording — iter 11)"
F="$ROOT/../../v3/@claude-flow/cli/src/ruvector/router-parallel-recorder.ts"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
# Architectural constraint #2: env-gated optional behavior
grep -q "CLAUDE_FLOW_ROUTER_PARALLEL_LOG" "$F" || miss="$miss no-env-gate"
# Constraint #3: graceful degradation — every appendFileSync is wrapped
grep -q "ADR-150" "$F" || miss="$miss no-adr-anchor"
grep -qE "never (throws|throw|block)|never throw" "$F" || miss="$miss no-no-throw-doc"
# Public API surface
grep -q "export function recordPair\b" "$F" || miss="$miss no-recordPair-export"
grep -q "export function recordPairOutcome\b" "$F" || miss="$miss no-recordPairOutcome-export"
grep -q "export function parallelRecorderStatus\b" "$F" || miss="$miss no-status-export"
# Pairs cleanly with the analyzer's expected JSONL shape
grep -q "task_hash" "$F" || miss="$miss no-task-hash"
grep -q "predictedQuality\|predictedCostUsd" "$F" || miss="$miss no-prediction-fields"
# Default path matches analyzer's default input
grep -q "router-parallel.jsonl" "$F" || miss="$miss path-mismatch-with-analyzer"
[[ -z "$miss" ]] && ok || bad "$miss"

step "17d. router-parallel-analyze (ADR-150 SelfEvolvingRouter promotion gate — iter 10)"
F="$ROOT/scripts/router-parallel-analyze.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
# The 3-criteria AND-gate from ADR-150 review-round-1 must be explicit
grep -q "qualityImprovementPct" "$F" || miss="$miss no-quality-metric"
grep -q "usdIncreasePct" "$F" || miss="$miss no-cost-metric"
grep -q "latencyIncreasePct" "$F" || miss="$miss no-latency-metric"
# AND-semantics (not OR)
grep -q "passes.quality && passes.cost && passes.latency" "$F" || miss="$miss no-AND-gate"
# Thresholds documented in source
grep -q "qualityThresholdPct: 2" "$F" || miss="$miss no-quality-threshold"
grep -q "usdThresholdPct: 1" "$F" || miss="$miss no-cost-threshold"
grep -q "latencyThresholdPct: 5" "$F" || miss="$miss no-latency-threshold"
# Insufficient-data + strict modes both exit cleanly
grep -q "n=\${usable.length} < 30\|sufficient: false" "$F" || miss="$miss no-insufficient-guard"
grep -q "ARGS.strict" "$F" || miss="$miss no-strict-mode"
[[ -z "$miss" ]] && ok || bad "$miss"

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
