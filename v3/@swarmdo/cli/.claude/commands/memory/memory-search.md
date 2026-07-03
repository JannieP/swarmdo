# memory-search

Search through stored memory.

## Usage
```bash
npx swarmdo memory search [options]
```

## Options
- `--query <text>` - Search query
- `--pattern <regex>` - Pattern matching
- `--limit <n>` - Result limit

## Examples
```bash
# Search memory
npx swarmdo memory search --query "authentication"

# Pattern search
npx swarmdo memory search --pattern "api-.*"

# Limited results
npx swarmdo memory search --query "config" --limit 10
```
