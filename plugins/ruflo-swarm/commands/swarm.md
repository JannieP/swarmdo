---
name: swarm
description: Initialize, monitor, and manage multi-agent swarms
---
$ARGUMENTS

Swarm lifecycle management.

**Init**: `npx @rufflo/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized`
**Status**: `npx @rufflo/cli@latest swarm status`
**Health**: `npx @rufflo/cli@latest swarm health`
**Shutdown**: `npx @rufflo/cli@latest swarm shutdown`

Parse $ARGUMENTS to determine the subcommand. If no arguments, show swarm status.

After init, spawn agents via Claude Code's Task tool with `run_in_background: true` for parallel execution.
