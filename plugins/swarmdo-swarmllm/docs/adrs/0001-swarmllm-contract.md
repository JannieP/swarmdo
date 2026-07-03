---
id: ADR-0001
title: swarmdo-swarmllm plugin contract — pinning, namespace coordination, MicroLoRA + SONA cross-references, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, swarmllm, microlora, sona, llm, namespace, smoke-test]
---

## Context

`swarmdo-swarmllm` (v0.1.0) — local LLM inference + MicroLoRA fine-tuning + chat formatting. 1 agent (`llm-specialist`), 2 skills (`llm-config`, `chat-format`), 1 command (`/swarmllm`).

Wraps `swarmllm_*` MCP family — same family that exposes the SONA + MicroLoRA tools `swarmdo-intelligence` ADR-0001 already documents (`swarmllm_sona_create`, `swarmllm_sona_adapt`, `swarmllm_microlora_create`, `swarmllm_microlora_adapt` per `v3/@swarmdo/cli/src/mcp-tools/swarmllm-tools.ts:142, 169, 192, 222`). The HNSW WASM router (`swarmllm_hnsw_create/_add/_route`) is documented in `swarmdo-agentdb` ADR-0001 §"Tool inventory".

This plugin is the canonical owner of the LLM-config + chat-format slice of the `swarmllm_*` surface; SONA + MicroLoRA + HNSW each have other canonical homes.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Namespace coordination (claims `swarmllm-config`); Cross-reference table — SONA tools owned by swarmdo-intelligence ADR-0001, MicroLoRA tools shared with swarmdo-intelligence (DISTILL/CONSOLIDATE phase), HNSW WASM router owned by swarmdo-agentdb ADR-0001; Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `local-inference`, `chat-templates`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; both skills + agent + command with valid frontmatter; SONA cross-reference (swarmdo-intelligence); MicroLoRA cross-reference (swarmdo-intelligence DISTILL phase); HNSW cross-reference (swarmdo-agentdb); v3.6 pin; namespace coordination; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. Cross-plugin shared-tool ownership is now contractually documented (SONA → intelligence, MicroLoRA → intelligence DISTILL, HNSW WASM → agentdb).

**Negative:** none material.

## Verification

```bash
bash plugins/swarmdo-swarmllm/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/swarmdo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md` — owns SONA + MicroLoRA in the 4-step pipeline
- `plugins/swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md` — owns HNSW WASM router (`swarmllm_hnsw_*`) + namespace convention
- `plugins/swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md` — sibling substrate plugin
- `v3/@swarmdo/cli/src/mcp-tools/swarmllm-tools.ts` — 4 SONA + MicroLoRA tools at lines 142, 169, 192, 222

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/swarmdo-swarmllm/`. Contract elements implemented: LLM-config + chat-format slice owned; SONA/MicroLoRA ownership deferred to swarmdo-intelligence; HNSW WASM router ownership deferred to swarmdo-agentdb; namespace `swarmllm-configs` claimed; smoke-as-contract gate defined in `scripts/smoke.sh`.
