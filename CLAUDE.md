# Claude Code Configuration - Swarmdo v1.4

> **Swarmdo v1.29.0** (2026-07-11) — continued correctness-hardening across the deterministic toolkit (config-lint hook-events, transcript export turn-count, apply CRLF + ambiguous-hunk flagging, compact blank-run handling, sbom/pack/redact/testreport) plus memory-system fixes: content-deduped prompt-time injection and a fix for auto-memory store bloat (a search-strategy vs entry-type mismatch that broke import dedup). New this line: **compaction survival** — a working-state digest snapshotted on `PreCompact` and re-injected on the next prompt so the model re-grounds instead of re-exploring; a Claude Code plugin-hint + on-PATH `swarmdo` shim; reasoningbank timing deflake. Each shipped with fixture/regression tests + evidence.
> 6,000+ commits, 314 MCP tools, 16 agent roles + custom types, 19 AgentDB controllers, 21 native plugins.
> Packages: `swarmdo@1.29.0` (umbrella), `@swarmdo/cli@1.29.0`, `swarmdo-bridge@1.29.0` (wrapper in `swarmdo/`)

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Key Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@swarmdo/cli` | `v3/@swarmdo/cli/` | CLI entry point (26 commands) |
| `@swarmdo/codex` | `v3/@swarmdo/codex/` | Dual-mode Claude + Codex collaboration |
| `@swarmdo/guidance` | `v3/@swarmdo/guidance/` | Governance control plane |
| `@swarmdo/hooks` | `v3/@swarmdo/hooks/` | 17 hooks + 12 workers |
| `@swarmdo/memory` | `v3/@swarmdo/memory/` | AgentDB + HNSW search |
| `@swarmdo/security` | `v3/@swarmdo/security/` | Input validation, CVE remediation |

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Task tool for spawning agents, not just MCP

**Mandatory patterns:**
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS spawn ALL agents in ONE message with full instructions via Task tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL terminal operations in ONE Bash message
- ALWAYS batch ALL memory store/retrieve operations in ONE message

---

## Swarm Orchestration

- MUST initialize the swarm using MCP tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Task tool
- Never use MCP tools alone for execution — Task tool agents do the actual work

### MCP + Task Tool in SAME Message

- MUST call MCP tools AND Task tool in ONE message for complex work
- Always call MCP first, then IMMEDIATELY call Task tool to spawn agents

### 3-Tier Model Routing (ADR-026, ADR-143)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Deterministic codemod | ~1ms | $0 | Structural transforms with **no LLM**: `var-to-const`, `remove-console`, `add-logging` |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- Always check for `[CODEMOD_AVAILABLE]` or `[TASK_MODEL_RECOMMENDATION]` before spawning agents
- When you see `[CODEMOD_AVAILABLE]`, call the `hooks_codemod` MCP tool (intent + file) — it applies the transform deterministically via the TypeScript compiler at $0, no LLM. Deterministic intents only: `var-to-const`, `remove-console`, `add-logging`
- `add-types`, `add-error-handling`, `async-await` need judgement and route to a model (Tier 2/3) — they are **not** $0 codemods (see ADR-143)
- Agent Booster (`agent-booster`) is a fast-apply merge engine for arbitrary LLM-produced edit snippets, not an intent-transform engine — it is **not** the Tier-1 path

## Swarm Configuration & Anti-Drift

### Anti-Drift Coding Swarm (PREFERRED DEFAULT)

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents
- Keep task cycles short with verification gates

```javascript
mcp__swarmdo-swarm__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
})
```

## Dual-Mode Collaboration (Claude Code + Codex)

This repository uses **dual-mode orchestration** to run Claude Code (🔵) and OpenAI Codex (🟢) workers in parallel with shared memory coordination. Both platforms collaborate on development tasks with cross-learning.

### Why Dual-Mode?

| Single Platform | Dual-Mode Collaboration |
|----------------|------------------------|
| One model's perspective | Two AI platforms cross-validating |
| Limited reasoning styles | Complementary strengths |
| No external verification | Built-in code review |
| Sequential workflows | Parallel execution |

### Dual-Mode Swarm Protocol

For complex tasks, spawn both Claude and Codex workers in parallel:

```javascript
// STEP 1: Initialize dual-mode swarm
mcp__swarmdo-swarm__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
})

// STEP 2: Spawn BOTH platforms in parallel via Task tool
// 🔵 Claude Code workers (architecture, security, testing)
Task("Architect", "Design the implementation. Store design in memory namespace 'collaboration'.", "system-architect")
Task("Tester", "Write tests based on architect's design. Read from 'collaboration' namespace.", "tester")
Task("Reviewer", "Review code quality and security. Store findings in 'collaboration'.", "reviewer")

// 🟢 Codex workers (implementation, optimization)
// Spawn via CLI for Codex platform
Bash("npx swarmdo-codex dual run --worker 'codex:coder:Implement the solution based on architect design' --namespace collaboration")
Bash("npx swarmdo-codex dual run --worker 'codex:optimizer:Optimize performance based on implementation' --namespace collaboration")

// STEP 3: Coordinate via shared memory
Bash("npx swarmdo@latest memory store --namespace collaboration --key 'task-context' --value '[task description]'")
```

### Collaboration Templates (Pre-Built Pipelines)

| Template | Workers | Pipeline |
|----------|---------|----------|
| `feature` | 🔵 Architect → 🟢 Coder → 🔵 Tester → 🟢 Reviewer | Full feature development |
| `security` | 🔵 Analyst → 🟢 Scanner → 🔵 Reporter | Security audit workflow |
| `refactor` | 🔵 Architect → 🟢 Refactorer → 🔵 Tester | Code modernization |
| `bugfix` | 🔵 Researcher → 🟢 Coder → 🔵 Tester | Bug investigation & fix |

### Dual-Mode CLI Commands

```bash
# Run a collaboration template
npx swarmdo-codex dual run feature --task "Add user authentication with OAuth"
npx swarmdo-codex dual run security --target "./src"
npx swarmdo-codex dual run refactor --target "./src/legacy"

# Custom multi-platform swarm
npx swarmdo-codex dual run \
  --worker "claude:architect:Design the API structure" \
  --worker "codex:coder:Implement REST endpoints" \
  --worker "claude:tester:Write integration tests" \
  --worker "codex:reviewer:Review code quality" \
  --namespace "api-feature"

# Check collaboration status
npx swarmdo-codex dual status

# List available templates
npx swarmdo-codex dual templates
```

### Shared Memory Coordination

All workers share state via the `collaboration` namespace:

```bash
# Store context for cross-platform sharing
npx swarmdo@latest memory store --namespace collaboration --key "design-decisions" --value "..."

