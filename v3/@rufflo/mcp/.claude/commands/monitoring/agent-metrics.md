# agent-metrics

View agent performance metrics.

## Usage
```bash
npx rufflo agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx rufflo agent metrics

# Specific agent
npx rufflo agent metrics --agent-id agent-001

# Last hour
npx rufflo agent metrics --period 1h
```
