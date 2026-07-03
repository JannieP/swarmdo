---
id: ADR-0001
title: swarmdo-rvf plugin contract — pinning, namespace coordination, RVF cross-references (browser sessions, swarmvector containers), smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, rvf, session-persistence, portable-memory, namespace, smoke-test]
---

## Context

`swarmdo-rvf` (v0.2.0) — RVF format for portable agent memory + session persistence + cross-platform transfer. 1 agent + 2 skills (`rvf-manage`, `session-persist`) + 1 command.

RVF (SwarmVector Format) cognitive containers are referenced in two sibling ADRs as the substrate for portable session/memory state:

- [swarmdo-browser ADR-0001](../../swarmdo-browser/docs/adrs/0001-browser-skills-architecture.md) — every browser session is allocated as an RVF container at session-start (manifest, trajectory, screenshots, snapshots, cookies, findings)
- [swarmdo-swarmvector ADR-0001](../../swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md) — `swarmvector rvf create|ingest|query|status|segments|derive|compact|export|examples|download` (10 RVF subcommands)

This plugin is the **canonical owner of the portable-memory + session-persistence slice** of the RVF surface. browser uses it for sessions; swarmvector exposes the lower-level RVF tooling.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Cross-plugin RVF ownership table — browser sessions consume RVF, swarmvector exposes the tooling, this plugin owns portable-memory + session-persistence; Namespace coordination (claims `rvf-sessions`); Verification + Architecture Decisions sections.
3. Plugin metadata stays at `0.2.0` (already at the cadence). Keywords add `mcp`, `cognitive-containers`, `lineage-tracking`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; both skills + agent + command with valid frontmatter; v3.6 pin; namespace coordination; RVF cross-references (swarmdo-browser sessions + swarmdo-swarmvector RVF tooling); ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The cross-plugin RVF-ownership story is now contractually documented.

**Negative:** none material.

## Verification

```bash
bash plugins/swarmdo-rvf/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/swarmdo-browser/docs/adrs/0001-browser-skills-architecture.md` — browser sessions as RVF containers
- `plugins/swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md` — RVF tooling (`swarmvector rvf *`)
- `plugins/swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/swarmdo-rvf/`. Contract elements implemented: canonical portable-memory + session-persistence slice documented; RVF container lifecycle (browser sessions + swarmvector containers) cross-referenced; namespace `rvf-sessions` claimed; smoke-as-contract gate defined in `scripts/smoke.sh`.
