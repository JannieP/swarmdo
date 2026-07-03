---
name: vector-setup
description: First-run setup for swarmvector@0.2.25 — installs ONNX/Brain/SONA add-ons, registers the MCP server, and verifies the install via `doctor`
argument-hint: "[--full]"
allowed-tools: Bash Read
---

# Vector Setup

Bootstraps `swarmvector@0.2.25` and its optional add-ons so every `/vector` subcommand actually works on first run.

## Why this exists

Out of the box, several `/vector` subcommands fail with a confusing dep error:

| Error | Missing package |
|-------|-----------------|
| `ONNX WASM files not bundled. The onnx/ directory is missing.` | `swarmvector-onnx-embeddings-wasm` |
| `Brain commands require @swarmvector/pi-brain` | `@swarmvector/pi-brain` |
| `SONA not available. Native error: Cannot find module '/.../@swarmvector/sona/index.js'` | `@swarmvector/swarmllm` (JS fallback) |
| `LLM commands require @swarmvector/swarmllm` | `@swarmvector/swarmllm` |

This skill installs them in one pass.

## Steps

1. **Pin swarmvector**:
   ```bash
   npm install swarmvector@0.2.25
   ```
2. **Install the add-ons** (idempotent — only what's missing):
   ```bash
   npm install swarmvector-onnx-embeddings-wasm \
               @swarmvector/pi-brain \
               @swarmvector/swarmllm
   ```
   For a leaner install, pass `--full` to also pull `@swarmvector/graph-node` and `@swarmvector/router`:
   ```bash
   npm install swarmvector-onnx-embeddings-wasm \
               @swarmvector/pi-brain \
               @swarmvector/swarmllm \
               @swarmvector/graph-node \
               @swarmvector/router
   ```
3. **Verify the binary**:
   ```bash
   npx -y swarmvector@0.2.25 doctor
   npx -y swarmvector@0.2.25 info
   ```
4. **Register the MCP server**:
   ```bash
   claude mcp add swarmvector -- npx -y swarmvector@0.2.25 mcp start
   claude mcp list | grep swarmvector
   ```
5. **Sanity check** the most common subcommands:
   ```bash
   npx -y swarmvector@0.2.25 hooks route "test"
   npx -y swarmvector@0.2.25 attention list
   npx -y swarmvector@0.2.25 rvf examples
   ```
6. **(Optional) Generate a pi identity** for brain + edge:
   ```bash
   npx -y swarmvector@0.2.25 identity generate
   npx -y swarmvector@0.2.25 identity show
   ```

## Smoke test

For a deterministic verification of the install, run the plugin's bundled smoke script:
```bash
bash plugins/swarmdo-swarmvector/scripts/smoke.sh
```

It checks: version pin, top-level subcommand visibility, `hooks ast-analyze`, `hooks route`, `attention list`, `rvf examples`, and `info`. Exits non-zero if any drift from the contracted surface is detected.

## What this does not install

- Native Rust toolchain (optional; only needed for source builds)
- Platform-specific native bindings (auto-detected by `@swarmvector/core`)
- `@swarmvector/sona` native binding (the JS fallback via `@swarmvector/swarmllm` is sufficient on macOS arm64; Linux x64 has its own native binding)

If `doctor` still reports a problem after this skill runs, paste its output verbatim and ask.
