# rufflo-rufllm

RufLLM local inference with chat formatting, model configuration, MicroLoRA fine-tuning, and SONA real-time adaptation.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install rufflo-rufllm@rufflo
```

## Features

- **Model configuration**: Generate optimal configs for local inference
- **MicroLoRA**: Task-specific fine-tuning with lightweight adapters
- **SONA adaptation**: Real-time neural adaptation (<0.05ms)
- **Chat formatting**: Multi-provider prompt formatting (Claude, GPT, Gemini, Ollama, Cohere)
- **HNSW routing**: Context retrieval for RAG pipelines (≤11 hot patterns; for large-corpus search see `rufflo-agentdb` `embeddings_search`)

## Commands

- `/rufllm` -- Model status, adapters, and provider availability

## Skills

- `llm-config` -- Configure models, MicroLoRA, and SONA
- `chat-format` -- Format prompts for different LLM providers

## Compatibility

- **CLI:** pinned to `@rufflo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/rufflo-rufllm/scripts/smoke.sh` is the contract.

## Cross-plugin tool ownership

This plugin shares the `rufllm_*` MCP family with two sibling plugins. Each tool group has a canonical owner; this plugin is the entry point for LLM-config + chat formatting:

| Tool group | Canonical owner | This plugin's role |
|-----------|-----------------|-------------------|
| `rufllm_sona_create`, `rufllm_sona_adapt` | [rufflo-intelligence ADR-0001](../rufflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (4-step pipeline DISTILL phase) | Surfaces SONA in `llm-config` skill |
| `rufllm_microlora_create`, `rufllm_microlora_adapt` | [rufflo-intelligence ADR-0001](../rufflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (DISTILL + CONSOLIDATE phases via `--consolidate` flag) | Surfaces MicroLoRA in `llm-config` skill |
| `rufllm_hnsw_create`, `rufllm_hnsw_add`, `rufllm_hnsw_route` | [rufflo-agentdb ADR-0001](../rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md) (WASM router, ≤11 patterns — distinct from large-corpus `embeddings_search`) | References from `chat-format` for context routing |

Source: `v3/@rufflo/cli/src/mcp-tools/rufllm-tools.ts:142, 169, 192, 222` (SONA + MicroLoRA) and `:57-58` (HNSW WASM router with `~11 patterns` cap).

## Namespace coordination

This plugin owns the `rufllm-config` AgentDB namespace (kebab-case, follows the convention from [rufflo-agentdb ADR-0001 §"Namespace convention"](../rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`rufllm-config` stores model configurations, adapter manifests, and chat-format templates. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/rufflo-rufllm/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — rufflo-rufllm plugin contract (cross-plugin tool ownership table, namespace coordination, smoke as contract)](./docs/adrs/0001-rufllm-contract.md)

## Related Plugins

- `rufflo-intelligence` — owns SONA + MicroLoRA in the 4-step pipeline
- `rufflo-agentdb` — owns HNSW WASM router; namespace convention owner
- `rufflo-rufvector` — sibling substrate plugin (pinned `rufvector@0.2.25`)
- `rufflo-rag-memory` — consumes RAG context routing
