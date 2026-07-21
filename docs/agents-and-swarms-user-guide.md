# Agents & Swarms — User Guide

The commands that **run and inspect multi-agent work**: individual agents, coordinated swarms, the task queue, saved sessions, the queen-led hive mind, and the autopilot completion loop.

Two kinds of command live here. The **status / list** commands are read-only and safe to run anytime — the output below is from real runs on this repo. The **spawn / init / create** commands *mutate state*, and a few make **billable model calls** — those are documented from their `--help` and flagged, not executed here.

---

## `agent list` — what agents exist?

List every agent registered with Swarmdo (running, idle, or bridged in from Claude Code). Alias: `agent ls`.

```
$ swarmdo agent list
Active Agents

+----+-----------------+--------+-------------+--------------+
| ID | Type            | Status | Created     | Last Acti... |
+----+-----------------+--------+-------------+--------------+
|    | engine-coder    | idle   | 11:58:41 pm | N/A          |
|    | workflow-sub... | idle   | 1:08:24 am  | N/A          |
|    | workflow-sub... | idle   | 1:08:24 am  | N/A          |
|    | workflow-sub... | idle   | 1:08:24 am  | N/A          |
+----+-----------------+--------+-------------+--------------+

[INFO] Total: 6 agents
```

**Use it for:** seeing who's alive before assigning work; confirming a bridge/registry synced.

> **Note:** in this run the **`ID` column came back blank** for every agent (see Troubleshooting). Types are also truncated in the fixed-width table.

**Related (mutating):** `agent spawn -t <type> [-n name] [--task "…"]` creates an agent (`--provider`/`--model`/`--timeout` flags; default provider `anthropic`). `agent stop`, `agent status <id>`, `agent logs`, `agent metrics`, `agent health`, and `agent bridge` round out the lifecycle. There is **no `agent execute` subcommand** — running work goes through `agent spawn --task` or the MCP `agent_run`/`agent_execute` tools.

---

## `swarm status` — how is the swarm doing?

Show the active swarm's progress, agent counts by state, task counts by state, and headline performance metrics.

```
$ swarmdo swarm status
Swarm Status: swarm-1784631690596-p4z1qx

Overall Progress: [##--------------------------------------] 5.0%

Agents
+-----------+-------+
| Status    | Count |
+-----------+-------+
| Active    |     0 |
| Idle      |    13 |
| Completed |     0 |
| Total     |    13 |
+-----------+-------+

Tasks
+-------------+-------+
| Status      | Count |
+-------------+-------+
| Total       |     0 |
+-------------+-------+

Performance Metrics
  - Tokens Used: unknown
  - Avg Response Time: no data
  - Success Rate: no data
```

**Use it for:** a one-glance health check on a running swarm; spotting stuck (all-idle) swarms.

> **Note:** with **0 total tasks** the header still reports **5.0% progress** (see Troubleshooting). "unknown / no data" metrics are the expected empty state before any work runs.

**Related (mutating):** `swarm init [-t topology] [-m max-agents] [--v3-mode]` (default topology `hierarchical`, max 15) sets up coordination; `swarm start -o "<objective>" -s <strategy>` kicks off execution; `swarm scale`, `swarm stop`, and `swarm coordinate --agents 15` manage it.

---

## `task list` — what's queued?

List tasks in the queue. By default shows pending/running; `--all` includes finished ones. Alias: `task ls`.

```
$ swarmdo task list
Tasks

[INFO] No tasks found matching criteria
```

**Use it for:** checking the work queue; confirming a `task create` landed.

**Related (read-only siblings):** `task ready` (tasks whose dependencies are all done), `task graph` (the dependency DAG), `task doctor` (which blocked tasks are still live vs permanently stuck), `task status <id>`.

**Related (mutating / billable):** `task create -t <type> -d "<desc>"` (with `--dependencies`, `--priority`, `--assign`, `--parent`); `task assign <id> -a <agent>` (or `--unassign`); `task cancel` / `task retry`. `task dispatch` and `task parse-prd` make **real LLM calls** (the latter is dry-run unless you pass `--confirm`).

---

## `session list` — what states have I saved?

List saved session snapshots — each captures memory, agent, and task state at a point in time. Alias: `session ls`.

```
$ swarmdo session list
Sessions

+----------------------+----------------------+--------+--------+-------+--------------------+
| ID                   | Name                 | Status | Agents | Tasks | Last Updated       |
+----------------------+----------------------+--------+--------+-------+--------------------+
| session-178464472... | session-178464472... | saved  |      0 |     0 | 29m ago            |
| session-178464456... | session-178464456... | saved  |      0 |     0 | 32m ago            |
| session-178456247... | session-178456247... | saved  |      0 |     0 | 23h 20m ago        |
| session-178426116... | session-178426116... | saved  |      0 |     0 | 17/07/2026 2:06... |
+----------------------+----------------------+--------+--------+-------+--------------------+

[INFO] Showing 10 of 10 sessions
```

