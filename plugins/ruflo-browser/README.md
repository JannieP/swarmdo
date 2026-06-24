# rufflo-browser

Session-as-skill browser automation. Playwright-backed via 23 `mcp__rufflo__browser_*` tools, with each session captured as a first-class **RVF cognitive container** holding manifest + trajectory + screenshots + sanitized cookies + findings, indexed in AgentDB and gated by AIDefence.

> **v0.2.0 architecture** — every browser session is now an addressable, replayable, federatable artifact. Status is **Proposed** per [ADR-0001](./docs/adrs/0001-browser-skills-architecture.md); the load-bearing replay assumption requires a pre-Accept spike (see ADR Verification §4).
>
> **Substrate alignment (ADR-122).** This plugin is the user-facing skill layer; the substrate primitives — signed trajectories (Ed25519 + RVF), causal-graph self-healing, AIDefence-attested cookie vault, federated MCTS, Session Capsules, Workflow Compiler — ship in the [`@rufflo/browser@3.0.0-alpha.4`](https://www.npmjs.com/package/@rufflo/browser) npm package. See the [substrate announcement](https://gist.github.com/ruvnet/a708fafb1375ed69bc48377df47fa2ac) and tracking issue [#2041](https://github.com/ruvnet/ruflo/issues/2041).

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install rufflo-browser@rufflo
```

## How sessions work

A browser session is allocated an RVF container at session-start and committed at session-end:

```
<rvf-id>/
├── manifest.yaml         # URL, viewport, profile, runner, lineage
├── trajectory.ndjson     # one line per action via ruvector hooks trajectory-step
├── screenshots/<step>.png
├── snapshots/<step>.json # accessibility trees indexed by navigation
├── dom/                  # optional, when --with-dom
├── cookies.json          # AIDefence-sanitized
└── findings.md           # test verdicts, scrape outputs, injection quarantine
```

Re-open with `rvf ingest <id>`, fork with `rvf derive`, federate with `rvf export`.

## Commands

`/rufflo-browser` is a verb dispatcher:

```bash
/rufflo-browser ls [--query <text>]      # list sessions, AgentDB-indexed
/rufflo-browser show <session-id>        # manifest + trajectory + verdict
/rufflo-browser replay <session-id>      # re-drive trajectory
/rufflo-browser export <session-id>      # rvf export → tar.zst
/rufflo-browser fork <session-id>        # rvf derive → new lineage-tracked session
/rufflo-browser purge <session-id>       # destroy, keep redacted manifest
/rufflo-browser doctor                   # check Playwright, MCP, AgentDB, AIDefence
```

## Skills

| Skill | Purpose |
|-------|---------|
| `browser-record` | Open a named, traced session into an RVF container. Primitive others compose. |
| `browser-replay` | Replay a stored trajectory, optionally on a different URL or with mutated inputs. |
| `browser-extract` | Run a stored `browser-templates` recipe or one-shot extraction. PII-scanned. |
| `browser-login` | Drive an auth flow once, sanitize+vault cookies for reuse. |
| `browser-form-fill` | Form interaction with field-name → value mapping. |
| `browser-screenshot-diff` | Pixel + DOM diff between two session screenshots (visual regression). |
| `browser-auth-flow` | Probe an auth flow for redirect leaks, missing CSRF, weak session cookies. |
| `browser-test` | UI test recipe — composes `browser-record` + `browser-replay`. |

`browser-scrape` is a deprecation shim that delegates to `browser-extract`. Removed in v0.3.0.

## Memory layer (AgentDB)

| Namespace | Key | Value | Purpose |
|-----------|-----|-------|---------|
| `browser-sessions` | `<rvf-id>` | manifest summary + verdict + tags | session index for `/rufflo-browser ls` |
| `browser-selectors` | `<host>:<intent>` | `{selector, ref, snapshot-hash, last-success}` | survives DOM drift via embedding similarity |
| `browser-templates` | `<template-name>` | scrape recipe with selector chain + post-process | replaces ad-hoc memory strings |
| `browser-cookies` | `<host>` | claims-gated cookie blob + expiry + AIDefence verdict | cookie reuse without re-auth |

Raw cookies and tokens never enter AgentDB unwrapped — see ADR §3.

## AIDefence gates (mandatory)

1. **Pre-storage scan** — every scraped string passes `aidefence_has_pii` before AgentDB store.
2. **Cookie sanitization** — `aidefence_scan` flags high-entropy strings; vault them in `browser-cookies`.
3. **Prompt-injection check** — extracted text returning to an LLM passes `aidefence_is_safe`. Hits get quarantined to `findings.md`. With [`aidefence@2.3.0` (ADR-118)](../../v3/docs/adr/ADR-118-aidefence-2.3.0-upgrade.md) the check now catches role-hijack (`you are now …` / `act as …` / `pretend to be …`) and jailbreak markers (`DAN mode` / `developer mode` / `god mode` / `root mode`) in addition to the canonical `ignore all previous instructions` family — high-leverage upgrade for browser-scraped pages.

## MCP surface

23 existing `mcp__rufflo__browser_*` tools (interaction primitive) **+ 5 new `browser_session_*` lifecycle tools (implemented in v0.2.0)**:

| Tool | Purpose |
|------|---------|
| `browser_session_record` | RVF allocate + ruvector `trajectory-begin` + `agent-browser open`. Returns session id + rvf path. |
| `browser_session_end` | `trajectory-end` with verdict + `rvf compact` + AgentDB index in `browser-sessions`. |
| `browser_session_replay` | RVF derive child container + load trajectory steps for caller-level dispatch. |
| `browser_template_apply` | Fetch a recipe from `browser-templates` AgentDB namespace. |
| `browser_cookie_use` | Fetch an opaque vault handle from `browser-cookies`; raw values never returned. |

Implementation: [`v3/@rufflo/cli/src/mcp-tools/browser-session-tools.ts`](../../v3/@rufflo/cli/src/mcp-tools/browser-session-tools.ts), registered in `mcp-client.ts`. Each handler shells out to the pinned `ruvector@0.2.25` CLI for trajectory + RVF, the existing `agent-browser` CLI for browser actions, and the bridged `rufflo memory` for AgentDB. Missing dependencies degrade with structured `success: false` errors instead of crashing.

`browser_session_replay` is deliberately a primitive: it derives a child RVF container and surfaces the source trajectory so the caller dispatches each step through the appropriate `browser_*` tool. That keeps the replay engine out of the MCP layer and makes the load-bearing assumption (replay-fidelity across DOM drift) testable via the spike harness below rather than buried in tool internals.

## Verification

Two complementary checks:

### Structural smoke (fast, offline)

```bash
bash plugins/rufflo-browser/scripts/smoke.sh
# Expected on green: "13 passed, 0 failed"
```

Verifies plugin structural soundness — file inventory, frontmatter validity, ADR cross-references, AgentDB namespace coverage in the agent, allowed-tools enumeration in skills, and that the 5 lifecycle MCP tools are present in the CLI source.

### Replay spike (interactive, online — pre-Accept gate)

```bash
bash plugins/rufflo-browser/scripts/replay-spike.sh
```

Records + replays a baseline session against each URL in `scripts/SITES.txt` (10 sites by default, varying drift profiles). Writes `spike-results/<timestamp>/STATUS.md` with per-site verdicts and the aggregate replay rate. The ADR threshold is **≥80%**; meeting it is the gate to flip ADR-0001 from `Proposed` → `Accepted`. Below the threshold, the proposal degrades to "session as audit log" (replay and screenshot-diff become best-effort).

The spike requires `agent-browser` (or `npx --yes agent-browser`), `ruvector@0.2.25` (auto-fetched via `npx`), and network access. It is **not** part of the smoke test — running it is a deliberate audit step.

## Architecture Decisions

- [`ADR-0001` — Adopt session-as-skill architecture for rufflo-browser](./docs/adrs/0001-browser-skills-architecture.md)

## Related Plugins

- `rufflo-ruvector` — trajectory hooks, SONA pattern distillation, MCP tools
- `rufflo-agentdb` — controllers backing `browser-sessions`, `browser-selectors`, `browser-templates`, `browser-cookies`
- `rufflo-aidefence` — PII / prompt-injection gates
- `rufflo-federation` — cross-installation session sharing via RVF export

## License

MIT
