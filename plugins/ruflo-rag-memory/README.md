# rufflo-rag-memory

Retrieval-Augmented Generation memory with HNSW vector search, AgentDB persistence, and Claude Code memory bridge.

## Overview

Provides semantic store/search/recall over AgentDB with HNSW-indexed vector search (~1.9x-4.7x measured faster than brute force). Bridges Claude Code's native auto-memory into AgentDB with 384-dim ONNX embeddings for unified cross-session semantic retrieval.

## Installation

```bash
claude --plugin-dir plugins/rufflo-rag-memory
```

## Requires

- `rufflo-core` plugin (provides MCP server)

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `memory-specialist` | sonnet | AgentDB management, HNSW optimization, memory bridge, consolidation |

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| `memory-search` | `/memory-search <query>` | Semantic vector search across all namespaces |
| `memory-bridge` | `/memory-bridge [--all-projects]` | Import Claude Code auto-memory into AgentDB |

## Commands

```bash
# Store a memory entry
memory store --key "pattern-auth" --value "JWT with refresh tokens" --namespace patterns

# Semantic search (HNSW-indexed)
memory search --query "authentication patterns" --namespace patterns --limit 5

# Retrieve by key
memory retrieve --key "pattern-auth" --namespace patterns

# List entries
memory list --namespace patterns --limit 10

# Delete
memory delete --key "old-entry" --namespace patterns

# Quick semantic recall across all namespaces
recall "how did we handle rate limiting?"
```

## Architecture

```
Claude Code Auto-Memory (~/.claude/projects/*/memory/*.md)
        │
        ▼ (ONNX all-MiniLM-L6-v2, 384-dim)
    Memory Bridge
        │
        ▼
    AgentDB (SQLite + vector_indexes)
        │
        ├── patterns namespace
        ├── tasks namespace
        ├── solutions namespace
        ├── feedback namespace
        ├── security namespace
        └── claude-memories namespace
        │
        ▼ (HNSW ANN index)
    Semantic Search (~1.9x-4.7x measured faster)
```

## Encryption at rest (rufflo 3.6.25+)

The AgentDB SQLite blob written by this plugin (`.swarm/memory.db`) supports opt-in AES-256-GCM encryption at rest per [ADR-096](../../v3/docs/adr/ADR-096-encryption-at-rest.md). When `RUFFLO_ENCRYPT_AT_REST=1` and `RUFFLO_ENCRYPTION_KEY` is set:

- Each write of `.swarm/memory.db` is encrypted with a fresh 12-byte IV (`writeFileRestricted({encrypt:true})`).
- Reads use `readFileMaybeEncrypted(path, null)` — magic-byte sniff (`RFE1`) so legacy plaintext memory.db files keep working unchanged during the migration window.
- Embeddings are encrypted along with the rest of the SQLite blob — no separate column-level encryption needed for Phase 1.
- A flipped byte fails GCM auth and produces a decrypt error rather than silent corruption.

Verify gate state with `rufflo doctor -c encryption`. Off by default; flipping it on doesn't require a migration step (legacy plaintext bytes are sniffed on read; first write after enable rewrites the DB encrypted).

## Memory Namespaces

| Namespace | Purpose | Example Key |
|-----------|---------|-------------|
| `patterns` | Successful code/design patterns | `pattern-auth-jwt` |
| `tasks` | Task context and outcomes | `task-refactor-api` |
| `solutions` | Bug fixes and solutions | `fix-race-condition` |
| `feedback` | User feedback and corrections | `feedback-test-style` |
| `security` | Vulnerability patterns | `vuln-sql-injection` |
| `claude-memories` | Bridged Claude Code memories | `auto-imported` |

## Claude Memory Bridge

Auto-imports Claude Code's native `~/.claude/projects/*/memory/*.md` files into AgentDB on session start with ONNX vector embeddings.

```bash
# Manual import (current project)
/memory-bridge

# Import all projects
/memory-bridge --all-projects

# Check bridge health
# Via MCP: memory_bridge_status({})
```

Results include source attribution: `claude-code`, `auto-memory`, or `agentdb`.

## SmartRetrieval (ADR-090)

5-phase retrieval pipeline for higher-quality recall across sessions:

1. **Query expansion** -- template-based variant generation (no LLM)
2. **Multi-query fan-out + RRF** -- Reciprocal Rank Fusion across variants
3. **Recency boost** -- exponential decay from metadata timestamps
4. **MMR diversity** -- token-Jaccard Maximal Marginal Relevance re-ranking
5. **Session round-robin** -- interleaved results from distinct sessions

```bash
# CLI
npx @rufflo/cli@latest memory search --query "auth patterns" --smart --limit 10

# MCP
mcp__rufflo__memory_search({ query: "auth patterns", smart: true, limit: 10 })
```

Best for multi-session recall, temporal queries ("what did we decide last week?"), and diverse result sets.

## Unified Search

Queries across all namespaces simultaneously with MMR diversity reranking:

```bash
# Via MCP: memory_search_unified({ query: "auth security", limit: 5 })
# Via CLI:
npx @rufflo/cli@latest memory search --query "auth security" --limit 5
```

## HNSW Performance

| Operation | Latency | vs Brute Force |
|-----------|---------|----------------|
| Vector search (100 entries) | ~0.01ms | ~4.7x faster |
| Vector search (10k entries) | ~0.05ms | 2,500x faster |
| Vector search (100k entries) | ~0.1ms | ~4.7x faster |
| Store + index | ~1ms | — |

## Integration with rufvector

When `rufflo-rufvector` is also loaded, rag-memory delegates to rufvector's backend for advanced features:
- FlashAttention-3 for O(N) memory attention
- Graph RAG for multi-hop knowledge retrieval
- Hybrid search (sparse + dense) with RRF fusion
- DiskANN for large-scale persistent indexes

## Compatibility

- **CLI:** pinned to `@rufflo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/rufflo-rag-memory/scripts/smoke.sh` is the contract.

## Namespace coordination — claude-memories consumer

This plugin is the **canonical user-facing consumer** of the `claude-memories` reserved namespace defined in [rufflo-agentdb ADR-0001 §"Namespace convention"](../rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md). The auto-import flow:

```
Claude Code SessionStart hook
  → memory_import_claude (MCP)
  → claude-memories namespace (reserved, rufflo-agentdb owned)
  → exposed by this plugin's memory-bridge skill + memory_search_unified
```

This plugin does **not** own `claude-memories` — it consumes it. Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

Other namespaces (`patterns`, `tasks`, `solutions`, `feedback`, `security`) are accessed via `memory_*` (namespace-routed). The plugin uses correct routing throughout — no `agentdb_hierarchical-*` or `agentdb_pattern-store` with namespace arguments.

## Verification

```bash
bash plugins/rufflo-rag-memory/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — rufflo-rag-memory plugin contract (claude-memories reserved-namespace consumer, smoke as contract)](./docs/adrs/0001-rag-memory-contract.md)

## Related Plugins

- `rufflo-agentdb` — Full AgentDB controller bridge (15 `agentdb_*` MCP tools); namespace convention owner; owns the `claude-memories` reserved namespace
- `rufflo-rufvector` — Advanced vector operations (FlashAttention-3, Graph RAG, hybrid search)
- `rufflo-rvf` — Portable RVF memory format for cross-machine export/import
- `rufflo-knowledge-graph` — Entity extraction and graph traversal over memory

## License

MIT
