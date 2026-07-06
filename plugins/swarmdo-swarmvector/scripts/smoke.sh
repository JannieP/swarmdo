#!/usr/bin/env bash
# Smoke test for the swarmdo-swarmvector plugin against the swarmvector engine.
#
# Engine resolution (in order):
#   1. $SWARMVECTOR_BIN — explicit override
#   2. the repo-vendored engine (v3/vendor/swarmvector/bin/cli.js) — the copy
#      swarmdo actually ships; this is what runs in CI
#   3. npx swarmvector@$PIN — last resort for a future published fork.
#      NOTE: the `swarmvector` npm name is NOT published today (the 0.2.25
#      pin was a rename artifact of upstream ruvector@0.2.25) — resolution 2
#      is the real path.
set -u
PIN="swarmvector@0.2.25"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_CLI="$SCRIPT_DIR/../../../v3/vendor/swarmvector/bin/cli.js"
VENDOR_PKG="$SCRIPT_DIR/../../../v3/vendor/swarmvector/package.json"
PASS=0
FAIL=0
WORKDIR="$(mktemp -d -t swarmvector-smoke.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
cd "$WORKDIR" || exit 2

step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

if [[ -n "${SWARMVECTOR_BIN:-}" ]]; then
  run() { "$SWARMVECTOR_BIN" "$@" 2>&1; }
  EXPECT_VER=""
elif [[ -f "$VENDOR_CLI" ]] && node "$VENDOR_CLI" --version >/dev/null 2>&1; then
  run() { node "$VENDOR_CLI" "$@" 2>&1; }
  EXPECT_VER="$(node -p "require('$VENDOR_PKG').version" 2>/dev/null || echo "")"
elif [[ -f "$VENDOR_CLI" ]]; then
  echo "vendored engine present but not runnable (deps missing?) — install them:"
  echo "  (cd v3/vendor/swarmvector && npm install --omit=dev --ignore-scripts)"
  run() { npx -y "$PIN" "$@" 2>&1; }
  EXPECT_VER="0.2.25"
else
  run() { npx -y "$PIN" "$@" 2>&1; }
  EXPECT_VER="0.2.25"
fi

step "version pin"
# --version output may include npm warnings; take the last non-empty line.
ver=$(run --version | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | tail -1)
if [[ -n "$EXPECT_VER" ]]; then
  [[ "$ver" == "$EXPECT_VER" ]] && ok || bad "expected $EXPECT_VER, got '$ver'"
else
  [[ -n "$ver" ]] && ok || bad "engine did not report a semver version"
fi

step "top-level help mentions hooks/embed/rvf/attention/gnn/brain/sona"
help=$(run --help)
missing=""
for c in hooks embed rvf attention gnn brain sona create stats search insert; do
  grep -qE "^[[:space:]]+$c( |\$)" <<<"$help" || missing="$missing $c"
done
[[ -z "$missing" ]] && ok || bad "missing:$missing"

step "hooks route is positional"
out=$(run hooks route "test task")
grep -q '"recommended"' <<<"$out" && ok || bad "no JSON 'recommended' field — got: $out"

step "hooks ast-analyze on a sample TS file"
echo 'export const x = 1;' > sample.ts
out=$(run hooks ast-analyze sample.ts)
grep -q "AST Analysis" <<<"$out" && ok || bad "ast-analyze did not return summary"

step "hooks ast-complexity returns JSON"
out=$(run hooks ast-complexity sample.ts)
grep -q '"cyclomatic"' <<<"$out" && ok || bad "ast-complexity output unexpected"

step "attention list shows mechanisms"
out=$(run attention list)
grep -q "FlashAttention" <<<"$out" && ok || bad "attention list missing FlashAttention"

step "rvf examples lists at least 10 stores"
out=$(run rvf examples)
n=$(grep -cE '^\s+[a-z_]+\s+[0-9]' <<<"$out")
[[ $n -ge 10 ]] && ok || bad "expected ≥10 RVF examples, got $n"

step "gnn info reports availability status (platform-aware)"
out=$(run gnn info)
# Only the darwin-arm64 native binding is committed — on other platforms the
# honest expectation is a graceful status line, not 'Available'.
GNN_BINDING="$SCRIPT_DIR/../../../v3/@swarmvector/gnn/platforms/$(node -p 'process.platform + "-" + process.arch')/swarmvector-gnn.node"
if [[ -f "$GNN_BINDING" ]]; then
  grep -q "Status:.*Available" <<<"$out" && ok || bad "binding present but gnn did not report Available"
else
  grep -q "Status:" <<<"$out" && ok || bad "gnn info produced no Status line (graceful-unavailable expected)"
fi

step "info reports the engine CLI version"
out=$(run info)
if [[ -n "$EXPECT_VER" ]]; then
  grep -q "CLI Version: $EXPECT_VER" <<<"$out" && ok || bad "info did not report $EXPECT_VER"
else
  grep -qE "CLI Version: [0-9]+\.[0-9]+\.[0-9]+" <<<"$out" && ok || bad "info did not report a version"
fi

step "doctor exits 0"
run doctor >/dev/null && ok || bad "doctor returned non-zero"

step "removed surface stays removed (compare/index; midstream returned in 0.2.40)"
# midstream was removed in the 0.2.25 era but the vendored 0.2.40 engine
# ships it again (real-time inference: attractors/Lyapunov/scheduling) —
# the contract tracks what we actually ship.
fail_removed=""
for c in compare index; do
  # Don't pass --help — Commander will show top-level help instead of the error.
  out=$(run "$c")
  grep -q "unknown command '$c'" <<<"$out" || fail_removed="$fail_removed $c"
done
[[ -z "$fail_removed" ]] && ok || bad "still present:$fail_removed"

printf "\n%s passed, %s failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
