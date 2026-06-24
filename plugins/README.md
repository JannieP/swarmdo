# Rufflo Plugins

32 Claude Code plugins for agent-powered development workflows. Load with `--plugin-dir`.

## Quick Start

```bash
# Load specific plugins
claude --plugin-dir plugins/rufflo-core --plugin-dir plugins/rufflo-swarm

# Load all plugins
claude $(ls -d plugins/rufflo-*/ | sed 's|^|--plugin-dir |' | tr '\n' ' ')
```

## Plugin Catalog

### Core & Coordination

| Plugin | Description |
|--------|-------------|
| [rufflo-core](rufflo-core/) | MCP server, status, doctor, coder/researcher/reviewer agents |
| [rufflo-swarm](rufflo-swarm/) | Swarm topologies (hierarchical, mesh), Monitor streaming |
| [rufflo-autopilot](rufflo-autopilot/) | Autonomous /loop task completion with prediction |
| [rufflo-loop-workers](rufflo-loop-workers/) | 12 background workers via /loop or CronCreate |
| [rufflo-workflows](rufflo-workflows/) | Workflow templates, parallel execution, branching |

### Memory & Intelligence

| Plugin | Description |
|--------|-------------|
| [rufflo-agentdb](rufflo-agentdb/) | AgentDB with HNSW vector search (~1.9x-4.7x measured faster) |
| [rufflo-rag-memory](rufflo-rag-memory/) | SOTA RAG — hybrid search, Graph RAG, MMR diversity, memory bridge |
| [rufflo-rvf](rufflo-rvf/) | Portable RVF memory format, session persistence |
| [rufflo-ruvector](rufflo-ruvector/) | [`ruvector`](https://npmjs.com/package/ruvector) — FlashAttention-3, Graph RAG, hybrid search, 103 MCP tools, Brain AGI |
| [rufflo-knowledge-graph](rufflo-knowledge-graph/) | Entity extraction, relation mapping, pathfinder traversal |
| [rufflo-intelligence](rufflo-intelligence/) | SONA neural patterns, trajectory learning, model routing |
| [rufflo-daa](rufflo-daa/) | Dynamic Agentic Architecture, cognitive patterns |

### Architecture & Methodology

| Plugin | Description |
|--------|-------------|
| [rufflo-adr](rufflo-adr/) | ADR lifecycle — create, index, supersede, compliance checking |
| [rufflo-ddd](rufflo-ddd/) | DDD scaffolding — bounded contexts, aggregates, domain events |
| [rufflo-sparc](rufflo-sparc/) | SPARC methodology with 5 phases and quality gates |

### Quality & Security

| Plugin | Description |
|--------|-------------|
| [rufflo-security-audit](rufflo-security-audit/) | CVE scanning, dependency vulnerability checks |
| [rufflo-aidefence](rufflo-aidefence/) | Prompt injection detection, PII scanning |
| [rufflo-testgen](rufflo-testgen/) | Test gap detection, TDD London School workflow |
| [rufflo-browser](rufflo-browser/) | Playwright browser automation and testing |

### Development Tools

| Plugin | Description |
|--------|-------------|
| [rufflo-jujutsu](rufflo-jujutsu/) | Diff analysis, risk scoring, reviewer recommendations |
| [rufflo-docs](rufflo-docs/) | Doc generation, drift detection, API docs |
| [rufflo-ruvllm](rufflo-ruvllm/) | Local LLM inference, MicroLoRA, chat formatting |
| [rufflo-agent](rufflo-agent/) | WASM agent sandboxing and gallery |
| [rufflo-plugin-creator](rufflo-plugin-creator/) | Scaffold and validate new plugins |
| [rufflo-migrations](rufflo-migrations/) | Database schema migration management |
| [rufflo-observability](rufflo-observability/) | Structured logging, tracing, metrics correlation |
| [rufflo-cost-tracker](rufflo-cost-tracker/) | Token usage tracking, budget alerts, cost optimization |

### Domain-Specific

| Plugin | Description |
|--------|-------------|
| [rufflo-goals](rufflo-goals/) | GOAP planning, deep research, horizon tracking |
| [rufflo-federation](rufflo-federation/) | Zero-trust cross-installation agent federation |
| [rufflo-iot-cognitum](rufflo-iot-cognitum/) | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management |
| [rufflo-neural-trader](rufflo-neural-trader/) | [`neural-trader`](https://npmjs.com/package/neural-trader) — 4 agents, LSTM/Transformer, Rust/NAPI backtesting, 112+ MCP tools |
| [rufflo-market-data](rufflo-market-data/) | Market data ingestion, OHLCV vectorization, pattern matching |

## Recommended Stacks

| Use Case | Plugins |
|----------|---------|
| Feature development | `rufflo-core` + `rufflo-swarm` + `rufflo-testgen` + `rufflo-ddd` |
| Security audit | `rufflo-core` + `rufflo-security-audit` + `rufflo-aidefence` |
| Architecture work | `rufflo-core` + `rufflo-adr` + `rufflo-ddd` + `rufflo-sparc` |
| Deep research | `rufflo-core` + `rufflo-goals` + `rufflo-rag-memory` + `rufflo-intelligence` |
| Vector search | `rufflo-core` + `rufflo-ruvector` + `rufflo-rag-memory` + `rufflo-knowledge-graph` |
| IoT development | `rufflo-core` + `rufflo-iot-cognitum` + `rufflo-agentdb` |
| Trading systems | `rufflo-core` + `rufflo-neural-trader` + `rufflo-market-data` + `rufflo-ruvector` |
| Full stack | All 32 plugins |

## npm Package Integration

Several plugins wrap standalone npm packages for deeper functionality:

| Plugin | npm Package | What It Adds |
|--------|------------|-------------|
| `rufflo-neural-trader` | [`neural-trader`](https://npmjs.com/package/neural-trader) | 112+ MCP tools, Rust/NAPI engine, LSTM/Transformer models |
| `rufflo-ruvector` | [`ruvector`](https://npmjs.com/package/ruvector) | 103 MCP tools, FlashAttention-3, Graph RAG, Brain AGI |

```bash
# Install backing packages
npm install neural-trader ruvector

# Add as MCP servers (optional, for direct tool access)
claude mcp add neural-trader -- npx neural-trader mcp start
claude mcp add ruvector -- npx ruvector mcp start
```

## Plugin Structure

Each plugin follows the Claude Code plugin specification:

```
rufflo-<name>/
  .claude-plugin/plugin.json    # Plugin manifest
  agents/<name>.md              # Agent definitions (frontmatter: name, description, model)
  commands/<name>.md            # CLI command mappings
  skills/<name>/SKILL.md        # Interactive skills (frontmatter: name, description, argument-hint, allowed-tools)
  README.md                     # Plugin documentation
```

## Creating a Plugin

```bash
claude --plugin-dir plugins/rufflo-plugin-creator
# Then: /create-plugin my-new-plugin
```

Or manually: copy any existing plugin directory and modify.

## Validation

```bash
claude plugin validate plugins/rufflo-<name>
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
