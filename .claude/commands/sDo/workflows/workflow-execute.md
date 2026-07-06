# workflow-execute

Execute saved workflows.

## Usage
```bash
npx swarmdo workflow execute [options]
```

## Options
- `--name <name>` - Workflow name
- `--params <json>` - Workflow parameters
- `--dry-run` - Preview execution

## Examples
```bash
# Execute workflow
npx swarmdo workflow execute --name "deploy-api"

# With parameters
npx swarmdo workflow execute --name "test-suite" --params '{"env": "staging"}'

# Dry run
npx swarmdo workflow execute --name "deploy-api" --dry-run
```
