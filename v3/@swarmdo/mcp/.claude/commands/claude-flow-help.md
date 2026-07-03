---
name: swarmdo-help
description: Show Swarmdo commands and usage
---

# Swarmdo Commands

## 🌊 Swarmdo: Agent Orchestration Platform

Swarmdo is the ultimate multi-terminal orchestration platform that revolutionizes how you work with Claude Code.

## Core Commands

### 🚀 System Management
- `./swarmdo start` - Start orchestration system
- `./swarmdo start --ui` - Start with interactive process management UI
- `./swarmdo status` - Check system status
- `./swarmdo monitor` - Real-time monitoring
- `./swarmdo stop` - Stop orchestration

### 🤖 Agent Management
- `./swarmdo agent spawn <type>` - Create new agent
- `./swarmdo agent list` - List active agents
- `./swarmdo agent info <id>` - Agent details
- `./swarmdo agent terminate <id>` - Stop agent

### 📋 Task Management
- `./swarmdo task create <type> "description"` - Create task
- `./swarmdo task list` - List all tasks
- `./swarmdo task status <id>` - Task status
- `./swarmdo task cancel <id>` - Cancel task
- `./swarmdo task workflow <file>` - Execute workflow

### 🧠 Memory Operations
- `./swarmdo memory store "key" "value"` - Store data
- `./swarmdo memory query "search"` - Search memory
- `./swarmdo memory stats` - Memory statistics
- `./swarmdo memory export <file>` - Export memory
- `./swarmdo memory import <file>` - Import memory

### ⚡ SPARC Development
- `./swarmdo sparc "task"` - Run SPARC orchestrator
- `./swarmdo sparc modes` - List all 17+ SPARC modes
- `./swarmdo sparc run <mode> "task"` - Run specific mode
- `./swarmdo sparc tdd "feature"` - TDD workflow
- `./swarmdo sparc info <mode>` - Mode details

### 🐝 Swarm Coordination
- `./swarmdo swarm "task" --strategy <type>` - Start swarm
- `./swarmdo swarm "task" --background` - Long-running swarm
- `./swarmdo swarm "task" --monitor` - With monitoring
- `./swarmdo swarm "task" --ui` - Interactive UI
- `./swarmdo swarm "task" --distributed` - Distributed coordination

### 🌍 MCP Integration
- `./swarmdo mcp status` - MCP server status
- `./swarmdo mcp tools` - List available tools
- `./swarmdo mcp config` - Show configuration
- `./swarmdo mcp logs` - View MCP logs

### 🤖 Claude Integration
- `./swarmdo claude spawn "task"` - Spawn Claude with enhanced guidance
- `./swarmdo claude batch <file>` - Execute workflow configuration

## 🌟 Quick Examples

### Initialize with SPARC:
```bash
npx -y swarmdo@latest init --sparc
```

### Start a development swarm:
```bash
./swarmdo swarm "Build REST API" --strategy development --monitor --review
```

### Run TDD workflow:
```bash
./swarmdo sparc tdd "user authentication"
```

### Store project context:
```bash
./swarmdo memory store "project_requirements" "e-commerce platform specs" --namespace project
```

### Spawn specialized agents:
```bash
./swarmdo agent spawn researcher --name "Senior Researcher" --priority 8
./swarmdo agent spawn developer --name "Lead Developer" --priority 9
```

## 🎯 Best Practices
- Use `./swarmdo` instead of `npx swarmdo` after initialization
- Store important context in memory for cross-session persistence
- Use swarm mode for complex tasks requiring multiple agents
- Enable monitoring for real-time progress tracking
- Use background mode for tasks > 30 minutes

## 📚 Resources
- Documentation: the upstream project (see NOTICE)
- Examples: the upstream project (see NOTICE)
- Issues: the upstream project (see NOTICE)
