---
name: vector-embed
description: Generate embeddings via npx swarmvector@0.2.25 embed text (ONNX all-MiniLM-L6-v2, 384-dim), normalize, and store in HNSW index
argument-hint: "<text-or-file>"
allowed-tools: Bash Read mcp__swarmdo__memory_store mcp__swarmdo__memory_search
---

# Vector Embed

Generate and store vector embeddings using the `swarmvector` npm package.

## When to use

Use this skill to embed text, code, or documents into 384-dimensional vectors for semantic search, similarity comparison, or clustering. swarmvector uses ONNX all-MiniLM-L6-v2 with HNSW indexing (52,000+ inserts/sec, ~0.045ms search).

## Steps

1. **Ensure swarmvector@0.2.25 is available**:
   ```bash
   npm ls swarmvector 2>/dev/null | grep '0.2.25' || npm install swarmvector@0.2.25
   ```
   If `embed text` later reports `ONNX WASM files not bundled`, also run:
   ```bash
   npm install swarmvector-onnx-embeddings-wasm
   ```
2. **Embed the input** (use the `text` subcommand, with text as a positional arg):
   - Single string: `npx -y swarmvector@0.2.25 embed text "your text here"`
   - With output file: `npx -y swarmvector@0.2.25 embed text "your text here" -o vec.json`
   - For a file: read its content via the Read tool, then pass it as the positional argument.
   - For batch: loop over files in shell — swarmvector@0.2.25 has no built-in `--batch`/`--glob` flags.
3. **Adaptive (LoRA) variant**: `npx -y swarmvector@0.2.25 embed text "..." --adaptive --domain code`
4. **Confirm** — report vector dimension (384), norm, and any output path written.
5. **Store metadata** in AgentDB if needed:
   `mcp__swarmdo__memory_store({ key: "embed-SOURCE", value: "VECTOR_METADATA", namespace: "vector-patterns" })`

## MCP alternative

Register the MCP server once with the pinned version:
```bash
claude mcp add swarmvector -- npx -y swarmvector@0.2.25 mcp start
```
Then call MCP tools directly: `hooks_rag_context` (semantic context), `brain_search` (collective brain), `hooks_ast_analyze`, `hooks_route`.

## Caveats

- The `embed --batch --glob` and `embed --file` flags do **not** exist in swarmvector@0.2.25; only `embed text <text>` is supported. Read files yourself and call `embed text` per file.
- ONNX runtime is not bundled by default. If embedding fails, install `swarmvector-onnx-embeddings-wasm` or run `npx -y swarmvector@0.2.25 doctor` to diagnose.
