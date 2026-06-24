# memory-persist

Persist memory across sessions.

## Usage
```bash
npx rufflo memory persist [options]
```

## Options
- `--export <file>` - Export to file
- `--import <file>` - Import from file
- `--compress` - Compress memory data

## Examples
```bash
# Export memory
npx rufflo memory persist --export memory-backup.json

# Import memory
npx rufflo memory persist --import memory-backup.json

# Compressed export
npx rufflo memory persist --export memory.gz --compress
```
