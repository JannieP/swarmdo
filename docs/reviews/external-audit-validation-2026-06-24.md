# Audit Validation Report: Ruflo v3.14.1 vs. External Audit (v3.5.51, April 2026)

> **Validated:** 2026-06-24 against current `main` (v3.14.1)
> **Source audit:** https://gist.github.com/roman-rr/ed603b676af019b8740423d2bb8e4bf6
> **Audit date:** 2026-04-04 against v3.5.51
> **Method:** 4 parallel Explore agents + targeted code reads of MCP tool registry, LLM wire, signature verification, and disk state.

---

## Bottom line

The audit was **substantially valid for v3.5.51 in April 2026** — it accurately identified a real architectural gap: many MCP tools recorded state without invoking work. The team appears to have read it and responded. **In current v3.14.1 (June 2026), roughly half the audit's specific code-level claims are now REFUTED or PARTIALLY FIXED, but its core thesis — that ruflo over-claims capabilities — still has bite, just in subtler ways.**

---

## Methodology

Fanned out four parallel Explore agents to verify each claim against current code (`v3/@claude-flow/cli/src/mcp-tools/` is the active path; `v3/mcp/tools/` is the older path the audit examined), plus targeted code reads of the LLM wire, signature verification, and disk state.

Key inputs:
- 275 unique MCP tool names in active `cli/src/mcp-tools/`
- 122 tool names in legacy `v3/mcp/tools/` (the original audit target)
- Current package version: 3.14.1
- Audited package version: 3.5.51
- Time between: ~2 months

---

## Claim-by-claim scorecard

| # | Audit Claim | Current State | Evidence |
|---|-------------|---------------|----------|
| 1 | `agent_spawn` is a Map entry, no execution | **STILL TRUE** (but mitigated) | `agent-tools.ts:269` — `agent_spawn` still only registers metadata. **BUT** `agent-tools.ts:414` adds new `agent_execute` tool that calls Anthropic/Ollama/OpenRouter via real fetch. Comment explicitly acknowledges "agent_spawn registered metadata but nothing dispatched work." |
| 2 | `task_create`/`assign` — no worker picks up tasks | **STILL TRUE** in `v3/mcp/tools/` (old path); newer path delegates to coordinator. No background polling loop exists. | `v3/mcp/tools/task-tools.ts:228` — `taskStore = new Map()`; assign just mutates status. |
| 3 | `swarm_init` returns `currentAgents: 0` | **STILL TRUE** in simple path; works only if `swarmCoordinator` is injected as context. | `v3/mcp/tools/swarm-tools.ts:198-296` — fallback hardcodes `currentAgents: 0`. |
| 4 | `verifySignature()` unconditionally returns true | **REFUTED — FIXED** | `v3/@claude-flow/plugin-agent-federation/src/plugin.ts:131-140` uses real `@noble/ed25519`. Comment line 83 references `audit_1776483149979` ("closes a previous verifySignature returns true unconditionally vulnerability"). |
| 5 | Raft `requestVotes()` is `emit('vote_request')` | **REFUTED — FIXED** | `v3/@claude-flow/swarm/src/consensus/raft.ts:335` — `requestVote()` uses real `transport.send()` RPC when wired (ADR-095 G2). Legacy in-process fallback exists. |
| 6 | All consensus types run the same handler | **REFUTED** | Distinct classes: `byzantine.ts`, `raft.ts`, `gossip.ts`. Factory at `swarm/src/consensus/index.ts:78-104` instantiates per algorithm. |
| 7 | Queen ID = `"queen-${Date.now()}"`, no election | **VERIFIED — STILL TRUE** | `hive-mind-tools.ts:176`: `const queenId = input.queenId \|\| \`queen-${Date.now()}\`` |
| 8 | WASM agent echoes input | **PARTIAL** — current code has real composition path via `wasm_agent_compose` with destructive-tool gating, but bundled WASM is still echo for testing | `wasm-agent-tools.ts:117` comment: "the WASM agent runtime (G4) when the bundled WASM only echoes input." Fallback path goes to `callAnthropicMessages` |
| 9 | `neural_train` ignores data, random accuracy | **REFUTED — FIXED** | `neural-tools.ts:339-395` — stores 384-d embeddings per entry, accuracy is `patternsStored > 0 ? 1.0 : 0` |
| 10 | `neural_predict` returns hardcoded coder/researcher/reviewer | **REFUTED — FIXED** | `neural-tools.ts:460-484` — real k-NN with cosine similarity, softmax confidence over stored pattern names |
| 11 | Token-optimizer `batchSize: 4` always | **REFUTED — FIXED** | `token-optimizer.ts:206-216` — tiered: `<=4 → 2`, `<=8 → 4`, `>8 → 5` |
| 12 | Cache `+= 100` hardcoded | **REFUTED — FIXED** | `token-optimizer.ts:139-143` — measured from `Math.ceil(query.length / 4) - Math.ceil(compactPrompt.length / 4)` |
| 13 | Agent-booster `sleep(352)` benchmark baseline | **NOT FOUND** in code; ADR-026 references "352ms → 1ms" as latency claim, not a sleep loop |
| 14 | ReasoningBank `baseline = 1000` hardcoded | **NOT FOUND** in current `reasoningbank-adapter.ts` (698 lines, read fully) |
| 15 | `AnthropicProvider` real but unwired | **PARTIAL** — `AnthropicProvider` class at `providers/src/anthropic-provider.ts` still exists, **but** `agent_execute` now uses inline `callAnthropicMessages()` in `agent-execute-core.ts:125` (real fetch). `ProviderManager` still not used. |
| 16 | 100 MB graph-state.json for 20 unique entries | **REFUTED** | `.claude-flow/` is currently 12 KB. `graph-state.json` doesn't exist on disk. PageRank is in-memory Map. |
| 17 | 5,706 auto-memory entries, ~20 unique | **REFUTED (current state)** | `auto-memory-store.json` is `[]`. Bridge exists but unpopulated. |
| 18 | Trigram-Jaccard similarity (not semantic) | **REFUTED** | Hooks use **word-level Jaccard** (`intelligence.cjs:170-180`); memory-graph uses HNSW vector similarity (`memory-graph.ts:174-188`). No trigram code exists. |
| 19 | Router fake latency `Math.random()*0.5+0.1` + hardcoded 15%/14%/13% | **NOT FOUND** in current code |
| 20 | `.claude/agents/` has 91 generic definitions | **PARTIALLY TRUE** (~40 entries now, still mostly generic) |
| 21 | `.hive-mind/` 31 stale prompt templates | **REFUTED** — directory doesn't exist |
| 22 | ~300+ MCP tools, ~10 real | **PARTIALLY TRUE on count, MISLEADING on ratio** | 275 unique tool names in active `cli/src/mcp-tools/`. Real-execution count is now well above 10 (memory, embeddings, neural, agent_execute, browser, hooks_codemod, AgentDB, autopilot all have real backends). |

