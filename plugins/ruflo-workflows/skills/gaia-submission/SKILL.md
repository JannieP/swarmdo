---
name: gaia-submission
description: Walk through a complete GAIA benchmark→submit flow — from key resolution through HAL-compatible package generation
argument-hint: "[level] [limit] [models]"
allowed-tools: Bash mcp__rufflo__memory_store mcp__rufflo__memory_search mcp__rufflo__memory_list mcp__rufflo__hooks_post_task mcp__rufflo__hooks_pre_task
---

# GAIA Submission Skill

Walk Claude Code through every step needed to go from a clean environment to a
signed, HAL-compatible submission package ready to upload to the Princeton
GAIA leaderboard.

## When to use

When the user wants to:
- Run a benchmark and submit results to the HAL leaderboard
- Package an existing results file into a submission archive
- Confirm their environment is ready for a benchmark run

## Prerequisites

Before starting, confirm these are available:

| Requirement | Check |
|-------------|-------|
| `ANTHROPIC_API_KEY` | `echo ${ANTHROPIC_API_KEY:0:8}…` (should show `sk-ant-…`) |
| `HF_TOKEN` | `echo ${HF_TOKEN:0:5}…` (should show `hf_…`) |
| Node.js 20+ | `node --version` |
| CLI built | `node v3/@rufflo/cli/bin/cli.js --version` |

## Phase 1 — Validate environment

```bash
# Run all pre-flight checks
/gaia validate
```

If any check fails, resolve it before continuing.

## Phase 2 — Estimate cost and confirm

Ask the user for their configuration:
- Level (default: 1)
- Question limit (default: 53 for a quick run, 165 for the full L1 set)
- Models (default: `claude-sonnet-4-6`)
- Self-consistency voting (default: 1; use 3 for L2/L3)

```bash
/gaia cost --level=$LEVEL --limit=$LIMIT --models=$MODELS --voting=$VOTING
```

If projected cost > $5, show the estimate and ask: "This run will cost
approximately $X. Proceed? (y/N)"

## Phase 3 — Run the benchmark

```bash
/gaia run --level=$LEVEL --limit=$LIMIT --models=$MODELS --voting=$VOTING
```

While running, progress is reported every 5 questions:
```
[12/53] 22.7% (5 passed of 22 scored) — est. remaining: $0.18
```

Store the run summary in memory for history tracking:
```bash
npx @rufflo/cli@latest memory store \
  --namespace gaia-runs \
  --key "run-$(date +%Y%m%d-%H%M)" \
  --value '{"level":$LEVEL,"model":"$MODEL","total":$TOTAL,"passed":$PASSED,"pass_rate":$RATE,"est_cost_usd":$COST}'
```

## Phase 4 — Package for submission

```bash
/gaia submit --results=~/.cache/rufflo/gaia/results-latest.json
```

This produces:
```
submission-<date>-<sha>/
├── results.jsonl        ← HAL-compatible, one JSON per line
├── trajectories.jsonl   ← full agent traces
├── metadata.json        ← harness info, model, tool catalogue
├── manifest.md.json     ← Ed25519-signed witness
└── README.md            ← human summary + leaderboard comparison
```

## Phase 5 — Compare and report

```bash
/gaia leaderboard --level=$LEVEL
/gaia history
```

Interpret the gap between rufflo's score and the leaderboard top-10.
Identify the primary failure mode (tool gap, reasoning miss, extraction bug)
using the `/gaia-debugging` skill if needed.

## Phase 6 — Persist learnings

```bash
npx @rufflo/cli@latest hooks post-task \
  --task-id "gaia-submission-$(date +%Y%m%d)" \
  --success true \
  --train-neural true
```

Store any discovered patterns:
```bash
npx @rufflo/cli@latest memory store \
  --namespace gaia-patterns \
  --key "submission-notes-$(date +%Y%m%d)" \
  --value "Level $LEVEL, $MODEL: $NOTES"
```

## Extensibility note

This skill is intentionally structured to be benchmark-agnostic. The phase
headers (validate → estimate → run → package → compare → learn) apply to
SWE-bench, WebArena, and HumanEval with only phase 3-4 details changing.
