# Hooks, Neural & Routing — User Guide

Swarmdo's **self-learning layer**: the hooks that fire around your tool calls, the background workers that mine your codebase, the neural/SwarmVector stack that stores patterns, and the Q-Learning router that picks an agent for a task.

The status/list commands below are **read-only and safe to run anytime** — they inspect state, they don't change it. The *training* and *mutating* commands (`neural train`, `hooks pretrain`, `hooks build-agents`, `hooks post-task`) are grouped separately at the end and are described from `--help` only. All output below is from real runs on this repo (2026-07-22).

---

## `hooks list` — what hooks are registered?

Show every hook Swarmdo knows about, its trigger type, whether it's enabled, and how often it has fired. On a fresh checkout everything reads `No` / `Never` — hooks are opt-in.

```
$ swarmdo hooks list
Registered Hooks

+----------------------+--------------+---------+----------+------------+---------------+
| Name                 | Type         | Enabled | Priority | Executions | Last Executed |
+----------------------+--------------+---------+----------+------------+---------------+
| pre-edit             | PreToolUse   | No      |          |            | Never         |
| post-edit            | PostToolUse  | No      |          |            | Never         |
| pre-task             | PreToolUse   | No      |          |            | Never         |
| post-task            | PostToolUse  | No      |          |            | Never         |
| route                | intelligence | No      |          |            | Never         |
| session-start        | SessionStart | No      |          |            | Never         |
| intelligence         | intelligence | No      |          |            | Never         |
|  … 19 more rows …                                                                     |
+----------------------+--------------+---------+----------+------------+---------------+

[INFO] Total: 26 hooks
```

**Use it for:** confirming which hooks exist and whether any are wired in / have fired.

---

## `hooks worker list` — what background workers can I dispatch?

List the background workers (analysis/optimization jobs) with their priority, estimated runtime, and purpose. Nothing runs from this command — it's a catalogue.

```
$ swarmdo hooks worker list
Background Workers (12 Total)

+-------------+----------+-----------+------------------------------------------+
| Worker      | Priority | Est. Time | Description                              |
+-------------+----------+-----------+------------------------------------------+
| ultralearn  | normal   | 60s       | Deep knowledge acquisition and learning  |
| optimize    | high     | 30s       | Performance optimization and tuning      |
| consolidate | low      | 20s       | Memory consolidation and cleanup         |
| predict     | normal   | 15s       | Predictive preloading and anticipation   |
| audit       | critical | 45s       | Security analysis and vulnerability s... |
| map         | normal   | 30s       | Codebase mapping and architecture ana... |
| preload     | low      | 10s       | Resource preloading and cache warming    |
| deepdive    | normal   | 60s       | Deep code analysis and examination       |
| document    | normal   | 45s       | Auto-documentation generation            |
| refactor    | normal   | 30s       | Code refactoring suggestions             |
| benchmark   | normal   | 60s       | Performance benchmarking                 |
| testgaps    | normal   | 30s       | Test coverage analysis                   |
| backup      | low      | 5s        | WAL-safe memory.db snapshot with keep... |
+-------------+----------+-----------+------------------------------------------+

Performance targets:
  Trigger detection: <5ms
  Worker spawn: <50ms
  Max concurrent: 10
```

**Use it for:** discovering what analysis jobs you can dispatch (`hooks worker dispatch -t <name>`).

> **Known issue:** the header says `12 Total` (and `worker --help` says "12 workers"), but **13 rows** are listed — `backup` is the 13th and isn't counted. Off-by-one in the count string; the table itself is correct. See the troubleshooting table.

---

## `hooks worker status` — is anything running right now?

Report currently active workers. On an idle repo this is empty — the expected result when you haven't dispatched anything.

```
$ swarmdo hooks worker status
No active workers
```

**Use it for:** a quick "is a background job in flight?" check before dispatching or exiting.

---

## `neural status` — is the neural stack up?

A component-by-component readout of the SwarmVector / SONA neural stack: which pieces are active, loaded, available, or need installing. Useful sanity check before training or relying on semantic search.

```
$ swarmdo neural status
Neural Network Status (Real)
──────────────────────────────────────────────────
+----------------------+-------------+----------------------------------+
| Component            | Status      | Details                          |
+----------------------+-------------+----------------------------------+
| SONA Coordinator     | Active      | Adaptation: 1.02μs avg           |
| SwarmVector Training | Not loaded  | Call neural train to initialize  |
| SONA Engine          | Not loaded  | Optional, enable with --sona     |
| ReasoningBank        | Active      | 1 patterns stored                |
| HNSW Index           | Available   | @swarmvector/core installed (... |
| Embedding Model      | Loaded      | Xenova/all-MiniLM-L6-v2 (384-... |
| Flash Attention Ops  | Available   | batchCosineSim, softmax, topK    |
| Int8 Quantization    | Available   | ~4x memory reduction             |
| swarmllm Coordinator | Active      | SonaCoordinator | 0 trajectories |
| Contrastive Trainer  | Unavailable | Install @swarmvector/swarmllm    |
| Training Pipeline    | unavailable | JS fallback (no checkpoints)     |
| Graph Database       | Active      | 0 nodes, 0 edges                 |
+----------------------+-------------+----------------------------------+
```

**Use it for:** verifying the embedding model + HNSW are loaded, and seeing what's optional vs. missing. (`Not loaded` / `Unavailable` rows here are informational, not errors — training and the swarmllm extras are opt-in.)

> **Cosmetic note:** in a piped/non-TTY shell the progress spinner leaks a garbled line above the table (`... Checking neural systems...... Checking neural systems.....:`). Harmless — the table payload is correct.

---

## `neural patterns` — what has it learned?

List the cognitive patterns Swarmdo has persisted, with type, confidence, and how often each was used. Backed by a JSON file on disk, so it survives across sessions.

