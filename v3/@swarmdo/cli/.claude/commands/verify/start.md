# 🔍 Verification Commands

Truth verification system for ensuring code quality and correctness with a 0.95 accuracy threshold.

## Overview

The verification system provides real-time truth checking and validation for all agent tasks, ensuring high-quality outputs and automatic rollback on failures.

## Subcommands

### `verify check`
Run verification checks on current code or agent outputs.

```bash
swarmdo verify check --file src/app.js
swarmdo verify check --task "task-123"
swarmdo verify check --threshold 0.98
```

### `verify rollback`
Automatically rollback changes that fail verification.

```bash
swarmdo verify rollback --to-commit abc123
swarmdo verify rollback --last-good
swarmdo verify rollback --interactive
```

### `verify report`
Generate verification reports and metrics.

```bash
swarmdo verify report --format json
swarmdo verify report --export metrics.html
swarmdo verify report --period 7d
```

### `verify dashboard`
Launch interactive verification dashboard.

```bash
swarmdo verify dashboard
swarmdo verify dashboard --port 3000
swarmdo verify dashboard --export
```

## Configuration

Default threshold: **0.95** (95% accuracy required)

Configure in `.swarmdo/config.json`:
```json
{
  "verification": {
    "threshold": 0.95,
    "autoRollback": true,
    "gitIntegration": true,
    "hooks": {
      "preCommit": true,
      "preTask": true,
      "postEdit": true
    }
  }
}
```

## Integration

### With Swarm Commands
```bash
swarmdo swarm --verify --threshold 0.98
swarmdo hive-mind --verify
```

### With Training Pipeline
```bash
swarmdo train --verify --rollback-on-fail
```

### With Pair Programming
```bash
swarmdo pair --verify --real-time
```

## Metrics

- **Truth Score**: 0.0 to 1.0 (higher is better)
- **Confidence Level**: Statistical confidence in verification
- **Rollback Rate**: Percentage of changes rolled back
- **Quality Improvement**: Trend over time

## Examples

### Basic Verification
```bash
# Verify current directory
swarmdo verify check

# Verify with custom threshold
swarmdo verify check --threshold 0.99

# Verify and auto-fix
swarmdo verify check --auto-fix
```

### Advanced Workflows
```bash
# Continuous verification during development
swarmdo verify watch --directory src/

# Batch verification
swarmdo verify batch --files "*.js" --parallel

# Integration testing
swarmdo verify integration --test-suite full
```

## Performance

- Verification latency: <100ms for most checks
- Rollback time: <1s for git-based rollback
- Dashboard refresh: Real-time via WebSocket

## Related Commands

- `truth` - View truth scores and metrics
- `pair` - Collaborative development with verification
- `train` - Training with verification feedback