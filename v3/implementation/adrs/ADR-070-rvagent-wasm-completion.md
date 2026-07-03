# ADR-070: Complete @swarmvector/rvagent-wasm & swarmllm-wasm Integration

**Status**: Implemented
**Date**: 2026-03-25
**Author**: the upstream author
**Supersedes**: Gaps identified in ADR-059

## Context

ADR-059 defined the integration plan for `@swarmvector/rvagent-wasm` and
`@swarmvector/swarmllm-wasm`. An audit on 2026-03-25 found that the code was fully
implemented but the wiring was incomplete:

| Item | ADR-059 Status | Actual State |
|------|---------------|--------------|
| `src/swarmvector/agent-wasm.ts` | Planned | Implemented (387 lines) |
| `src/mcp-tools/wasm-agent-tools.ts` | Planned | Implemented (10 MCP tools) |
| `src/swarmvector/swarmllm-wasm.ts` | Pending | Implemented (full module) |
| `src/mcp-tools/swarmllm-tools.ts` | Pending | Implemented (MCP tools) |
| `src/swarmvector/index.ts` re-exports | Pending | Implemented (both modules) |
| `src/mcp-tools/index.ts` re-exports | Pending | Implemented (both tool sets) |
| `src/types/optional-modules.d.ts` | Planned | Implemented (ambient types) |
| `package.json` optional deps | Required | **Missing** — neither package listed |

The sole gap was that `@swarmvector/rvagent-wasm` and `@swarmvector/swarmllm-wasm` were
not declared in `package.json` `optionalDependencies`, meaning:

1. `npm install` would never fetch them
2. Runtime `import()` calls would always hit the graceful-degradation path
3. Users could not enable WASM agents without manually installing the packages

## Decision

Add both packages to `optionalDependencies` in `v3/@swarmdo/cli/package.json`:

```json
{
  "optionalDependencies": {
    "@swarmvector/rvagent-wasm": "^0.1.0",
    "@swarmvector/swarmllm-wasm": "^2.0.2"
  }
}
```

No code changes required — all integration modules, MCP tools, type
declarations, and re-exports were already in place.

## Implementation Summary

### rvagent-wasm (10 MCP Tools)

| Tool | File | Status |
|------|------|--------|
| `wasm_agent_create` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_prompt` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_tool` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_list` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_terminate` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_files` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_export` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_list` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_search` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_create` | `wasm-agent-tools.ts` | Working |

### swarmllm-wasm MCP Tools

| Tool | File | Status |
|------|------|--------|
| `swarmllm_status` | `swarmllm-tools.ts` | Working |
| `swarmllm_hnsw_create` | `swarmllm-tools.ts` | Working |
| `swarmllm_sona_create` | `swarmllm-tools.ts` | Working |
| `swarmllm_microlora_create` | `swarmllm-tools.ts` | Working |
| `swarmllm_chat_format` | `swarmllm-tools.ts` | Working |
| `swarmllm_kvcache_create` | `swarmllm-tools.ts` | Working |

### Integration Modules

| Module | Lines | Exports |
|--------|-------|---------|
| `src/swarmvector/agent-wasm.ts` | 387 | 20+ functions (lifecycle, gallery, RVF, MCP bridge) |
| `src/swarmvector/swarmllm-wasm.ts` | ~350 | 12+ functions (HNSW, SONA, MicroLoRA, chat, KV, arena) |
| `src/swarmvector/index.ts` | 245 | Re-exports all public API from both modules |

## Consequences

### Positive
- `npm install` now fetches WASM packages when available for the platform
- All 16 MCP tools become functional without manual package installation
- Consistent with existing `@swarmvector/*` optional dependency pattern
- No breaking changes — graceful degradation still works when packages unavailable

### Negative
- Additional ~820 kB unpacked size in optional deps (620 kB + 200 kB)
- Both packages still have known upstream issues (see ADR-059 § Known Issues)

### Neutral
- ADR-059 can now be considered fully implemented
- No new code was needed — only the dependency declaration was missing
