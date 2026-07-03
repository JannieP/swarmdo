# Swarmdo Plugins

32 Claude Code plugins for agent-powered development workflows. Load with `--plugin-dir`.

## Quick Start

```bash
# Load specific plugins
claude --plugin-dir plugins/swarmdo-core --plugin-dir plugins/swarmdo-swarm

# Load all plugins
claude $(ls -d plugins/swarmdo-*/ | sed 's|^|--plugin-dir |' | tr '\n' ' ')
```

## Plugin Catalog

### Core & Coordination

| Plugin | Description |
|--------|-------------|
| [swarmdo-core](swarmdo-core/) | MCP server, status, doctor, coder/researcher/reviewer agents |
| [swarmdo-swarm](swarmdo-swarm/) | Swarm topologies (hierarchical, mesh), Monitor streaming |
| [swarmdo-autopilot](swarmdo-autopilot/) | Autonomous /loop task completion with prediction |
| [swarmdo-loop-workers](swarmdo-loop-workers/) | 12 background workers via /loop or CronCreate |
| [swarmdo-workflows](swarmdo-workflows/) | Workflow templates, parallel execution, branching |

### Memory & Intelligence

| Plugin | Description |
|--------|-------------|
| [swarmdo-agentdb](swarmdo-agentdb/) | AgentDB with HNSW vector search (~1.9x-4.7x measured faster) |
| [swarmdo-rag-memory](swarmdo-rag-memory/) | SOTA RAG — hybrid search, Graph RAG, MMR diversity, memory bridge |
| [swarmdo-rvf](swarmdo-rvf/) | Portable RVF memory format, session persistence |
| [swarmdo-swarmvector](swarmdo-swarmvector/) | [`swarmvector`](https://npmjs.com/package/swarmvector) — FlashAttention-3, Graph RAG, hybrid search, 103 MCP tools, Brain AGI |
| [swarmdo-knowledge-graph](swarmdo-knowledge-graph/) | Entity extraction, relation mapping, pathfinder traversal |
| [swarmdo-intelligence](swarmdo-intelligence/) | SONA neural patterns, trajectory learning, model routing |
| [swarmdo-daa](swarmdo-daa/) | Dynamic Agentic Architecture, cognitive patterns |

### Architecture & Methodology

| Plugin | Description |
|--------|-------------|
| [swarmdo-adr](swarmdo-adr/) | ADR lifecycle — create, index, supersede, compliance checking |
| [swarmdo-ddd](swarmdo-ddd/) | DDD scaffolding — bounded contexts, aggregates, domain events |
| [swarmdo-sparc](swarmdo-sparc/) | SPARC methodology with 5 phases and quality gates |

### Quality & Security

| Plugin | Description |
|--------|-------------|
| [swarmdo-security-audit](swarmdo-security-audit/) | CVE scanning, dependency vulnerability checks |
| [swarmdo-aidefence](swarmdo-aidefence/) | Prompt injection detection, PII scanning |
| [swarmdo-testgen](swarmdo-testgen/) | Test gap detection, TDD London School workflow |
| [swarmdo-browser](swarmdo-browser/) | Playwright browser automation and testing |

### Development Tools

| Plugin | Description |
|--------|-------------|
| [swarmdo-jujutsu](swarmdo-jujutsu/) | Diff analysis, risk scoring, reviewer recommendations |
| [swarmdo-docs](swarmdo-docs/) | Doc generation, drift detection, API docs |
| [swarmdo-swarmllm](swarmdo-swarmllm/) | Local LLM inference, MicroLoRA, chat formatting |
| [swarmdo-agent](swarmdo-agent/) | WASM agent sandboxing and gallery |
| [swarmdo-plugin-creator](swarmdo-plugin-creator/) | Scaffold and validate new plugins |
| [swarmdo-migrations](swarmdo-migrations/) | Database schema migration management |
| [swarmdo-observability](swarmdo-observability/) | Structured logging, tracing, metrics correlation |
| [swarmdo-cost-tracker](swarmdo-cost-tracker/) | Token usage tracking, budget alerts, cost optimization |

### Domain-Specific

| Plugin | Description |
|--------|-------------|
| [swarmdo-goals](swarmdo-goals/) | GOAP planning, deep research, horizon tracking |
| [swarmdo-federation](swarmdo-federation/) | Zero-trust cross-installation agent federation |
| [swarmdo-iot-cognitum](swarmdo-iot-cognitum/) | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management |
| [swarmdo-neural-trader](swarmdo-neural-trader/) | [`neural-trader`](https://npmjs.com/package/neural-trader) — 4 agents, LSTM/Transformer, Rust/NAPI backtesting, 112+ MCP tools |
| [swarmdo-market-data](swarmdo-market-data/) | Market data ingestion, OHLCV vectorization, pattern matching |

## Recommended Stacks

| Use Case | Plugins |
|----------|---------|
| Feature development | `swarmdo-core` + `swarmdo-swarm` + `swarmdo-testgen` + `swarmdo-ddd` |
| Security audit | `swarmdo-core` + `swarmdo-security-audit` + `swarmdo-aidefence` |
| Architecture work | `swarmdo-core` + `swarmdo-adr` + `swarmdo-ddd` + `swarmdo-sparc` |
| Deep research | `swarmdo-core` + `swarmdo-goals` + `swarmdo-rag-memory` + `swarmdo-intelligence` |
| Vector search | `swarmdo-core` + `swarmdo-swarmvector` + `swarmdo-rag-memory` + `swarmdo-knowledge-graph` |
| IoT development | `swarmdo-core` + `swarmdo-iot-cognitum` + `swarmdo-agentdb` |
| Trading systems | `swarmdo-core` + `swarmdo-neural-trader` + `swarmdo-market-data` + `swarmdo-swarmvector` |
| Full stack | All 32 plugins |

## npm Package Integration

Several plugins wrap standalone npm packages for deeper functionality:

| Plugin | npm Package | What It Adds |
|--------|------------|-------------|
| `swarmdo-neural-trader` | [`neural-trader`](https://npmjs.com/package/neural-trader) | 112+ MCP tools, Rust/NAPI engine, LSTM/Transformer models |
| `swarmdo-swarmvector` | [`swarmvector`](https://npmjs.com/package/swarmvector) | 103 MCP tools, FlashAttention-3, Graph RAG, Brain AGI |

```bash
# Install backing packages
npm install neural-trader swarmvector

# Add as MCP servers (optional, for direct tool access)
claude mcp add neural-trader -- npx neural-trader mcp start
claude mcp add swarmvector -- npx swarmvector mcp start
```

## Plugin Structure

Each plugin follows the Claude Code plugin specification:

```
swarmdo-<name>/
  .claude-plugin/plugin.json    # Plugin manifest
  agents/<name>.md              # Agent definitions (frontmatter: name, description, model)
  commands/<name>.md            # CLI command mappings
  skills/<name>/SKILL.md        # Interactive skills (frontmatter: name, description, argument-hint, allowed-tools)
  README.md                     # Plugin documentation
```

## Creating a Plugin

```bash
claude --plugin-dir plugins/swarmdo-plugin-creator
# Then: /create-plugin my-new-plugin
```

Or manually: copy any existing plugin directory and modify.

## Validation

```bash
claude plugin validate plugins/swarmdo-<name>
```

## Verification & Discoverability

Every MCP tool description across the 32 plugins must answer "use this over native (Bash/Read/Grep/Glob/Task/TodoWrite) when?" per [ADR-112](../v3/docs/adr/ADR-112-mcp-tool-discoverability.md). The rule is enforced by CI:

```bash
# Run the audit (scans all MCPTool definitions across all plugins)
node scripts/audit-tool-descriptions.mjs

# Gates: every description must include "Use when …" guidance,
# be ≥ 80 chars, and be unique. Baseline at verification/mcp-tool-baseline.json
# is monotone-decreasing — CI fails on any regression.
```

Combined with [`verification/`](../verification/) (Ed25519-signed witness manifest, 103+ documented fixes attested), the plugin surface is regression-protected at three layers: install smoke (`npm i`), behavioral smoke (paired-tool round-trips), and presence attestation (every load-bearing line of every documented fix). See [`verification/README.md`](../verification/README.md) for the full stack.

## License

MIT
