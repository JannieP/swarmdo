# ADR-086: Wire @swarmvector/swarmllm as Intelligence Coordinator

**Status**: Accepted — Implemented (SonaCoordinator, ContrastiveTrainer, TrainingPipeline wired; selective JS retained for cosine/EWC/LoRA forward/HNSW)
**Date**: 2026-04-07 · **Updated**: 2026-05-09

## Context

The swarmdo intelligence pipeline (ReasoningBank, EWC++, LoRA, SONA, cosine similarity) is implemented in pure JavaScript using Float32Array operations. `@swarmvector/swarmllm@2.5.4` is installed and provides structured ML components.

### API Testing Results (2026-04-07)

| Component | swarmllm Status | Keep JS? | Rationale |
|-----------|--------------|----------|-----------|
| `cosineSimilarity` | Works but same speed as JS (38ms vs 36ms / 100k) | **Yes** | No perf gain |
| `ReasoningBank.store/getByType` | Works | Partial | Use for type-based storage, keep JS HNSW for search |
| `ReasoningBank.findSimilar` | **Broken** (returns 0 always) | **Yes** | swarmllm bug |
| `EwcManager.computePenalty` | **Returns NaN** | **Yes** | swarmllm bug |
| `LoraAdapter.forward` | Works but same speed, different output dims | **Yes** | API mismatch |
| `SonaCoordinator` | Works: trajectory recording + background loop | **Use** | Real learning pipeline |
| `ContrastiveTrainer` | Works: triplet training, epoch tracking | **Use** | Agent embedding learning |
| `TrainingPipeline` | Works: checkpoint save/load, LoRA training | **Use** | Model training infrastructure |
| `SessionManager` | Works: session create/export/import | **Use** | Session coordination |

### What swarmllm IS

A well-structured JS library with SIMD support flag. NOT native Rust/NAPI for most operations. Value is in the **coordination framework**, not raw speed.

### ESM/CJS Import Resolution

`@swarmvector/swarmllm` exports CJS only (`dist/cjs/index.js`). ESM `await import()` fails due to broken ESM export path. Resolution: use `createRequire(import.meta.url)` pattern (same as `diskann-backend.ts`, `swarmvector-training.ts`).

## Decision

Selectively integrate `@swarmvector/swarmllm` as the intelligence **coordinator**, not a wholesale replacement:

### USE swarmllm for (coordination & learning):
1. **`SonaCoordinator`** — Trajectory-based learning pipeline in `intelligence.ts`
2. **`ContrastiveTrainer`** — Agent embedding improvement in `sona-optimizer.ts`
3. **`TrainingPipeline`** — LoRA training with checkpoints in `lora-adapter.ts`
4. **`ReasoningBank`** (store/getByType) — Type-based pattern storage alongside JS HNSW

### KEEP pure JS for (proven, working):
1. **Cosine similarity** — Same speed, proven correct
2. **EWC++** — swarmllm returns NaN, our JS version works
3. **LoRA forward/backward** — API dimensions match our callers
4. **MoE Router** — No swarmllm equivalent
5. **HNSW search** — swarmllm `findSimilar` broken, our HNSW works

### Files modified

#### Core integration (CJS import via `createRequire`):
1. **`cli/src/memory/intelligence.ts`** — `loadSwarmllmCoordinator()` lazily loads `SonaCoordinator`, eagerly loaded during `initializeIntelligence()`. Trajectories forwarded via `recordTrajectory()`. Background learning via `runBackgroundLearning()`. Stats expose `_swarmllmBackend` and `_swarmllmTrajectories`.
2. **`cli/src/memory/sona-optimizer.ts`** — `loadContrastiveTrainer()` lazily loads `ContrastiveTrainer`, eagerly loaded during `SONAOptimizer.initialize()`. Exposes `trainAgentEmbeddings()` and `_contrastiveTrainer` in stats.
3. **`cli/src/swarmvector/lora-adapter.ts`** — `loadTrainingPipeline()` lazily loads `TrainingPipeline`. `initBackend()` for eager loading. `saveCheckpoint()`/`loadCheckpoint()` with swarmllm primary + JSON fallback. Stats expose `_trainingBackend`.

#### CLI command wiring:
4. **`cli/src/commands/neural.ts` (status)** — Three new rows in status table: swarmllm Coordinator, Contrastive Trainer, Training Pipeline.
5. **`cli/src/commands/neural.ts` (train)** — Auto-saves LoRA checkpoint after training completes via `adapter.saveCheckpoint()`.
6. **`cli/src/commands/neural.ts` (optimize)** — Triggers `runBackgroundLearning()` during optimization pass.

