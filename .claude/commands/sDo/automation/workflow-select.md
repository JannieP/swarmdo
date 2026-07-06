# workflow-select

Automatically select optimal workflow based on task type.

## Usage
```bash
npx swarmdo automation workflow-select [options]
```

## Options
- `--task <description>` - Task description
- `--constraints <list>` - Workflow constraints
- `--preview` - Preview without executing

## Examples
```bash
# Select workflow for task
npx swarmdo automation workflow-select --task "Deploy to production"

# With constraints
npx swarmdo automation workflow-select --constraints "no-downtime,rollback"

# Preview mode
npx swarmdo automation workflow-select --task "Database migration" --preview
```