# Search for patterns across all workers
npx swarmdo@latest memory search --namespace collaboration --query "authentication patterns"

# Retrieve specific findings
npx swarmdo@latest memory retrieve --namespace collaboration --key "security-findings"
```

### Cross-Platform Learning

Both platforms learn from each other's outputs:

```bash
# After successful collaboration, train patterns
npx swarmdo@latest hooks post-task --task-id "dual-[id]" --success true --train-neural true

# Store successful collaboration patterns
npx swarmdo@latest memory store --namespace patterns --key "dual-mode-[pattern]" --value "[what worked]"

# Transfer learnings to both platforms
npx swarmdo@latest hooks transfer store --pattern "dual-collab-success"
```

### Worker Dependency Levels

Workers execute in dependency order:

```
Level 0: [🔵 Architect]           # No dependencies - runs first
Level 1: [🟢 Coder, 🔵 Tester]    # Depends on Architect
Level 2: [🔵 Reviewer]            # Depends on Coder + Tester
Level 3: [🟢 Optimizer]           # Depends on Reviewer approval
```

### Platform Strengths

| Task Type | Preferred Platform | Reason |
|-----------|-------------------|--------|
| Architecture & Design | 🔵 Claude | Strong reasoning, system thinking |
| Implementation | 🟢 Codex | Fast code generation |
| Security Review | 🔵 Claude | Careful analysis, threat modeling |
| Performance Optimization | 🟢 Codex | Code-level optimizations |
| Testing Strategy | 🔵 Claude | Coverage analysis, edge cases |
| Refactoring | 🟢 Codex | Bulk code transformations |

### Programmatic API

```typescript
import { DualModeOrchestrator, CollaborationTemplates } from '@swarmdo/codex';

const orchestrator = new DualModeOrchestrator({
  namespace: 'my-feature',
  memoryBackend: 'hybrid'
});

// Use pre-built template
const workers = CollaborationTemplates.featureDevelopment('Add OAuth login');

// Run collaboration
const results = await orchestrator.runCollaboration(workers, 'Implement OAuth feature');

// Access shared memory
const designDocs = await orchestrator.getMemory('design-decisions');
```

---

## Swarm Protocols & Routing

### Auto-Start Swarm Protocol

When the user requests a complex task (multi-file changes, feature implementation, refactoring), **immediately execute this pattern in a SINGLE message:**

```javascript
// STEP 1: Initialize swarm coordination via MCP
mcp__swarmdo-swarm__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
})

// STEP 2: Spawn NAMED agents concurrently — all in ONE message
// Each agent knows WHO to message next in the pipeline
Task({
  prompt: "Research requirements and codebase. SendMessage findings to 'architect' when done.",
  subagent_type: "researcher", name: "researcher", run_in_background: true
})
Task({
  prompt: "Wait for research from 'researcher'. Design implementation. SendMessage design to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true
})
Task({
  prompt: "Wait for design from 'architect'. Implement the solution. SendMessage code paths to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true
})
Task({
  prompt: "Wait for implementation from 'coder'. Write tests. SendMessage results to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true
})
Task({
  prompt: "Wait for test results from 'tester'. Review code quality and security. Report findings.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true
})

// STEP 3: Kick off the pipeline
SendMessage({ to: "researcher", summary: "Start research", message: "[task description and context]" })

// STEP 4: Batch todos
TodoWrite({ todos: [
  {content: "Research and analyze requirements", status: "in_progress", activeForm: "Researching"},
  {content: "Design architecture", status: "pending", activeForm: "Designing"},
  {content: "Implement solution", status: "pending", activeForm: "Implementing"},
  {content: "Write tests", status: "pending", activeForm: "Testing"},
  {content: "Review and finalize", status: "pending", activeForm: "Reviewing"}
]})

