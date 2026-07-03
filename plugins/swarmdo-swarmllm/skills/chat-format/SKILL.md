---
name: chat-format
description: Format prompts for different LLM providers with chat templates and HNSW-powered context retrieval
argument-hint: "<prompt> [--provider anthropic|openai|local]"
allowed-tools: mcp__swarmdo__swarmllm_chat_format mcp__swarmdo__swarmllm_hnsw_create mcp__swarmdo__swarmllm_hnsw_add mcp__swarmdo__swarmllm_hnsw_route mcp__swarmdo__swarmllm_status Bash
---

# Chat Format

Format prompts for multi-provider LLM inference with context retrieval.

## When to use

When preparing prompts for different LLM providers (Claude, GPT, Gemini, Ollama) or building RAG pipelines with HNSW-powered context retrieval.

## Steps

1. **Format chat** — call `mcp__swarmdo__swarmllm_chat_format` with messages and target provider
2. **Create HNSW index** — call `mcp__swarmdo__swarmllm_hnsw_create` for context retrieval
3. **Add documents** — call `mcp__swarmdo__swarmllm_hnsw_add` to index documents
4. **Route query** — call `mcp__swarmdo__swarmllm_hnsw_route` to find relevant context
5. **Check status** — call `mcp__swarmdo__swarmllm_status` for provider availability

## Supported providers

- Anthropic (Claude) — native format
- OpenAI (GPT) — chat completion format
- Google (Gemini) — generative AI format
- Ollama — local model format
- Cohere — generate/chat format
