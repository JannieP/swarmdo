# smart-spawn

Intelligently spawn agents based on workload analysis.

## Usage
```bash
npx rufflo automation smart-spawn [options]
```

## Options
- `--analyze` - Analyze before spawning
- `--threshold <n>` - Spawn threshold
- `--topology <type>` - Preferred topology

## Examples
```bash
# Smart spawn with analysis
npx rufflo automation smart-spawn --analyze

# Set spawn threshold
npx rufflo automation smart-spawn --threshold 5

# Force topology
npx rufflo automation smart-spawn --topology hierarchical
```
