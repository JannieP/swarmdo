# Ops, Config & Diagnostics — User Guide

The commands you reach for to answer *"is my install healthy, what's running, and how do I keep it tidy?"* — health checks, live system/daemon status, configuration, package updates, and artifact cleanup.

All output below is from real runs on this repo. The read-only commands (`doctor`, `status`, `daemon status`) are safe to run anytime. The mutating ones (`config set/reset`, `daemon start`, `update all`, `cleanup --force`) are documented from their `--help` and are **not** run here — treat them with care.

> **Two gotchas up front:** `config list` and `process list` are **not real subcommands**. They print a help screen and exit `0` without listing anything — see those sections for what to run instead.

---

## `config list` — ⚠ falls through to help (not a real command)

There is no `config list`. Running it prints a (slightly stale) usage screen and exits `0` — no error, no listing.

```
$ swarmdo config list
Configuration Management

Usage: swarmdo config <subcommand> [options]

Subcommands:
  - init       - Initialize configuration
  - get        - Get configuration value
  - set        - Set configuration value
  - providers  - Manage AI providers
  - reset      - Reset to defaults
  - export     - Export configuration
  - import     - Import configuration
```

Note this fallback even omits `lint`, which `config --help` does list. **To actually inspect config**, use `config get <key>` (e.g. `swarmdo config get swarm.topology`) or `config export`. To change it, `config set -k <key> -v <value>` (mutating — not run here).

**Use it for:** nothing — it's a no-op. Reach for `config get` / `config export` instead.

---

## `doctor` — is my install healthy?

Runs ~20 parallel health checks (Node, npm, git, config, daemon, memory DB, API keys, MCP servers, disk, TypeScript, integrations) and prints a pass/warn summary. Add `--fix` to *see* suggested commands (it does not auto-apply).

```
$ swarmdo doctor
Swarmdo Doctor
System diagnostics and health check
──────────────────────────────────────────────────
⚠ Version Freshness: v1.58.44 (cannot check registry)
✓ Node.js Version: v20.20.2 (>= 20 required)
✓ npm Version: v10.8.2
✓ Claude Code CLI: v2.1.216
✓ Git: v2.50.1 (Apple Git-155)
✓ Config File: Found: swarmdo.config.json
⚠ Daemon Status: Not running
✓ Memory Database: /Users/…/.swarm/memory.db (1.06 MB)
⚠ API Keys: Found: OPENAI_API_KEY (no Claude key)
✓ MCP Servers: 4 servers (swarmdo configured: top-level)
⚠ Disk Space: 76Gi available (82% used)
✓ TypeScript: v5.9.3
…
Summary: 14 passed, 7 warnings
```

*(Output trimmed — the full run prints 21 checks. Cosmetic note: when piped to a non-terminal, the "Running health checks in parallel…" spinner leaks its animation frames into the output before the results.)*

**Use it for:** first thing to run when something feels off, or after `init` / upgrades to confirm the environment is sane.

---

## `status` — what's running right now?

A snapshot of the live system: swarm state, agent counts, task counts, memory backend, and MCP server. `--watch` gives a live-updating view; `--health-check` runs checks and exits.

```
$ swarmdo status
Swarmdo V3 [STOPPED]

Swarm
[INFO]   Swarm not running

Agents
+--------+-------+
| Status | Count |
+--------+-------+
| Active |     0 |
| Idle   |     0 |
| Total  |     0 |
+--------+-------+
…
```

*(Trimmed — the full output also prints Tasks, Memory, and MCP Server tables, all zero/idle here since nothing is running.)*

**Use it for:** a quick "is anything live?" check; pair with `status agents` / `status tasks` / `status memory` for detail.

---

## `daemon status` — are the background workers alive?

Shows the worker daemon's state plus a per-worker table (enabled flag, idle/running, run counts, success rate, last/next run). Read-only. Starting/stopping it (`daemon start` / `daemon stop`) is mutating and not run here.

```
$ swarmdo daemon status
+----- Swarmdo Daemon -----+
| Status: ○ STOPPED        |
| PID: 49748               |
| TTL: 12h (self-shutdown) |
| Workers Enabled: 6       |
| Max Concurrent: 2        |
+--------------------------+

Worker Status
+-------------+----+----------+------+---------+----------+----------+
| Worker      | On | Status   | Runs | Success | Last Run | Next Run |
+-------------+----+----------+------+---------+----------+----------+
| map         | ✓  | idle     | 0    | 0%      | never    | -        |
| audit       | ✓  | idle     | 0    | 0%      | never    | -        |
| backup      | ✓  | idle     | 1    | 100%    | 15d ago  | -        |
+-------------+----+----------+------+---------+----------+----------+
```

