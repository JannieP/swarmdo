# ADR-087: Wire @swarmvector/graph-node as Native Graph Backend

**Status**: Accepted — Implemented (`graph-backend.ts` wrapper wired into agent spawn, causal edges, swarm topology, and MCP/CLI status)
**Date**: 2026-04-07 · **Updated**: 2026-05-09

## Context

The codebase has `@swarmvector/graph-node@2.0.3` installed (native Rust bindings, 10x faster than WASM) but 0 references in source code. Meanwhile, causal edges and agent relationships are stored only in the AgentDB bridge with no graph-native operations like k-hop neighbor queries or hyperedge support.

### Available @swarmvector packages evaluated

| Package | Status | Result |
|---|---|---|
| `@swarmvector/graph-node` | **Works** | createNode, createEdge, createHyperedge, kHopNeighbors, stats — all functional |
| `@swarmvector/gnn` | **Broken** | All NAPI functions fail with type conversion errors |
| `@swarmvector/rvf` | **Broken** | Backend resolution fails, no native bindings found |

### graph-node API requirements (discovered via testing)

- `createNode({ id, type, embedding })` — embedding required (Float32Array)
- `createEdge({ from, to, label, description, embedding, properties })` — all fields required
- `createHyperedge({ nodes[], label, description, embedding, properties })` — all fields required
- `kHopNeighbors(nodeId, k)` — returns string[] of neighbor node IDs
- `stats()` — returns `{ totalNodes, totalEdges, avgDegree }`
- `GraphDatabase(path?)` — optional path for persistence
- All methods are async (return Promises)

## Decision

Wire `@swarmvector/graph-node` as the native graph backend for agent relationships, causal edges, task dependencies, and swarm topology.

### New module: `src/swarmvector/graph-backend.ts`

Provides a clean wrapper over the raw graph-node API:
- `isGraphBackendAvailable()` — check if native backend loaded
- `addNode(data)` — add agent/task/pattern node
- `addEdge(data)` — add relationship edge
- `addHyperedge(nodeIds, label)` — create multi-node relationship
- `getNeighbors(nodeId, hops)` — k-hop neighbor query
- `getGraphStats()` — node/edge/degree statistics
- `recordCausalEdge(src, tgt, relation)` — causal edge recording
- `recordCollaboration(agentId, agentType, taskId)` — agent-task assignment
- `recordSwarmTeam(agentIds, topology)` — swarm team hyperedge

Auto-generates minimal embeddings (8-dim hash) for graph structure operations.

### Files modified

1. **`src/swarmvector/graph-backend.ts`** (new) — Native graph database wrapper
2. **`src/mcp-tools/agentdb-tools.ts`** — `agentdb_causal-edge` tries graph-node first, falls back to bridge
3. **`src/mcp-tools/agent-tools.ts`** — `agent_spawn` records agent node in graph
4. **`src/mcp-tools/hooks-tools.ts`** — `hooks_intelligence` adds `graphDatabase` component status
5. **`src/mcp-tools/hooks-tools.ts`** — `hooks_intelligence_stats` adds graph stats to swarmllm section
6. **`src/mcp-tools/hooks-tools.ts`** — `implementationStatus.working` includes `graph-database`
7. **`src/mcp-tools/swarmllm-tools.ts`** — `swarmllm_status` includes graph backend status
8. **`src/commands/neural.ts`** — `neural status` shows Graph Database row in status table

### Non-goals
- Not replacing AgentDB bridge (graph-node supplements it)
- Not integrating @swarmvector/gnn (NAPI broken) or @swarmvector/rvf (backend missing)
- Not adding Cypher query interface (graph-node querySync untested)

## Consequences

### Positive
- Native Rust graph operations (10x faster than WASM)
- k-hop neighbor queries for agent relationship discovery
- Hyperedge support for swarm team representation
- Causal edges stored in both graph-node and AgentDB for redundancy
- Agent spawn automatically builds relationship graph
- Graph stats visible in `neural status`, `hooks_intelligence`, `swarmllm_status`

### Negative
- Minimal 8-dim hash embeddings are not semantic (sufficient for graph structure)
- Persistence path (`/tmp/rv-graph-persist.db`) reports null (graph-node quirk), but data persists

### Risks
- graph-node requires `embedding` on all operations — mitigated by auto-generated mini-embeddings
- graph-node persistence path returns null — mitigated by in-memory fallback
- CJS-only package — mitigated by `createRequire` bridge pattern

### Test Coverage
- `__tests__/graph-backend.test.ts` — 9 tests covering exports, graceful degradation, CJS pattern
- Full suite: 32 files, 1762 tests passing

## Implementation status (2026-05-09)

All 8 files listed in the Decision shipped in a single commit (same as ADR-086).

| Component | Status | Files | Commit(s) |
|---|---|---|---|
| **`graph-backend.ts`** — native graph wrapper (`addNode`, `addEdge`, `addHyperedge`, `getNeighbors`, `recordCausalEdge`, `recordCollaboration`, `recordSwarmTeam`) | Implemented | `v3/@swarmdo/cli/src/swarmvector/graph-backend.ts` (new) | `7eb505d22 feat: native swarmllm + graph-node intelligence backends (ADR-086, ADR-087)` |
| **`agentdb-tools.ts`** — `agentdb_causal-edge` graph-node first, AgentDB bridge fallback | Implemented | `v3/@swarmdo/cli/src/mcp-tools/agentdb-tools.ts` | `7eb505d22` |
| **`agent-tools.ts`** — `agent_spawn` records agent node in graph | Implemented | `v3/@swarmdo/cli/src/mcp-tools/agent-tools.ts` | `7eb505d22` |
| **`hooks-tools.ts`** — `hooks_intelligence` + `hooks_intelligence_stats` graph component + stats | Implemented | `v3/@swarmdo/cli/src/mcp-tools/hooks-tools.ts` | `7eb505d22` |
| **`swarmllm-tools.ts`** — `swarmllm_status` graph backend status | Implemented | `v3/@swarmdo/cli/src/mcp-tools/swarmllm-tools.ts` | `7eb505d22` |
| **`neural.ts`** — `neural status` Graph Database row | Implemented | `v3/@swarmdo/cli/src/commands/neural.ts` | `7eb505d22` |
| **Test coverage** — 9 tests, graceful degradation, CJS import pattern | Implemented | `v3/@swarmdo/cli/__tests__/graph-backend.test.ts` | `7eb505d22` |

### Non-goals confirmed

`@swarmvector/gnn` (NAPI broken) and `@swarmvector/rvf` (backend missing) were evaluated and rejected. Cypher query interface (`querySync`) not added (untested).
