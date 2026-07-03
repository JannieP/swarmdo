---
name: discover-plugins
description: Discover and recommend swarmdo plugins based on your workflow, installed MCP tools, and current task
argument-hint: "[search-query]"
allowed-tools: mcp__swarmdo__transfer_plugin-search mcp__swarmdo__transfer_plugin-info mcp__swarmdo__transfer_plugin-featured mcp__swarmdo__transfer_plugin-official mcp__swarmdo__transfer_store-search mcp__swarmdo__transfer_store-featured mcp__swarmdo__transfer_store-trending mcp__swarmdo__transfer_store-info mcp__swarmdo__guidance_discover mcp__swarmdo__guidance_recommend mcp__swarmdo__guidance_capabilities mcp__swarmdo__mcp_status Bash Read
---

# Discover Plugins

Find and recommend swarmdo plugins for your workflow.

## When to use

When starting a new project, exploring swarmdo capabilities, or wondering which plugins would help with your current task.

## Steps

1. **Check installed** — run `ls plugins/` to see what's already installed
2. **Browse marketplace** — call `mcp__swarmdo__transfer_plugin-featured` for recommended plugins
3. **Search by need** — call `mcp__swarmdo__transfer_plugin-search` with keywords matching your task
4. **Get recommendations** — call `mcp__swarmdo__guidance_recommend` with your current task description for personalized suggestions
5. **Check capabilities** — call `mcp__swarmdo__guidance_capabilities` to see what each plugin enables
6. **Show details** — call `mcp__swarmdo__transfer_plugin-info` for full plugin details

## Plugin Catalog (32 plugins)

### Core & Coordination — Start here

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-core** | Always — base layer for all Swarmdo work | MCP server, status, doctor, coder/researcher/reviewer agents |
| **swarmdo-swarm** | Multi-agent tasks (3+ files, features, refactors) | Swarm topologies (hierarchical, mesh), Monitor streaming, worktree isolation |
| **swarmdo-autopilot** | Autonomous task completion without manual steering | /loop-based autonomous execution, progress prediction, learning |
| **swarmdo-loop-workers** | Recurring background work (audits, optimization, mapping) | 12 background workers via /loop or CronCreate scheduling |
| **swarmdo-workflows** | Repeatable multi-step processes | Workflow templates, parallel execution, conditional branching |

### Memory & Intelligence — Cross-session learning

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-agentdb** | Semantic search over code patterns, telemetry, decisions | AgentDB with HNSW vector search (~1.9x-4.7x measured faster), SwarmVector embeddings |
| **swarmdo-rag-memory** | Simple key-value memory with search | Store/search/recall without full AgentDB setup |
| **swarmdo-rvf** | Portable memory export/import across machines | RVF format, session persistence, cross-platform transfer |
| **swarmdo-swarmvector** | Vector embedding operations, HNSW indexing, clustering | ONNX 384-dim embeddings, hyperbolic Poincare ball, k-means/DBSCAN clustering |
| **swarmdo-knowledge-graph** | Entity extraction, relation mapping, graph traversal | Pathfinder algo on AgentDB causal edges, code entity graphs |
| **swarmdo-intelligence** | Task routing optimization, learning from outcomes | SONA neural patterns, trajectory learning, model routing with confidence |
| **swarmdo-daa** | Self-adapting agents that evolve behavior | Dynamic Agentic Architecture, cognitive patterns, knowledge sharing |

### Architecture & Methodology — Build right

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-adr** | Document architecture decisions, check compliance | ADR create/index/supersede, code-to-ADR linking, compliance checking on diffs |
| **swarmdo-ddd** | Domain modeling, bounded context scaffolding | Context wizard, aggregate roots, domain events, anti-corruption layers, boundary validation |
| **swarmdo-sparc** | Structured development methodology | Specification-Pseudocode-Architecture-Refinement-Completion with quality gates |