**Use it for:** finding a checkpoint to restore; auditing when state was last saved.

**Related (mutating):** `session save -n "<name>"` (includes memory/agents/tasks by default — toggle with `--include-*`); `session restore <id>`; `session delete <id>`; `session export -o backup.json` / `session import backup.json`; `session current` shows the live session.

---

## `hive-mind status` — is the queen-led hive up?

Show the hive mind's ID, online/offline state, topology, consensus strategy, the queen's load, and the worker roster.

```
$ swarmdo hive-mind status
+----- Hive Mind Status ------+
| Hive ID: hive-1784646518813 |
| Status: offline             |
| Topology: mesh              |
| Consensus: byzantine        |
|                             |
| Queen: N/A                  |
|   Status: offline           |
|   Load: 0.0%                |
|   Queued Tasks: 0           |
+-----------------------------+

Worker Agents
[INFO] No workers in hive. Use "swarmdo hive-mind spawn" to add workers.
```

**Use it for:** confirming whether a hive is running and how many workers it holds.

**Related (mutating):** `hive-mind init [-t topology] [-c consensus] [-m max-agents]` (defaults `hierarchical-mesh` / `byzantine` / 15); `hive-mind spawn -n <count> [-r role]` adds workers, and `hive-mind spawn --claude -o "<objective>"` launches Claude Code under hive coordination. `hive-mind task`, `consensus`, `broadcast`, `memory`, and `shutdown` operate a live hive.

---

## `autopilot status` — is the completion loop armed?

Show the autopilot state — whether it's enabled, iteration/timeout budget, elapsed time, task progress, and which task sources it watches. Autopilot keeps re-engaging agents until every task is done.

```
$ swarmdo autopilot status
Autopilot: ✗ DISABLED
Session: 735ef56f...
Iterations: 0/50
Timeout: 240 min
Elapsed: 0 min
Tasks: 13/26 (50%)
Sources: team-tasks, swarm-tasks, file-checklist
```

**Use it for:** checking whether the persistent-completion loop is on and how close it is to its iteration/timeout cap.

**Related (mutating):** `autopilot enable` arms the loop; `autopilot disable` stops re-engagement; `autopilot config --max-iterations <n> --timeout <min>` sets the budget; `autopilot reset` zeroes the counter/timer. `autopilot check` is the stop-hook entry point; `learn` / `history` / `predict` mine past completion episodes. There is **no `autopilot run` subcommand** — `enable` plus the stop-hook `check` drive the loop.

---

## Workflows

| Goal | Command(s) |
|------|-----------|
| See who's available before assigning work | `agent list` |
| One-glance health of a running swarm | `swarm status` |
| What's ready to run right now? | `task ready` (then `task list --all` for history) |
| Why is a task blocked? | `task graph` + `task doctor` |
| Find a checkpoint to roll back to | `session list` → `session restore <id>` |
| Is the hive up and how big? | `hive-mind status` |
| Is the completion loop still working the backlog? | `autopilot status` |
| Stand up a fresh coding swarm | `swarm init` → `agent spawn` → `task create` → `task assign` |

The `*-status` / `*-list` commands are read-only. `spawn`, `init`, `create`, `assign`, `save`, and `enable` change state; `task dispatch`, `task parse-prd`, and `hive-mind spawn --claude` can make **billable model calls** — run those deliberately.

## Troubleshooting

| Symptom | What's happening |
|---------|------------------|
| `agent list` shows a **blank `ID` column** | Observed on this repo — every row's ID rendered empty, so `agent status`/`stop`/`logs <id>` have nothing to target from the table. Candidate bug. |
| `swarm status` shows **> 0% progress with 0 tasks** | The header read `5.0%` while the Tasks table totalled `0`. Progress looks decoupled from task count in the empty state. Candidate bug (cosmetic). |
| `swarmdo agent execute …` / `swarmdo autopilot run …` prints group help | Neither subcommand exists; the CLI **silently falls back to the parent command's help** instead of erroring on an unknown subcommand, which can mask a typo. Use `agent spawn` / `autopilot enable` respectively. |
| Table columns look cut off (`workflow-sub...`, `Last Acti...`) | Fixed-width table truncation — cosmetic; widen the terminal or use a JSON output flag where available. |
| `swarm status` metrics say `unknown` / `no data` | Expected empty state before any tasks have run. |

All status/list commands here are local and read-only — safe to wire into hooks or a HUD.
