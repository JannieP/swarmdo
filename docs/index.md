---
layout: default
title: Rufflo Marketplace
description: Claude Code native agents, swarms, workers, and MCP tools for continuous software engineering
---

# Rufflo Marketplace

**Installable agentic workflows for Claude Code -- not just commands.**

Rufflo provides native Claude Code plugins for multi-agent orchestration, /loop workers, security auditing, memory-powered RAG, and test generation.

## Quick Install

```bash
# Add the marketplace
/plugin marketplace add ruvnet/ruflo

# Install plugins
/plugin install rufflo-core@rufflo
/plugin install rufflo-swarm@rufflo
/plugin install rufflo-loop-workers@rufflo
```

## Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| **rufflo-core** | MCP server, base commands, project config | `/plugin install rufflo-core@rufflo` |
| **rufflo-swarm** | Teams, agents, Monitor streams, worktree isolation | `/plugin install rufflo-swarm@rufflo` |
| **rufflo-loop-workers** | /loop workers, CronCreate, cache-aware scheduling | `/plugin install rufflo-loop-workers@rufflo` |
| **rufflo-security-audit** | Security review, dependency checks, policy gates | `/plugin install rufflo-security-audit@rufflo` |
| **rufflo-rag-memory** | RuVector memory, HNSW search, AgentDB | `/plugin install rufflo-rag-memory@rufflo` |
| **rufflo-testgen** | Test gap detection, coverage analysis, TDD workflow | `/plugin install rufflo-testgen@rufflo` |
| **rufflo-docs** | Doc generation, drift detection, API docs | `/plugin install rufflo-docs@rufflo` |
| **rufflo-autopilot** | Autonomous /loop completion, learning, prediction | `/plugin install rufflo-autopilot@rufflo` |
| **rufflo-intelligence** | Self-learning SONA patterns, trajectory learning, routing | `/plugin install rufflo-intelligence@rufflo` |
| **rufflo-agentdb** | AgentDB controllers, HNSW vector search, RuVector | `/plugin install rufflo-agentdb@rufflo` |
| **rufflo-aidefence** | AI safety scanning, PII detection, prompt defense | `/plugin install rufflo-aidefence@rufflo` |
| **rufflo-browser** | Playwright browser automation, testing, scraping | `/plugin install rufflo-browser@rufflo` |
| **rufflo-jujutsu** | Git diff analysis, risk scoring, reviewer recs | `/plugin install rufflo-jujutsu@rufflo` |
| **rufflo-agent** | Sandboxed WASM agents and gallery sharing | `/plugin install rufflo-agent@rufflo` |
| **rufflo-workflows** | Workflow templates, orchestration, lifecycle | `/plugin install rufflo-workflows@rufflo` |
| **rufflo-daa** | Dynamic Agentic Architecture, cognitive patterns | `/plugin install rufflo-daa@rufflo` |
| **rufflo-ruvllm** | Local LLM inference, MicroLoRA, chat formatting | `/plugin install rufflo-ruvllm@rufflo` |
| **rufflo-rvf** | RVF portable memory, session persistence | `/plugin install rufflo-rvf@rufflo` |
| **rufflo-plugin-creator** | Scaffold, validate, publish new plugins | `/plugin install rufflo-plugin-creator@rufflo` |

## How It Works

Rufflo plugins extend Claude Code with:
- **Skills** -- Teach Claude Code new workflows (swarm init, /loop workers, security scans)
- **Commands** -- Slash commands for common operations (/status, /audit, /memory)
- **Agents** -- Specialized agent definitions (coder, reviewer, architect, security-auditor)
- **MCP Server** -- 314 tools for coordination, memory, neural learning, and more

## Claude Code Native Integration

Rufflo plugins use Claude Code's native capabilities when available:

| Feature | Plugin | Claude Code Native |
|---------|--------|--------------------|
| Periodic workers | rufflo-loop-workers | `/loop` + `ScheduleWakeup` |
| Live monitoring | rufflo-swarm | `Monitor` tool |
| Background jobs | rufflo-loop-workers | `CronCreate` |
| Agent isolation | rufflo-swarm | `isolation: "worktree"` |
| Multi-agent comms | rufflo-swarm | `TeamCreate` + `SendMessage` |
| Cross-session | rufflo-core | `PushNotification` + `RemoteTrigger` |
| Autonomous loops | rufflo-autopilot | `/loop` + `ScheduleWakeup` + autopilot MCP |

## Trust & Security

- All plugins are open source -- review before installing
- MCP servers run locally, no data leaves your machine
- Plugins declare required permissions in their manifest
- Pin versions for production use: `/plugin install rufflo-core@0.1.0@rufflo`
- Security scanning available via rufflo-security-audit
- Cryptographically-signed [witness manifest](../verification.md) attests every documented fix; see [Validation System](validation/) for the three-layer regression-protection stack

## Links

- [GitHub Repository](https://github.com/ruvnet/ruflo)
- [npm Packages](https://www.npmjs.com/package/@rufflo/cli)
- [ADR-091: Native Integration](https://github.com/ruvnet/ruflo/blob/main/v3/docs/adr/ADR-091-loop-monitor-native-integration.md)
- [Issues & Support](https://github.com/ruvnet/ruflo/issues)
