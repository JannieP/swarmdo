---
layout: default
title: Swarmdo Marketplace
description: Claude Code native agents, swarms, workers, and MCP tools for continuous software engineering
---

# Swarmdo Marketplace

**Installable agentic workflows for Claude Code -- not just commands.**

Swarmdo provides native Claude Code plugins for multi-agent orchestration, /loop workers, security auditing, memory-powered RAG, and test generation.

## Quick Install

```bash
# Add the marketplace
/plugin marketplace add upstream/swarmdo

# Install plugins
/plugin install swarmdo-core@swarmdo
/plugin install swarmdo-swarm@swarmdo
/plugin install swarmdo-loop-workers@swarmdo
```

## Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| **swarmdo-core** | MCP server, base commands, project config | `/plugin install swarmdo-core@swarmdo` |
| **swarmdo-swarm** | Teams, agents, Monitor streams, worktree isolation | `/plugin install swarmdo-swarm@swarmdo` |
| **swarmdo-loop-workers** | /loop workers, CronCreate, cache-aware scheduling | `/plugin install swarmdo-loop-workers@swarmdo` |
| **swarmdo-security-audit** | Security review, dependency checks, policy gates | `/plugin install swarmdo-security-audit@swarmdo` |
| **swarmdo-rag-memory** | SwarmVector memory, HNSW search, AgentDB | `/plugin install swarmdo-rag-memory@swarmdo` |
| **swarmdo-testgen** | Test gap detection, coverage analysis, TDD workflow | `/plugin install swarmdo-testgen@swarmdo` |
| **swarmdo-docs** | Doc generation, drift detection, API docs | `/plugin install swarmdo-docs@swarmdo` |
| **swarmdo-autopilot** | Autonomous /loop completion, learning, prediction | `/plugin install swarmdo-autopilot@swarmdo` |
| **swarmdo-intelligence** | Self-learning SONA patterns, trajectory learning, routing | `/plugin install swarmdo-intelligence@swarmdo` |
| **swarmdo-agentdb** | AgentDB controllers, HNSW vector search, SwarmVector | `/plugin install swarmdo-agentdb@swarmdo` |
| **swarmdo-aidefence** | AI safety scanning, PII detection, prompt defense | `/plugin install swarmdo-aidefence@swarmdo` |
| **swarmdo-browser** | Playwright browser automation, testing, scraping | `/plugin install swarmdo-browser@swarmdo` |
| **swarmdo-jujutsu** | Git diff analysis, risk scoring, reviewer recs | `/plugin install swarmdo-jujutsu@swarmdo` |
| **swarmdo-agent** | Sandboxed WASM agents and gallery sharing | `/plugin install swarmdo-agent@swarmdo` |
| **swarmdo-workflows** | Workflow templates, orchestration, lifecycle | `/plugin install swarmdo-workflows@swarmdo` |
| **swarmdo-daa** | Dynamic Agentic Architecture, cognitive patterns | `/plugin install swarmdo-daa@swarmdo` |
| **swarmdo-swarmllm** | Local LLM inference, MicroLoRA, chat formatting | `/plugin install swarmdo-swarmllm@swarmdo` |
| **swarmdo-rvf** | RVF portable memory, session persistence | `/plugin install swarmdo-rvf@swarmdo` |
| **swarmdo-plugin-creator** | Scaffold, validate, publish new plugins | `/plugin install swarmdo-plugin-creator@swarmdo` |

## How It Works

Swarmdo plugins extend Claude Code with:
- **Skills** -- Teach Claude Code new workflows (swarm init, /loop workers, security scans)
- **Commands** -- Slash commands for common operations (/status, /audit, /memory)
- **Agents** -- Specialized agent definitions (coder, reviewer, architect, security-auditor)
- **MCP Server** -- 314 tools for coordination, memory, neural learning, and more

## Claude Code Native Integration

Swarmdo plugins use Claude Code's native capabilities when available:

| Feature | Plugin | Claude Code Native |
|---------|--------|--------------------|
| Periodic workers | swarmdo-loop-workers | `/loop` + `ScheduleWakeup` |
| Live monitoring | swarmdo-swarm | `Monitor` tool |
| Background jobs | swarmdo-loop-workers | `CronCreate` |
| Agent isolation | swarmdo-swarm | `isolation: "worktree"` |
| Multi-agent comms | swarmdo-swarm | `TeamCreate` + `SendMessage` |
| Cross-session | swarmdo-core | `PushNotification` + `RemoteTrigger` |
| Autonomous loops | swarmdo-autopilot | `/loop` + `ScheduleWakeup` + autopilot MCP |

## Trust & Security

- All plugins are open source -- review before installing
- MCP servers run locally, no data leaves your machine
- Plugins declare required permissions in their manifest
- Pin versions for production use: `/plugin install swarmdo-core@0.1.0@swarmdo`
- Security scanning available via swarmdo-security-audit
- Cryptographically-signed [witness manifest](../verification.md) attests every documented fix; see [Validation System](validation/) for the three-layer regression-protection stack

## Links

- [GitHub Repository](the upstream project (see NOTICE))
- [npm Packages](https://www.npmjs.com/package/@swarmdo/cli)
- [ADR-091: Native Integration](the upstream project (see NOTICE))
- [Issues & Support](the upstream project (see NOTICE))
