# swarmdo-core

Foundation plugin. Registers the `swarmdo` MCP server (300+ tools), provides three generalist agents (`coder`, `researcher`, `reviewer`), three first-run helpers (`init-project`, `swarmdo-doctor`, `discover-plugins`), and a curated catalog covering all 30+ sibling plugins.

## Install

```
/plugin marketplace add upstream/swarmdo
/plugin install swarmdo-core@swarmdo
```

## What's Included

- **MCP Server**: 300+ tools via `@swarmdo/cli` (memory, agentdb, embeddings, hooks, neural, autopilot, browser, aidefence, agent, swarm, system, terminal, github, daa, coordination, performance, workflow, …)
- **CLI Commands**: 26 commands with 140+ subcommands for agent orchestration
- **`swarmdo` on PATH**: while this plugin is enabled, Claude Code adds `bin/swarmdo` to the Bash tool's `PATH`, so agents can run `swarmdo memory search …` directly. The shim execs a locally/globally installed `swarmdo` when present (skipping the npx cold-start tax), else falls back to `npx --prefer-offline swarmdo@latest`. It excludes itself from resolution to avoid recursion, and passes args, stdin, and exit codes straight through.
- **3-Tier Model Routing**: Agent Booster (WASM), Haiku, Sonnet/Opus with automatic cost optimization
- **Session Management**: Persistent sessions with cross-conversation learning
- **Hooks**: PreToolUse / PostToolUse / PreCompact / Stop wired to swarmdo's auto-routing + learning loop. Defined at `plugins/swarmdo-core/hooks/hooks.json` so the per-plugin loader picks them up on `/plugin install swarmdo-core@swarmdo` (per-plugin layout — fixes #1748 Issue 1; the marketplace-root copy at `.claude-plugin/hooks/hooks.json` is preserved for `claude --plugin-dir <repo-root>` users).

## Configuration

The MCP server starts automatically when this plugin is active. Override environment variables in `.mcp.json` as needed.

## Compatibility

- **CLI:** pinned to `@swarmdo/cli` v3.6 major+minor. The `.mcp.json` invocation uses `@latest` for dynamic resolution; the smoke contract verifies the resolved CLI matches the v3.6 line.
- **Verification:** `bash plugins/swarmdo-core/scripts/smoke.sh` is the contract.

## MCP server contract

The registered `swarmdo` MCP server exposes 300+ tools across these families. Runtime truth is `mcp tool call mcp_status`:

| Family | Notable tools | Plugin documenting it |
|--------|---------------|-----------------------|
| `memory_*` | `memory_store`, `_search`, `_search_unified`, `_import_claude`, `_bridge_status` | `swarmdo-rag-memory` |
| `agentdb_*` | 15 tools for hierarchical / pattern / causal storage | `swarmdo-agentdb` |
| `embeddings_*` | 10 tools incl. RaBitQ 32× quantization | `swarmdo-agentdb`, `swarmdo-swarmvector` |
| `hooks_*` (incl. `hooks_intelligence_*`) | 19+ tools — routing, learning, transfer, metrics, explain | `swarmdo-intelligence`, `swarmdo-autopilot` |
| `aidefence_*` | 6 tools — PII / prompt-injection / sanitization | `swarmdo-aidefence` |
| `neural_*` | 6 tools — train, predict, patterns, compress | `swarmdo-intelligence` |
| `autopilot_*` | 10 tools — autonomous loops + learning | `swarmdo-autopilot` |
| `browser_*` (+ new `browser_session_*`) | 23 + 5 = 28 tools — Playwright + RVF lifecycle | `swarmdo-browser` |
| `swarmllm_sona_*` / `swarmllm_microlora_*` | 4 tools — adaptive learning | `swarmdo-intelligence`, `swarmdo-swarmllm` |
| `agent_*`, `swarm_*` | spawn, list, status, orchestrate | `swarmdo-swarm` |
| `system_*`, `terminal_*` | system + terminal session ops | this plugin |

For every other plugin's tool surface, see its `docs/adrs/0001-*.md`.

## Sibling contracts

This foundation plugin defers to seven sibling ADRs that own specific cross-cutting contracts. New plugins (and consumers of `swarmdo-core`) should reference these instead of re-deriving:

| Contract | Owner |
|----------|-------|
| **Pinning + smoke as contract** (general pattern) | [swarmdo-swarmvector ADR-0001](../swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md) |
| **Namespace convention** (`<plugin-stem>-<intent>`, reserved namespaces) | [swarmdo-agentdb ADR-0001](../swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md) |
| **Session-as-skill architecture** (RVF + trajectory + 3 AIDefence gates) | [swarmdo-browser ADR-0001](../swarmdo-browser/docs/adrs/0001-browser-skills-architecture.md) |
| **4-step intelligence pipeline** (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE) | [swarmdo-intelligence ADR-0001](../swarmdo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) |
| **3-gate AIDefence pattern** (PII pre-storage, sanitization, prompt-injection) | [swarmdo-aidefence ADR-0001](../swarmdo-aidefence/docs/adrs/0001-aidefence-contract.md) |
| **270s cache-aware /loop heartbeat** | [swarmdo-autopilot ADR-0001](../swarmdo-autopilot/docs/adrs/0001-autopilot-contract.md) |
| **ADR plugin contract** (token-optimization via REFERENCE.md) | [swarmdo-adr ADR-0001](../swarmdo-adr/docs/adrs/0001-adr-plugin-pattern.md) |

## Verification

```bash
bash plugins/swarmdo-core/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — swarmdo-core plugin contract (foundation, MCP server, plugin catalog, smoke as contract)](./docs/adrs/0001-core-contract.md)
