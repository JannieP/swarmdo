# Memory Distillation — User Guide

`swarmdo memory distill` turns a **raw Claude Code session transcript** into a handful of **dense, self-contained atomic facts**, stored in your memory and retrievable through normal semantic search. It is tier 1 (L0→L1) of a Tencent-style distillation pyramid — see [ADR-155](adr/ADR-155-memory-distillation.md).

- **Design doc:** [ADR-155](adr/ADR-155-memory-distillation.md)
- **Available:** `@swarmdo/cli` ≥ 1.58.42
- **One-line:** `swarmdo memory distill --confirm`

---

## Why

Long coding sessions carry their entire raw history forward, which bloats context and cost. Distillation reads the messy dialogue, keeps the ~5% worth remembering (decisions, constraints, resolved bugs, key locations) as compact facts, and throws the rest away. Those facts then feed future work through search instead of re-reading the whole transcript.

```
L0 transcript ──► parse turns ──► one claude call ──► validate ──► redact ──► dedup ──► store (L1 facts)
   .jsonl          (reused)        extract facts       + clamp     secrets    @0.9      distilled namespace
```

Only the **extract** step uses an LLM (reading-comprehension + compression). Everything else — parsing, embedding, redaction, dedup, retrieval — is deterministic infrastructure swarmdo already ships.

---

## Quick start

```bash
# 1. Dry-run — resolves your current session, counts turns, prints the plan.
#    Makes NO model call and costs nothing.
swarmdo memory distill

# 2. Confirm — one budget-capped headless `claude` call extracts the facts.
swarmdo memory distill --confirm

# 3. Retrieve — distilled facts live in the `distilled` namespace.
swarmdo memory search --namespace distilled --rerank -q "why did we choose X"
```

`distill` is **opt-in and dry-run by default**: nothing billable happens until you add `--confirm`.

---

## A real run

Distilling a 60-turn session (`--session <id> --confirm --model haiku`):

```
[INFO] Distilling 60 turns from 33d2ccbe… with haiku…

[OK] Distilled 20 fact(s) into 'distilled'
  - [decision]     New agent_run MCP tool fuses spawn+execute in one call, addressing the audit's #1 finding.
  - [bug]          ProviderManager round-robin/latency-routing is bypassed: agent_execute calls Anthropic directly via inline fetch. Fix: route through ProviderManager (3-5 days).
  - [constraint]   Raft/Byzantine/Gossip code is real and distinct per algorithm, but the default path runs in a single Node process via EventEmitter/JSON state. Real distributed consensus needs a network transport.
  - [constraint]   Project uses automatic version-bump on EVERY commit; maintain semver discipline (PATCH bugs / MINOR additions / MAJOR breaking).
  - [verification] All 146 agent-area tests pass, incl. 5 new agent_run tests. No regressions.
  - [location]     Audit validation report saved to docs/reviews/external-audit-validation-2026-06-24.md.
  …20 facts total…
[INFO] Distillation cost: $0.1217
```

Then retrieval finds them semantically:

```
$ swarmdo memory search --namespace distilled --rerank -q "distributed consensus limitations"
  fact-33d2ccbe-…  0.49  distilled  Raft/Byzantine/Gossip protocol code is real but runs in a single process…

$ swarmdo memory search --namespace distilled --rerank -q "provider routing bug"
  fact-33d2ccbe-…  0.57  distilled  ProviderManager round-robin/latency-routing is bypassed…
```

---

## Command reference

```
swarmdo memory distill [options]
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--session <id\|latest>` | `latest` | Which transcript. `latest` = newest **main** session in the **current project** (never a sibling project's). An explicit id resolves anywhere. |
| `--confirm` | *(off)* | Actually run the billable `claude` call. Without it you get a dry-run plan. |
| `--model <m>` | `haiku` | Extraction model. `haiku` is cheap and fine for most sessions; use `sonnet` for larger/complex ones. |
| `--max-budget-usd <n>` | `0.50` | Hard budget ceiling for the single call. |
| `--max-facts <n>` | `40` | Cap on facts extracted (clamped). |
| `--timeout-secs <n>` | `180` | Timeout for the call. |
| `--namespace <ns>` | `distilled` | Where facts are stored. |
| `--json` | *(off)* | Machine-readable output (facts, cost, counts). |

---

## Cost & safety

- **Opt-in only.** No hook, no daemon, no automatic invocation. Distillation happens only when you run the command with `--confirm`.
- **Budget-capped.** One `claude` call, bounded by `--max-budget-usd` (default $0.50). A 60-turn session cost ~$0.12 on Haiku.
- **Respects `SWARMDO_HEADLESS`.** If `SWARMDO_HEADLESS` is `0`/`false`/`off`, the billable call is blocked (the dry-run still works).
- **Needs the `claude` CLI** on your PATH (Claude Code installed).
- **Secrets are redacted (#119).** Every fact is scrubbed with swarmdo's redactor **before** it is embedded or stored, so API keys/tokens never land in the memory DB. The run reports `N had secrets redacted`.
- **Deduped (@0.9).** A near-identical fact already in the namespace is skipped, so re-running is idempotent.
- **Provenance.** Each fact stores `{sessionId, transcript, turn, category}` metadata for auditing/removal.

---

## Choosing a model, and the large-session limit

- **`--model haiku`** (default): cheap and reliable for sessions up to ~30K tokens of dialogue.
- **`--model sonnet`**: higher fidelity for larger or more complex sessions.
- **Very large sessions (#121):** a single call over a ~75K-token session (hundreds of turns) can fail to return clean JSON. Until chunked distillation lands, target a specific shorter `--session <id>`, or use `sonnet`. The dry-run prints the turn count so you can gauge size first.

---

## What this is (and isn't)

- **Is:** L1 — atomic facts from one session, deduped, redacted, searchable.
- **Isn't (yet):** L2 *scenarios* (clustered fact patterns) and L3 *persona* (a rolling project profile). Those layer on the same engine — see ADR-155 *Future work*.
- **Measure the payoff** with `swarmdo usage` on your own before/after sessions — don't inherit an external token-reduction number.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `no facts extracted — no JSON array found` | Session too large for one call (#121) — try `--model sonnet` or a shorter `--session <id>`. |
| `claude exited with status 1` | Same as above, or budget too low — raise `--max-budget-usd`. |
| `claude CLI not found` | Install Claude Code; distill shells out to `claude --print`. |
| `SWARMDO_HEADLESS forbids…` | The cost guard is on; unset `SWARMDO_HEADLESS` (or set it to `1`) to allow the billable call. |
| Distilled the wrong session | Fixed in ≥1.58.42 (#120); update, or pass `--session <id>` explicitly. |