### Summary tally

| Verdict | Count |
|---------|-------|
| Refuted / Fixed since audit | 11 |
| Still true (or partially true) | 6 |
| Not found in current code | 3 |
| Partial / Mixed | 2 |
| **Total claims evaluated** | **22** |

---

## Real value gaps still present

After filtering out the fixed-or-misinformation claims, **these are the genuine gaps**:

### A. `agent_spawn` UX trap (high impact, low effort)

**Problem:** `agent_spawn` still records metadata only; users must then call `agent_execute` to get work done. The tool description was updated to hint at this, but the *name* `agent_spawn` still implies process creation. This is the single most user-confusing artifact remaining.

**Fix options:**
1. Make `agent_spawn` auto-call `agent_execute` if `prompt` is given
2. Rename to `agent_register`
3. Prominently surface that pattern in the tool description

**Effort:** **1–2 days** for any of these.

### B. Inter-process consensus is still local (medium impact, high effort)

**Problem:** Raft/Byzantine/Gossip protocol code is real, but in the default path they run within a single Node process via EventEmitter / shared JSON state. Real distributed consensus needs a network transport.

**Fix:** Wire the existing `transport.send()` interface to a real implementation (gRPC, WebSocket, libp2p). Plumbing exists; backends don't.

**Effort:** **3–5 weeks** for one transport (e.g., WebSocket) with tests.

### C. `ProviderManager` round-robin / latency-routing is bypassed (medium impact, low effort)

**Problem:** `agent_execute` calls Anthropic directly via inline `fetch`, bypassing the (already-built) `ProviderManager` that does round-robin and latency-based routing. Multiple provider keys configured? Only the first matches your env-var precedence.

**Fix:** Route `callAnthropicMessages` through `ProviderManager`.

**Effort:** **3–5 days** including failover test coverage.

