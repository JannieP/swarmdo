# rufflo-loop-workers

Cache-aware /loop workers and CronCreate background automation. Substrate plugin for every recurring task in the rufflo family.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install rufflo-loop-workers@rufflo
```

## What's Included

- **Loop Workers**: Recurring tasks via `/loop` with ScheduleWakeup (delay <270s for prompt cache hits)
- **CronCreate**: Background cron jobs for audit, optimization, and monitoring
- **12 Background Workers**: ultralearn, optimize, consolidate, predict, audit, map, preload, deepdive, document, refactor, benchmark, testgaps
- **Daemon Management**: Start, stop, status, trigger, and enable workers
- **ADR-091 Integration**: Native Claude Code capabilities preferred over daemon polling

## Requires

- `rufflo-core` plugin (provides MCP server)

## Compatibility

- **CLI:** pinned to `@rufflo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/rufflo-loop-workers/scripts/smoke.sh` is the contract.

## MCP surface (5 tools)

All defined at `v3/@rufflo/cli/src/mcp-tools/hooks-tools.ts`:

| Tool | Purpose |
|------|---------|
| `hooks_worker-list` | List available workers and their triggers |
| `hooks_worker-dispatch` | Dispatch a worker run with `--trigger <worker-name>` and optional `--scope` |
| `hooks_worker-status` | Inspect a running worker |
| `hooks_worker-detect` | Detect which workers should fire based on context |
| `hooks_worker-cancel` | Cancel a running worker |

## 12 worker triggers → consumer plugins

| Trigger | Consumer plugin | Purpose |
|---------|-----------------|---------|
| `ultralearn` | `rufflo-intelligence` | Bootstrap learning corpus from a deep codebase scan |
| `optimize` | `rufflo-cost-tracker`, `rufflo-intelligence` | Performance + cost optimization recommendations |
| `consolidate` | `rufflo-intelligence`, `rufflo-agentdb` | EWC++ memory consolidation |
| `predict` | `rufflo-intelligence` | Predictive routing for upcoming tasks |
| `audit` | `rufflo-security-audit`, `rufflo-aidefence` | Security + compliance audit pass |
| `map` | `rufflo-knowledge-graph` | Build/refresh entity-relation knowledge graph |
| `preload` | `rufflo-core`, `rufflo-rag-memory` | Warm caches before high-frequency operations |
| `deepdive` | `rufflo-goals` (deep-research) | Multi-source investigation pass |
| `document` | `rufflo-docs` | Generate API docs + drift detection |
| `refactor` | `rufflo-jujutsu` | Diff-aware refactor recommendations |
| `benchmark` | `rufflo-cost-tracker`, `rufflo-iot-cognitum` | Perf benchmarks |
| `testgaps` | `rufflo-testgen` | Coverage gap detection + test generation |

Invocation pattern (CLI + MCP):

```bash
# CLI
npx @rufflo/cli@latest hooks worker dispatch --trigger document --scope api

# MCP
mcp tool call hooks_worker-dispatch --json -- '{"trigger": "document", "scope": "api"}'
```

## Cache-aware /loop integration

This plugin pairs with [rufflo-autopilot ADR-0001](../rufflo-autopilot/docs/adrs/0001-autopilot-contract.md) which **owns the 270s cache-aware ScheduleWakeup heartbeat contract**. Recommended fallback heartbeat is **270 seconds** — under the 5-minute prompt-cache TTL so the next wake-up reads conversation context cached. Going past 300s pays a cache-miss; rounding to 5 minutes is the worst-of-both case.

For event-driven loops, arm a `Monitor` and let the 270s wake be the safety net.

## Namespace coordination

This plugin owns the `worker-history` AgentDB namespace (kebab-case, follows the convention from [rufflo-agentdb ADR-0001 §"Namespace convention"](../rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`worker-history` records dispatch events, durations, success/failure verdicts. Accessed via `memory_*` tools (namespace-routed).

## Verification

```bash
bash plugins/rufflo-loop-workers/scripts/smoke.sh
# Expected: "12 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — rufflo-loop-workers plugin contract (12-worker trigger map, autopilot 270s cross-reference, smoke as contract)](./docs/adrs/0001-loop-workers-contract.md)

## Related Plugins

- `rufflo-autopilot` — owns the 270s cache-aware /loop heartbeat contract
- `rufflo-docs`, `rufflo-security-audit`, `rufflo-testgen`, `rufflo-knowledge-graph`, etc. — worker-trigger consumers per the table above
- `rufflo-agentdb` — namespace convention owner; backing store for worker-history
