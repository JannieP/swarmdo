# ADR-152 — Genome Similarity Search

**Status**: Accepted (spike landed iter 35 — both invariants pass)
**Date**: 2026-06-16 (revised same-day with spike result)
**Parent**: [ADR-151](ADR-151-harness-intelligence-layer.md) (Phase 3 scope shell — Harness Intelligence Layer)
**Inherits**: ADR-150's four architectural constraints (removable / optional / graceful / CI-gate)
**Spike**: `plugins/rufflo-metaharness/scripts/_spike-similarity.mjs` ([iter-35 commit](https://github.com/ruvnet/ruflo/commit/HEAD))

## Spike result (iter 35 — measured)

```
similarity(LEGAL, LEGAL).overall = 1.0000    ✓ Invariant 1 (self-match) — exact
similarity(LEGAL, SUPPORT).overall = 0.8296
similarity(LEGAL, DEVOPS).overall  = 0.5840  ✓ Invariant 2 (vertical affinity) — support > devops

Per-component (LEGAL vs SUPPORT):  cosine=0.9987  categorical=0.75   jaccard=0.2857
Per-component (LEGAL vs DEVOPS):   cosine=0.9734  categorical=0      jaccard=0
```

Notable findings from the spike:
- **Numerical cosine alone is too coarse** — LEGAL vs DEVOPS scored cosine=0.9734 despite being unrelated verticals. The numerics are clustered around similar scorecard ranges. Categorical + jaccard pulled the composite correctly to 0.58 vs 0.83.
- **The 0.6/0.25/0.15 weighting from the §Decision section reproduces the intended ordering** on the synthetic LEGAL/SUPPORT/DEVOPS fixtures.
- **`categorical: 0` for LEGAL/DEVOPS** correctly fires because they share no enum field (different archetypes, different templates, different recommendedMode). This is a strong feature of the design — categorical disagreement is a clean kill-switch.

## Context

ADR-151 Phase-3 §3.1 calls for a similarity function over MetaHarness genome + scorecard JSON. It is the **critical-path dependency for §3.2 (Recommendation Engine), §3.3 (Fleet Drift), and §3.5 (Plugin Compatibility)** — three of the four other Phase-3 sub-capabilities consume similarity scores.

What we have already (post-ADR-150 implementation):
- `harness genome <repo>` emits a 7-section JSON blob: `repo_type`, `agent_topology[]`, `risk_score`, `mcp_surface`, `test_confidence`, `publish_readiness`.
- `harness score <repo>` emits a 5-dimension JSON blob: `harnessFit`, `compileConfidence`, `taskCoverage`, `toolSafety`, `memoryUsefulness`, plus `archetype` and `template`.
- `harness threat-model <repo>` emits a `worst` severity + a list of categorized findings.
- The iter-7 `oia-audit` records bundle all three above per timestamp in `metaharness-audit` memory namespace.

What we need: a function `similarity(genomeA, genomeB) → number ∈ [0,1]` plus a per-dimension breakdown explaining where the two harnesses agree or differ.

## Decision

Implement genome similarity as a **pure-TS function** in the existing `rufflo-metaharness` plugin with three components:

### 1. Cosine similarity over a numerical feature vector

Project the structured genome + scorecard into a fixed-length numerical vector:

| Index | Source | Field | Normalization |
|---:|---|---|---|
| 0 | score | `harnessFit` | already 0..100 → divide by 100 |
| 1 | score | `compileConfidence` | divide by 100 |
| 2 | score | `taskCoverage` | divide by 100 |
| 3 | score | `toolSafety` | divide by 100 |
| 4 | score | `memoryUsefulness` | divide by 100 |
| 5 | genome | `risk_score` | already 0..1 |
| 6 | genome | `test_confidence` | already 0..1 |
| 7 | genome | `publish_readiness` | already 0..1 |
| 8 | score | `estCostPerRunUsd` | log-transformed: `log10(usd + 0.001) / log10(10)` clamped to 0..1 |

Cosine similarity over these 9 dims gives a `[0, 1]` score where 1 = identical and 0 = orthogonal. Cheap, deterministic, byte-identical for identical inputs.

### 2. Categorical agreement over enum fields

Three fields are categorical:

| Field | Source | Possible values |
|---|---|---|
| `repo_type` | genome | e.g. `node_mcp_ci`, `python_lib`, `rust_cli` |
| `archetype` | score | e.g. `typescript-sdk-harness`, `python-agent-harness` |
| `template` | score | one of the 20 metaharness templates |
| `recommendedMode` | score | `CLI`, `MCP`, or `CLI + MCP` |

Each contributes `1` if matching, `0` if not. Sum / 4 → categorical-agreement score.

### 3. Set agreement over `agent_topology[]`

The `agent_topology` field is an array (e.g. `["maintainer", "tester", "security", "release"]`). Jaccard similarity = `|A ∩ B| / |A ∪ B|`.

### Composite

`overallSimilarity = 0.6 · cosine + 0.25 · categorical + 0.15 · jaccard`

Weights chosen so that:
- Numerical similarity dominates (most signal density).
- Categorical agreement is the next tier (high-signal but low-cardinality).
- Topology agreement is the tie-breaker (interpretable but coarse).

Return shape:

```typescript
interface SimilarityResult {
  overall: number;                                // [0,1]
  components: {
    cosine: number;                               // [0,1]
    categorical: number;                          // [0,1]
    jaccard: number;                              // [0,1]
  };
  perDimension: Record<string, {
    a: number | string | string[];
    b: number | string | string[];
    contribution: number;                         // signed [-w, +w]
  }>;
  generatedAt: string;
}
```

The `perDimension` breakdown lets consumers explain *why* two harnesses scored as they did — critical for the §3.2 Recommendation Engine's confidence calculation and the §3.3 Drift Detection's alert reason.

## Implementation surface

- **One pure-TS function** in `plugins/rufflo-metaharness/scripts/_similarity.mjs` (shared module convention — see iter-1 `_harness.mjs` and iter-73 `_sessions.mjs`).
- **One CLI skill** `harness-similarity` invoked as `npx rufflo metaharness similarity --a <genomeA.json> --b <genomeB.json>` (or `--a-key`/`--b-key` for memory-namespace lookup, mirroring iter-15 `audit-trend`).
- **One MCP tool** `mcp__rufflo__metaharness_similarity` so agents can call it during conversation.

NO new dependency on `@metaharness/*` — the function operates on JSON shapes that the existing CLI already emits. Genuinely zero blast radius on ADR-150's four constraints:

- Removable ✓ (pure-TS, reads JSON the CLI already produces)
- Optional ✓ (no new dep)
- Graceful ✓ (gracefully reports `degraded` if inputs are malformed)
- CI-gate ✓ (standalone unit-testable; no `npx` required)

## Smallest demonstrable spike (the implementation gate)

Before ADR-152 is marked **Accepted**, ship a 30-LOC proof that:

1. Reads two `harness genome` + `harness score` JSON files from disk.
2. Computes `cosine` over the 9 numeric dims.
3. Returns a single number.
4. Verifies: similarity(X, X) === 1 (exact self-match).
5. Verifies: similarity(legal_harness, devops_harness) < similarity(legal_harness, support_harness) using the 13 known metaharness verticals as fixtures.

The spike script: `plugins/rufflo-metaharness/scripts/_spike-similarity.mjs`. Lives in the plugin to avoid polluting global scripts; deleted after ADR-152 graduates.

## Consequences

### Positive

- Unblocks §3.2 / §3.3 / §3.5 — three of four Phase-3 consumers can begin work in parallel once similarity ships.
- No new dependencies, no runtime cost, pure-function semantics. Failure modes are limited to "garbage in → low confidence out" — never a crash.
- The 9-dim feature vector + 3-component weighted composite is a **single source of truth** for similarity semantics; downstream ADRs reference back to this one rather than reinventing.

### Negative

- **Choice of weights (0.6/0.25/0.15) is opinionated.** A different weighting could change the recommender's rankings. Mitigation: expose weights as optional CLI flags; defaults are documented; ship the fixtures from the spike as a regression-suite so weight changes are visible.
- **Numerical vector excludes `threat-model worst`** because it's categorical and would inflate the categorical component too far. If `worst` regression is what matters for drift detection (§3.3), drift consumers must check `worst` separately.
- **No semantic similarity over agent prompts / SKILL.md text.** ADR-151's §3.4 (capability graph) calls for that; this ADR explicitly defers it to keep §3.1 small.

### Neutral

- The function is invocable from any layer (CLI / MCP tool / direct Node import / future browser-side) without changes — the JSON contract is the only coupling.

## Alternatives Considered

**Alternative A: Use sentence embeddings over the README + agent prompt text.**
- Pros: captures semantic similarity humans care about.
- Cons: requires embeddings model + 384-dim vectors + similarity index. Adds a heavy dep, breaks ADR-150's removability rule for harnesses that disable optional deps.
- Verdict: Defer to §3.4 (capability graph) where it's actually needed.

**Alternative B: Skip cosine, use only categorical + jaccard.**
- Pros: simpler, no float math.
- Cons: loses signal from the 5 scorecard + 3 genome numeric dimensions. `harnessFit: 82` vs `harnessFit: 45` should clearly contribute to similarity, and categorical can't see that.
- Verdict: cosine over the 9 numerics is the right primitive.

**Alternative C: Train a similarity model on real harness pairs.**
- Pros: would learn actual user-perceived similarity.
- Cons: requires labeled pairs that don't exist; circular (the recommender's job is to PRODUCE those pairs). Premature ML.
- Verdict: defer until §3.2 has shipped enough data to bootstrap.

## Open Questions

- Should weights be a configurable field in `mcp-policy.json`? Lean no — the 0.6/0.25/0.15 split should be a single global default. Per-org tuning is out of scope for §3.1.
- Should the function ALSO emit a Mermaid diagram visualizing the breakdown? Probably yes via an optional `--format mermaid`. Cheap to add post-spike.
- How does similarity interact with the iter-15 `audit-trend` script? `audit-trend` already diffs two timestamps of the SAME harness; this ADR adds a separate primitive for diffing two DIFFERENT harnesses. Both should live as siblings, not subtypes.

## References

- [ADR-151](ADR-151-harness-intelligence-layer.md) — Phase 3 scope shell (parent)
- [ADR-150](ADR-150-metaharness-integration-surfaces.md) — Phase 1+2 implementation, architectural constraints
- iter-15 `audit-trend` — `plugins/rufflo-metaharness/scripts/audit-trend.mjs` (sibling drift-detection primitive)
- iter-1 `_harness.mjs` — shared-module convention reference
- Upstream `harness genome / score / threat-model` outputs documented in [`ruvnet/agent-harness-generator`](https://github.com/ruvnet/agent-harness-generator) source
