# memory-search

Search through stored memory.

## Usage
```bash
npx rufflo memory search [options]
```

## Options
- `--query <text>` - Search query
- `--pattern <regex>` - Pattern matching
- `--limit <n>` - Result limit

## Examples
```bash
# Search memory
npx rufflo memory search --query "authentication"

# Pattern search
npx rufflo memory search --pattern "api-.*"

# Limited results
npx rufflo memory search --query "config" --limit 10
```
