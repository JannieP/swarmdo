# swarmdo-swarmllm

SwarmLLM local inference with chat formatting, model configuration, MicroLoRA fine-tuning, and SONA real-time adaptation.

## Install

```
/plugin marketplace add ruvnet/swarmdo
/plugin install swarmdo-swarmllm@swarmdo
```

## Features

- **Model configuration**: Generate optimal configs for local inference
- **MicroLoRA**: Task-specific fine-tuning with lightweight adapters
- **SONA adaptation**: Real-time neural adaptation (<0.05ms)
- **Chat formatting**: Multi-provider prompt formatting (Claude, GPT, Gemini, Ollama, Cohere)
- **HNSW routing**: Context retrieval for RAG pipelines (≤11 hot patterns; for large-corpus search see `swarmdo-agentdb` `embeddings_search`)

## Commands

- `/swarmllm` -- Model status, adapters, and provider availability

## Skills

- `llm-config` -- Configure models, MicroLoRA, and SONA
- `chat-format` -- Format prompts for different LLM providers

## Compatibility

- **CLI:** pinned to `@swarmdo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/swarmdo-swarmllm/scripts/smoke.sh` is the contract.

## Cross-plugin tool ownership

This plugin shares the `swarmllm_*` MCP family with two sibling plugins. Each tool group has a canonical owner; this plugin is the entry point for LLM-config + chat formatting:

| Tool group | Canonical owner | This plugin's role |
|-----------|-----------------|-------------------|
| `swarmllm_sona_create`, `swarmllm_sona_adapt` | [swarmdo-intelligence ADR-0001](../swarmdo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (4-step pipeline DISTILL phase) | Surfaces SONA in `llm-config` skill |
| `swarmllm_microlora_create`, `swarmllm_microlora_adapt` | [swarmdo-intelligence ADR-0001](../swarmdo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (DISTILL + CONSOLIDATE phases via `--consolidate` flag) | Surfaces MicroLoRA in `llm-config` skill |
| `swarmllm_hnsw_create`, `swarmllm_hnsw_add`, `swarmllm_hnsw_route` | [swarmdo-agentdb ADR-0001](../swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md) (WASM router, ≤11 patterns — distinct from large-corpus `embeddings_search`) | References from `chat-format` for context routing |

Source: `v3/@swarmdo/cli/src/mcp-tools/swarmllm-tools.ts:142, 169, 192, 222` (SONA + MicroLoRA) and `:57-58` (HNSW WASM router with `~11 patterns` cap).

## Namespace coordination

This plugin owns the `swarmllm-config` AgentDB namespace (kebab-case, follows the convention from [swarmdo-agentdb ADR-0001 §"Namespace convention"](../swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`swarmllm-config` stores model configurations, adapter manifests, and chat-format templates. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/swarmdo-swarmllm/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — swarmdo-swarmllm plugin contract (cross-plugin tool ownership table, namespace coordination, smoke as contract)](./docs/adrs/0001-swarmllm-contract.md)

## Related Plugins

- `swarmdo-intelligence` — owns SONA + MicroLoRA in the 4-step pipeline
- `swarmdo-agentdb` — owns HNSW WASM router; namespace convention owner
- `swarmdo-swarmvector` — sibling substrate plugin (pinned `swarmvector@0.2.25`)
- `swarmdo-rag-memory` — consumes RAG context routing
