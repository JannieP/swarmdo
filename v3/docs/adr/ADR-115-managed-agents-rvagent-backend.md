# ADR-115 — Claude Managed Agents as a cloud backend for `rvagent`

**Status**: Accepted (2026-05-12) — implemented as the `managed_agent_*` MCP tools in the `swarmdo-agent` plugin (see Implementation below)
**Date**: 2026-05-12
**Authors**: claude (drafted with the upstream author)
**Related**: `swarmdo-agent` plugin (renamed from `swarmdo-wasm`) / `wasm_agent_*` MCP tools (`@swarmvector/rvagent-wasm`) · ADR-026 (3-tier model routing) · ADR-095 G2 / ADR-104 (pluggable `ConsensusTransport` / `FederationTransport`) · ADR-097 (federation peers) · ADR-112 (MCP tool discoverability) · [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
**Supersedes**: nothing

## Context

Swarmdo's `rvagent` capability — the `swarmdo-agent` plugin, wrapping `@swarmvector/rvagent-wasm` — is a *local, WASM-sandboxed* agent harness. Its MCP surface:

| `rvagent` tool | What it does |
|---|---|
| `wasm_agent_create` | spin up a WASM-sandboxed agent (its own filesystem, tools) |
| `wasm_agent_prompt` | send the agent a user turn |
| `wasm_agent_tool` | invoke a tool inside the sandbox |
| `wasm_agent_files` | read the sandbox filesystem |
| `wasm_agent_export` | export the session as an RVF container (portable, replayable) |
| `wasm_agent_terminate` | stop the agent |
| `wasm_gallery_*` | publish / discover reusable agent templates |

[Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) (Anthropic, beta — `anthropic-beta: managed-agents-2026-04-01`) is a *cloud, Anthropic-managed* agent harness with the **same conceptual model**:

| Managed Agents concept | API |
|---|---|
| **Agent** — model + system + tools + MCP servers + skills | `POST /v1/agents` → `{id, version}` (reusable by id, versioned) |
| **Environment** — container template (apt/pip/npm/cargo/gem/go packages, networking, init script, env vars) | `POST /v1/environments` → `{id}` |
| **Session** — a running agent instance in an environment | `POST /v1/sessions` `{agent, environment_id, title}` → `{id, status}` |
| **Events** — user turns / tool use / tool results / status, SSE-streamed and persisted | `POST /v1/sessions/{id}/events`, `GET /v1/sessions/{id}/stream` (SSE), `GET /v1/sessions/{id}/events` (full history) |
| Built-in toolset (`agent_toolset_20260401`): bash, file ops (read/write/edit/glob/grep), web search/fetch, MCP servers | per-tool config + `permission_policy` |

It also exposes `mcp_servers`, `skills`, `multiagent` (research preview), and **define-outcomes** (research preview) on the agent config — i.e. Anthropic is converging on the same primitives swarmdo already has (agents, MCP servers, skills, multi-agent swarms, success criteria).

The mapping to `rvagent` is essentially 1:1:

| `rvagent` (WASM, local) | Managed Agents (cloud) |
|---|---|
| `wasm_agent_create` (sandbox) | `agents.create` + `environments.create` + `sessions.create` |
| `wasm_agent_prompt` | `events.send(user.message)` + `events.stream` |
| (tools run inside the WASM sandbox) | the agent autonomously calls `agent_toolset_20260401` tools in the cloud container |
| `wasm_agent_files` | bash/file tools in the container; full event history is `GET /sessions/{id}/events` |
| `wasm_agent_export` (RVF container) | session + event history is persisted server-side; export = the event log |
| `wasm_agent_terminate` | `DELETE /v1/sessions/{id}` (or the session goes idle) |
| WASM sandbox (local, no network unless granted) | cloud container (`environments`, networking rules) |
| `wasm_gallery_*` (share agent templates) | agents are reusable-by-id; a "gallery" entry = the agent-config blob |

### Validation (this exploration)

A live smoke against `https://api.anthropic.com/v1` with the org's Anthropic key (sourced from the GCP `swarmdo/anthropic-api-key` secret) confirmed the flow end-to-end:

```
POST /v1/agents        {name, model:"claude-haiku-4-5-20251001", system, tools:[{type:"agent_toolset_20260401"}]}  → agent_…  (version 1)
POST /v1/environments  {name, config:{type:"cloud", networking:{type:"unrestricted"}}}                            → env_…
POST /v1/sessions      {agent, environment_id, title}                                                              → sesn_…  (status:"idle")
POST /v1/sessions/{id}/events  {events:[{type:"user.message", content:[{type:"text", text:"echo … > /tmp/x && cat /tmp/x"}]}]}
GET  /v1/sessions/{id}/events  → 13 events: session.status_running → user.message → agent.thinking → agent.tool_use(bash) →
                                  agent.tool_result("swarmdo-managed-agents-smoke OK\n") → agent.message("Done.") → session.status_idle (stop_reason:end_turn)
DELETE /v1/sessions/{id}, DELETE /v1/environments/{id}   (cleanup)
```

Roughly ~7 s wall-clock for a trivial bash task on Haiku. The container provisioned, ran the agent loop, executed the tool, and went idle without intervention. Headers required on every request: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: managed-agents-2026-04-01`. The SSE stream returns nothing if you attach it *after* a fast session already went idle — `GET /sessions/{id}/events` is the reliable transcript; attach the stream before/while sending the user event for real-time.

## Decision

**Treat `rvagent` as the *interface* and add Claude Managed Agents as a second *backend* behind it — a `runtime: "managed"` (vs the default `"wasm"`) on the `wasm_agent_*` MCP tools** (and/or a thin `managed_agent_*` alias toolset), wrapping the Managed Agents REST API via `@anthropic-ai/sdk`'s `client.beta.agents|environments|sessions` (which sets the beta header automatically). This mirrors the established swarmdo pattern of one interface over a local-vs-cloud transport (`ConsensusTransport`: `LocalTransport` | `FederationTransport` — ADR-095 G2 / ADR-104).

### Surface

- `wasm_agent_create({ runtime: "managed", model?, system?, mcpServers?, skills?, env? })` — creates (or reuses) a Managed Agent + environment + session; returns a handle that looks like a WASM-agent handle (`agentId` ↔ session id, plus the underlying `agent`/`environment` ids) so downstream tools don't care which backend it is.
- `wasm_agent_prompt({ agentId, runtime: "managed", message })` — `events.send(user.message)` then drain `events.stream` (or poll `events`) until `session.status_idle`; returns the assistant text + a tool-use trace.
- `wasm_agent_files({ agentId, runtime: "managed" })` — fetch the session's file artifacts / event history.
- `wasm_agent_terminate({ agentId, runtime: "managed" })` — `DELETE /v1/sessions/{id}` (and optionally the env).
- `wasm_gallery_*` — store/retrieve Managed-Agent **config blobs** (`{model, system, tools, mcp_servers, skills}`) alongside the existing WASM-agent templates; a gallery entry that targets `runtime: "managed"` materializes a real Managed Agent on use.

### The high-value combinations

1. **Swarmdo's own MCP server as a Managed Agent tool source.** Managed Agents' agent config accepts `mcp_servers`. A swarmdo Managed Agent can be wired to `npx swarmdo mcp start` (HTTP transport) → the cloud agent gets swarmdo's 314 MCP tools (memory, swarm, hooks, agentdb, federation, …) running in the cloud container. That is: a cloud-hosted swarmdo agent, no local infra.
2. **Managed Agents as a federation peer (ADR-097/104).** A Managed Agent session is, operationally, a remote autonomous executor with persisted state — the same shape as a federated peer. The `FederationTransport` / `task_assign` dispatch could target a Managed Agent session as one of its executors (closing the #1916 "task-execution dispatch" gap with a *third* executor option: local WASM | federated peer | Anthropic Managed).
3. **Long-running / async work.** `rvagent`-WASM is in-process and ephemeral; Managed Agents persist a filesystem + event history across interactions and run for minutes/hours — the right backend for long agent tasks where the WASM sandbox isn't.
4. **Skills + outcomes parity.** Managed Agents accept swarmdo's skills (Markdown skill files) and (research-preview) `define-outcomes` — a Managed-Agent backed `rvagent` can carry the same skill set and success criteria a local one does.

### Constraints / boundaries

- **Optional, off by default.** `runtime: "wasm"` stays the default; `runtime: "managed"` requires `ANTHROPIC_API_KEY` (or the GCP `anthropic-api-key` secret in CI/ops) and the beta header — degrade gracefully (`{ error: "managed runtime needs ANTHROPIC_API_KEY + managed-agents beta access" }`) when absent. No core package gains a hard dependency on `@anthropic-ai/sdk` for this — it's a plugin-level dep (`swarmdo-agent` / a new `swarmdo-managed-agents`), lazily imported.
- **Cost & rate limits.** Managed Agents bill per session (LM tokens + container time) and are rate-limited per org (create: 300/min, read: 600/min) plus tier spend limits. The tool descriptions must say so (ADR-112), and `cost-tracking` should record Managed-Agent sessions the same way it records LM calls. `wasm_agent_prompt({runtime:"managed"})` should surface an estimated cost before a long run.
- **Beta churn.** The API is beta (`managed-agents-2026-04-01`); `multiagent` and `define-outcomes` are research preview. Pin the beta header in one place; treat the latter two as feature-flagged.
- **Branding.** Anthropic's branding guidelines forbid presenting a Managed-Agents integration as "Claude Code"/"Claude Cowork" — swarmdo keeps its own branding; surface it as "swarmdo agent (Anthropic Managed runtime)" not "Claude Code agent".
- **Cleanup discipline.** A Managed Agent leaves an `agent` + `environment` + `session` on the org account; `wasm_agent_terminate` must delete the session (and env, if swarmdo created it), and there should be a `managed_agent_gc` / doctor check for orphaned sessions.

This ADR records the *intent to build*; the plugin's internals (exact handle shape, stream-vs-poll, gallery storage, federation wiring) are a follow-up implementation PR.

### Future: a third runtime — the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

This ADR adds the *cloud* runtime (Managed Agents). There's a natural *third* runtime that completes the spectrum: the **[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)** (`@anthropic-ai/claude-agent-sdk` for TS, `claude-agent-sdk` for Python) — "Claude Code as a library": `query({prompt, options})` / `ClaudeSDKClient`, with built-in tools (Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch/Monitor/AskUserQuestion), hooks (`PreToolUse`/`PostToolUse`/`Stop`/`SessionStart`/…), subagents (`agents` option + the `Agent` tool), MCP servers (`mcpServers` option), permission modes (`permissionMode`/`allowedTools`), sessions (resume/fork), and it loads Claude Code's filesystem config (`.claude/skills/*/SKILL.md`, `.claude/commands/*.md`, `CLAUDE.md`, plugins). It bundles a native Claude Code binary. **Runs in your process, on your filesystem** — full host trust.

So `swarmdo-agent` would expose three runtimes behind one mental model:

| Runtime | Package | Runs on | Trust | Best for |
|---|---|---|---|---|
| **WASM** (`rvagent`) | `@swarmvector/rvagent-wasm` | local WASM sandbox | sandboxed (no host fs/net) | untrusted code; portable/replayable RVF containers; fast, free, offline |
| **SDK** (`sdk_agent_*`, future) | `@anthropic-ai/claude-agent-sdk` | your process / your filesystem | full host trust | a real Claude agent loop (hooks, subagents, MCP, sessions, skills) on the local repo/services — the programmatic, in-process version of `claude -p` |
| **Managed** (`managed_agent_*`, this ADR) | Managed Agents REST API | Anthropic cloud container | cloud-isolated | long-running/async; managed infra; no local setup; persistent server-side session |

Why the SDK runtime is worth adding (a follow-up — likely its own ADR-116):
- It **is** Claude Code's machinery, exposed as a library — and swarmdo already loads `.claude/skills`, `.claude/commands`, `CLAUDE.md`, plugins, and shells out to `claude -p`. The SDK is the in-process version: full control over the message stream, hooks (swarmdo's own hooks), subagents (swarmdo's 16 roles), MCP servers, permission modes, sessions.
- The "give the agent swarmdo's 314 tools" combo is **trivial** here (unlike Managed Agents, which needs a publicly reachable URL): pass `mcpServers: { swarmdo: { command: "npx", args: ["swarmdo", "mcp", "start"] } }` — a *local* stdio MCP server, no deployment.
- Anthropic positions it as "prototype with the Agent SDK locally → move to Managed Agents for production" — having both in `swarmdo-agent` gives swarmdo exactly that path.

Costs/constraints (so it stays opt-in, plugin-level, off by default — `wasm_agent_*` remains the safe default): a real, heavy dependency (bundles a Claude Code binary as an optional dep); **full host trust, no sandbox** — the least-isolated of the three (a WASM agent can't touch your fs; an SDK agent can); needs `ANTHROPIC_API_KEY` (or Bedrock/Vertex/Azure creds). Branding rules (not "Claude Code").

## Consequences

### Positive

- **One mental model, two runtimes.** Authors think "rvagent"; swarmdo picks local WASM (fast, free, ephemeral, no network) or Anthropic Managed (cloud, persistent, long-running, no local infra) per task — like it already picks `LocalTransport` vs `FederationTransport`.
- **Closes a real gap.** A cloud autonomous executor with persisted state and a full toolset is exactly what `task_assign` / hive workers (#1916 items 3/4) and long-running federation tasks need; Managed Agents is a turnkey option.
- **Swarmdo-tools-in-the-cloud.** Wiring `npx swarmdo mcp start` as a Managed Agent's MCP server gives a cloud-hosted swarmdo with zero local setup — a strong onboarding/demo story and a real ops capability.
- **First-party, low integration cost.** It's Anthropic's own API; `@anthropic-ai/sdk` is already in the dep tree somewhere; the conceptual mapping is 1:1 so the adapter is thin. Validated working today.
- **Convergent primitives.** Managed Agents' agent/environment/session/events/skills/mcp_servers/multiagent/outcomes are the same primitives swarmdo has — the integration is "speak the same nouns to a different harness", not an impedance mismatch.

### Negative

- **Cost surface.** Easy to rack up container-time + token spend; needs cost-tracking integration + pre-run estimates + a GC for orphaned sessions, or it becomes a footgun.
- **Beta exposure.** Wire shapes may shift; `multiagent`/`outcomes` are research-preview (gated). Maintenance burden until GA.
- **Two backends to keep behaviorally aligned.** `runtime: "wasm"` and `runtime: "managed"` must return compatible handle/result shapes; divergence (e.g. `wasm_agent_files` semantics) is a latent bug source — code review and a parity smoke (run the same trivial task on both runtimes, diff the result shape) are needed.
- **Network/credential dependency.** `managed` runtime can't work offline or without an Anthropic key + beta access; the WASM runtime is the floor.

### Neutral

- Opt-in; users who don't use `managed_agent_*` see no change. Worst case: an unused code path behind an env-var.
- This is "adopt an external standard" (Anthropic's harness), not invent one — same posture as ADR-114 (DSPy.ts).

## Implementation (2026-05-12)

Landed as a **separate `managed_agent_*` toolset** (rather than a `runtime:` flag on the existing `wasm_agent_*` tools — cleaner, zero risk to the WASM path; both toolsets now live in the renamed `swarmdo-agent` plugin):

- `plugins/swarmdo-wasm/` → **`plugins/swarmdo-agent/`** (`git mv`; `plugin.json` name/description/keywords now span both runtimes; `.claude-plugin/marketplace.json` entry + READMEs + `discover-plugins` skill + `verification/inventory.json` updated). The `wasm_agent_*` / `wasm_gallery_*` tool *names* are unchanged.
- **`v3/@swarmdo/cli/src/mcp-tools/managed-agent-tools.ts`** — 6 new MCP tools, registered in `mcp-client.ts`, wrapping the Managed Agents REST API with plain `fetch` (no new SDK dep): `managed_agent_create` (`agents.create` + `environments.create` + `sessions.create`), `managed_agent_prompt` (`events.send(user.message)` + poll `GET /events` until a terminal `session.status_*`, default 180 s / cap 600 s), `managed_agent_status`, `managed_agent_events` (full transcript + a summary), `managed_agent_list`, `managed_agent_terminate` (`DELETE /sessions/{id}` ± the env). Key from `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`; every tool degrades gracefully with a structured "use `wasm_agent_create` for a local no-key runtime" error when absent. ADR-112-compliant descriptions (each names when `wasm_agent_*` / native is the right call instead). `mcpServers` / `skills` / `packages` / `networking` / `initScript` pass through to the agent/environment config.
- **`plugins/swarmdo-agent/skills/managed-agent/SKILL.md`** + **`commands/managed-agent.md`** — the cloud-runtime skill/command (the WASM-vs-managed decision table, the key prereq + fallback, the `mcpServers`-reachability caveat, the cost/cleanup discipline).
- **`plugins/swarmdo-agent/scripts/smoke.sh`** + **`.github/workflows/swarmdo-agent-smoke.yml`** — structural CI guard (12 checks now: manifest is `swarmdo-agent` with both-runtime keywords; all 10 `wasm_*` + all 6 `managed_agent_*` referenced; managed-agent skill keeps an explicit `allowed-tools` + offers the `wasm_agent_create` fallback; ADR cross-refs). Also wired into the `audit-cli-mcp-tools` / `audit-tool-descriptions` guards (311 registered / 0 dangling / 0 no-guidance).

**Validated live** against `api.anthropic.com` with the org's Anthropic key (GCP `swarmdo/anthropic-api-key`), via `swarmdo mcp exec -t managed_agent_*`: `create` (haiku, custom system) → `{sessionId, agentId, environmentId, status:"idle", model:"claude-haiku-4-5-20251001"}`; `prompt` ("echo … > /tmp/r.txt && cat …") → `{finished:true, status:"idle", stopReason:"end_turn", assistantText:"Done.", toolUses:[{name:"bash", input:{command:"echo … && cat …"}}], eventCount:13}`; `terminate` → `{sessionDeleted:true, environmentDeleted:true}`. No-key path returns the graceful error. `claude --plugin-dir plugins/swarmdo-agent` loads the plugin and lists its skills (`managed-agent`, `wasm-agent`, `wasm-gallery`). `smoke.sh` 12/0; cli build clean.

**Not yet done (follow-ups, called out above):** `runtime:"managed"` as a flag on `wasm_agent_*` (unification); a deployed/tunneled HTTP swarmdo MCP server so the cloud agent gets swarmdo's 314 tools (the combo needs a reachable URL); `task_assign` / federation dispatch to a Managed Agent session (#1916 items 3/4 — a third executor); cost-tracking integration + a `doctor`/GC check for orphaned sessions; `multiagent` / `define-outcomes` (research-preview, feature-flagged).

## Links

- Claude Managed Agents — overview: https://platform.claude.com/docs/en/managed-agents/overview · quickstart: https://platform.claude.com/docs/en/managed-agents/quickstart · sessions API: https://platform.claude.com/docs/en/managed-agents/sessions · tools: https://platform.claude.com/docs/en/managed-agents/tools
- `@swarmvector/rvagent-wasm` (the `rvagent` backend) — dep of `@swarmdo/cli`; surfaced via the `swarmdo-agent` plugin's `wasm_agent_*` MCP tools
- ADR-095 G2 / ADR-104 — pluggable `ConsensusTransport` / `FederationTransport` (the local-vs-cloud pattern this reuses)
- ADR-097 — federation peers (a Managed Agent session ≈ a federated executor)
- ADR-026 — 3-tier model routing (Managed Agent `model` selection should route through this)
- ADR-112 — MCP tool discoverability (every new `*_agent_*({runtime:"managed"})` tool description must comply; must state the cost/beta caveats)
- ADR-117 — first consumer: `swarmdo-neural-trader` dispatches heavy backtests / Monte-Carlo / sweeps / model training to the `managed_agent_*` runtime (the `trader-cloud-backtest` skill), with cost-optimization rules
- #1916 — hive task-execution dispatch (Managed Agents as a third executor option)