#### MCP tool wiring:
7. **`cli/src/mcp-tools/hooks-tools.ts` (intelligence)** — Three new components in `hooks_intelligence` response: `swarmllmCoordinator`, `contrastiveTrainer`, `trainingPipeline`. Added to `implementationStatus.working`.
8. **`cli/src/mcp-tools/hooks-tools.ts` (intelligence stats)** — New `swarmllm` stats object with coordinator/contrastiveTrainer/trainingBackend status.
9. **`cli/src/mcp-tools/hooks-tools.ts` (trajectory-end)** — Calls `runBackgroundLearning()` after trajectory end for automatic learning.
10. **`cli/src/mcp-tools/swarmllm-tools.ts` (swarmllm_status)** — Returns both WASM and native CJS backend status: `{ wasm: {...}, native: {...} }`.

### Non-goals

- Not replacing cosine/EWC/LoRA forward (JS is equal or better)
- Not replacing graph layer (graph-node, gnn) — separate ADR
- Not modifying MCP tool interfaces (backward compatible)

## Consequences

### Positive
- Real trajectory-based SONA learning (not keyword heuristic)
- Contrastive training improves agent routing over time
- Checkpoint infrastructure for LoRA persistence across sessions
- Transparent `_backend` reporting for all components via CLI and MCP
- Background learning triggers automatically on trajectory-end
- All 3 backends report status in `neural status`, `hooks intelligence`, and `swarmllm_status`

### Negative
- Two code paths for pattern storage (swarmllm + JS)
- swarmllm API quirks require adapter wrappers
- Cross-module stats require async fetches in MCP tools

### Risks
- swarmllm `findSimilar` bug means we can't use it for search — mitigated by keeping JS HNSW
- swarmllm EWC `NaN` bug means we can't use it for consolidation — mitigated by keeping JS EWC++
- CJS-only package requires `createRequire` bridge — standard pattern in codebase

### Test Coverage
- `__tests__/swarmllm-integration.test.ts` — 11 tests covering all 3 backends, CJS import pattern, and graceful degradation
- `__tests__/swarmllm-tools.test.ts` — Updated status test for `{ wasm, native, graph }` response shape
- `__tests__/graph-backend.test.ts` — 9 tests for graph-node backend (ADR-087)
- Full suite: 32 files, 1762 tests passing

### Related ADRs
- **ADR-087** — `@swarmvector/graph-node` native graph database backend (companion integration)
- Other `@swarmvector` packages evaluated but not integrated: `@swarmvector/gnn` (NAPI broken), `@swarmvector/rvf` (backend missing)

## Implementation status (2026-05-09)

All integration points shipped in a single commit alongside ADR-087. A follow-on fix corrected untruthful Flash Attention and swarmllm coordinator stats.

| Component | Status | Files | Commit(s) |
|---|---|---|---|
| **SonaCoordinator** — lazy load + trajectory forwarding + background learning | Implemented | `v3/@swarmdo/cli/src/memory/intelligence.ts` | `7eb505d22 feat: native swarmllm + graph-node intelligence backends (ADR-086, ADR-087)` |
| **ContrastiveTrainer** — lazy load + `trainAgentEmbeddings()` | Implemented | `v3/@swarmdo/cli/src/memory/sona-optimizer.ts` | `7eb505d22` |
| **TrainingPipeline** — lazy load + `saveCheckpoint()`/`loadCheckpoint()` | Implemented | `v3/@swarmdo/cli/src/swarmvector/lora-adapter.ts` | `7eb505d22` |
| **CLI wiring** — `neural status` table rows; `neural train` checkpoint; `neural optimize` background learning | Implemented | `v3/@swarmdo/cli/src/commands/neural.ts` | `7eb505d22` |
| **MCP tool wiring** — `hooks_intelligence`, `hooks_intelligence stats`, `trajectory-end`, `swarmllm_status` | Implemented | `v3/@swarmdo/cli/src/mcp-tools/hooks-tools.ts`, `swarmllm-tools.ts` | `7eb505d22` |
| **Stats truthfulness fix** — Flash Attention + swarmllm coordinator stats corrected | Implemented | `v3/@swarmdo/cli/src/memory/intelligence.ts` | `a7122a50e fix(intelligence): make Flash Attention + swarmllm coordinator stats truthful (#1770)` |
| **Test suite** — 11 integration tests, 9 graph-backend tests, 32 files / 1762 tests passing | Implemented | `v3/@swarmdo/cli/__tests__/swarmllm-integration.test.ts`, `swarmllm-tools.test.ts`, `graph-backend.test.ts` | `7eb505d22` |

### Kept as pure JS (as decided)

cosine similarity, EWC++, LoRA forward/backward, MoE Router, HNSW search — swarmllm equivalents either broken (NaN, 0 always) or no speedup measured.
