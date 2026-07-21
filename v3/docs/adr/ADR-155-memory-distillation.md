# ADR-155 — Memory Distillation (`swarmdo memory distill`)

- **Status:** Accepted (build in progress)
- **Date:** 2026-07-21
- **Supersedes / relates to:** [ADR-090 SmartRetrieval], the cross-encoder rerank added in v1.58.38, [tencent-agent-memory-eval] memory note
- **Issue:** follows the TencentDB-Agent-Memory evaluation (build-the-architecture-not-the-dependency)

## Context

Long coding sessions bloat context by carrying **raw transcript history** forward. TencentDB Agent Memory's measured −61% token win comes from a 4-tier distillation pyramid: raw dialogue (L0) → **atomic facts (L1)** → scenarios (L2) → persona (L3), each produced by an LLM and stored for retrieval. Our audit showed swarmdo already owns the *substrate* (durable store, ONNX embeddings, HNSW, BM25 + cross-encoder rerank) but has **no automatic distillation** — the missing piece is the LLM extraction that turns messy dialogue into dense, structured facts.

This ADR specifies **L0→L1 only** — the highest-leverage tier — as the first shippable increment. L2 (scenario clustering) and L3 (persona synthesis) layer on the same engine later (see Future Work).

## Decision

Add an **opt-in, budget-capped, dry-run-by-default** CLI command `swarmdo memory distill` that reads a Claude Code session transcript, uses a headless `claude` call to extract atomic facts, and stores them (with provenance) in the existing memory store — where they become retrievable through the normal `memory search` path (including `--rerank`).

It is a near-clone of the existing, unit-tested `task parse-prd` command (transcript→facts JSON is the same shape as PRD→tasks JSON). We **reuse** existing infra rather than inventing new mechanisms.

## Architecture (grounded at HEAD)

```
L0  session .jsonl ──► parse turns ──► chunk ──► LLM extract ──► validate ──► dedup ──► store (L1 facts)
     transcript/export.ts   distill.ts    distill.ts  claude -p   distill.ts  searchEntries  storeEntry
```

### 1. L0 — read the transcript (reuse, no new parsing)
- Resolve the session: `resolveSessionFile(process.env.CLAUDE_SESSION_ID ?? 'latest')` (`transcript/export.ts:211`).
- Parse turns by composing existing exports: `contentToText` (`export.ts:60`) + `cleanUserText` (`export.ts:55`, strips `<system-reminder>` noise). A local `sessionTurns(file)` helper in `distill.ts` does the `readFileSync → split('\n') → JSON.parse (skip throws) → filter role∈{user,assistant} → {role,text}` compose (the recipe scout-transcript verified). We keep this **inside distill.ts** to avoid touching the shared transcript module.
- Gotchas honored: single-session read (avoids fork/resume double-counting), drop empty tool-result-only turns, strip system-reminders, full-file load (no streaming — acceptable for one session).

### 2. L0→L1 — LLM extraction (clone `parse-prd`)
- `defaultRunClaude(req)` — injectable, copied from `parse-prd.ts:52`: `spawnSync('claude', ['--print','--output-format','json','--allowedTools','','--model',<m>,'--max-budget-usd',<cap>])`, prompt on **STDIN**, env scrubbed (`CLAUDE_ENTRYPOINT='worker'`, delete `CLAUDE_SESSION_ID`/`CLAUDE_PARENT_SESSION_ID`). Cost from stdout `total_cost_usd`, text from `.result`.
- `buildDistillPrompt(turns, maxFacts)` — instructs: *"Extract at most N atomic, self-contained facts worth remembering across sessions (decisions, preferences, constraints, resolved bugs, key file/API locations). Return ONLY a JSON array of `{fact: string, turn: number, category: string}`. No prose, no fences."* (mirrors `buildDecomposePrompt` style.)
- Parse with `extractJsonArray` (`parse-prd.ts:116`, reused as-is) → `JSON.parse` → `validateFacts` (drop entries missing `fact`, clamp to `maxFacts`, collect `warnings[]`).
- Returns `{ facts: DistilledFact[], costUsd, warnings }`. **Runner is injectable → unit tests pass a fake, zero billable calls.**

