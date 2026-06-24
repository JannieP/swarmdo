# task-orchestrate

Orchestrate complex tasks across the swarm.

## Usage
```bash
npx rufflo task orchestrate [options]
```

## Options
- `--task <description>` - Task description
- `--strategy <type>` - Orchestration strategy
- `--priority <level>` - Task priority (low, medium, high, critical)

## Examples
```bash
# Orchestrate development task
npx rufflo task orchestrate --task "Implement user authentication"

# High priority task
npx rufflo task orchestrate --task "Fix production bug" --priority critical

# With specific strategy
npx rufflo task orchestrate --task "Refactor codebase" --strategy parallel
```