```
$ swarmdo neural patterns
Neural Patterns - list
────────────────────────────────────────
+--------------------+--------+------------+-------+
| ID                 | Type   | Confidence | Usage |
+--------------------+--------+------------+-------+
| pattern-1783386479 | result | 100.0%     | 10    |
+--------------------+--------+------------+-------+

Total: 1 patterns (persisted) | Trajectories: 0
✓ Loaded from: /Users/janpieterse/Projects/SwarmDo/.swarmdo/neural/patterns.json
```

**Use it for:** inspecting what the learning layer has accumulated; confirming persistence is working.

---

## `route` — which agent should take this task?

Q-Learning task-to-agent router. It analyses a task description and recommends an agent type, learning from feedback over time.

Note the argument shape (from `route --help`): the task is a **positional** argument, or you use the `task` subcommand. There is **no `--task` flag** — the only options are `-q/--q-learning` and `-a/--agent`.

```
$ swarmdo route --task "add JWT auth to the API"
Q-Learning Agent Router
Intelligent task-to-agent routing using reinforcement learning

Usage: swarmdo route <task> [options]
       swarmdo route <subcommand>

Subcommands:
  - task         - Route a task to optimal agent
  - list-agents  - List available agent types
  - stats        - Show router statistics
  ...
Backend Status:
  - SwarmVector: Available
  - Backend: swarmvector-native

Run "swarmdo route <subcommand> --help" for more info
```

The run above passed `--task`, which `route` does **not** recognise — so instead of routing it printed this overview and exited 0 (no routing decision, no error). The correct invocations, per `--help`, are:

```
$ swarmdo route "add JWT auth to the API"          # positional form
$ swarmdo route task "add JWT auth to the API"     # explicit subcommand
$ swarmdo route task "add JWT auth to the API" -j  # JSON output
```

*(These correct forms were not executed in this demonstration — only the `--task` variant above was run, and it produced the overview shown.)*

**Use it for:** picking an agent for a task, and (via `route stats` / `route feedback`) improving that choice over time.

> **Known issue:** `route --task "…"` is a silent no-op — an unrecognised flag makes the command print its overview and exit 0 rather than routing or reporting the bad flag. Drop `--task` and pass the task positionally. See the troubleshooting table.

---

## `progress` — how complete is V3?

A one-glance implementation-progress bar with a per-area breakdown. Also available as `hooks progress`.

```
$ swarmdo progress
V3 Implementation Progress

[██████████████████████████████] 99%

Breakdown:
  cli: 100%
  mcp: 100%
  hooks: 100%
  packages: 100%
  ddd: 90%
```

**Use it for:** a quick project-completeness snapshot; a friendly header for status reports.

---

## Training & mutating commands (described from `--help`, not run here)

These change state, train models, write files, or record learning data, so they were **not executed** in this read-only demonstration. Descriptions are from each command's `--help`.

| Command | What it does (per `--help`) | Key options |
|---------|-----------------------------|-------------|
| `neural train` | Train neural patterns with WASM SIMD acceleration (MicroLoRA + Flash Attention). | `-p` pattern type, `-e` epochs (50), `-l` learning-rate, `--flash`, `--moe`, `--contrastive` |
| `hooks pretrain` | Bootstrap intelligence from the repository (4-step pipeline + embeddings). Writes analysis + indexes documents. | `-p` path (`.`), `-d` depth, `--with-embeddings`, `--embedding-model`, `--file-types` |
| `hooks build-agents` | Generate optimized agent configs from pretrain data — **writes files** to an output dir. | `-o` output (`./agents`), `-f` focus, `--config-format` (yaml/json) |
| `hooks post-task` | Record task completion for learning (mutates the learning store). | `-i` task-id, `-s` success, `-q` quality, `-a` agent, `--depth` |

**Use them for:** `pretrain` → `build-agents` bootstraps the intelligence layer on a new repo; `neural train` grows the pattern set; `post-task` is the feedback signal that makes routing improve. Run them deliberately, not as status checks.

---

## Workflows

| Question | Command(s) |
|----------|-----------|
| Are any hooks wired in / firing? | `hooks list` |
| What background jobs can I dispatch? | `hooks worker list` → `hooks worker dispatch -t <name>` |
| Is a worker running right now? | `hooks worker status` |
| Is the embedding model + HNSW loaded? | `neural status` |
| What has the learning layer stored? | `neural patterns` |
| Which agent should take this task? | `route "<task>"` (positional) or `route task "<task>"` |
| How complete is the V3 build? | `progress` |
| Bootstrap intelligence on a new repo | `hooks pretrain` → `hooks build-agents` (mutating) |

## Troubleshooting / known issues

| Symptom | Cause / fix |
|---------|-------------|
| `route --task "…"` prints the overview and does nothing | `--task` is not a valid flag. Pass the task **positionally** (`route "…"`) or use the `task` subcommand (`route task "…"`). The command exits 0 with no error, so the no-op is easy to miss. |
| `hooks worker list` header says `12 Total` but shows 13 rows | Off-by-one in the count string — `backup` is the uncounted 13th worker. The table is complete; only the total is wrong. |
| `neural status` prints a garbled `... Checking neural systems...` line | Cosmetic spinner leak in non-TTY/piped output. The status table below it is correct. |
| `neural status` shows rows as `Not loaded` / `Unavailable` | Expected on a fresh repo — SwarmVector training, the SONA engine, and the swarmllm extras are opt-in. Run `neural train` / install extras to activate. |
| `hooks list` shows everything `No` / `Never` | Hooks are opt-in; none are enabled until you wire them into Claude Code settings. |

All status/list commands here are read-only and local — safe to run anytime, including inside CI or a pre-commit check.