// Pipeline flow via SendMessage:
// researcher ──→ architect ──→ coder ──→ tester ──→ reviewer
```

### Agent Routing (Anti-Drift)

| Code | Task | Agents |
|------|------|--------|
| 1 | Bug Fix | coordinator, researcher, coder, tester |
| 3 | Feature | coordinator, architect, coder, tester, reviewer |
| 5 | Refactor | coordinator, architect, coder, reviewer |
| 7 | Performance | coordinator, perf-engineer, coder |
| 9 | Security | coordinator, security-architect, auditor |
| 11 | Memory | coordinator, memory-specialist, perf-engineer |
| 13 | Docs | researcher, api-docs |

**Codes 1-11: hierarchical/specialized (anti-drift). Code 13: mesh/balanced**

### Task Complexity Detection

**AUTO-INVOKE SWARM when task involves:**
- Multiple files (3+)
- New feature implementation
- Refactoring across modules
- API changes with tests
- Security-related changes
- Performance optimization
- Database schema changes

**SKIP SWARM for:**
- Single file edits
- Simple bug fixes (1-2 lines)
- Documentation updates
- Configuration changes
- Quick questions/exploration

## Project Configuration

This project is configured with Swarmdo V3 (Anti-Drift Defaults):
- **Topology**: hierarchical (prevents drift via central coordination)
- **Max Agents**: 8 (smaller team = less drift)
- **Strategy**: specialized (clear roles, no overlap)
- **Consensus**: raft (leader maintains authoritative state)
- **Memory Backend**: hybrid (SQLite + AgentDB)
- **HNSW Indexing**: Enabled (measured ~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force; ANN wins above the crossover)
- **Neural Learning**: Enabled (SONA)

## Configuration Presets

`swarmdo init` ships a ladder of named capability tiers — pick one word instead of toggling dozens of flags. Apply with `swarmdo init --preset <name>`; browse with `swarmdo preset list` and `swarmdo preset info <name>`.

| Tier | Preset | Agents | Vector intelligence | For |
|------|--------|--------|---------------------|-----|
| 0 | `minimal` | 4 | off | Experiments, low-power/offline; smallest footprint |
| 1 | `basic` ★ | 6 | off | **Default.** Most projects; fast init, no model downloads |
| 2 | `standard` | 10 | on | Semantic memory + learned routing (HNSW + neural + ONNX embeddings) |
| 3 | `advanced` | 15 | on | Full skill/agent/command surface; hyperbolic embeddings |
| 4 | `max` | 20 | on | + Claude⇄Codex dual-mode + swarmdo-swarm MCP; heaviest footprint |

★ recommended default. Aliases: `default`→`basic`, `intermediate`→`standard`, `full`→`max`. Each rung is a superset of the one below; every preset ships the efficiency skills (caveman + ponytail) enabled. Full detail per tier: `swarmdo preset info <name>`.

### Efficiency skills — caveman & ponytail (from Claude Code)

Run `swarmdo preset info efficiency` for the full guide. Both are **user-invoked** skills (available, never automatic), toggled per-project with `swarmdo efficiency on|off|status`:

- **🦴 caveman** — *token compression* (vendored from JuliusBrussee/caveman, MIT). In Claude Code, type `/sdo-caveman-compress <file>` to rewrite a memory file (CLAUDE.md, todos, preferences) into caveman-speak — cuts input tokens while preserving all code, URLs, and structure; a human-readable backup is kept as `<file>.original.md`. Also `/sdo-caveman` (speak compressed in-session), `sdo-cavecrew` (compressed multi-agent crew), `sdo-caveman-stats` (measure savings). Reverse by restoring the `.original.md`.
- **🎯 ponytail** — *anti-over-engineering* (vendored from DietrichGebert/ponytail, MIT). Type `/sdo-ponytail [lite|full|ultra]` to channel a lazy senior dev on a coding task (YAGNI, standard library before custom code, native features before dependencies, one line before fifty); stays active every response until you say "stop ponytail". Also `sdo-ponytail-audit` (score a codebase), `sdo-ponytail-review` (apply to a diff), `sdo-ponytail-debt`/`sdo-ponytail-gain` (track simplicity debt/wins). For swarm agents, pass `ponytail:true` per `agent_run`/`agent_execute` call, or set `SWARMDO_PONYTAIL=1` to make it the default persona for every agent.

## V3 CLI Commands (26 Commands, 140+ Subcommands)

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization with wizard, presets, skills, hooks |
| `agent` | 8 | Agent lifecycle (spawn, list, status, stop, metrics, pool, health, logs) |
| `swarm` | 6 | Multi-agent swarm coordination and orchestration |
| `memory` | 14 | AgentDB memory with HNSW vector search (measured ~1.9x–4.7x vs brute force above crossover) + WAL-safe `backup` + `revectorize` (repairs hash-era vectors) + `export`/`import -f obsidian` (markdown-vault roundtrip) + `import --watch` (live Obsidian sync) |
| `mcp` | 9 | MCP server management and tool execution |
| `task` | 9 | Task creation, assignment, lifecycle + dependency graph (`--dependencies`, `ready`, `graph`; dispatcher gates on readiness) |
| `session` | 7 | Session state management and persistence |
| `config` | 7 | Configuration management and provider setup |
| `status` | 3 | System status monitoring with watch mode |
| `start` | 3 | Service startup and quick launch |
| `workflow` | 6 | Workflow execution and template management |
| `hooks` | 17 | Self-learning hooks + 13 background workers |
| `hive-mind` | 6 | Queen-led Byzantine fault-tolerant consensus |

### Advanced Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `daemon` | 5 | Background worker daemon (start, stop, status, trigger, enable) |
| `neural` | 5 | Neural pattern training (train, status, patterns, predict, optimize) |
| `security` | 6 | Security scanning (scan, audit, cve, threats, validate, report) |
| `performance` | 5 | Performance profiling (benchmark, profile, metrics, optimize, report) |
| `providers` | 5 | AI providers (list, add, remove, test, configure) |
| `plugins` | 5 | Plugin management (list, install, uninstall, enable, disable) |
| `deployment` | 5 | Deployment management (deploy, rollback, status, environments, release) |
| `embeddings` | 4 | Vector embeddings (embed, batch, search, init) — agentic-flow ONNX backend (speedup unverified, no benchmark) |
| `usage` | 10 | Claude Code token/cost analytics from local transcripts (daily, monthly, models, projects, sessions, 5h `blocks` w/ live burn, `errors` tool-failure analytics, `cache` prompt-cache efficiency + $ saved, `guard` budget policy, `reflect` wrapped-style retrospective; alias: `cost`) |
| `repair` | 1 | Test-Driven Repair — bounded, budget-capped headless claude loop fixes source until a failing test passes (alias: `tdd-repair`; dry-run without `--confirm`) |
| `integrations` | 2 | Wire swarmdo into Codex CLI / Copilot CLI / pi (AGENTS.md + per-CLI MCP config, idempotent merges; alias `integrate`; NEVER touches .claude/.mcp.json/CLAUDE.md) |
| `hud` | 1 | Single-pane operational HUD: 5h block burn, task readiness, daemon workers, memory snapshots (`--watch`, `--json`) |
| `preset` | 3 | Named config tiers for init (`list`/`info`/`show`): minimal→basic→standard→advanced→max; `preset info efficiency` documents the caveman + ponytail skills. Apply: `init --preset <name>` |
| `claims` | 4 | Claims-based authorization (check, grant, revoke, list) |
| `migrate` | 5 | V2 to V3 migration with rollback support |
| `process` | 4 | Background process management |
| `doctor` | 1 | System diagnostics with health checks |
| `completions` | 4 | Shell completions (bash, zsh, fish, powershell) |

### Quick CLI Examples

```bash
# Initialize project
npx swarmdo@latest init --wizard

# Start daemon with background workers
npx swarmdo@latest daemon start

# Spawn an agent
npx swarmdo@latest agent spawn -t coder --name my-coder

# Initialize swarm
npx swarmdo@latest swarm init --v3-mode

# Search memory (HNSW-indexed)
npx swarmdo@latest memory search -q "authentication patterns"

# System diagnostics
npx swarmdo@latest doctor --fix

# Security scan
npx swarmdo@latest security scan --depth full

# Performance benchmark
npx swarmdo@latest performance benchmark --suite all
```

## Headless Background Instances (claude -p)

Use `claude -p` (print/pipe mode) to spawn headless Claude instances for parallel background work. These run non-interactively and return results to stdout.

### Basic Usage

```bash
# Single headless task
claude -p "Analyze the authentication module for security issues"

# With model selection
claude -p --model haiku "Format this config file"
claude -p --model opus "Design the database schema for user management"

# With output format
claude -p --output-format json "List all TODO comments in src/"
claude -p --output-format stream-json "Refactor the error handling in api.ts"

# With budget limits
claude -p --max-budget-usd 0.50 "Run comprehensive security audit"

# With specific tools allowed
claude -p --allowedTools "Read,Grep,Glob" "Find all files that import the auth module"

# Skip permissions (sandboxed environments only)
claude -p --dangerously-skip-permissions "Fix all lint errors in src/"
```

### Parallel Background Execution

```bash
# Spawn multiple headless instances in parallel
claude -p "Analyze src/auth/ for vulnerabilities" &
claude -p "Write tests for src/api/endpoints.ts" &
claude -p "Review src/models/ for performance issues" &
wait  # Wait for all to complete

# With results captured
SECURITY=$(claude -p "Security audit of auth module" &)
TESTS=$(claude -p "Generate test coverage report" &)
PERF=$(claude -p "Profile memory usage in workers" &)
wait
echo "$SECURITY" "$TESTS" "$PERF"
```

### Session Continuation

```bash
# Start a task, resume later
claude -p --session-id "abc-123" "Start analyzing the codebase"
claude -p --resume "abc-123" "Continue with the test files"