### 3. L1 — store facts with provenance
- **Storage change (required, ~15 lines, NO migration):** the `metadata TEXT` column exists but both writers hardcode `'{}'` (`memory-bridge.ts:723`, `memory-initializer.ts:2433`). Add optional `metadata?: Record<string,unknown>` to `storeEntry` (`memory-initializer.ts:2321`) **and** `bridgeStoreEntry` (`memory-bridge.ts:630`), write `JSON.stringify(metadata ?? {})`, and surface it in `bridgeGetEntry`/`getEntry`. Backward-compatible (param optional, default `{}` = today's behaviour).
- Store each fact: `value` = **pure fact text** (clean embedding), `metadata` = `{ source:'distill', sessionId, transcript, turn, category, distilledAt }`, `namespace:'distilled'`, `key:` `fact-${sessionId}-${turn}-${shortHash(fact)}`, `upsert:true`, `generateEmbeddingFlag:true` (ONNX 384-dim + HNSW auto-updated by `storeEntry`).
- **Dedup:** before store, `searchEntries({ query: factText, namespace:'distilled', limit:1, threshold:0.9 })` — skip on a near-duplicate hit; count skipped.
- Namespace `distilled` isolates L1 facts and is independently searchable; `storeEntry` auto-provisions its `vector_indexes` row.

### 4. Retrieval (already shipped)
Distilled facts live in the store → retrievable via `memory search --namespace distilled` (and `--rerank`, added v1.58.38) and the `memory_search` MCP tool. No new retrieval code.

## Command UX (mirror `parse-prd`'s safety chain)

`swarmdo memory distill [--session latest] [--model haiku] [--max-budget-usd 0.50] [--timeout-secs 180] [--max-facts 40] [--namespace distilled] [--confirm] [--json] [--path <db>]`

Order (parse-prd's, so **dry-run always works even where headless is forbidden**):
1. **Dry-run gate** — without `--confirm`: resolve session, count turns, print the plan (`session file`, `#turns`, model, budget cap, "will make 1 billable `claude` call") + `re-run with --confirm`. Exit 0.
2. **`SWARMDO_HEADLESS` guard** — block if `∈ {0,false,off}` (the #2356 cost rule; same check as `commands/task.ts:1004`).
3. **`claude --version` preflight** — friendly error if the CLI is absent.
4. **Run** — extract → dedup → store → summary (`N facts stored, M skipped as duplicates, $cost`).

Defaults: `--model haiku` (extraction/compression is well-suited to Haiku and keeps cost low; `--model sonnet` for higher fidelity), `--max-budget-usd 0.50`, single call (no loop).

## Cost & safety
- **Opt-in only.** No hook, no daemon, no automatic invocation — respects `SWARMDO_HEADLESS=0` and the "no billable headless sweeps" rule. Same posture as `repair` / `parse-prd`.
- Budget-capped per call via `--max-budget-usd`; dry-run by default.
- One session ≈ one `claude` call.

## Test strategy (engine-first, no billable calls)
- `distill.test.ts`: inject a fake `runClaude` returning canned JSON → assert `extractFacts` parses/validates/clamps/collects warnings; malformed-JSON and fenced-JSON cases (via `extractJsonArray`).
- `sessionTurns` against a fixture `.jsonl` (roles, tool-result-only turns dropped, system-reminders stripped, fork-copy not double-read).
- `storeFacts`: dedup skips a near-dup; provenance metadata round-trips through the new `storeEntry`/`getEntry` `metadata` param.
- Storage-change regression: existing memory tests (261 in the memory suite) must stay green; add a metadata-roundtrip test.
- Dry-run + `SWARMDO_HEADLESS` guard behaviour (no `claude` spawned).

## Integration points (files)
- **New:** `v3/@swarmdo/cli/src/memory/distill.ts` (engine), `v3/@swarmdo/cli/__tests__/memory-distill.test.ts`.
- **Edit (shared, careful):** `memory-initializer.ts` (`storeEntry` + `getEntry` metadata), `memory-bridge.ts` (`bridgeStoreEntry` + `bridgeGetEntry` metadata).
- **Edit:** `commands/memory.ts` (register `distill` subcommand + flags + safety chain).
- **Docs:** README row, USERGUIDE section, website card, this ADR.

## Work breakdown (for the build swarm)
- **WU1 — storage metadata** (shared files; lead-owned, tested): optional `metadata` on `storeEntry`/`bridgeStoreEntry`/`getEntry`/`bridgeGetEntry`.
- **WU2 — engine** (`distill.ts`, isolated new file; agent-drafted): `sessionTurns`, `buildDistillPrompt`, injectable `defaultRunClaude`, `extractFacts`, `storeFacts`.
- **WU3 — command** (`commands/memory.ts`; lead-owned wiring): `distill` subcommand, flags, dry-run + guard + preflight chain.
- **WU4 — tests** (`memory-distill.test.ts`; agent-drafted): the strategy above.
- **WU5 — docs** (agent-drafted): README/USERGUIDE/website.

## Future work (explicitly out of scope here)
- **L2 scenario** — cluster L1 facts by embedding (existing HNSW) + LLM-summarize each cluster into a named scenario.
- **L3 persona** — LLM-synthesize a rolling project/user profile from scenarios.
- **Provenance drill-down** — surface `metadata.transcript`/`turn` in `memory search` output; deterministic path fact→source turn.
- **Measured token reduction** — validate via `swarmdo usage` on before/after sessions (don't inherit Tencent's −61%).
- **`memory_distill` MCP tool** — deferred (headless-from-MCP is awkward; CLI-first).

## Honest caveats
- Fact quality depends on the model; Haiku default trades some fidelity for cost. Bad facts pollute memory → dedup + `--max-facts` cap + provenance (so facts are auditable/removable) mitigate.
- Tencent's −61% is on their harness; we will measure our own, not claim theirs.
- This is L1 only; the token-reduction payoff grows with L2/L3 and with feeding distilled facts into future context (a follow-on wiring step).
