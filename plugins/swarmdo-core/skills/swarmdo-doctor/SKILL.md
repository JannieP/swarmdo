---
name: swarmdo-doctor
description: Run health checks on the Swarmdo installation and fix common issues
argument-hint: "[--fix]"
allowed-tools: Bash(npx *)
---
Run `npx @swarmdo/cli@latest doctor --fix` to diagnose and auto-repair common issues.

Checks: Node.js 20+, npm 9+, git, config validity, daemon status, memory database, API keys, MCP servers, disk space, TypeScript.

Targeted fixes:
- Memory: `npx @swarmdo/cli@latest memory init --force`
- Daemon: `npx @swarmdo/cli@latest daemon start`
- Config: `npx @swarmdo/cli@latest config reset`
