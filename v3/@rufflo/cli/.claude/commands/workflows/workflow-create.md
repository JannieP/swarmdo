# workflow-create

Create reusable workflow templates.

## Usage
```bash
npx rufflo workflow create [options]
```

## Options
- `--name <name>` - Workflow name
- `--from-history` - Create from history
- `--interactive` - Interactive creation

## Examples
```bash
# Create workflow
npx rufflo workflow create --name "deploy-api"

# From history
npx rufflo workflow create --name "test-suite" --from-history

# Interactive mode
npx rufflo workflow create --interactive
```
