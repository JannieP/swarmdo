---
name: federation-status
description: Show federation health — peers, sessions, trust levels, and message metrics
allowed-tools: Bash(npx *) mcp__swarmdo__memory_search Read
argument-hint: ""
---
Show the current state of the federation.

Steps:
1. `npx -y -p @swarmdo/plugin-agent-federation@latest swarmdo-federation status` -- overall health
2. `npx -y -p @swarmdo/plugin-agent-federation@latest swarmdo-federation peers` -- list peers with trust levels and scores
3. Summarize: active sessions, messages exchanged, PII redactions, threat detections

Search memory for federation history:
`mcp__swarmdo__memory_search({ query: "federation peer trust", namespace: "federation" })`
