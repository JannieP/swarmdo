---
name: neural-train
description: Train SONA + MicroLoRA neural patterns from successful task completions; runs the DISTILL + CONSOLIDATE phases of the 4-step pipeline
argument-hint: "[--pattern-type coordination|edit|task] [--epochs N] [--microlora]"
allowed-tools: mcp__swarmdo__neural_train mcp__swarmdo__neural_status mcp__swarmdo__neural_patterns mcp__swarmdo__neural_predict mcp__swarmdo__neural_optimize mcp__swarmdo__neural_compress mcp__swarmdo__hooks_pretrain mcp__swarmdo__hooks_build-agents mcp__swarmdo__hooks_intelligence_trajectory-start mcp__swarmdo__hooks_intelligence_trajectory-step mcp__swarmdo__hooks_intelligence_trajectory-end mcp__swarmdo__hooks_intelligence_pattern-store mcp__swarmdo__hooks_intelligence_learn mcp__swarmdo__hooks_intelligence-reset mcp__swarmdo__swarmllm_sona_create mcp__swarmdo__swarmllm_sona_adapt mcp__swarmdo__swarmllm_microlora_create mcp__swarmdo__swarmllm_microlora_adapt mcp__swarmdo__agentdb_consolidate Bash
---

# Neural Training

Train and consolidate neural patterns. Implements the **DISTILL** and **CONSOLIDATE** phases of the 4-step intelligence pipeline.

## When to use

- After completing a successful task — capture what worked.
- After accumulating ≥10 task completions — run consolidation to fold patterns into long-term storage.
- When training a new domain — create a MicroLoRA adapter for it.

## Standard flow (DISTILL)

1. **Check current neural status** — `mcp__swarmdo__neural_status`.
2. **Start a trajectory** — `mcp__swarmdo__hooks_intelligence_trajectory-start` with the task context.
3. **Record steps** — for each significant action, `mcp__swarmdo__hooks_intelligence_trajectory-step`.
4. **End trajectory** — `mcp__swarmdo__hooks_intelligence_trajectory-end` with `verdict: pass|fail|partial`.
5. **Learn from the trajectory** — `mcp__swarmdo__hooks_intelligence_learn`.
6. **Train patterns** — `mcp__swarmdo__neural_train` with `--pattern-type coordination --epochs 10`.
7. **Store patterns** — `mcp__swarmdo__hooks_intelligence_pattern-store`.
8. **Verify** — `mcp__swarmdo__neural_patterns` to confirm.

## SONA adaptation (single-domain, <0.05ms)

For real-time micro-adaptation:

```bash
mcp tool call swarmllm_sona_create --json -- '{"domain": "coding"}'
mcp tool call swarmllm_sona_adapt --json -- '{"feedback": {"score": 0.9, "trajectory": "..."}}'
```

## MicroLoRA adaptation (multi-domain)

When you have ≥3 distinct domains, create a MicroLoRA adapter per domain rather than overloading SONA:

```bash
# Create the adapter
mcp tool call swarmllm_microlora_create --json -- '{"domain": "frontend"}'

# Adapt with feedback
mcp tool call swarmllm_microlora_adapt --json -- '{"adapter": "frontend", "feedback": {...}}'

# CONSOLIDATE phase: apply EWC++ on weight deltas to prevent catastrophic forgetting
mcp tool call swarmllm_microlora_adapt --json -- '{"adapter": "frontend", "consolidate": true}'
```

The `--consolidate` flag is the EWC++ trigger. Without it, fresh training overwrites older domains.

## CONSOLIDATE phase (separate from training)

After every ~10 trajectory completions, run a full consolidation pass:

```bash
mcp tool call agentdb_consolidate --json
mcp tool call neural_compress --json    # storage efficiency
```

This folds patterns into long-term storage under EWC++ semantics.

## Bootstrapping from scratch

If the system has no learned patterns yet:

```bash
mcp tool call hooks_pretrain --json -- '{"modelType": "moe", "epochs": 10}'
mcp tool call hooks_build-agents --json -- '{"agentTypes": "coder,tester"}'
```

`hooks_pretrain` writes to the `patterns` (plural) namespace — distinct from the `pattern` (singular) ReasoningBank target. See `swarmdo-agentdb` ADR-0001 for the namespace convention.

## Reset (testing only)

To wipe intelligence state (e.g., for benchmarking):

```bash
mcp tool call hooks_intelligence-reset --json
```

## CLI alternatives

```bash
npx @swarmdo/cli@latest neural train --pattern-type coordination --epochs 10
npx @swarmdo/cli@latest neural patterns --list
npx @swarmdo/cli@latest neural status
npx @swarmdo/cli@latest neural compress
npx @swarmdo/cli@latest hooks pretrain --model-type moe --epochs 10
npx @swarmdo/cli@latest hooks build-agents --agent-types coder,tester
```
