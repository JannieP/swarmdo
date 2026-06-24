---
name: rufflo-help
description: Show Rufflo commands and usage
---

# Rufflo Commands

## 🌊 Rufflo: Agent Orchestration Platform

Rufflo is the ultimate multi-terminal orchestration platform that revolutionizes how you work with Claude Code.

## Core Commands

### 🚀 System Management
- `./rufflo start` - Start orchestration system
- `./rufflo start --ui` - Start with interactive process management UI
- `./rufflo status` - Check system status
- `./rufflo monitor` - Real-time monitoring
- `./rufflo stop` - Stop orchestration

### 🤖 Agent Management
- `./rufflo agent spawn <type>` - Create new agent
- `./rufflo agent list` - List active agents
- `./rufflo agent info <id>` - Agent details
- `./rufflo agent terminate <id>` - Stop agent

### 📋 Task Management
- `./rufflo task create <type> "description"` - Create task
- `./rufflo task list` - List all tasks
- `./rufflo task status <id>` - Task status
- `./rufflo task cancel <id>` - Cancel task
- `./rufflo task workflow <file>` - Execute workflow

### 🧠 Memory Operations
- `./rufflo memory store "key" "value"` - Store data
- `./rufflo memory query "search"` - Search memory
- `./rufflo memory stats` - Memory statistics
- `./rufflo memory export <file>` - Export memory
- `./rufflo memory import <file>` - Import memory

### ⚡ SPARC Development
- `./rufflo sparc "task"` - Run SPARC orchestrator
- `./rufflo sparc modes` - List all 17+ SPARC modes
- `./rufflo sparc run <mode> "task"` - Run specific mode
- `./rufflo sparc tdd "feature"` - TDD workflow
- `./rufflo sparc info <mode>` - Mode details

### 🐝 Swarm Coordination
- `./rufflo swarm "task" --strategy <type>` - Start swarm
- `./rufflo swarm "task" --background` - Long-running swarm
- `./rufflo swarm "task" --monitor` - With monitoring
- `./rufflo swarm "task" --ui` - Interactive UI
- `./rufflo swarm "task" --distributed` - Distributed coordination

### 🌍 MCP Integration
- `./rufflo mcp status` - MCP server status
- `./rufflo mcp tools` - List available tools
- `./rufflo mcp config` - Show configuration
- `./rufflo mcp logs` - View MCP logs

### 🤖 Claude Integration
- `./rufflo claude spawn "task"` - Spawn Claude with enhanced guidance
- `./rufflo claude batch <file>` - Execute workflow configuration

## 🌟 Quick Examples

### Initialize with SPARC:
```bash
npx -y rufflo@latest init --sparc
```

### Start a development swarm:
```bash
./rufflo swarm "Build REST API" --strategy development --monitor --review
```

### Run TDD workflow:
```bash
./rufflo sparc tdd "user authentication"
```

### Store project context:
```bash
./rufflo memory store "project_requirements" "e-commerce platform specs" --namespace project
```

### Spawn specialized agents:
```bash
./rufflo agent spawn researcher --name "Senior Researcher" --priority 8
./rufflo agent spawn developer --name "Lead Developer" --priority 9
```

## 🎯 Best Practices
- Use `./rufflo` instead of `npx rufflo` after initialization
- Store important context in memory for cross-session persistence
- Use swarm mode for complex tasks requiring multiple agents
- Enable monitoring for real-time progress tracking
- Use background mode for tasks > 30 minutes

## 📚 Resources
- Documentation: https://github.com/ruvnet/claude-code-flow/docs
- Examples: https://github.com/ruvnet/claude-code-flow/examples
- Issues: https://github.com/ruvnet/claude-code-flow/issues