# Fork a session for parallel exploration
claude -p --resume "abc-123" --fork-session "Try approach A: event sourcing"
claude -p --resume "abc-123" --fork-session "Try approach B: CQRS pattern"
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p, --print` | Non-interactive mode, print and exit |
| `--model <model>` | Select model (haiku, sonnet, opus) |
| `--output-format <fmt>` | Output: text, json, stream-json |
| `--max-budget-usd <amt>` | Spending cap per invocation |
| `--allowedTools <tools>` | Restrict available tools |
| `--append-system-prompt` | Add custom instructions |
| `--resume <id>` | Continue a previous session |
| `--fork-session` | Branch from resumed session |
| `--fallback-model <model>` | Auto-fallback if primary overloaded |
| `--permission-mode <mode>` | acceptEdits, bypassPermissions, plan, etc. |
| `--mcp-config <json>` | Load MCP servers from JSON |

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### V3 Specialized Agents
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### @swarmdo/security Module
CVE remediation, input validation, path security:
- `InputValidator` — Zod-based validation at boundaries
- `PathValidator` — Path traversal prevention
- `SafeExecutor` — Command injection protection
- `PasswordHasher` — bcrypt hashing
- `TokenGenerator` — Secure token generation

### Token Optimizer (Agent Booster)
Integrates agentic-flow optimizations for 30-50% token reduction:
```typescript
import { getTokenOptimizer } from '@swarmdo/integration';
const optimizer = await getTokenOptimizer();

// Compact context (32% fewer tokens)
const ctx = await optimizer.getCompactContext("auth patterns");

// 352x faster edits = fewer retries
await optimizer.optimizedEdit(file, old, new, "typescript");

// Optimal config (100% success rate)
const config = optimizer.getOptimalConfig(agentCount);
```
| Feature | Token Savings |
|---------|---------------|
| ReasoningBank retrieval | -32% |
| Agent Booster edits | -15% |
| Cache (95% hit rate) | -10% |
| Optimal batch size | -20% |

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`, `collective-intelligence-coordinator`, `swarm-memory-manager`

### Consensus & Distributed
`byzantine-coordinator`, `raft-manager`, `gossip-coordinator`, `consensus-builder`, `crdt-synchronizer`, `quorum-manager`, `security-manager`

### Performance & Optimization
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`, `memory-coordinator`, `smart-agent`

### GitHub & Repository
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`, `workflow-automation`, `project-board-sync`, `repo-architect`, `multi-repo-swarm`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

### Specialized Development
`backend-dev`, `mobile-dev`, `ml-developer`, `cicd-engineer`, `api-docs`, `system-architect`, `code-analyzer`, `base-template-generator`

### Testing & Validation
`tdd-london-swarm`, `production-validator`

## Agent Teams & Comms System

Agent Teams turns Claude Code into a multi-agent system where named agents communicate in real-time via `SendMessage`. The comms system is the primary coordination mechanism — agents talk to each other, not just to the lead.

### Architecture

```
Team Lead (you)
  ├── SendMessage ←→ architect (named agent)
  ├── SendMessage ←→ developer (named agent)
  ├── SendMessage ←→ tester (named agent)
  └── SendMessage ←→ reviewer (named agent)
       ↕ agents can message each other by name
```

### Core Principle: Named Agents + SendMessage

Every agent MUST have a `name` so it's addressable. Communication happens via `SendMessage`, not polling or shared memory.

```javascript
// STEP 1: Spawn named agents (all in ONE message, background)
Task({
  prompt: "Design the API. When done, send your design to 'developer' via SendMessage.",
  subagent_type: "system-architect",
  name: "architect",
  run_in_background: true
})
Task({
  prompt: "Wait for architect's design via SendMessage. Then implement it. Send code to 'tester'.",
  subagent_type: "coder",
  name: "developer",
  run_in_background: true
})
Task({
  prompt: "Wait for developer's code via SendMessage. Write tests. Send results to 'reviewer'.",
  subagent_type: "tester",
  name: "tester",
  run_in_background: true
})

// STEP 2: Kick off the pipeline by messaging the first agent
SendMessage({
  to: "architect",
  summary: "Start API design",
  message: "Design a REST API for user management with CRUD endpoints. Send the design to 'developer' when done."
})
```

### SendMessage Protocol

```javascript
// Lead → Teammate: assign work
SendMessage({ to: "developer", summary: "Implement auth", message: "Build OAuth2 flow..." })

// Lead → Teammate: redirect priorities
SendMessage({ to: "developer", summary: "Prioritize auth", message: "Auth endpoint is blocking tester, do it first." })

// Lead → Teammate: provide context from another agent's results
SendMessage({ to: "tester", summary: "Architect output", message: "The architect designed these endpoints: [details]. Write tests for them." })

// Lead → Teammate: graceful shutdown
SendMessage({ to: "developer", message: { type: "shutdown_request" } })
```

### Coordination Patterns

**Pipeline (A → B → C)** — each agent messages the next when done:
```
architect ──SendMessage──→ developer ──SendMessage──→ tester ──SendMessage──→ reviewer
```
Tell each agent WHO to message next in their prompt.

**Fan-out / Fan-in** — lead spawns parallel agents, collects results:
```
         ┌→ researcher-1 ──→┐
lead ────┼→ researcher-2 ──→├──→ lead synthesizes
         └→ researcher-3 ──→┘
```
Spawn with `run_in_background: true`. Results arrive as task completions.

**Supervisor / Worker** — lead assigns, workers report back:
```
lead ←──SendMessage──→ worker-1
lead ←──SendMessage──→ worker-2
lead ←──SendMessage──→ worker-3
```
Lead sends tasks via SendMessage, workers respond with results.

### Agent Prompt Template (Comms-Aware)

When spawning agents that need to coordinate, include comms instructions:

```javascript
Task({
  prompt: `You are the architect for this feature team.

YOUR TASK: Design the database schema for user management.

COMMS PROTOCOL:
- When your design is ready, send it to "developer" via SendMessage
- If you need clarification, message the team lead (just output text)
- Include file paths and key decisions in your message

DELIVERABLE: Schema design with entity relationships, indexes, and migration plan.`,
  subagent_type: "system-architect",
  name: "architect",
  run_in_background: true
})
```

### Full Team Spawn Example

