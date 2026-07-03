# MetaHarness User Guide (ADR-150)

**MetaHarness integration in swarmdo `3.12.1+`.** Ten CLI subcommands, nine MCP tools, three CI workflows, and a dedicated `swarmdo eject` command — all wired to the upstream `metaharness` / `@metaharness/*` ecosystem with **graceful degradation** when those optional packages aren't installed.

Quick links: [Quick start](#quick-start) · [10 CLI subcommands](#cli-subcommands) · [9 MCP tools](#mcp-tools) · [Architectural constraints](#architectural-constraints-adr-150) · [Workflows](#common-workflows) · [Troubleshooting](#troubleshooting) · [ADR-152 similarity search](#adr-152-§31-genome-similarity-search) · [Eject](#swarmdo-eject)

---

## What is MetaHarness?

`metaharness` is a sibling agent-harness scaffolding system designed by the same author as swarmdo. Where swarmdo *is* a harness, metaharness analyzes harnesses — scoring readiness, mapping MCP surfaces, threat-modeling, fingerprinting genome characteristics, and detecting drift over time. ADR-150 integrates it as a first-class subsystem so you can audit and characterize swarmdo (or any harness) from the same CLI.

The integration is **strictly optional**. Per [ADR-150](../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md) constraint #4, swarmdo remains fully operational even when every `@metaharness/*` package is uninstalled — every command degrades gracefully with a clear `degraded: true` payload instead of crashing.

---

## Quick start

```bash
# Install (metaharness ships bundled in @swarmdo/cli's plugins/)
npm i swarmdo@latest

# Score the current repo's harness readiness
npx swarmdo metaharness score --path .

# 7-section categorical genome report
npx swarmdo metaharness genome --path .

# Static security scan of the declared MCP surface
npx swarmdo metaharness mcp-scan --path . --fail-on high

# Composite audit (oia-manifest + threat-model + mcp-scan + score + genome)
npx swarmdo metaharness oia-audit --path . --alert-on-worst high

# Detect drift from the last audit
npx swarmdo metaharness drift-from-history --threshold 0.95

# Score two harnesses' similarity (ADR-152 §3.1)
npx swarmdo metaharness similarity --a harnessA.json --b harnessB.json
```

All commands accept `--format json|table` and `--help`.

---

## CLI subcommands

```
npx swarmdo metaharness <subcommand> [flags]
```

| # | Subcommand | One-line | Output shape |
|---|---|---|---|
| 1 | `score` | 5-dim readiness scorecard | `{harnessFit, compileConfidence, taskCoverage, toolSafety, memoryUsefulness, estCostPerRunUsd, recommendedMode, archetype, template}` |
| 2 | `genome` | 7-section categorical report | `{repo_type, agent_topology, risk_score, mcp_surface, test_confidence, publish_readiness}` |
| 3 | `mcp-scan` | Static MCP security findings | `{findings: [{severity, message, ...}], summary, alert}` |
| 4 | `threat-model` | Enterprise threat report | `{worst, findings: [{category, severity, ...}]}` |
| 5 | `oia-audit` | Composite audit → memory | `{timing, composite: {worst}, components, fingerprint, alert, persisted}` |
| 6 | `audit-list` | Enumerate audit records | `{namespace, filters, records: [{key, startedAt, ...}], generatedAt}` |
| 7 | `audit-trend` | Diff two audits (drift) | `{verdict, structuralDistance, introduced, cleared, alert}` |
| 8 | `similarity` | ADR-152 §3.1 weighted similarity | `{overall, components: {cosine, categorical, jaccard}, perDimension?}` |
| 9 | `drift-from-history` | One-command drift detection | `{timing, baseline, current, drift, alert}` |
| 10 | `mint` | Scaffold a custom harness | dry-run by default; refuses in-repo target |

### `score` — 5-dimension readiness

```bash
npx swarmdo metaharness score --path . --format json
npx swarmdo metaharness score --path . --alert-on-fit-below 70
```

Returns five numeric dimensions (0–100):

- **harnessFit** — overall readiness composite
- **compileConfidence** — build/test signal strength
- **taskCoverage** — breadth of declared agent roles
- **toolSafety** — MCP policy posture
- **memoryUsefulness** — persistence + retrieval characteristics

Plus `estCostPerRunUsd`, `recommendedMode` (`CLI` / `CLI + MCP`), `archetype`, `template`.

### `genome` — 7-section categorical

```bash
npx swarmdo metaharness genome --path . --alert-on-risk-above 0.5
```

Returns categorical (string/enum) classifications that complement `score`'s numerics. Pair them: `score` is *how ready*, `genome` is *what kind*.

### `mcp-scan` — MCP security

```bash
npx swarmdo metaharness mcp-scan --path . --fail-on high
```

Reads `.mcp/servers.json` + `.harness/claims.json` and runs static analysis. Finding shape is normalized to `{severity, message, title?, detail?, id?}` — same fields whether upstream emitted JSON or our text-parser fell back.

`--fail-on {low|medium|high}` sets the `alert.triggered` floor.

### `threat-model` — Enterprise threat report

```bash
npx swarmdo metaharness threat-model --path . --fail-on high
```

Returns `{worst, findings: [...]}` suitable for sharing with infosec. Findings are categorized; the worst-severity rollup is the operationally-useful summary.

### `oia-audit` — Composite audit → memory

```bash
npx swarmdo metaharness oia-audit --path . \
  --alert-on-worst high \
  --format json
```

Bundles **5 sub-audits in parallel** (oia-manifest + threat-model + mcp-scan + score + genome) into one timestamped record. Persists to the `metaharness-audit` memory namespace by default, or pass `--dry-run` to skip persistence.

Output includes a denormalized `fingerprint: {score, genome}` field designed for downstream `similarity()` and `audit-trend` consumption.

### `audit-list` — Enumerate records

```bash
npx swarmdo metaharness audit-list --limit 20 --since 30d --format json
```

Discover which audit keys exist before running `audit-trend` or `drift-from-history --baseline-key <k>`.

### `audit-trend` — Diff two audits

```bash
npx swarmdo metaharness audit-trend \
  --baseline-key audit-2026-06-01... \
  --current-key  audit-2026-06-15... \
  --alert-on-distance-below 0.85
```

Returns composite worst-severity delta + per-component status change + introduced/cleared findings + (ADR-152 §3.1) **structural distance** when both records carry a `fingerprint`.

Accepts memory keys OR direct file paths (`--baseline /path/to/json.json`) — useful for diffing CI artifacts.

### `similarity` — ADR-152 §3.1 weighted similarity

```bash
npx swarmdo metaharness similarity \
  --a harnessA.json --b harnessB.json \
  --per-dimension \
  --alert-below 0.5
```

Returns `overall ∈ [0,1]` plus per-component breakdown:
- **cosine** over 9 numerics (harnessFit, riskScore, etc.)
- **categorical** over 4 enums (repo_type, recommendedMode, archetype, template)
- **jaccard** over `agent_topology` (set of declared roles)

See [ADR-152 §3.1 below](#adr-152-§31-genome-similarity-search) for math + use cases.

### `drift-from-history` — One-command drift

```bash
# Slowest path — discovers the most recent audit in memory
npx swarmdo metaharness drift-from-history --threshold 0.95

# Fast path — skip audit-list (~14× faster)
npx swarmdo metaharness drift-from-history \
  --baseline-key audit-2026-06-15T... \
  --threshold 0.95

# Fastest path — skip memory entirely (~19× faster)
npx swarmdo metaharness drift-from-history \
  --baseline-file /tmp/last-audit.json \
  --threshold 0.95 \
  --alert-on-new-severity high \
  --dry-run
```

Composes `audit-list` + `oia-audit` + `audit-trend` into one structured report. **Three tiers** of execution speed:

| Tier | Flag | Wall time | When to use |
|---|---|---|---|
| Slow | (none) | ~26 s | Interactive — let it discover the baseline |
| Fast | `--baseline-key` | ~1.8 s | When you already know the key (e.g., from `audit-list`) |
| Fastest | `--baseline-file` | ~1.4 s | CI artifact pipelines (diff this run vs downloaded prior artifact) |

`--alert-on-new-severity` is orthogonal to `--threshold`: a CRITICAL finding triggers even if structural similarity stays above the threshold.

### `mint` — Scaffold a harness

```bash
npx swarmdo metaharness mint --name foo --template vertical:coding --confirm
```

Dry-run by default. Pass `--confirm` to actually write.

---

## MCP tools

Nine MCP tools registered under the `metaharness` category, callable by Claude Code / any MCP-aware agent:

```
mcp__swarmdo__metaharness_score
mcp__swarmdo__metaharness_genome
mcp__swarmdo__metaharness_mcp_scan
mcp__swarmdo__metaharness_threat_model
mcp__swarmdo__metaharness_oia_audit
mcp__swarmdo__metaharness_audit_list
mcp__swarmdo__metaharness_audit_trend
mcp__swarmdo__metaharness_similarity
mcp__swarmdo__metaharness_drift_from_history
```

Every handler returns the `{success, data, degraded, exitCode}` contract:

```ts
type MCPHandlerResult = {
  success: boolean;   // false on alert.triggered OR exitCode != 0
  data: any;          // the wrapped JSON payload
  degraded: boolean;  // true when metaharness is uninstalled
  exitCode: number;   // mirrors the CLI exit code
}
```

`success === false` is the source of truth for "this should block downstream action" — `exitCode` is also surfaced for shell-script consumers but the MCP layer uses `success`.

Each tool description includes `Use when ...` guidance per [ADR-112](../v3/docs/adr/ADR-112-mcp-tool-discoverability.md) so a model can pick the right one without reading source.

---

## Architectural constraints (ADR-150)

The integration enforces **four constraints** as load-bearing invariants:

| # | Constraint | Enforced by |
|---|---|---|
| 1 | **Removable** | `npm ls --without @metaharness/*` produces a working CLI |
| 2 | **Optional in `package.json`** | `@metaharness/*` packages MUST be in `optionalDependencies`, never `dependencies` |
| 3 | **Graceful degradation** | Every code path catches `MODULE_NOT_FOUND` and falls back to a `degraded: true` payload |
| 4 | **CI gate** | `.github/workflows/no-metaharness-smoke.yml` enforces 1–3 by static grep + runtime drill on every PR |

If `@metaharness/router`, `metaharness`, or `@metaharness/kernel` are absent, every command emits:

```json
{
  "degraded": true,
  "reason": "metaharness-not-installed",
  "hint": "Install metaharness manually with `npm i -D metaharness` or run `npx metaharness@latest --version` to verify network access.",
  "generatedAt": "2026-06-17T..."
}
```

…and exits 0. Downstream tooling can branch on `degraded` to fall back or skip.

---

## Common workflows

### Daily drift check

```bash
# Once: seed with a baseline audit
npx swarmdo metaharness oia-audit --path . --alert-on-worst high

# Daily: detect drift vs the last baseline
npx swarmdo metaharness drift-from-history --threshold 0.95 \
  --alert-on-new-severity high
```

The composite audit writes a record keyed by ISO timestamp. `drift-from-history` discovers it via `audit-list`, runs a fresh audit, diffs the fingerprints via ADR-152 §3.1 similarity, and alerts when:
- Structural similarity falls below `--threshold` **OR**
- Any introduced finding meets `--alert-on-new-severity` (orthogonal gate)

### Weekly cron (CI)

The repo ships `.github/workflows/oia-audit-weekly.yml` which runs the composite audit every Sunday 04:17 UTC, uploads the result as a 90-day-retained artifact, and diffs against the previous week's artifact using the fastest `--baseline-file` path.

Adapt for your repo:

```yaml
- name: composite audit
  run: |
    npx swarmdo metaharness oia-audit --path . --dry-run \
      --alert-on-worst high --format json > /tmp/audit.json
- uses: actions/upload-artifact@v4
  with:
    name: oia-audit-${{ github.run_id }}
    path: /tmp/audit.json
    retention-days: 90

- name: drift vs prior week
  if: always() && steps.prior-artifact.outputs.has_prior == 'true'
  run: |
    npx swarmdo metaharness drift-from-history \
      --baseline-file /tmp/prior/audit.json \
      --threshold 0.95 \
      --alert-on-new-severity high \
      --format json > /tmp/drift.json
```

### PR audit gate

```bash
# In .github/workflows/metaharness-ci.yml
npx swarmdo metaharness score --path . --alert-on-fit-below 70
npx swarmdo metaharness mcp-scan --path . --fail-on high
npx swarmdo metaharness threat-model --path . --fail-on high
```

Any of these exits 1 when the alert fires; standard CI failure semantics.

### Template ranking (ADR-151 §3.2)

```bash
# Compare current repo against N candidate templates
for t in templates/*.json; do
  npx swarmdo metaharness similarity \
    --a current-genome.json --b "$t" --format json \
    | jq "{template: \"$t\", overall: .overall}"
done | jq -s 'sort_by(-.overall)'
```

The Recommender surfaces the closest-fit templates for a given target repo.

---

## ADR-152 §3.1 Genome Similarity Search

A **pure-TS, zero-`@metaharness/*`-dep** similarity engine. Weighted blend:

| Component | Weight | What it compares |
|---|---|---|
| **cosine** | 0.4 | 9 numerics: `harnessFit`, `compileConfidence`, `taskCoverage`, `toolSafety`, `memoryUsefulness`, `risk_score`, `test_confidence`, `publish_readiness`, `estCostPerRunUsd` |
| **categorical** | 0.3 | 4 enums: `repo_type`, `recommendedMode`, `archetype`, `template` |
| **jaccard** | 0.3 | `agent_topology` (set of declared roles) |

`overall = w_c · cosine + w_k · categorical + w_j · jaccard`, all in `[0, 1]`.

**Verdict thresholds:**

| overall | verdict |
|---|---|
| ≥ 0.95 | `near-identical` |
| ≥ 0.85 | `minor-drift` |
| ≥ 0.5 | `moderate-drift` |
| < 0.5 | `major-drift` |

These are the structural-distance verdicts surfaced by `audit-trend` and `drift-from-history`.

---

## Router integration (ADR-148/149)

`@metaharness/router@~0.3.2` is wired as the cost-optimal model router behind the `SWARMDO_ROUTER_NEURAL=1` triple-gate. When the neural path is active, the `routedBy` field carries `'metaharness-knn' | 'metaharness-krr' | 'fastgrnn'` so you can audit which engine made each decision.

### Parallel-logging (ADR-150 Phase 2)

```bash
export SWARMDO_ROUTER_PARALLEL_LOG=1
# … run your normal workload …
node plugins/swarmdo-metaharness/scripts/router-parallel-analyze.mjs \
  --input .swarm/router-parallel.jsonl --strict
```

Every `route()` call writes a paired-decision row (bandit pick + neural-augmented pick + outcome). The analyzer enforces the 3-criteria AND-gate from ADR-150 review-round-1:

```
quality > 2%   AND   cost < 1%   AND   latency < 5%
```

`--strict` exit 1 if any criterion fails — the **promotion gate** before swapping the bandit out for the neural router in production.

---

## `swarmdo eject`

A dedicated CLI command (not under `metaharness`) that lifts a swarmdo project into a renamed standalone harness via `metaharness --from-existing`.

```bash
# Dry-run (default) — prints the plan and exits without writing
npx swarmdo eject --name my-harness

# Eject for real
npx swarmdo eject --name my-harness --confirm

# Eject to a specific dir (must be OUTSIDE the calling repo)
npx swarmdo eject --name my-harness --target /abs/path --confirm
```

**Safety gate:** refuses any `--target` inside the calling repo. The default target is `/tmp/swarmdo-eject-<ts>-<name>/` — a fresh location to prevent eject-on-top-of-source accidents.

Use case: you've prototyped agent workflows on top of swarmdo and want a renamed harness with its own identity, ready to publish or distribute independently.

---

## `swarmdo doctor`

Verify metaharness availability:

```bash
npx swarmdo doctor --component metaharness
```

Reports installed/missing status for `@metaharness/router`, `metaharness`, `@metaharness/kernel`, plus the plugin script directory location. Always exits 0 — doctor reports state, never blocks.

---

## Troubleshooting

### "metaharness: plugins/swarmdo-metaharness/scripts/ not found"

Shipped fixed in **`swarmdo@3.12.1+`**. The CLI dispatcher locates its plugin scripts under `node_modules/@swarmdo/cli/plugins/swarmdo-metaharness/scripts/`. If you're on `3.12.0`, upgrade:

```bash
npm install swarmdo@latest
```

### "degraded: true, reason: metaharness-not-installed"

The optional `metaharness` / `@metaharness/*` packages aren't in `node_modules`. Per ADR-150 constraint #3 this is a **valid degraded mode** — swarmdo still works, you just won't get score/genome/etc. results. To enable them:

```bash
npm install -D metaharness@latest @metaharness/router@latest
```

(Or accept the degraded mode — swarmdo doesn't *require* metaharness for any non-metaharness command.)

### Drift report exits 2 with "no audit records found"

You haven't seeded a baseline yet. Run one composite audit first:

```bash
npx swarmdo metaharness oia-audit --path .
# Then drift detection becomes meaningful
npx swarmdo metaharness drift-from-history --threshold 0.95
```

### `audit-list` shows zero records but I ran audits

Check the namespace — `oia-audit` persists to `metaharness-audit` by default. If you've overridden `AUDIT_LIST_NAMESPACE`, set it for `audit-list` too:

```bash
AUDIT_LIST_NAMESPACE=my-custom-ns npx swarmdo metaharness audit-list
```

### Composite audit takes 30+ seconds on CI

Expected — `oia-audit` spawns 5 sub-audits in parallel and each shells out to `npx metaharness <cmd>`. Cold-cache npx warmup is ~25 s per process. Mitigations:
- Pre-install metaharness in the runner (skips npx fetch)
- Use `--dry-run` to skip the memory-store roundtrip
- Pin a CI cache for the npm/npx store

### "ELIFECYCLE Command failed with exit code 1" on `pnpm install`

Usually transient network ECONNRESET on sharp / onnxruntime-node postinstall. Retry the install — the cron-fire workflows ship with `npm_config_fetch_retries=5` so most flakes auto-recover.

---

## Internals

- **Source**: [`plugins/swarmdo-metaharness/`](../plugins/swarmdo-metaharness/) in the repo
- **Bundled location at runtime**: `node_modules/@swarmdo/cli/plugins/swarmdo-metaharness/scripts/`
- **CLI dispatcher**: [`v3/@swarmdo/cli/src/commands/metaharness.ts`](../v3/@swarmdo/cli/src/commands/metaharness.ts)
- **MCP tools**: [`v3/@swarmdo/cli/src/mcp-tools/metaharness-tools.ts`](../v3/@swarmdo/cli/src/mcp-tools/metaharness-tools.ts)
- **Eject command**: [`v3/@swarmdo/cli/src/commands/eject.ts`](../v3/@swarmdo/cli/src/commands/eject.ts)
- **ADR**: [`v3/docs/adr/ADR-150-metaharness-integration-surfaces.md`](../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md)
- **ADR-152 §3.1 similarity**: [`v3/docs/adr/ADR-152-genome-similarity-search.md`](../v3/docs/adr/ADR-152-genome-similarity-search.md)
- **Tracking issue**: [#2399](the upstream project (see NOTICE))
- **Upstream**: [`the upstream project (see NOTICE)`](the upstream project (see NOTICE))

## Cross-references

Filed upstream issues (open):
- `upstream/agent-harness-generator#15` — CLI schema mismatch (downstream workaround via `runMetaharness` routing in place)
- `upstream/agent-harness-generator#16` — `mcp-scan` text-only output (downstream `parseMcpScanText` parser donated as MIT contribution)

Both are tracked in [ADR-150 §"Cross-references"](../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md).
