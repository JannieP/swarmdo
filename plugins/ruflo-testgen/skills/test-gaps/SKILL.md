---
name: test-gaps
description: Detect missing test coverage and generate test suggestions
argument-hint: "[--path PATH] [--limit N]"
allowed-tools: Bash(npx *) mcp__rufflo__hooks_worker-dispatch Read Grep
---
Find test coverage gaps via CLI:
```bash
npx @rufflo/cli@latest hooks coverage-gaps --format table --limit 20
npx @rufflo/cli@latest hooks coverage-route --task "add auth tests"
npx @rufflo/cli@latest hooks coverage-suggest --path src/
```

Or dispatch the testgaps worker via MCP:
`mcp__rufflo__hooks_worker-dispatch({ trigger: "testgaps" })`

For continuous detection, use `/loop` with the `loop-worker` skill targeting the `testgaps` worker.
