# ADR-035: MCP Tool Groups — Modular Tool Organization

**Status:** Accepted
**Date:** 2026-03-05
**Supersedes:** ADR-033, ADR-034

## Context

The MCP bridge grew to 331+ tools from multiple backends (swarmvector, swarmdo, agentic-flow, Claude Code, Gemini, Codex). Exposing all tools simultaneously caused:

1. **Context flooding** — AI models struggle to select the right tool from 300+ options
2. **Startup overhead** — loading all backends when only a subset is needed
3. **No discoverability** — the AI had no structured way to learn about available capabilities

## Decision

Reorganize all tools into **12 logical groups** that can be independently enabled/disabled via `MCP_GROUP_*` environment variables. Add a built-in `guidance` tool that provides structured instructions to the AI about available capabilities.

### Tool Groups

| Group | Source | Tools | Default | Env Var |
|-------|--------|-------|---------|---------|
| **core** | built-in | search, web_research, guidance | always on | — |
| **intelligence** | swarmvector | ~10 | enabled | `MCP_GROUP_INTELLIGENCE` |
| **agents** | swarmdo | ~50 | enabled | `MCP_GROUP_AGENTS` |
| **memory** | swarmdo | ~25 | enabled | `MCP_GROUP_MEMORY` |
| **devtools** | swarmdo | ~60 | enabled | `MCP_GROUP_DEVTOOLS` |
| **security** | swarmdo | ~25 | disabled | `MCP_GROUP_SECURITY` |
| **browser** | swarmdo | ~23 | disabled | `MCP_GROUP_BROWSER` |
| **neural** | swarmdo | ~20 | disabled | `MCP_GROUP_NEURAL` |
| **agentic-flow** | agentic-flow@alpha | 15 | disabled | `MCP_GROUP_AGENTIC_FLOW` |
| **claude-code** | claude mcp serve | varies | disabled | `MCP_GROUP_CLAUDE_CODE` |
| **gemini** | gemini-mcp-server | varies | disabled | `MCP_GROUP_GEMINI` |
| **codex** | @openai/codex | varies | disabled | `MCP_GROUP_CODEX` |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  HF Chat UI → /mcp                                     │
└─────────────┬───────────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Bridge v2.0.0                                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  TOOL GROUP FILTER                               │   │
│  │  MCP_GROUP_INTELLIGENCE=true  → include          │   │
│  │  MCP_GROUP_AGENTS=true        → include          │   │
│  │  MCP_GROUP_BROWSER=false      → exclude          │   │
│  │  MCP_GROUP_NEURAL=false       → exclude          │   │
│  └─────────────────────────────────────────────────┘   │
│         ▼                    ▼                ▼         │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ swarmvector │  │    swarmdo     │  │ agentic-flow    │  │
│  │ (stdio)  │  │   (stdio)   │  │    (stdio)      │  │
│  └──────────┘  └──────────────┘  └─────────────────┘  │
│                                                         │
│  Optional (disabled by default):                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Claude  │  │  Gemini  │  │  Codex   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Group Filtering

Tools from external backends are filtered by matching their original tool name against group prefix patterns:

```javascript
// Group definition
agents: {
  source: "swarmdo",
  prefixes: ["agent_", "swarm_", "task_", "session_", "hive-mind_", "workflow_", "coordination_"],
}

// swarmdo tool "agent_spawn" → matches "agent_" prefix → included if agents group enabled
// swarmdo tool "browser_open" → matches "browser_" prefix → only if browser group enabled
```

A backend is only started if at least one of its groups is enabled. This means disabling all swarmdo groups prevents the swarmdo process from spawning entirely.

### Guidance Tool

The `guidance` tool replaces the old `system_guide`. It provides structured, AI-optimized instructions:

```
guidance(topic="overview")     → capabilities summary + decision guide
guidance(topic="groups")       → table of all groups with status
guidance(topic="agents")       → detailed usage for the agents group
guidance(topic="tool", tool_name="swarmdo__memory_search") → specific tool docs
```

The system prompt instructs the AI to call `guidance` when:
- Unsure which tool to use
- User asks "what can you do?"
- Needs to learn a specific tool group before using it

### Agentic-Flow Integration

`agentic-flow@alpha` (npm package) provides 15 tools:

| Tool | Description |
|------|-------------|
| `agentic_flow_agent` | Execute any of 66+ specialized agents |
| `agentic_flow_list_agents` | List available agent types |
| `agentic_flow_create_agent` | Create custom agents |
| `agentic_flow_list_all_agents` | List with sources |
| `agentic_flow_agent_info` | Get agent details |
| `agentic_flow_check_conflicts` | Agent conflict detection |
| `agentic_flow_optimize_model` | Auto-select best model |
| `agent_booster_edit_file` | 352x faster code editing |
| `agent_booster_batch_edit` | Multi-file refactoring |
| `agent_booster_parse_markdown` | LLM output parsing |
| `agentdb_stats` | Database statistics |
| `agentdb_pattern_store` | Store reasoning patterns |
| `agentdb_pattern_search` | Search similar patterns |
| `agentdb_pattern_stats` | Pattern analytics |
| `agentdb_clear_cache` | Clear query cache |

## Configuration Examples

### Minimal (research assistant)
```env
MCP_GROUP_INTELLIGENCE=false
MCP_GROUP_AGENTS=false
MCP_GROUP_MEMORY=false
MCP_GROUP_DEVTOOLS=false
# Only core tools: search, web_research, guidance
```

### Developer workstation
```env
MCP_GROUP_INTELLIGENCE=true
MCP_GROUP_AGENTS=true
MCP_GROUP_MEMORY=true
MCP_GROUP_DEVTOOLS=true
MCP_GROUP_AGENTIC_FLOW=true   # agent execution + boosted editing
```

### Full capabilities
```env
MCP_GROUP_INTELLIGENCE=true
MCP_GROUP_AGENTS=true
MCP_GROUP_MEMORY=true
MCP_GROUP_DEVTOOLS=true
MCP_GROUP_SECURITY=true
MCP_GROUP_BROWSER=true
MCP_GROUP_NEURAL=true
MCP_GROUP_AGENTIC_FLOW=true
MCP_GROUP_CLAUDE_CODE=true
MCP_GROUP_GEMINI=true
MCP_GROUP_CODEX=true
ANTHROPIC_API_KEY=sk-ant-...
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health with group status |
| `/groups` | GET | Detailed group info with tool counts |
| `/models` | GET | Available LLM models |
| `/mcp` | POST | MCP JSON-RPC (tools/list, tools/call) |

## Consequences

### Positive
- AI sees only relevant tools (20-50 instead of 300+), improving tool selection accuracy
- Unused backends don't start, saving memory and CPU
- `guidance` tool provides structured discoverability
- Groups can be mixed and matched per deployment
- New backends/groups can be added without touching existing code

### Negative
- Some tools appear in multiple potential groups (e.g., swarmdo `hooks_*` in both intelligence and devtools) — resolved by prefix matching
- Group boundaries are somewhat arbitrary for the swarmdo "Uncategorized" tools

### Mitigations
- `guidance` tool helps AI navigate regardless of how tools are grouped
- `/groups` endpoint lets operators inspect what's actually active

## Related

- [ADR-029: HuggingFace Chat UI Cloud Run](ADR-029-HUGGINGFACE-CHAT-UI-CLOUD-RUN.md)
- [ADR-032: RVF Private MCP Tunnel](ADR-032-RVF-PRIVATE-MCP-TUNNEL.md)