```javascript
// Create shared task list first
TaskCreate({ subject: "Design schema", description: "...", activeForm: "Designing" })
TaskCreate({ subject: "Implement models", description: "...", activeForm: "Implementing" })
TaskCreate({ subject: "Write tests", description: "...", activeForm: "Testing" })
TaskCreate({ subject: "Security review", description: "...", activeForm: "Reviewing" })

// Spawn ALL named agents in ONE message
Task({
  prompt: "Design the schema. SendMessage to 'developer' with your design when done. Update task #1.",
  subagent_type: "system-architect", name: "architect", run_in_background: true
})
Task({
  prompt: "Wait for schema from 'architect'. Implement models + endpoints. SendMessage to 'tester'. Update task #2.",
  subagent_type: "coder", name: "developer", run_in_background: true
})
Task({
  prompt: "Wait for code from 'developer'. Write integration tests. SendMessage results to 'security'. Update task #3.",
  subagent_type: "tester", name: "tester", run_in_background: true
})
Task({
  prompt: "Wait for test results from 'tester'. Review for vulnerabilities. Update task #4.",
  subagent_type: "security-auditor", name: "security", run_in_background: true
})
```

### Agent Teams Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `TeammateIdle` | Teammate finishes turn | Auto-assign pending tasks via SendMessage |
| `TaskCompleted` | Task marked complete | Train patterns, notify lead via SendMessage |

```bash
npx swarmdo@latest hooks teammate-idle --auto-assign true
npx swarmdo@latest hooks task-completed -i task-123 --train-patterns true
```

### Rules

1. **Always name agents** — use `name: "role-name"` so they're addressable
2. **Comms over memory** — use SendMessage for real-time coordination, memory for persistence
3. **Pipeline prompts** — tell each agent WHO to message next and WHAT to send
4. **Spawn all at once** — all Task calls in ONE message with `run_in_background: true`
5. **Don't poll** — agents message back when done; wait for task completion notifications
6. **Graceful shutdown** — send `{ type: "shutdown_request" }` before TeamDelete
7. **Lead synthesizes** — when agents complete, review ALL results before responding to user

## V3 Hooks System (17 Hooks + 12 Workers)

### Hook Categories

| Category | Hooks | Purpose |
|----------|-------|---------|
| **Core** | `pre-edit`, `post-edit`, `pre-command`, `post-command`, `pre-task`, `post-task` | Tool lifecycle |
| **Session** | `session-start`, `session-end`, `session-restore`, `notify` | Context management |
| **Intelligence** | `route`, `explain`, `pretrain`, `build-agents`, `transfer` | Neural learning |
| **Learning** | `intelligence` (trajectory-start/step/end, pattern-store/search, stats, attention) | Reinforcement |
| **Agent Teams** | `teammate-idle`, `task-completed` | Multi-agent coordination |

### 13 Background Workers

| Worker | Priority | Description |
|--------|----------|-------------|
| `ultralearn` | normal | Deep knowledge acquisition |
| `optimize` | high | Performance optimization |
| `consolidate` | low | Memory consolidation |
| `predict` | normal | Predictive preloading |
| `audit` | critical | Security analysis |
| `map` | normal | Codebase mapping |
| `preload` | low | Resource preloading |
| `deepdive` | normal | Deep code analysis |
| `document` | normal | Auto-documentation |
| `refactor` | normal | Refactoring suggestions |
| `benchmark` | normal | Performance benchmarking |
| `testgaps` | normal | Test coverage analysis |
| `backup` | low | Nightly WAL-safe memory.db snapshot (keep 7) |

### Essential Hook Commands

```bash
# Core hooks
npx swarmdo@latest hooks pre-task --description "[task]"
npx swarmdo@latest hooks post-task --task-id "[id]" --success true
npx swarmdo@latest hooks post-edit --file "[file]" --train-patterns

# Session management
npx swarmdo@latest hooks session-start --session-id "[id]"
npx swarmdo@latest hooks session-end --export-metrics true
npx swarmdo@latest hooks session-restore --session-id "[id]"

# Intelligence routing
npx swarmdo@latest hooks route --task "[task]"
npx swarmdo@latest hooks explain --topic "[topic]"

# Neural learning
npx swarmdo@latest hooks pretrain --model-type moe --epochs 10
npx swarmdo@latest hooks build-agents --agent-types coder,tester

# Background workers
npx swarmdo@latest hooks worker list
npx swarmdo@latest hooks worker dispatch --trigger audit
npx swarmdo@latest hooks worker status
```

## Intelligence System (SwarmVector)

V3 includes the SwarmVector Intelligence System (measured numbers: see [audit](docs/reviews/intelligence-system-audit-2026-05-29.md) + [`scripts/benchmark-intelligence.mjs`](scripts/benchmark-intelligence.mjs)):
- **SONA**: Self-Optimizing Neural Architecture (measured 0.0043ms/adapt, target <0.05ms met)
- **MoE**: Mixture of Experts for specialized routing (gate converges — confidence 0.13→0.88 after rewards)
- **HNSW**: measured ~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force (recall@10 ~0.99); ANN wins above the crossover, swarmvector NAPI backend (WASM not active on test host)
- **EWC++**: Elastic Weight Consolidation (prevents forgetting)
- **Flash Attention**: unverified — no benchmark exists for this claim

The 4-step intelligence pipeline:
1. **RETRIEVE** — Fetch relevant patterns via HNSW
2. **JUDGE** — Evaluate with verdicts (success/failure)
3. **DISTILL** — Extract key learnings via LoRA
4. **CONSOLIDATE** — Prevent catastrophic forgetting via EWC++

## Embeddings Package (v3.0.0-alpha.12)

Features:
- **sql.js**: Cross-platform SQLite persistent cache (WASM, no native compilation)
- **Document chunking**: Configurable overlap and size
- **Normalization**: L2, L1, min-max, z-score
- **Hyperbolic embeddings**: Poincare ball model for hierarchical data
- **agentic-flow ONNX integration**: speedup unverified (no benchmark; backend reported `onnx`, model all-MiniLM-L6-v2, 384-dim)
- **Neural substrate**: Integration with SwarmVector

## Hive-Mind Consensus

### Topologies
- `hierarchical` — Queen controls workers directly
- `mesh` — Fully connected peer network
- `hierarchical-mesh` — Hybrid (recommended)
- `adaptive` — Dynamic based on load

### Consensus Strategies
- `byzantine` — BFT (tolerates f < n/3 faulty)
- `raft` — Leader-based (tolerates f < n/2)
- `gossip` — Epidemic for eventual consistency
- `crdt` — Conflict-free replicated data types
- `quorum` — Configurable quorum-based

## V3 Performance Targets

> Source of truth: [`docs/reviews/intelligence-system-audit-2026-05-29.md`](docs/reviews/intelligence-system-audit-2026-05-29.md) + [`scripts/benchmark-intelligence.mjs`](scripts/benchmark-intelligence.mjs). Numbers below are measured unless marked "target/unverified".

