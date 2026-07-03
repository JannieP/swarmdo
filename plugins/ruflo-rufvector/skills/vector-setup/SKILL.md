---
name: vector-setup
description: First-run setup for rufvector@0.2.25 — installs ONNX/Brain/SONA add-ons, registers the MCP server, and verifies the install via `doctor`
argument-hint: "[--full]"
allowed-tools: Bash Read
---

# Vector Setup

Bootstraps `rufvector@0.2.25` and its optional add-ons so every `/vector` subcommand actually works on first run.

## Why this exists

Out of the box, several `/vector` subcommands fail with a confusing dep error:

| Error | Missing package |
|-------|-----------------|
| `ONNX WASM files not bundled. The onnx/ directory is missing.` | `rufvector-onnx-embeddings-wasm` |
| `Brain commands require @rufvector/pi-brain` | `@rufvector/pi-brain` |
| `SONA not available. Native error: Cannot find module '/.../@rufvector/sona/index.js'` | `@rufvector/rufllm` (JS fallback) |
| `LLM commands require @rufvector/rufllm` | `@rufvector/rufllm` |

This skill installs them in one pass.

## Steps

1. **Pin rufvector**:
   ```bash
   npm install rufvector@0.2.25
   ```
2. **Install the add-ons** (idempotent — only what's missing):
   ```bash
   npm install rufvector-onnx-embeddings-wasm \
               @rufvector/pi-brain \
               @rufvector/rufllm
   ```
   For a leaner install, pass `--full` to also pull `@rufvector/graph-node` and `@rufvector/router`:
   ```bash
   npm install rufvector-onnx-embeddings-wasm \
               @rufvector/pi-brain \
               @rufvector/rufllm \
               @rufvector/graph-node \
               @rufvector/router
   ```
3. **Verify the binary**:
   ```bash
   npx -y rufvector@0.2.25 doctor
   npx -y rufvector@0.2.25 info
   ```
4. **Register the MCP server**:
   ```bash
   claude mcp add rufvector -- npx -y rufvector@0.2.25 mcp start
   claude mcp list | grep rufvector
   ```
5. **Sanity check** the most common subcommands:
   ```bash
   npx -y rufvector@0.2.25 hooks route "test"
   npx -y rufvector@0.2.25 attention list
   npx -y rufvector@0.2.25 rvf examples
   ```
6. **(Optional) Generate a pi identity** for brain + edge:
   ```bash
   npx -y rufvector@0.2.25 identity generate
   npx -y rufvector@0.2.25 identity show
   ```

## Smoke test

For a deterministic verification of the install, run the plugin's bundled smoke script:
```bash
bash plugins/rufflo-rufvector/scripts/smoke.sh
```

It checks: version pin, top-level subcommand visibility, `hooks ast-analyze`, `hooks route`, `attention list`, `rvf examples`, and `info`. Exits non-zero if any drift from the contracted surface is detected.

## What this does not install

- Native Rust toolchain (optional; only needed for source builds)
- Platform-specific native bindings (auto-detected by `@rufvector/core`)
- `@rufvector/sona` native binding (the JS fallback via `@rufvector/rufllm` is sufficient on macOS arm64; Linux x64 has its own native binding)

If `doctor` still reports a problem after this skill runs, paste its output verbatim and ask.
