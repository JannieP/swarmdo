# rufflo-workflows

Workflow automation across **two complementary surfaces**:

1. **MCP `workflow_*` tools** — declarative, persisted workflow definitions with a full state-machine lifecycle (create → run ↔ pause → complete/cancel). Best for long-lived, resumable, human-gated pipelines.
2. **Native Claude Code `Workflow` JS** — imperative orchestration scripts (`.claude/workflows/*.js`) that fan subagents out deterministically via `agent` / `parallel` / `pipeline` / `phase`. Best for comprehensive fan-out: review, audit, migration, research.

Neither subsumes the other — see [Choosing a surface](#choosing-a-surface).

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install rufflo-workflows@rufflo
```

## Features

- **MCP workflow definitions**: multi-step processes with conditions, parallel steps, and templates
- **Lifecycle management**: execute, pause, resume, cancel running workflows
- **Approval gates**: manual pause points for human review
- **Native orchestration**: author `.claude/workflows/*.js` fan-out/pipeline scripts and run them with the `Workflow` tool

## Commands

- `/workflow` -- List MCP workflows + templates **and** native `.claude/workflows/*.js` scripts

## Skills

- `workflow-create` -- Author MCP workflow templates **or** native `.claude/workflows/*.js` orchestration scripts
- `workflow-run` -- Execute/manage MCP workflows **or** invoke + resume native workflows

## Compatibility

- **CLI:** pinned to `@rufflo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/rufflo-workflows/scripts/smoke.sh` is the contract.

## MCP surface (10 tools)

All defined at `v3/@rufflo/cli/src/mcp-tools/workflow-tools.ts`:

| Tool | Purpose |
|------|---------|
| `workflow_create` | Create a new workflow definition |
| `workflow_run` | Run a workflow with inputs |
| `workflow_execute` | Execute a one-shot workflow without persistence |
| `workflow_status` | Inspect a running workflow |
| `workflow_list` | List workflows |
| `workflow_pause` | Pause a running workflow |
| `workflow_resume` | Resume a paused workflow |
| `workflow_cancel` | Cancel a workflow |
| `workflow_delete` | Delete a workflow definition |
| `workflow_template` | Manage workflow templates |

## Lifecycle state machine

```
created ──run──→ running ──pause──→ paused ──resume──→ running
                    │                  │
                    │                  └──cancel──→ cancelled
                    │
                    ├──complete──→ completed
                    └──cancel────→ cancelled
```

| State | Allowed transitions |
|-------|--------------------|
| `created` | `running` (via `workflow_run`), `cancelled` (via `workflow_cancel`) |
| `running` | `paused` (via `workflow_pause`), `completed` (auto), `cancelled` (via `workflow_cancel`) |
| `paused` | `running` (via `workflow_resume`), `cancelled` (via `workflow_cancel`) |
| `completed` | terminal |
| `cancelled` | terminal |

`workflow_execute` is the **stateless** path — fire-and-forget, no persisted state machine.

## Native Workflow Orchestration (Claude Code `Workflow` tool)

The native surface runs a JavaScript orchestration script that fans subagents out deterministically. Scripts live in **`.claude/workflows/*.js`** and each begins with a **pure-literal** `export const meta` block — the `meta.name` makes it an invocable **named workflow**.

```js
export const meta = {
  name: 'plugin-contract-audit',
  description: 'Run every plugin smoke contract, diagnose failures, report',
  phases: [{ title: 'Sweep' }, { title: 'Diagnose' }, { title: 'Report' }],
}
// body runs inside an async wrapper — top-level await + return are legal
const sweep = await agent('run all plugins/*/scripts/smoke.sh ...', { schema: SWEEP_SCHEMA })
const failures = (sweep?.results || []).filter((r) => r.failed > 0)
const diagnoses = await parallel(failures.map((f) => () =>
  agent(`diagnose ${f.plugin}`, { schema: DIAGNOSIS_SCHEMA })))
return { audited: sweep.results.length, failures, diagnoses }
```

### The four-hook API

| Hook | Purpose |
|------|---------|
| `agent(prompt, opts)` | Spawn one subagent; with `opts.schema` returns validated structured output |
| `parallel(thunks)` | Run thunks concurrently with a **barrier** (await all) |
| `pipeline(items, ...stages)` | Run each item through all stages independently — **no barrier** |
| `phase(title)` / `log(msg)` | Progress grouping and narration |

`meta` MUST be a pure literal (no variables, calls, or interpolation). Use `parallel` only when you genuinely need every result together; otherwise prefer `pipeline`.

### Invocation

```js
Workflow({ name: 'plugin-contract-audit' })            // run a named .claude/workflows/*.js
Workflow({ scriptPath: '.claude/workflows/foo.js' })   // run a script by path
Workflow({ name: 'plugin-contract-audit', args: 'rufflo-agentdb' })  // pass args (the script's `args` global)
Workflow({ scriptPath, resumeFromRunId: 'wf_…' })      // resume — unchanged agent() calls return cached
```

The repo ships a reference workflow at `.claude/workflows/plugin-contract-audit.js` and a worked example at `.claude/workflows/intelligence-system-hardening.js`.

## Choosing a surface

| If you need… | Use |
|--------------|-----|
| A persisted definition that pauses for human approval and resumes across sessions | **MCP `workflow_*`** |
| A stateful lifecycle (`created → running ↔ paused → completed/cancelled`) the engine schedules | **MCP `workflow_*`** |
| Deterministic fan-out of many subagents (review N dimensions, audit N plugins, migrate N files) | **Native `Workflow` JS** |
| Structured, schema-validated results aggregated in code | **Native `Workflow` JS** |
| A one-shot stateless run | MCP `workflow_execute` **or** native `Workflow` |

## Namespace coordination

This plugin owns the `workflows-state` AgentDB namespace (kebab-case, follows the convention from [rufflo-agentdb ADR-0001 §"Namespace convention"](../rufflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`workflows-state` indexes workflow definitions, current state, run history, and template metadata. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/rufflo-workflows/scripts/smoke.sh
# Expected: "15 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — rufflo-workflows plugin contract (10-tool MCP surface, lifecycle state machine, smoke as contract)](./docs/adrs/0001-workflows-contract.md)
- [`ADR-0002` — native Claude Code Workflow orchestration (`.claude/workflows/*.js` fan-out) alongside the MCP surface](./docs/adrs/0002-native-workflow-orchestration.md)

## Related Plugins

- `rufflo-agentdb` — namespace convention owner
- `rufflo-loop-workers` — sibling automation surface (loops are recurring; workflows are stateful pipelines)
- `rufflo-sparc` — SPARC phase transitions can be modeled as workflows