| Metric | Measured / Target | Status |
|--------|-------------------|--------|
| HNSW Search | ~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force (recall@10 ~0.99); ties/loses below crossover | **Measured** (swarmvector NAPI; 150x-12,500x NOT reproduced — was brute-force fallback) |
| Int8 Quantization | 3.84x compression, reconstruction cosine 0.99999 | **Measured** |
| RaBitQ Quantization | 32x compression, 0.60ms/query (14,760-vec index) | **Measured** |
| SONA Adaptation | 0.0043ms/adapt (target <0.05ms met) | **Measured** |
| MoE Gate | converges — confidence 0.13→0.88, Q 0→99.8 after rewards | **Measured** |
| Flash Attention | 2.49x-7.47x | **Unverified** (no benchmark exists) |
| MCP Response | <100ms | target |
| CLI Startup | <500ms | target |

## Environment Variables

```bash
# Configuration
SWARMDO_CONFIG=./swarmdo.config.json
SWARMDO_LOG_LEVEL=info

# Provider API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=sk-or-...   # enables the configurable swarm model pool (swarmdo.config.json `openrouter`)

# MCP Server
SWARMDO_MCP_PORT=3000
SWARMDO_MCP_HOST=localhost
SWARMDO_MCP_TRANSPORT=stdio

# Memory
SWARMDO_MEMORY_BACKEND=hybrid
SWARMDO_MEMORY_PATH=./data/memory

# Daemon
SWARMDO_HEADLESS=0        # hard-forbid billable headless `claude --print` worker sweeps
SWARMDO_REQUIRE_REAL_EMBEDDINGS=1  # strict mode: hash-embedding fallbacks throw instead of degrading silently
```

## Doctor Health Checks

Run `npx swarmdo@latest doctor` to check:
- Node.js version (20+)
- npm version (9+)
- Git installation
- Config file validity
- Daemon status
- Memory database
- API keys
- MCP servers
- Disk space
- TypeScript installation

## Quick Setup

```bash
# Add MCP servers
claude mcp add swarmdo npx swarmdo@latest mcp start
claude mcp add swarmdo-swarm npx swarmdo-swarm mcp start  # Optional

# Start daemon
npx swarmdo@latest daemon start

# Run doctor
npx swarmdo@latest doctor --fix
```

## Claude Code vs MCP Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- TodoWrite and task management
- Git operations

### MCP Tools ONLY COORDINATE:
- Swarm initialization (topology setup)
- Agent type definitions
- Task orchestration
- Memory management
- Neural features
- Performance tracking

- Keep MCP for coordination strategy only — use Claude Code's Task tool for real execution

## Claude Code ↔ AgentDB Memory Bridge

Claude Code's auto-memory (`~/.claude/projects/*/memory/*.md`) is bridged to AgentDB with ONNX vector embeddings for semantic search.

### MCP Tools

| Tool | Description |
|------|-------------|
| `memory_import_claude` | Import Claude Code memories into AgentDB with 384-dim ONNX embeddings. Use `allProjects: true` to import from ALL projects. |
| `memory_bridge_status` | Show bridge health — Claude files, AgentDB entries, SONA state, connection status |
| `memory_search_unified` | Semantic search across ALL namespaces (claude-memories, auto-memory, patterns, tasks, feedback) |

### Auto-Import on Session Start

The `SessionStart` hook automatically imports current project's memories into AgentDB. For manual import of all projects:

```bash
# Via MCP tool (from Claude Code)
memory_import_claude({ allProjects: true })

# Via helper hook (from terminal)
node .claude/helpers/auto-memory-hook.mjs import-all
```

### Unified Search

Search across both Claude Code memories and AgentDB entries:

```bash
# Via MCP tool
memory_search_unified({ query: "authentication security", limit: 5 })

# Results include source attribution: claude-code, auto-memory, or agentdb
```

### Intelligence Pipeline

| Component | Status | Details |
|-----------|--------|---------|
| ONNX Embeddings | Active | all-MiniLM-L6-v2, 384 dimensions |
| SONA Learning | Active | Pattern matching + trajectory recording |
| ReasoningBank | Active | Pattern storage with file persistence |
| AgentDB sql.js | Active | SQLite with vector_indexes table |

## Publishing to npm

### Versioning policy (stable releases — swarmdo shipped 1.0.0 on 2026-06-27)

- **swarmdo ships stable semver from 1.0.0**, NOT alpha pre-releases.
- Bump rules (semver discipline):
  - **PATCH** (1.3.0 → 1.3.1): bug fixes only, no API change, no schema change
  - **MINOR** (1.3.0 → 1.4.0): backward-compatible additions (new MCP tool, new flag, new agent type)
  - **MAJOR** (1.x → 2.0.0): breaking change in CLI surface, MCP tool signature, file layout, or default behavior
- Default tag is `latest` (no `--tag alpha`). This fork has NO legacy alpha/v3alpha dist-tags — never create them.
- Never publish a pre-release (`-alpha.N`, `-beta.N`, `-rc.N`) unless the user explicitly asks for a pre-release flow.

### Publishing Rules

- Publish BOTH npm packages when publishing CLI changes: `swarmdo` (root umbrella) and `@swarmdo/cli`. `swarmdo-bridge` is `private: true` (version-bumped in lockstep, NEVER published — see its package.json description)
- Only the `latest` dist-tag exists — npm sets it on publish; nothing else to update
- `@swarmdo/cli` MUST be published from its self-contained staging dir — its `file:../` siblings don't ship from the package dir, so a plain `npm publish` there produces a broken install (guarded: `prepublishOnly` fails with instructions). `scripts/build-standalone.mjs` vendors cli-core/mcp/neural/shared/memory/sona/rabitq-wasm into `vendor/` and rewrites the specs
- The `swarmdo` umbrella publishes from the repo root as-is (its tarball vendors all `v3/**` dists; `file:` deps resolve inside the tarball)
- MUST run verification for BOTH before telling user publishing is complete
- **MANDATORY docs sync on every deploy/publish** (user rule, 2026-07-07): a version is not "released" until (1) README badge + feature sections reflect it, (2) docs/USERGUIDE.md documents any new commands/flags, (3) website/index.html (working copy) is updated AND deployed to the live site — copy to the SwarmDo/swarmdo.com repo, push, and curl-verify swarmdo.com serves the new content. `swarmdo release` automates the version strings + site deploy; feature-level docs content is your responsibility per release
- PREFERRED: publish from GitHub — `swarmdo release --skip-publish --confirm` bumps/commits/tags; pushing the v* tag triggers `.github/workflows/npm-publish.yml` (builds workspaces, stages the cli, gates tarball completeness, publishes both with the NPM_TOKEN secret, verifies the registry). `swarmdo release --confirm` without the skip does the same train locally