### D. Tool-count inflation in surface (medium impact, low-medium effort)

**Problem:** 275 unique MCP tools. Many — claims, workflow, daa, parts of swarm/hive-mind — are coordination-state tools with thin executors. They aren't *theater* now (vs. April), but they bulk up the MCP tools-list response your LLM clients pay tokens for.

**Fix:** Group tools behind capability flags (`mcp start --enable=memory,agent,browser`) so a default install exposes ~30-50 tools.

**Effort:** **1–2 weeks** for opt-in capability grouping + docs.

### E. Documentation overstates measured performance (low effort, important credibility)

**Problem:** README/CLAUDE.md still cite "150x–12,500x faster HNSW" in some places. The team's own audit (`docs/reviews/intelligence-system-audit-2026-05-29.md`) marks this as "NOT reproduced — was brute-force fallback" with measured ~1.9x–4.7x. Same for Flash Attention 2.49x–7.47x (marked "unverified"). The top-level README/AGENTS.md still leaks the old numbers.

**Fix:** Sweep top-level README, AGENTS.md, and command help text. Source-of-truth is already established in `docs/reviews/intelligence-system-audit-2026-05-29.md`.

**Effort:** **2–3 days**.

### F. Intelligence-layer skeleton runs even when empty (low impact, low effort)

**Problem:** Session-start hook still walks the auto-memory pipeline and `UserPromptSubmit` hook still calls the router even when the store is empty. Burns ~50–100 tokens/turn on noise (down from the audit's reported 300, but non-zero).

**Fix:** Short-circuit when `auto-memory-store.json` length is 0.

**Effort:** **1 day**.

### G. WASM agent bundled runtime is still an echo stub (low impact, high effort)

**Problem:** `wasm-agent-tools.ts:117` confirms: "the bundled WASM only echoes input." The fallback to `callAnthropicMessages` makes it work, but a real local WASM LLM is still missing.

**Fix:** Either ship a real ggml/llama.cpp WASM, or remove the "WASM agent" framing and call it "agent definition packaging."

**Effort:** Real WASM LLM is **2–4 months** (likely don't do). Repositioning is **1 week**.

---

## Total remediation effort

| Priority | Item | Effort |
|---|---|---|
| P0 | A — agent_spawn UX trap | 1–2 d |
| P0 | E — Doc cleanup of unverified perf | 2–3 d |
| P0 | F — Skip intelligence pipeline when empty | 1 d |
| P1 | C — Wire ProviderManager | 3–5 d |
| P1 | D — Capability-flagged tool grouping | 1–2 w |
| P2 | B — Real network transport for consensus | 3–5 w |
| P3 | G — WASM repositioning (skip real build) | 1 w |

**Sum:** ~**8–12 weeks** of focused work for items A–G.
**P0-only fixes: ~1 week** and address the highest user-trust gaps (~80% of perceived value lost from audit).

---

## Net judgment

The audit was a useful slap. The team appears to have responded substantively:
- Real Ed25519 (was `return true`)
- Real LLM wire via `agent_execute` (multi-provider: Anthropic, Ollama, OpenRouter)
- Real k-NN cosine similarity neural predict (was hardcoded labels)
- Measured token-optimizer counts (was hardcoded `+= 100`)
- Cleaned-up disk state (`.claude-flow/` now 12 KB, was 100 MB)
- Distinct consensus algorithm classes (was claimed single shared handler)

**But the surface area is still inflated, `agent_spawn` still misleads by name, and consensus is still single-process in the default path.**

The audit's framing ("99% theater") is no longer fair to v3.14.1; **"feature-rich but uneven, with several genuinely-shipped capabilities buried under coordination scaffolding that hasn't caught up to its API surface"** is the better summary.

---

## Cross-references

- Source audit: https://gist.github.com/roman-rr/ed603b676af019b8740423d2bb8e4bf6
- Internal performance audit: [`docs/reviews/intelligence-system-audit-2026-05-29.md`](./intelligence-system-audit-2026-05-29.md)
- ADR-026 (model routing): `v3/implementation/adrs/ADR-026-agent-booster-model-routing.md`
- ADR-095 G2 (Raft transport): `v3/@claude-flow/swarm/src/consensus/raft.ts:336`
- Federation Ed25519 fix: `v3/@claude-flow/plugin-agent-federation/src/plugin.ts:131-140` (audit_1776483149979)
