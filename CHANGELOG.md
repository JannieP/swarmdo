# Changelog

All notable changes to swarmdo are documented here.

## 1.0.0

First release under the swarmdo name. The project is a renamed, self-contained
derivative of an MIT-licensed upstream — see NOTICE and LICENSE for
attribution. Highlights of this release:

- Fully self-contained dependency tree: every upstream engine (vector, LLM,
  swarm MCP server, pathfinder, AgentDB, agentic-flow, the Postgres vector
  extension) is vendored in-repo under swarmdo naming and file:-linked.
- `swarmdo` CLI (26 commands), `@swarmdo/*` workspace, `swarmvector` Postgres
  extension (pgrx; verified against PostgreSQL 16).
- User-selectable statusline segments (SWARMDO_STATUSLINE env or
  .swarmdo/statusline.json; presets full/compact/minimal).
- History predating the rename is available in the git log.