### Quality & Security — Ship safely

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-security-audit** | Before merging, after dependency changes | CVE scanning, dependency vulnerability checks, security reports |
| **swarmdo-aidefence** | Processing user input, handling untrusted data | Prompt injection detection, PII scanning, adversarial defense |
| **swarmdo-testgen** | After implementing features, during refactors | Test gap detection, TDD London School workflow, coverage routing |
| **swarmdo-browser** | UI testing, web scraping, visual validation | Playwright automation — navigate, click, screenshot, validate |

### Development Tools — Build faster

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-jujutsu** | PR review, merge decisions, diff risk scoring | Diff analysis, risk classification, reviewer recommendations |
| **swarmdo-docs** | After API changes, before releases | Doc generation, drift detection, API documentation |
| **swarmdo-swarmllm** | Local LLM inference, custom model configs | SwarmLLM integration, MicroLoRA fine-tuning, chat formatting |
| **swarmdo-agent** | Sandboxed code execution, untrusted workloads | WASM agent sandboxing, community gallery |
| **swarmdo-plugin-creator** | Building new swarmdo plugins | Scaffold structure, validate frontmatter, test MCP references |
| **swarmdo-migrations** | Database schema changes | Sequential migration numbering, up/down pairs, dry-run, rollback validation |
| **swarmdo-observability** | Logging, tracing, metrics correlation | Structured JSON logging, distributed tracing, agent-to-app telemetry correlation |
| **swarmdo-cost-tracker** | Token budget management | Per-agent cost attribution, model pricing, budget alerts, optimization recommendations |

### Domain-Specific — Specialized workloads

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmdo-goals** | Long-horizon planning, multi-session research | GOAP algorithm, deep research orchestration, horizon tracking, synthesis |
| **swarmdo-federation** | Cross-installation agent coordination | Zero-trust peer discovery, mTLS auth, consensus routing, compliance audit |
| **swarmdo-iot-cognitum** | Cognitum Seed hardware device management | 5-tier device trust, telemetry anomaly detection (Z-score), fleet firmware rollouts, witness chain verification, SONA + AgentDB integration |
| **swarmdo-neural-trader** | Trading strategy development and backtesting | Z-score market anomalies, SONA trajectory strategies, walk-forward backtesting, portfolio optimization |
| **swarmdo-market-data** | Market data ingestion and pattern matching | OHLCV vectorization, candlestick pattern detection, HNSW-indexed historical search |

## Decision Guide

**"I need to..."** → Use this plugin:

- Build a feature → `swarmdo-core` + `swarmdo-swarm` + `swarmdo-testgen`
- Fix a bug → `swarmdo-core` + `swarmdo-jujutsu` (for diff analysis)
- Audit security → `swarmdo-security-audit` + `swarmdo-aidefence`
- Run background tasks → `swarmdo-loop-workers` + `swarmdo-autopilot`
- Search past decisions → `swarmdo-agentdb` + `swarmdo-rag-memory`
- Plan a multi-week effort → `swarmdo-goals` (horizon tracking)
- Manage IoT devices → `swarmdo-iot-cognitum`
- Coordinate remote agents → `swarmdo-federation`
- Test UI changes → `swarmdo-browser`
- Generate docs → `swarmdo-docs`
- Create a new plugin → `swarmdo-plugin-creator`
- Document architecture decisions → `swarmdo-adr`
- Scaffold domain models → `swarmdo-ddd`
- Follow SPARC methodology → `swarmdo-sparc`
- Develop trading strategies → `swarmdo-neural-trader` + `swarmdo-market-data`
- Work with vector embeddings → `swarmdo-swarmvector`
- Build knowledge graphs → `swarmdo-knowledge-graph`
- Manage database migrations → `swarmdo-migrations`
- Add observability → `swarmdo-observability`
- Track token costs → `swarmdo-cost-tracker`

## Install any plugin

```
/plugin marketplace add ruvnet/swarmdo
/plugin install <plugin-name>@swarmdo
```
