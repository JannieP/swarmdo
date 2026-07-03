---
name: init-project
description: Initialize a new Swarmdo project with MCP tools, hooks, and agent configuration
argument-hint: "[--preset standard|minimal|full]"
allowed-tools: Bash(npx *) Read Write Edit
---
Run `npx @swarmdo/cli@latest init --wizard` to set up the project interactively, or `npx @swarmdo/cli@latest init --preset standard` for defaults.

This creates CLAUDE.md, .claude/settings.json, and .swarmdo/ config with MCP server registration for the `swarmdo` MCP tools.
