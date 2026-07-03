# agent-metrics

View agent performance metrics.

## Usage
```bash
npx swarmdo agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx swarmdo agent metrics

# Specific agent
npx swarmdo agent metrics --agent-id agent-001

# Last hour
npx swarmdo agent metrics --period 1h
```
