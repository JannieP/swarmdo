# Orchestration — deterministic multi-agent verify & vote

`swarmdo orchestrate` runs **deterministic multi-agent orchestration**: it fans out
many independent LLM calls in parallel, validates their structured output, and
combines them into a verified answer — instead of trusting one fallible call.

Two patterns ship today (both lifted from swarmdo's GAIA benchmark harness):

| Pattern | Command | What it does |
|---------|---------|--------------|
| **Adversarial verify** | `orchestrate verify "<claim>"` | Spawns N independent skeptics, each trying to *refute* the claim through a different lens. The claim survives only if a **minority** refute it. |
| **Judge panel** | `orchestrate panel "<task>"` | Runs N diversified attempts and returns the **majority** answer + an agreement count. |

## Quick start

No provider key? Use `--demo` — a built-in deterministic local heuristic runs the
full engine end-to-end with no LLM:

```bash
swarmdo orchestrate verify "the cache is always faster than the DB" --demo
#   Verdict:   ✗ NOT VERIFIED
#   Skeptics:  3 of 3 refuted (rounds=3)

swarmdo orchestrate panel "which transport does the MCP server default to?" --demo
```

For real answers, configure any provider and drop `--demo`:

```bash
export OPENROUTER_API_KEY=sk-or-...        # or ANTHROPIC_API_KEY / OLLAMA_API_KEY
swarmdo orchestrate verify "auth uses PKCE" --model anthropic/claude-haiku-4.5
```

## Options

| Flag | Applies to | Meaning |
|------|-----------|---------|
| `--model <slug>` | both | Model for the fan-out — **the cheap-routing lever**. Point it at a cheap OpenRouter/Ollama slug and the exhaustive fan-out costs cents. |
| `--rounds N` | verify | Number of skeptics (default 3, one per lens). |
| `--attempts N` | panel | Number of diversified attempts (default 3). |
| `--strict` | verify | Exit non-zero (2) when the claim is **not** verified — for CI gating (`verify … --strict && deploy`). Default is informational (exit 0). |
| `--demo` | both | Run with the local no-LLM executor (no provider needed). |
| `--json` | both | Emit the raw structured result. |

## Cheap by design

Each fan-out call goes through swarmdo's provider router (`callAnthropicMessages`),
which is **stateless** — no agent registry, no shared state — so parallel fan-out
has no contention, and `--model` routes to whatever provider that slug implies.
Running 5 skeptics on a model ~150× cheaper than a frontier model is the point:
exhaustive verification without exhaustive cost.

## Programmatic API

The primitives are exported for building your own orchestration flows:

```ts
import { runParallel, runPipeline, callAgent } from '@swarmdo/cli/orchestration/engine';
import { adversarialVerify, judgePanel } from '@swarmdo/cli/orchestration/patterns';

// Schema-validated agent output (parsed + validated, one corrective retry):
const verdict = await callAgent('Is X true? Reply {"ok":bool}', {
  schema: { required: ['ok'], types: { ok: 'boolean' } },
  model: 'anthropic/claude-haiku-4.5',
});

// Bounded-concurrency fan-out; a thrown thunk becomes null (never rejects the batch):
const results = await runParallel(items.map((i) => () => callAgent(prompt(i))), { concurrency: 8 });

// No-barrier pipeline: each item flows through all stages independently:
const out = await runPipeline(files, readStage, reviewStage, verifyStage);

const { verified } = await adversarialVerify('the migration is idempotent', { rounds: 5 });
```

All primitives take an injectable `executor`, so orchestration logic is unit-testable
offline with no provider keys.

## Notes & limits

- The engine is deterministic by contract — orchestration scripts must avoid
  `Date.now()`/`Math.random()` to stay reproducible.
- `verify` is **adversarial** on purpose: skeptics are told to refute and to default
  to "refuted" when uncertain, so a claim has to earn its verdict.
- Provider precedence: `SWARMDO_PROVIDER` › (no Anthropic key + `OPENROUTER_API_KEY`)
  › (no Anthropic key + `OLLAMA_API_KEY`) › Anthropic direct.