```bash
# Versions are already bumped in lockstep by the every-commit bump rule

# STEP 1: Build + stage + publish @swarmdo/cli
cd v3/@swarmdo/cli
npm run build
npm run build:standalone                 # → dist-standalone/ (self-contained)
npm publish dist-standalone/             # default tag is `latest` — no --tag flag

# STEP 2: Publish swarmdo umbrella (repo root)
cd "$(git rev-parse --show-toplevel)"
npm publish
```

**Verification (run before telling user publishing is complete):**

```bash
for pkg in @swarmdo/cli swarmdo; do
  echo "$pkg: $(npm view $pkg@latest version)"
done
# Both must show the new version on `latest`
```

### All Tags That Must Be Updated

| Package | Tag | Command Users Run |
|---------|-----|-------------------|
| `swarmdo` | `latest` | `npx swarmdo@latest` |
| `@swarmdo/cli` | `latest` | `npx @swarmdo/cli@latest` |
| `swarmdo-bridge` | — | private, never published (bumped in lockstep only) |

- The root `swarmdo` package is what users run via `npx swarmdo`; `swarmdo-bridge` lives in `/swarmdo/` and depends on `@swarmdo/cli`
- Also remember to update `swarmdo/package.json` overrides when adding new pinned transitives (see #2112 lesson — root overrides do NOT propagate to the published `swarmdo` wrapper)

### GitHub Release after publish

Every stable bump SHOULD have a matching `gh release create v<version>` with consolidated release notes pointing at the gist if one exists. Example:

```bash
git tag v1.4.0 main
git push origin v1.4.0
gh release create v1.4.0 --title "v1.4.0 — <one-line headline>" \
  --notes-file /tmp/release-notes.md
```

## Plugin Registry Maintenance (IPFS/Pinata)

The plugin registry is stored on IPFS via Pinata for decentralized, immutable distribution.

### Registry Location
- **Current CID**: Stored in `v3/@swarmdo/cli/src/plugins/store/discovery.ts`
- **Gateway**: `https://gateway.pinata.cloud/ipfs/{CID}`
- **Format**: JSON with plugin metadata, categories, featured/trending lists

### Required Environment Variables
Add to `.env` (NEVER commit actual values):
```bash
PINATA_API_KEY=your-api-key
PINATA_API_SECRET=your-api-secret
PINATA_API_JWT=your-jwt-token
```

## Plugin Registry Operations

### Adding a New Plugin to Registry

1. **Fetch current registry**:
```bash
curl -s "https://gateway.pinata.cloud/ipfs/$(grep LIVE_REGISTRY_CID v3/@swarmdo/cli/src/plugins/store/discovery.ts | cut -d"'" -f2)" > /tmp/registry.json
```

2. **Add plugin entry** to the `plugins` array:
```json
{
  "id": "@swarmdo/your-plugin",
  "name": "@swarmdo/your-plugin",
  "displayName": "Your Plugin",
  "description": "Plugin description",
  "version": "1.0.0-alpha.1",
  "size": 100000,
  "checksum": "sha256:abc123",
  "author": {"id": "swarmdo-team", "displayName": "Swarmdo Team", "verified": true},
  "license": "MIT",
  "categories": ["official"],
  "tags": ["your", "tags"],
  "downloads": 0,
  "rating": 5,
  "lastUpdated": "2026-01-25T00:00:00.000Z",
  "minClaudeFlowVersion": "3.0.0",
  "type": "integration",
  "hooks": [],
  "commands": [],
  "permissions": ["memory"],
  "exports": ["YourExport"],
  "verified": true,
  "trustLevel": "official"
}
```

3. **Update counts and arrays**:
   - Increment `totalPlugins`
   - Add to `official` array
   - Add to `featured`/`newest` if applicable
   - Update category `pluginCount`

4. **Upload to Pinata** (read credentials from .env):
```bash
# Source credentials from .env
PINATA_JWT=$(grep "^PINATA_API_JWT=" .env | cut -d'=' -f2-)

# Upload updated registry
curl -X POST "https://api.pinata.cloud/pinning/pinJSONToIPFS" \
  -H "Authorization: Bearer $PINATA_JWT" \
  -H "Content-Type: application/json" \
  -d @/tmp/registry.json
```

5. **Update discovery.ts** with new CID:
```typescript
export const LIVE_REGISTRY_CID = 'NEW_CID_FROM_PINATA';
```

6. **Also update demo registry** in discovery.ts `demoPluginRegistry` for offline fallback

### Security Rules
- NEVER hardcode API keys in scripts or source files
- NEVER commit .env (already in .gitignore)
- Always source credentials from environment at runtime
- Always delete temporary scripts after one-time uploads

### Verification
```bash
# Verify new registry is accessible
curl -s "https://gateway.pinata.cloud/ipfs/{NEW_CID}" | jq '.totalPlugins'
```

## MetaHarness Integration (ADR-150)

Swarmdo integrates with the upstream `metaharness` / `@metaharness/*` ecosystem as a sibling agent-harness scaffolding system (same author, designed around swarmdo's primitives). Both `metaharness` and `@metaharness/router` are in `optionalDependencies` — never required at runtime.

### Architectural constraint (load-bearing)

**Swarmdo remains operational if every MetaHarness package is removed.** Four rules:
1. **Removable**: `npm ls --without @metaharness/*` must still produce a working CLI
2. **Optional in package.json**: `@metaharness/*` packages MUST be in `optionalDependencies`, never in `dependencies`
3. **Graceful degradation**: every code path that touches MetaHarness catches `MODULE_NOT_FOUND` and falls back
4. **CI gate**: `.github/workflows/no-metaharness-smoke.yml` enforces all three by static grep + runtime drill on every PR

### Command + tool surface

```bash
# CLI subcommands (npx swarmdo metaharness …)
npx swarmdo metaharness score                      # 5-dim readiness scorecard
npx swarmdo metaharness genome                     # 7-section categorical report
npx swarmdo metaharness mcp-scan --fail-on high    # static security findings
npx swarmdo metaharness threat-model               # enterprise threat report
npx swarmdo metaharness oia-audit --alert-on-worst high
                                                 # composite weekly audit → memory
npx swarmdo metaharness audit-list --since 30d     # enumerate audit records
npx swarmdo metaharness audit-trend \              # diff two audits (drift)
  --baseline-key <a> --current-key <b> --alert-on-worsening \
  --alert-on-distance-below 0.85               # iter 38 — structural-distance gate (ADR-152 §3.1)
npx swarmdo metaharness similarity \               # iter 36 — ADR-152 §3.1 weighted similarity
  --a a.json --b b.json [--per-dimension] [--alert-below 0.5]
npx swarmdo metaharness drift-from-history \       # iter 53 — 1-command drift (composes 3 primitives)
  [--baseline-since 7d] [--baseline-key <key>] [--baseline-file <path>] \
  [--threshold 0.95] [--alert-on-new-severity high] [--dry-run]
                                                 # iter 66 — --baseline-key skips audit-list (~14x faster)
                                                 # iter 67 — --baseline-file skips memory entirely (~19x faster)
                                                 # iter 78 — --alert-on-new-severity adds orthogonal finding-severity gate
npx swarmdo metaharness mint --name foo --template vertical:coding --confirm

# Dedicated command
npx swarmdo eject --name my-harness                # lift swarmdo project → standalone harness
                                                 # dry-run by default; refuses in-repo target

# Doctor health check
npx swarmdo doctor --component metaharness         # report metaharness availability + version

# MCP tools (callable by Claude Code agents)
mcp__swarmdo__metaharness_score
mcp__swarmdo__metaharness_genome
mcp__swarmdo__metaharness_mcp_scan
mcp__swarmdo__metaharness_threat_model
mcp__swarmdo__metaharness_oia_audit
mcp__swarmdo__metaharness_audit_list
mcp__swarmdo__metaharness_audit_trend
mcp__swarmdo__metaharness_similarity          # iter 36 — ADR-152 §3.1 genome similarity
mcp__swarmdo__metaharness_drift_from_history  # iter 53 — 1-command drift detection
mcp__swarmdo__metaharness_bench               # perf bench of harness primitives
mcp__swarmdo__metaharness_security_bench      # security-posture benchmark
mcp__swarmdo__metaharness_evolve              # guided harness evolution step
```

### Routing integration (ADR-148/149)

`@metaharness/router@~0.3.2` is wired as the cost-optimal model router behind the `SWARMDO_ROUTER_NEURAL=1` triple-gate. The `routedBy` field on every routing decision carries `'metaharness-knn' | 'metaharness-krr' | 'fastgrnn'` when the neural path is active.

### SelfEvolvingRouter parallel-logging (ADR-150 Phase 2)

When `SWARMDO_ROUTER_PARALLEL_LOG=1` is set, every `route()` call writes a paired-decision row (bandit pick + neural-augmented pick + outcome) to `.swarm/router-parallel.jsonl`. Analyze with:

```bash
node plugins/swarmdo-metaharness/scripts/router-parallel-analyze.mjs \
  --input .swarm/router-parallel.jsonl --strict
```

The 3-criteria AND-gate from ADR-150 review-round-1: `quality > 2% AND cost < 1% AND latency < 5%`. Exit 1 in `--strict` mode if any criterion fails — promotion gate.

### CI workflows

- `metaharness-ci.yml` — score / mcp-scan / router-compat / eject-dryrun jobs on every PR touching `plugins/swarmdo-metaharness/**`
- `no-metaharness-smoke.yml` — enforces the four architectural-constraint rules above on every PR
- `oia-audit-weekly.yml` — Sundays 04:17 UTC, runs composite audit, uploads 90-day artifact

### Cross-references

- [ADR-150](v3/docs/adr/ADR-150-metaharness-integration-surfaces.md) — decision + implementation notes
- [Issue #2399](the upstream project (see NOTICE)) — phase tracker
- [Research gist](https://gist.the upstream project (see NOTICE)) — graded evidence
- Upstream: `the upstream project (see NOTICE)`

## Optional Plugins (20 Available)

Plugins are distributed via IPFS and can be installed with the CLI. Browse and install from the official registry:

```bash
# List all available plugins
npx swarmdo@latest plugins list

# Install a plugin
npx swarmdo@latest plugins install @swarmdo/plugin-name

# Enable/disable
npx swarmdo@latest plugins enable @swarmdo/plugin-name
npx swarmdo@latest plugins disable @swarmdo/plugin-name
```

### Core Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `@swarmdo/embeddings` | 3.0.0-alpha.1 | Vector embeddings with sql.js, HNSW, hyperbolic support |
| `@swarmdo/security` | 3.0.0-alpha.1 | Input validation, path security, CVE remediation |
| `@swarmdo/claims` | 3.0.0-alpha.8 | Claims-based authorization (check, grant, revoke, list) |
| `@swarmdo/neural` | 3.0.0-alpha.7 | Neural pattern training (SONA, MoE, EWC++) |
| `@swarmdo/plugins` | 3.0.0-alpha.1 | Plugin system core (manager, discovery, store) |
| `@swarmdo/performance` | 3.0.0-alpha.1 | Performance profiling and benchmarking |

### Integration Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `@swarmdo/plugin-agentic-qe` | 3.0.0-alpha.4 | Agentic quality engineering integration |
| `@swarmdo/plugin-prime-radiant` | 0.1.5 | Prime Radiant intelligence integration |
| `@swarmdo/plugin-gastown-bridge` | 3.0.0-alpha.1 | Gastown bridge protocol integration |
| `@swarmdo/teammate-plugin` | 1.0.0-alpha.1 | Multi-agent teammate coordination |
| `@swarmdo/plugin-code-intelligence` | 0.1.0 | Advanced code analysis and intelligence |
| `@swarmdo/plugin-test-intelligence` | 0.1.0 | Intelligent test generation and gap analysis |
| `@swarmdo/plugin-perf-optimizer` | 0.1.0 | Performance optimization automation |
| `@swarmdo/plugin-neural-coordinator` | 0.1.0 | Neural network coordination across agents |
| `@swarmdo/plugin-cognitive-kernel` | 0.1.0 | Core cognitive processing kernel |
| `@swarmdo/plugin-quantum-optimizer` | 0.1.0 | Quantum-inspired optimization algorithms |
| `@swarmdo/plugin-hyperbolic-reasoning` | 0.1.0 | Hyperbolic space reasoning for hierarchical data |

### Domain-Specific Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `@swarmdo/plugin-healthcare-clinical` | 0.1.0 | Healthcare clinical workflow automation |
| `@swarmdo/plugin-financial-risk` | 0.1.0 | Financial risk assessment and modeling |
| `@swarmdo/plugin-legal-contracts` | 0.1.0 | Legal contract analysis and generation |

### Plugin Development

```bash
# Create a new plugin from template
npx swarmdo@latest plugins create my-plugin

# Test locally
npx swarmdo@latest plugins install ./path/to/my-plugin

# Publish to registry (requires Pinata credentials)
npx swarmdo@latest plugins publish
```

Registry source: IPFS via Pinata (`QmXbfEAaR7D2Ujm4GAkbwcGZQMHqAMpwDoje4583uNP834`)

## Support

- Documentation: the upstream project (see NOTICE)
- Issues: the upstream project (see NOTICE)

---

Remember: **Swarmdo coordinates, Claude Code creates!**
