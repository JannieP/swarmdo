---
id: ADR-0001
title: swarmdo-daa plugin contract — pinning, namespace coordination, intelligence-pipeline alignment, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, daa, cognitive, adaptive, knowledge-sharing, namespace, smoke-test]
---

## Context

`swarmdo-daa` (v0.1.0) wraps 8 `daa_*` MCP tools at `v3/@swarmdo/cli/src/mcp-tools/daa-tools.ts:90, 161, 223, 271, 322, 388, 444, 512`:

| Tool | Purpose |
|------|---------|
| `daa_agent_create` | Initialize an adaptive agent |
| `daa_agent_adapt` | Trigger manual adaptation from feedback |
| `daa_workflow_create` | Define a cognitive workflow |
| `daa_workflow_execute` | Run a cognitive workflow |
| `daa_knowledge_share` | Propagate learnings across agents |
| `daa_learning_status` | Adaptation progress metrics |
| `daa_cognitive_pattern` | Define a reasoning pattern |
| `daa_performance_metrics` | Efficiency / accuracy stats |

All 8 are correctly referenced across the agent + 2 skills + 1 command. What's missing is the standard contract.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6), Namespace coordination (claims `daa-patterns`; defers to swarmdo-agentdb ADR-0001), 8-tool surface table, intelligence-pipeline alignment note (DAA cognitive patterns feed the JUDGE phase per swarmdo-intelligence ADR-0001), Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `cognitive-patterns`, `workflows`, `mcp`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; all 8 daa_* tools referenced; both skills + 1 command + 1 agent present with valid frontmatter; v3.6 pin; namespace coordination; intelligence-pipeline cross-reference; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. DAA cognitive patterns now have an explicit cross-link to the 4-step intelligence pipeline.

**Negative:** none material — plugin behavior unchanged.

## Verification

```bash
bash plugins/swarmdo-daa/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/swarmdo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md` — 4-step pipeline DAA feeds
- `plugins/swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md`
- `v3/@swarmdo/cli/src/mcp-tools/daa-tools.ts` — 8 daa_* tools

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/swarmdo-daa/`. Contract elements implemented: 8 `daa_*` MCP tools covered; namespace `daa-patterns` claimed per convention; intelligence-pipeline alignment (feeds cognitive patterns into RETRIEVE/JUDGE/DISTILL/CONSOLIDATE steps) documented; smoke-as-contract gate defined in `scripts/smoke.sh`.
