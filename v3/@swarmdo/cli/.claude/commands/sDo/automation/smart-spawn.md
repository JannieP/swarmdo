# smart-spawn

Intelligently spawn agents based on workload analysis.

## Usage
```bash
npx swarmdo automation smart-spawn [options]
```

## Options
- `--analyze` - Analyze before spawning
- `--threshold <n>` - Spawn threshold
- `--topology <type>` - Preferred topology

## Examples
```bash
# Smart spawn with analysis
npx swarmdo automation smart-spawn --analyze

# Set spawn threshold
npx swarmdo automation smart-spawn --threshold 5

# Force topology
npx swarmdo automation smart-spawn --topology hierarchical
```
