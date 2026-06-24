---
name: init-project
description: Initialize a new Rufflo project with MCP tools, hooks, and agent configuration
argument-hint: "[--preset standard|minimal|full]"
allowed-tools: Bash(npx *) Read Write Edit
---
Run `npx @rufflo/cli@latest init --wizard` to set up the project interactively, or `npx @rufflo/cli@latest init --preset standard` for defaults.

This creates CLAUDE.md, .claude/settings.json, and .rufflo/ config with MCP server registration for the `rufflo` MCP tools.
