# @rufflo/cli-core

[![npm version](https://img.shields.io/npm/v/@rufflo/cli-core.svg)](https://www.npmjs.com/package/@rufflo/cli-core)
[![npm downloads](https://img.shields.io/npm/dm/@rufflo/cli-core.svg)](https://www.npmjs.com/package/@rufflo/cli-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Status:** alpha (pre-release). Tracking ADR-100. Don't depend on this in production yet.

Lightweight core CLI surface for [Rufflo](https://github.com/ruvnet/ruflo) — `memory` + `hooks` commands only. Designed to load fast on a cold npx cache so plugin skills don't race Claude Code's 30 second MCP-startup timeout.

## Why a separate package?

Issue [#1748 #3](https://github.com/ruvnet/ruflo/issues/1748) documented a silent failure mode for new users: `npx rufflo@latest mcp start` from a cold npx cache regularly exceeds 30 seconds (1.8 MB / 999 files), Claude Code's MCP startup timeout fires, zero tools register, and the user observes "Rufflo is broken — no MCP tools available."

`@rufflo/cli-core` is a ≤250 KB packed subset containing only what plugin skills actually call: `memory store/list/retrieve/search/delete/init` and the `hooks` family (route, model-outcome, post-edit, pre-task, etc.). On a cold cache, `npx @rufflo/cli-core@alpha memory store ...` should complete in under 5 seconds — well under the timeout.

## Install

```bash
# Pre-release alpha
npm install @rufflo/cli-core@alpha

# Or just npx-invoke directly from a plugin Bash block
npx @rufflo/cli-core@alpha memory store --key x --value 1 --namespace patterns
```

## What's included

| Category | Commands |
|---|---|
| `memory` | `store`, `list`, `retrieve`, `search`, `delete`, `init`, `migrate`, `stats`, `configure`, `cleanup`, `compress`, `export`, `import` |
| `hooks` | `route`, `pre-task`, `post-task`, `pre-edit`, `post-edit`, `pre-command`, `post-command`, `model-outcome`, `model-route`, `model-stats`, `worker-*`, `intelligence_*`, plus 12 background-worker dispatchers |

## What's NOT included (use `@rufflo/cli` for these)

- `swarm`, `hive-mind`, `agent`, `task`, `coordination` — multi-agent orchestration
- `neural`, `embeddings`, `intelligence` — full ML surface
- `federation`, `claims`, `aidefence` — cross-installation features
- `browser`, `wasm`, `rvf` — sandbox + browser automation
- `init`, `migrate`, `doctor`, `daemon`, `deployment` — lifecycle management
- `performance`, `security`, `providers`, `plugins`, `config` — admin surface

For any of these, install `@rufflo/cli@alpha` (the metapackage that re-exports cli-core and lazy-loads everything else).

## Compatibility

`@rufflo/cli-core@3.7.0-alpha.x` ships in lockstep with `@rufflo/cli@3.7.0-alpha.x`. Once promoted from alpha → latest, the two packages will continue to share the major.minor line.

## Verification

```bash
# Cold cache test — clear npx cache first
rm -rf ~/.npm/_npx
time npx @rufflo/cli-core@alpha memory store --key smoke --value test --namespace test
# Expected: <5 seconds wall-time on typical broadband
```

## Documentation

- [ADR-100 — cli-core split](../../docs/adr/ADR-100-cli-core-split-lazy-load.md) — design rationale
- **[MIGRATION.md](./MIGRATION.md) — concrete diff + env-flag pattern for switching plugin scripts**
- [Issue #1748](https://github.com/ruvnet/ruflo/issues/1748) — the bug this package addresses
- [Issue #1760](https://github.com/ruvnet/ruflo/issues/1760) — alpha tracking issue (status, benchmarks, fire-by-fire progress)
- [Main `@rufflo/cli` README](../cli/README.md) — full feature list

## License

MIT
