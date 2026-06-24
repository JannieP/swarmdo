# Rufflo V3 Statusline Daemon System

## Overview

Real-time statusline updates powered by SQLite-backed daemon processes that monitor V3 implementation progress, swarm activity, and security status.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                       │
├─────────────────────────────────────────────────────────────┤
│  SessionStart Hook                                           │
│  └─> daemon-manager.sh start                                │
│       ├─> swarm-monitor.sh (process detection, 3s)          │
│       └─> metrics-db.mjs daemon (SQLite sync, 30s)          │
├─────────────────────────────────────────────────────────────┤
│  statusline.sh (on-demand)                                   │
│  └─> Reads from:                                             │
│       ├─ .rufflo/metrics.db (primary, SQLite)          │
│       └─ .rufflo/metrics/*.json (exported, compat)     │
├─────────────────────────────────────────────────────────────┤
│  SessionEnd Hook                                             │
│  └─> daemon-manager.sh stop                                 │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Daemon Manager (`daemon-manager.sh`)

Central control for all background processes.

```bash
# Start all daemons
.claude/helpers/daemon-manager.sh start [swarm_interval] [metrics_interval]

# Stop all daemons
.claude/helpers/daemon-manager.sh stop

# Restart daemons
.claude/helpers/daemon-manager.sh restart

# Check status
.claude/helpers/daemon-manager.sh status
```

### 2. Metrics Database (`metrics-db.mjs`)

SQLite-based metrics storage using sql.js (WASM, cross-platform).

**Database Schema:**
```sql
-- V3 Implementation Progress
CREATE TABLE v3_progress (
  id INTEGER PRIMARY KEY,
  domains_completed INTEGER,    -- 0-5 bounded contexts
  ddd_progress INTEGER,         -- 0-100%
  total_modules INTEGER,        -- @rufflo modules
  total_files INTEGER,          -- TypeScript files
  total_lines INTEGER,          -- Lines of code
  last_updated TEXT
);

-- Security Audit Status
CREATE TABLE security_audit (
  id INTEGER PRIMARY KEY,
  status TEXT,                  -- PENDING|IN_PROGRESS|CLEAN
  cves_fixed INTEGER,           -- 0-3
  total_cves INTEGER,           -- 3 critical CVEs
  last_audit TEXT
);

-- Real-time Swarm Activity
CREATE TABLE swarm_activity (
  id INTEGER PRIMARY KEY,
  agentic_flow_processes INTEGER,
  mcp_server_processes INTEGER,
  estimated_agents INTEGER,
  swarm_active INTEGER,
  coordination_active INTEGER,
  last_updated TEXT
);

-- Per-Module Status
CREATE TABLE module_status (
  name TEXT PRIMARY KEY,
  files INTEGER,
  lines INTEGER,
  progress INTEGER,
  has_src INTEGER,
  has_tests INTEGER,
  last_updated TEXT
);

-- CVE Remediation Status
CREATE TABLE cve_status (
  id TEXT PRIMARY KEY,
  description TEXT,
  severity TEXT,
  status TEXT,                  -- pending|fixed
  fixed_by TEXT,                -- Implementing file
  last_updated TEXT
);
```

**Commands:**
```bash
# Sync metrics from V3 implementation
node .claude/helpers/metrics-db.mjs sync

# Export to JSON (backward compatibility)
node .claude/helpers/metrics-db.mjs export

# Get current status
node .claude/helpers/metrics-db.mjs status

# Run as daemon
node .claude/helpers/metrics-db.mjs daemon [interval_seconds]
```

### 3. Swarm Monitor (`swarm-monitor.sh`)

Real-time process detection for active agents.

```bash
# Single check
.claude/helpers/swarm-monitor.sh check

# Continuous monitoring
.claude/helpers/swarm-monitor.sh monitor [interval]

# Show status
.claude/helpers/swarm-monitor.sh status
```

### 4. Statusline (`statusline.sh`)

On-demand status display for Claude Code.

**Output Format:**
```
▊ Rufflo V3 ● agentic-flow@alpha  │  ⎇ v3
─────────────────────────────────────────────────────
🏗️  DDD Domains    [●●●●●]  5/5    ⚡ 1.0x → unverified (no benchmark)
🤖 Swarm Agents    ◉ [ 2/15]      🟢 CVE 3/3    💾 0%
🔧 Architecture    DDD ●93%  │  Security ●CLEAN  │  Memory ●AgentDB
─────────────────────────────────────────────────────
```

## Performance

### Benchmark Results

| Method | Avg Time | Relative |
|--------|----------|----------|
| SQLite (sql.js) | 138ms | 1.0x (baseline) |
| Bash/JSON | 1455ms | 10.5x slower |

SQLite provides **10.5x faster** metrics synchronization.

### Optimization Details

1. **sql.js WASM** - Pure JavaScript, no native compilation
2. **Single .db file** - Atomic updates, no file fragmentation
3. **Prepared statements** - Reduced SQL parsing overhead
4. **Periodic sync** - 30s default, configurable
5. **JSON export** - Backward compatibility with statusline.sh

## Hook Configuration

In `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 3000,
            "command": ".claude/helpers/daemon-manager.sh start 3 30"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 2000,
            "command": ".claude/helpers/daemon-manager.sh stop"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "/workspaces/rufflo/.claude/statusline.sh"
  }
}
```

## Files

| File | Purpose |
|------|---------|
| `.claude/helpers/daemon-manager.sh` | Daemon lifecycle management |
| `.claude/helpers/metrics-db.mjs` | SQLite metrics engine |
| `.claude/helpers/swarm-monitor.sh` | Process detection |
| `.claude/helpers/sync-v3-metrics.sh` | Legacy bash sync (deprecated) |
| `.claude/statusline.sh` | Status display |
| `.rufflo/metrics.db` | SQLite database |
| `.rufflo/metrics/*.json` | Exported JSON (compatibility) |
| `.rufflo/pids/*.pid` | Daemon PID files |
| `.rufflo/logs/*.log` | Daemon logs |

## Metrics Tracked

### V3 Progress
- Domains completed (0-5 bounded contexts)
- DDD architecture progress (0-100%)
- Module count (10 @rufflo modules)
- Files and lines of code

### Security
- CVE remediation status (0-3 fixed)
- Overall security status (PENDING/IN_PROGRESS/CLEAN)
- Per-CVE tracking

### Swarm Activity
- agentic-flow processes
- MCP server status
- Estimated active agents
- Coordination status

### Performance
- Flash Attention speedup target
- Memory reduction target
- Search improvement metrics

## Troubleshooting

### Daemons not starting
```bash
# Check logs
cat .rufflo/logs/daemon.log
cat .rufflo/logs/metrics-daemon.log

# Manual start
.claude/helpers/daemon-manager.sh start
```

### Stale metrics
```bash
# Force sync
node .claude/helpers/metrics-db.mjs sync

# Restart daemons
.claude/helpers/daemon-manager.sh restart
```

### Database corruption
```bash
# Remove and recreate
rm .rufflo/metrics.db
node .claude/helpers/metrics-db.mjs sync
```
