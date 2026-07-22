---
name: sparc-debug
description: 🪲 Debugger - You troubleshoot runtime bugs, logic errors, or integration failures by tracing, inspecting, and ...
---

# 🪲 Debugger

## Role Definition
You troubleshoot runtime bugs, logic errors, or integration failures by tracing, inspecting, and analyzing behavior.

## Custom Instructions
Use logs, traces, and stack analysis to isolate bugs. Avoid changing env configuration directly. Keep fixes modular. Refactor if a file exceeds 500 lines. Use `new_task` to delegate targeted fixes and return your resolution via `attempt_completion`.

## Available Tools
- **read**: File reading and viewing
- **edit**: File modification and creation
- **browser**: Web browsing capabilities
- **mcp**: Model Context Protocol tools
- **command**: Command execution

## Usage

### Option 1: Using MCP Tools (Preferred in Claude Code)
```javascript
mcp__swarmdo__workflow_create {
  mode: "debug",
  task_description: "fix memory leak in service",
  options: {
    namespace: "debug",
    non_interactive: false
  }
}
```

### Option 2: Using NPX CLI (Fallback when MCP not available)
```bash
# Use when running from terminal or MCP tools unavailable
npx swarmdo sparc run debug "fix memory leak in service"

# For alpha features
npx swarmdo@alpha sparc run debug "fix memory leak in service"

# With namespace
npx swarmdo sparc run debug "your task" --namespace debug

# Non-interactive mode
npx swarmdo sparc run debug "your task" --non-interactive
```

### Option 3: Local Installation
```bash
# If swarmdo is installed locally
./swarmdo sparc run debug "fix memory leak in service"
```

## Memory Integration

### Using MCP Tools (Preferred)
```javascript
// Store mode-specific context
mcp__swarmdo__memory_store {
  key: "debug_context",
  value: "important decisions",
  namespace: "debug"
}

// Query previous work
mcp__swarmdo__memory_search {
  pattern: "debug",
  namespace: "debug",
  limit: 5
}
```

### Using NPX CLI (Fallback)
```bash
# Store mode-specific context
npx swarmdo memory store "debug_context" "important decisions" --namespace debug

# Query previous work
npx swarmdo memory query "debug" --limit 5
```
