# swarmdo-metaharness

MetaHarness integration plugin for swarmdo. Surfaces the upstream `metaharness` / `harness` CLIs through five swarmdo skills, honoring [ADR-150](../../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md)'s architectural constraint that MetaHarness must remain a removable augmentation — never a required runtime dependency.

## ADR-150 architectural constraint (load-bearing)

**Swarmdo remains operational if every MetaHarness package is removed.** Every code path in this plugin satisfies four rules:

1. **Removable** — no static `import '@metaharness/*'` outside the optional-router path in `v3/@swarmdo/cli/src/swarmvector/neural-router.ts`.
2. **Optional in package.json** — `metaharness` is in `optionalDependencies`, never `dependencies`.
3. **Graceful degradation** — every script catches `MODULE_NOT_FOUND`/network failure and emits `{ degraded: true, reason: 'metaharness-not-available' }` JSON, exits 0. The graceful path is the default behavior, not a special case.
4. **CI gate** — `no-metaharness-smoke.yml` runs the plugin smoke with `npm install --no-optional` and asserts the contract still passes.

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| `harness-score` | `/harness-score [--path .] [--alert-on-fit-below 70]` | 5-dim readiness scorecard (harnessFit/compile/coverage/safety/memory + cost) |
| `harness-genome` | `/harness-genome [--path .] [--alert-on-risk-above 0.5]` | 7-section categorical report (repo_type/topology/risk/mcp/test/publish) |
| `harness-mcp-scan` | `/harness-mcp-scan [--path .] [--fail-on high]` | Static MCP security findings — pure-read, no dispatch |
| `harness-threat-model` | `/harness-threat-model [--path .] [--fail-on high]` | Enterprise-grade threat model (clean/low/medium/high + findings) |
| `harness-mint` | `/harness-mint --name <id> --template <id> [--confirm]` | Scaffold a custom harness; DRY-RUN by default; refuses project-root writes |

## Phase-0 baseline (swarmdo itself, 2026-06-16)

```json
{
  "harnessFit": 82,
  "compileConfidence": 100,
  "taskCoverage": 79,
  "toolSafety": 100,
  "memoryUsefulness": 40,
  "estCostPerRunUsd": 0.048,
  "recommendedMode": "CLI + MCP",
  "archetype": "typescript-sdk-harness",
  "template": "vertical:coding",
  "scaffoldReady": true,
  "risk_score": 0.27,
  "publish_readiness": 0.9
}
```

## Architecture

All skills use subprocess invocation through the `_harness.mjs` shared helper:

```
skills/X/SKILL.md → scripts/X.mjs → scripts/_harness.mjs → spawnSync('npx', ['metaharness', …])
                                                  ↘ on MODULE_NOT_FOUND → emit degraded JSON, exit 0
```

This means:
- No library import overhead on swarmdo's boot path
- 60s hard timeout per subprocess (bounded blast radius)
- `--json` flag forced for structured parsing
- Graceful degradation is a single helper used by every skill

## Cross-links

- [ADR-150](../../v3/docs/adr/ADR-150-metaharness-integration-surfaces.md) — decision + architectural constraint
- [Issue #2399](https://github.com/ruvnet/swarmdo/issues/2399) — phase rollout tracker
- [Research dossier](https://gist.github.com/ruvnet/19d166ff9acf368c9da4172d91ac9113) — full graded-evidence sourcing
- [Upstream](https://github.com/ruvnet/agent-harness-generator) — `metaharness` source
- ADR-148/149 — `@metaharness/router` cost-optimal routing (sibling integration)
