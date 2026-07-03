# workflow-create

Create reusable workflow templates.

## Usage
```bash
npx swarmdo workflow create [options]
```

## Options
- `--name <name>` - Workflow name
- `--from-history` - Create from history
- `--interactive` - Interactive creation

## Examples
```bash
# Create workflow
npx swarmdo workflow create --name "deploy-api"

# From history
npx swarmdo workflow create --name "test-suite" --from-history

# Interactive mode
npx swarmdo workflow create --interactive
```
