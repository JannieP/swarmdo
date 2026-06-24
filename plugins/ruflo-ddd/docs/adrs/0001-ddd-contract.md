---
id: ADR-0001
title: rufflo-ddd plugin contract — pinning, namespace coordination, ADR cross-link, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, ddd, bounded-context, aggregate, namespace, smoke-test]
---

## Context

`rufflo-ddd` (v0.1.1) is a code-scaffolding plugin (no MCP tools of its own). Surface:

- 1 agent (`domain-modeler`)
- 3 skills (`ddd-context`, `ddd-aggregate`, `ddd-validate`)
- 1 command (`/ddd`) with 6 subcommands (`context create|list`, `aggregate`, `event`, `validate`, `map`)
- `REFERENCE.md` (token-optimized per ADR-098 Part 2)

Stores the domain model as a navigable graph in AgentDB with hierarchical nodes + causal edges for context dependencies. Pairs naturally with `rufflo-adr` (domain decisions) and `rufflo-sparc` (Architecture phase).

Same gaps as the others: no plugin-level ADR, no smoke test, no Compatibility section, no namespace coordination cross-reference, version `0.1.1`.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6), Namespace coordination (claims `ddd-patterns`; defers to rufflo-agentdb ADR-0001), Verification + Architecture Decisions sections.
3. Bump `0.1.1 → 0.2.0`. Keywords add `acl`, `value-objects`, `repositories`, `mcp`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; all 3 skills + 1 agent + 1 command present with valid frontmatter; 6 subcommands documented; REFERENCE.md non-empty; v3.6 pin; namespace coordination; ADR Proposed; ddd-patterns namespace claimed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. Reference data centralization (REFERENCE.md) follows the ADR-098 Part 2 token-diet pattern.

**Negative:** none — plugin behavior unchanged.

## Verification

```bash
bash plugins/rufflo-ddd/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/rufflo-adr/docs/adrs/0001-adr-plugin-pattern.md` — REFERENCE.md token-diet precedent
- `plugins/rufflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md`

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/rufflo-ddd/`. Contract elements implemented: 3 skills (`ddd-context`, `ddd-aggregate`, `ddd-validate`) with AgentDB hierarchical storage for domain graph; namespace `ddd-contexts` claimed; SPARC Architecture-phase alignment cross-linked; smoke-as-contract gate defined in `scripts/smoke.sh`.