*(Trimmed — the full table lists 9 workers. Note: the banner shows a `PID` even though status is `STOPPED`; treat that as a last-known/stale value, not a live process.)*

**Use it for:** confirming which background workers are enabled and whether they've been running; diagnosing why auto-audit/backup/consolidate haven't fired.

---

## `process list` — ⚠ falls through to help (not a real command)

Like `config list`, there is no `process list`. It prints the process help and exits `0`.

```
$ swarmdo process list
🔧 Process Management

Manage background processes, daemons, and workers.

Subcommands:
  daemon     - Manage background daemon process
  monitor    - Real-time process monitoring
  workers    - Manage background workers
  signals    - Send signals to processes
  logs       - View and manage process logs
```

**To actually see processes**, use `process monitor` (real-time view) or `process workers` / `process daemon`. Sending signals / spawning workers (`process signals`, `process workers --action spawn`) is mutating and not run here.

**Use it for:** nothing directly — it's a no-op. Use `process monitor` or `daemon status` instead.

---

## `update` — keep @swarmdo packages current (ADR-025)

Manages updates to the installed `@swarmdo` packages. `check` and `history` are read-only; `all` and `rollback` mutate your install and are **not** run here.

```
$ swarmdo update --help
swarmdo update
Manage @swarmdo package updates (ADR-025)

SUBCOMMANDS:
  check           Check for available @swarmdo package updates
  all             Update all @swarmdo packages
  history         View update history
  rollback        Rollback last update
  clear-cache     Clear update check cache
```

**Use it for:** `update check` to see if newer packages exist; `update history` / `update rollback` to review or undo a prior update.

---

## `cleanup` — remove swarmdo's project artifacts

Removes files swarmdo created in the project (`.swarm/`, generated config, etc.). **Dry-run by default** — it only deletes when you pass `--force`. Documented from `--help`; not executed here (destructive).

```
$ swarmdo cleanup --help
swarmdo cleanup
Remove project artifacts created by swarmdo/swarmdo

OPTIONS:
  -n, --dry-run             Show what would be removed without deleting (default behavior) [default: true]
  -f, --force               Actually delete the artifacts [default: false]
  -k, --keep-config         Preserve swarmdo.config.json and .claude/settings.json [default: false]

EXAMPLES:
  $ cleanup
    Show what would be removed (dry run)
  $ cleanup --force
    Remove all swarmdo artifacts
  $ cleanup --force --keep-config
    Remove artifacts but keep configuration files
```

**Use it for:** tearing swarmdo out of a project. Run bare first (dry-run) to preview, then `--force` (add `--keep-config` to keep your settings).

---

## Workflows

| Question | Command(s) |
|----------|-----------|
| Is my install healthy? | `doctor` (add `--fix` to see suggestions) |
| Is anything running right now? | `status` (or `status --watch`) |
| Are the background workers alive / firing? | `daemon status` |
| What's my current config value for X? | `config get <key>` — **not** `config list` |
| Show me running processes | `process monitor` — **not** `process list` |
| Am I on the latest packages? | `update check` |
| Remove swarmdo from this project | `cleanup` (preview) → `cleanup --force` |

## Troubleshooting / known issues

| Symptom | Cause / fix |
|---------|-------------|
| `config list` prints help, does nothing | Not a real subcommand (exits `0` silently). Use `config get` / `config export`. |
| `process list` prints help, does nothing | Not a real subcommand (exits `0` silently). Use `process monitor`. |
| `doctor` output has repeated "Running health checks…" noise | Cosmetic spinner leak when piped to a non-TTY; the check results below it are correct. |
| `daemon status` shows a PID but says STOPPED | Stale/last-known PID display; the daemon is not actually running. |
| `doctor` warns "API Keys: no Claude key" | Expected if only `OPENAI_API_KEY` is set; add an Anthropic key if you need Claude calls. |

The read-only commands here (`doctor`, `status`, `daemon status`) make no model calls and are safe to wire into hooks/CI.
