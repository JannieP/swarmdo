---
name: doc-gen
description: Generate and maintain documentation with drift detection
argument-hint: "[--target PATH]"
allowed-tools: Bash(npx *) mcp__rufflo__hooks_worker-dispatch mcp__rufflo__memory_store CronCreate Read Write
---
Generate docs via MCP worker dispatch:
`mcp__rufflo__hooks_worker-dispatch({ trigger: "document" })`

For continuous doc maintenance via CronCreate:
`CronCreate({ schedule: "0 */2 * * *", prompt: "Run document worker" })`

Detect drift by comparing current code against existing docs and flagging inconsistencies.

Scoped generation:
- API docs: `npx @rufflo/cli@latest hooks worker dispatch --trigger document --scope api`
- Full project: `npx @rufflo/cli@latest hooks worker dispatch --trigger document --scope full`

Store the approach: `mcp__rufflo__memory_store({ key: "doc-pattern", value: "APPROACH", namespace: "patterns" })`
