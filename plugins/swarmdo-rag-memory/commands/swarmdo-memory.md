---
name: swarmdo-memory
description: SOTA memory CRUD — store, search (hybrid/graph-rag/dense), retrieve, list, consolidate
---
$ARGUMENTS

Memory operations with HNSW-indexed vector search (~1.9x-4.7x measured faster).

Parse $ARGUMENTS to determine the operation:

**store** `--key KEY --value VALUE [--namespace NS]`:
`npx @swarmdo/cli@latest memory store --key "KEY" --value "VALUE" --namespace NAMESPACE`

**search** `--query QUERY [--namespace NS] [--limit N] [--hybrid] [--graph-rag]`:
- Default (dense): `npx @swarmdo/cli@latest memory search --query "QUERY" --namespace NAMESPACE --limit 5`
- Hybrid (sparse+dense): `npx swarmvector search "QUERY" --hybrid --limit 5`
- Graph RAG (multi-hop): `npx swarmvector search "QUERY" --graph-rag --limit 5`

**retrieve** `--key KEY [--namespace NS]`:
`npx @swarmdo/cli@latest memory retrieve --key "KEY" --namespace NAMESPACE`

**list** `[--namespace NS] [--limit N]`:
`npx @swarmdo/cli@latest memory list --namespace NAMESPACE --limit 10`

**delete** `--key KEY [--namespace NS]`:
`npx @swarmdo/cli@latest memory delete --key "KEY" --namespace NAMESPACE`

**consolidate** `[--namespace NS]`:
Deduplicate entries with cosine > 0.92, prune stale (>30 days untouched, zero retrieval hits), rebuild HNSW index.
`npx @swarmdo/cli@latest hooks worker dispatch --trigger consolidate`

**bridge** `[--all-projects]`:
Import Claude Code auto-memory into AgentDB.
See `/memory-bridge` skill for details.

Default namespace is "default". Common namespaces: `patterns`, `tasks`, `solutions`, `feedback`, `security`, `claude-memories`.

If no arguments, run `memory list`.
