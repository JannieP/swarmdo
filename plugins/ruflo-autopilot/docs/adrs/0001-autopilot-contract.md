---
id: ADR-0001
title: rufflo-autopilot plugin contract — pinning, namespace coordination, /loop integration, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, autopilot, loop, learning, mcp, smoke-test]
---

## Context

`rufflo-autopilot` wraps the 10 `autopilot_*` MCP tools at `v3/@rufflo/cli/src/mcp-tools/autopilot-tools.ts:27, 49, 65, 79, 107, 124, 141, 168, 186, 212` (`status`, `enable`, `disable`, `config`, `reset`, `log`, `progress`, `learn`, `history`, `predict`). Plugin is at v0.1.0 with two skills + two commands, integrates with Claude Code's native `/loop` + `ScheduleWakeup` (270s default to keep the prompt cache warm).

Surface count is correct (the plugin claims "10 autopilot MCP tools" and the source confirms 10). What's missing is the contract pattern every other plugin updated this session has adopted.

## Decision

1. Add this ADR (Proposed).
2. README augment with Compatibility (pin v3.6), Namespace coordination (defers to rufflo-agentdb ADR-0001 §"Namespace convention"; claims `autopilot-patterns` as the owned namespace), Verification + Architecture Decisions sections. Cross-reference to Claude Code's `/loop` skill semantics.
3. Bump `0.1.0 → 0.2.0`. Keywords add `prediction`, `progress-tracking`, `cache-aware`, `mcp`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; all 10 `autopilot_*` tools referenced; both skills present with valid frontmatter; both commands present (`/autopilot`, `/autopilot-status`); README pins to v3.6; namespace coordination block; ScheduleWakeup 270s cache-aware note retained; ADR Proposed; no wildcard tools; agent file references `autopilot-patterns`.

## Consequences

**Positive:** plugin joins the cadence. The cache-aware 270s ScheduleWakeup pattern is now contractually documented (every other plugin's loop guidance can reference it).

**Negative:** none material — plugin behavior unchanged.

**Neutral:** no new MCP tools, no new skills. Documentation + smoke.

## Verification

```bash
bash plugins/rufflo-autopilot/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/rufflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md`
- `plugins/rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/rufflo-browser/docs/adrs/0001-browser-skills-architecture.md`
- `plugins/rufflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md`
- `plugins/rufflo-adr/docs/adrs/0001-adr-plugin-pattern.md`
- `plugins/rufflo-aidefence/docs/adrs/0001-aidefence-contract.md` — 3-gate pattern
- `v3/@rufflo/cli/src/mcp-tools/autopilot-tools.ts` — 10 `autopilot_*` tool definitions

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/rufflo-autopilot/`. Contract elements implemented: 10 `autopilot_*` MCP tools covered; namespace `autopilot-patterns` claimed per ADR-097 convention; `/loop` + `ScheduleWakeup` 270s cache-warm heartbeat documented; smoke-as-contract gate defined in `scripts/smoke.sh`.
