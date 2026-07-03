# swarm-monitor

Real-time swarm monitoring.

## Usage
```bash
npx swarmdo swarm monitor [options]
```

## Options
- `--interval <ms>` - Update interval
- `--metrics` - Show detailed metrics
- `--export` - Export monitoring data

## Examples
```bash
# Start monitoring
npx swarmdo swarm monitor

# Custom interval
npx swarmdo swarm monitor --interval 5000

# With metrics
npx swarmdo swarm monitor --metrics
```
