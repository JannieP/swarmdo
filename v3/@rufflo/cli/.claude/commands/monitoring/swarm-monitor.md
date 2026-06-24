# swarm-monitor

Real-time swarm monitoring.

## Usage
```bash
npx rufflo swarm monitor [options]
```

## Options
- `--interval <ms>` - Update interval
- `--metrics` - Show detailed metrics
- `--export` - Export monitoring data

## Examples
```bash
# Start monitoring
npx rufflo swarm monitor

# Custom interval
npx rufflo swarm monitor --interval 5000

# With metrics
npx rufflo swarm monitor --metrics
```
