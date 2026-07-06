# swarm

Main swarm orchestration command for Swarmdo.

## Usage
```bash
npx swarmdo swarm <objective> [options]
```

## Options
- `--strategy <type>` - Execution strategy (research, development, analysis, testing)
- `--mode <type>` - Coordination mode (centralized, distributed, hierarchical, mesh)
- `--max-agents <n>` - Maximum number of agents (default: 5)
- `--claude` - Open Claude Code CLI with swarm prompt
- `--parallel` - Enable parallel execution

## Examples
```bash
# Basic swarm
npx swarmdo swarm "Build REST API"

# With strategy
npx swarmdo swarm "Research AI patterns" --strategy research

# Open in Claude Code
npx swarmdo swarm "Build API" --claude
```
