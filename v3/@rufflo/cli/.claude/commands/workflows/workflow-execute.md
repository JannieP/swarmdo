# workflow-execute

Execute saved workflows.

## Usage
```bash
npx rufflo workflow execute [options]
```

## Options
- `--name <name>` - Workflow name
- `--params <json>` - Workflow parameters
- `--dry-run` - Preview execution

## Examples
```bash
# Execute workflow
npx rufflo workflow execute --name "deploy-api"

# With parameters
npx rufflo workflow execute --name "test-suite" --params '{"env": "staging"}'

# Dry run
npx rufflo workflow execute --name "deploy-api" --dry-run
```
