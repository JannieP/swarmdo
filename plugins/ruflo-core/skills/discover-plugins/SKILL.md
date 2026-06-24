---
name: discover-plugins
description: Discover and recommend rufflo plugins based on your workflow, installed MCP tools, and current task
argument-hint: "[search-query]"
allowed-tools: mcp__rufflo__transfer_plugin-search mcp__rufflo__transfer_plugin-info mcp__rufflo__transfer_plugin-featured mcp__rufflo__transfer_plugin-official mcp__rufflo__transfer_store-search mcp__rufflo__transfer_store-featured mcp__rufflo__transfer_store-trending mcp__rufflo__transfer_store-info mcp__rufflo__guidance_discover mcp__rufflo__guidance_recommend mcp__rufflo__guidance_capabilities mcp__rufflo__mcp_status Bash Read
---

# Discover Plugins

Find and recommend rufflo plugins for your workflow.

## When to use

When starting a new project, exploring rufflo capabilities, or wondering which plugins would help with your current task.

## Steps

1. **Check installed** — run `ls plugins/` to see what's already installed
2. **Browse marketplace** — call `mcp__rufflo__transfer_plugin-featured` for recommended plugins
3. **Search by need** — call `mcp__rufflo__transfer_plugin-search` with keywords matching your task
4. **Get recommendations** — call `mcp__rufflo__guidance_recommend` with your current task description for personalized suggestions
5. **Check capabilities** — call `mcp__rufflo__guidance_capabilities` to see what each plugin enables
6. **Show details** — call `mcp__rufflo__transfer_plugin-info` for full plugin details

## Plugin Catalog (32 plugins)

### Core & Coordination — Start here

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-core** | Always — base layer for all Rufflo work | MCP server, status, doctor, coder/researcher/reviewer agents |
| **rufflo-swarm** | Multi-agent tasks (3+ files, features, refactors) | Swarm topologies (hierarchical, mesh), Monitor streaming, worktree isolation |
| **rufflo-autopilot** | Autonomous task completion without manual steering | /loop-based autonomous execution, progress prediction, learning |
| **rufflo-loop-workers** | Recurring background work (audits, optimization, mapping) | 12 background workers via /loop or CronCreate scheduling |
| **rufflo-workflows** | Repeatable multi-step processes | Workflow templates, parallel execution, conditional branching |

### Memory & Intelligence — Cross-session learning

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-agentdb** | Semantic search over code patterns, telemetry, decisions | AgentDB with HNSW vector search (150x-12,500x faster), RuVector embeddings |
| **rufflo-rag-memory** | Simple key-value memory with search | Store/search/recall without full AgentDB setup |
| **rufflo-rvf** | Portable memory export/import across machines | RVF format, session persistence, cross-platform transfer |
| **rufflo-ruvector** | Vector embedding operations, HNSW indexing, clustering | ONNX 384-dim embeddings, hyperbolic Poincare ball, k-means/DBSCAN clustering |
| **rufflo-knowledge-graph** | Entity extraction, relation mapping, graph traversal | Pathfinder algo on AgentDB causal edges, code entity graphs |
| **rufflo-intelligence** | Task routing optimization, learning from outcomes | SONA neural patterns, trajectory learning, model routing with confidence |
| **rufflo-daa** | Self-adapting agents that evolve behavior | Dynamic Agentic Architecture, cognitive patterns, knowledge sharing |

### Architecture & Methodology — Build right

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-adr** | Document architecture decisions, check compliance | ADR create/index/supersede, code-to-ADR linking, compliance checking on diffs |
| **rufflo-ddd** | Domain modeling, bounded context scaffolding | Context wizard, aggregate roots, domain events, anti-corruption layers, boundary validation |
| **rufflo-sparc** | Structured development methodology | Specification-Pseudocode-Architecture-Refinement-Completion with quality gates |

### Quality & Security — Ship safely

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-security-audit** | Before merging, after dependency changes | CVE scanning, dependency vulnerability checks, security reports |
| **rufflo-aidefence** | Processing user input, handling untrusted data | Prompt injection detection, PII scanning, adversarial defense |
| **rufflo-testgen** | After implementing features, during refactors | Test gap detection, TDD London School workflow, coverage routing |
| **rufflo-browser** | UI testing, web scraping, visual validation | Playwright automation — navigate, click, screenshot, validate |

### Development Tools — Build faster

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-jujutsu** | PR review, merge decisions, diff risk scoring | Diff analysis, risk classification, reviewer recommendations |
| **rufflo-docs** | After API changes, before releases | Doc generation, drift detection, API documentation |
| **rufflo-ruvllm** | Local LLM inference, custom model configs | RuVLLM integration, MicroLoRA fine-tuning, chat formatting |
| **rufflo-agent** | Sandboxed code execution, untrusted workloads | WASM agent sandboxing, community gallery |
| **rufflo-plugin-creator** | Building new rufflo plugins | Scaffold structure, validate frontmatter, test MCP references |
| **rufflo-migrations** | Database schema changes | Sequential migration numbering, up/down pairs, dry-run, rollback validation |
| **rufflo-observability** | Logging, tracing, metrics correlation | Structured JSON logging, distributed tracing, agent-to-app telemetry correlation |
| **rufflo-cost-tracker** | Token budget management | Per-agent cost attribution, model pricing, budget alerts, optimization recommendations |

### Domain-Specific — Specialized workloads

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **rufflo-goals** | Long-horizon planning, multi-session research | GOAP algorithm, deep research orchestration, horizon tracking, synthesis |
| **rufflo-federation** | Cross-installation agent coordination | Zero-trust peer discovery, mTLS auth, consensus routing, compliance audit |
| **rufflo-iot-cognitum** | Cognitum Seed hardware device management | 5-tier device trust, telemetry anomaly detection (Z-score), fleet firmware rollouts, witness chain verification, SONA + AgentDB integration |
| **rufflo-neural-trader** | Trading strategy development and backtesting | Z-score market anomalies, SONA trajectory strategies, walk-forward backtesting, portfolio optimization |
| **rufflo-market-data** | Market data ingestion and pattern matching | OHLCV vectorization, candlestick pattern detection, HNSW-indexed historical search |

## Decision Guide

**"I need to..."** → Use this plugin:

- Build a feature → `rufflo-core` + `rufflo-swarm` + `rufflo-testgen`
- Fix a bug → `rufflo-core` + `rufflo-jujutsu` (for diff analysis)
- Audit security → `rufflo-security-audit` + `rufflo-aidefence`
- Run background tasks → `rufflo-loop-workers` + `rufflo-autopilot`
- Search past decisions → `rufflo-agentdb` + `rufflo-rag-memory`
- Plan a multi-week effort → `rufflo-goals` (horizon tracking)
- Manage IoT devices → `rufflo-iot-cognitum`
- Coordinate remote agents → `rufflo-federation`
- Test UI changes → `rufflo-browser`
- Generate docs → `rufflo-docs`
- Create a new plugin → `rufflo-plugin-creator`
- Document architecture decisions → `rufflo-adr`
- Scaffold domain models → `rufflo-ddd`
- Follow SPARC methodology → `rufflo-sparc`
- Develop trading strategies → `rufflo-neural-trader` + `rufflo-market-data`
- Work with vector embeddings → `rufflo-ruvector`
- Build knowledge graphs → `rufflo-knowledge-graph`
- Manage database migrations → `rufflo-migrations`
- Add observability → `rufflo-observability`
- Track token costs → `rufflo-cost-tracker`

## Install any plugin

```
/plugin marketplace add ruvnet/ruflo
/plugin install <plugin-name>@rufflo
```
