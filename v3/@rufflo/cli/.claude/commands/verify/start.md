# 🔍 Verification Commands

Truth verification system for ensuring code quality and correctness with a 0.95 accuracy threshold.

## Overview

The verification system provides real-time truth checking and validation for all agent tasks, ensuring high-quality outputs and automatic rollback on failures.

## Subcommands

### `verify check`
Run verification checks on current code or agent outputs.

```bash
rufflo verify check --file src/app.js
rufflo verify check --task "task-123"
rufflo verify check --threshold 0.98
```

### `verify rollback`
Automatically rollback changes that fail verification.

```bash
rufflo verify rollback --to-commit abc123
rufflo verify rollback --last-good
rufflo verify rollback --interactive
```

### `verify report`
Generate verification reports and metrics.

```bash
rufflo verify report --format json
rufflo verify report --export metrics.html
rufflo verify report --period 7d
```

### `verify dashboard`
Launch interactive verification dashboard.

```bash
rufflo verify dashboard
rufflo verify dashboard --port 3000
rufflo verify dashboard --export
```

## Configuration

Default threshold: **0.95** (95% accuracy required)

Configure in `.rufflo/config.json`:
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
rufflo swarm --verify --threshold 0.98
rufflo hive-mind --verify
```

### With Training Pipeline
```bash
rufflo train --verify --rollback-on-fail
```

### With Pair Programming
```bash
rufflo pair --verify --real-time
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
rufflo verify check

# Verify with custom threshold
rufflo verify check --threshold 0.99

# Verify and auto-fix
rufflo verify check --auto-fix
```

### Advanced Workflows
```bash
# Continuous verification during development
rufflo verify watch --directory src/

# Batch verification
rufflo verify batch --files "*.js" --parallel

# Integration testing
rufflo verify integration --test-suite full
```

## Performance

- Verification latency: <100ms for most checks
- Rollback time: <1s for git-based rollback
- Dashboard refresh: Real-time via WebSocket

## Related Commands

- `truth` - View truth scores and metrics
- `pair` - Collaborative development with verification
- `train` - Training with verification feedback