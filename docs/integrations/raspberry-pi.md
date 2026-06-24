# Rufflo on Raspberry Pi / edge

Rufflo runs on a Raspberry Pi (and other ARM/edge boards). Nothing special to
install — the CLI is Node, the MCP server is stdio, and memory/search work
offline. This guide is the fast path plus the knobs that matter on constrained
hardware.

## 1. Check readiness

```bash
npx -y rufflo doctor -c edge
```

Reports your arch (arm64 is edge-native), RAM, CPU count, and whether an offline
LLM provider is configured. Guidance by RAM:

| Board (typical) | RAM | Verdict |
|-----------------|-----|---------|
| Pi 5 / Pi 4 (4–8GB) | ≥1GB | ✅ full Rufflo, local embedder |
| Pi 3 / Pi Zero 2 W | 0.5–1GB | ⚠️ use `--tools-profile lean` + `--skip-llm` |
| < 512MB | <0.5GB | ❌ MCP-only (memory/search), no local embedder |

## 2. Install + smoke test (no API key needed)

```bash
# Prove the four real subsystems work on-device — skips the LLM round-trip:
npx -y rufflo demo --skip-llm
```

This measures HNSW search + the Ed25519 + embedding backend locally. On a Pi 4
the HNSW + embedder run fine; on tighter boards the embedder falls back to the
hash path (still functional, lower quality) — `demo` reports which honestly.

## 3. Run the MCP server with the lean profile

The lean profile exposes ~60 focused tools instead of ~265 — less memory, faster
startup, and a sharper tool surface for whatever client you point at it:

```bash
npx -y rufflo mcp start --tools-profile lean
```

Point Claude Code, Cursor, or [GitHub Copilot](./github-copilot.md) at it — same
stdio server, one config shape.

## 4. Go fully offline (optional)

For agent **execution** without the cloud, run a local model via Ollama on the
Pi (or another box on your LAN) and route Rufflo to it:

```bash
export RUFFLO_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434   # or http://<lan-host>:11434
npx -y rufflo task dispatch                       # executes queued tasks locally
```

`rufflo doctor -c edge` then reports **offline-capable**. Memory, search, and
embeddings already work with no provider at all — only `agent_run` /
`task dispatch` need a model.

## 5. IoT / cognitive workloads

For sensor-driven or autonomous-loop workloads on the edge, see the
`@rufflo/plugin-iot-cognitum` plugin, which pairs the local memory + dispatch
loop with device I/O.

## Footprint tips

- `--tools-profile lean` is the single biggest win on constrained RAM.
- Keep `.rufflo/` on fast storage (USB SSD beats SD card for the HNSW index).
- The background `dispatch` daemon worker is **opt-in** — enable it only if you
  want continuous queue draining (it makes billable calls unless you're on
  Ollama). See `rufflo daemon`.
