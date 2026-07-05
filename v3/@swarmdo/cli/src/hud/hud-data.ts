/**
 * hud-data.ts — read-only snapshot of swarmdo's local operational state for
 * the `swarmdo hud` single-pane view.
 *
 * Demand evidence: live-visibility tools are among the most-starred Claude
 * Code companions (claude-hud 26.2k★, claude-code-templates 28.5k★). This
 * HUD is swarmdo-native: instead of generic session state it composes the
 * subsystems this CLI already tracks — active 5h billing block (usage),
 * ready/blocked task graph (task-deps), daemon workers, memory db +
 * snapshots. Every source is a local read; collecting a HudData never
 * writes, spawns, or bills.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  activeBlockStats,
  aggregateBlocks,
  collectUsage,
  localDateKey,
  type ActiveBlockStats,
} from '../usage/transcript-usage.js';
import { loadTaskStore } from '../mcp-tools/task-tools.js';
import { blockedTasks, readyTasks } from '../mcp-tools/task-deps.js';

export interface HudTasks {
  total: number;
  ready: number;
  blocked: number;
  inProgress: string[];
  readyIds: string[];
}

export interface HudWorker {
  name: string;
  runCount: number;
  failureCount: number;
  isRunning: boolean;
  lastRun?: string;
}

export interface HudDaemon {
  running: boolean;
  workers: HudWorker[];
}

export interface HudMemory {
  dbPath: string;
  dbBytes: number | null;
  snapshots: number;
  newestSnapshot: string | null;
}

export interface HudData {
  generatedAt: string;
  cwd: string;
  /** null when no activity falls in the current 5h window */
  activeBlock: ActiveBlockStats | null;
  todayCostUsd: number;
  tasks: HudTasks;
  daemon: HudDaemon | null;
  memory: HudMemory;
}

function readDaemon(cwd: string): HudDaemon | null {
  const stateFile = path.join(cwd, '.swarmdo', 'daemon-state.json');
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as {
      running?: boolean;
      workers?: Record<string, { runCount?: number; failureCount?: number; isRunning?: boolean; lastRun?: string }>;
    };
    const workers = Object.entries(raw.workers ?? {}).map(([name, w]) => ({
      name,
      runCount: w.runCount ?? 0,
      failureCount: w.failureCount ?? 0,
      isRunning: w.isRunning ?? false,
      lastRun: w.lastRun,
    }));
    return { running: raw.running === true, workers };
  } catch {
    return null; // never initialized — valid state, render as "not running"
  }
}

function readMemory(cwd: string): HudMemory {
  const dbPath = path.join(cwd, '.swarm', 'memory.db');
  let dbBytes: number | null = null;
  try {
    dbBytes = fs.statSync(dbPath).size;
  } catch {
    /* no db yet */
  }
  let snapshots = 0;
  let newestSnapshot: string | null = null;
  try {
    const names = fs
      .readdirSync(path.join(cwd, '.swarm', 'backups'))
      .filter((f) => /^memory-\d{8}-\d{6}(-\d+)?\.db$/.test(f))
      .sort();
    snapshots = names.length;
    newestSnapshot = names[names.length - 1] ?? null;
  } catch {
    /* no backups dir */
  }
  return { dbPath, dbBytes, snapshots, newestSnapshot };
}

function readTasks(cwd: string): HudTasks {
  const store = loadTaskStore(cwd);
  const all = Object.values(store.tasks);
  return {
    total: all.length,
    ready: readyTasks(store).length,
    blocked: blockedTasks(store).length,
    inProgress: all.filter((t) => t.status === 'in_progress').map((t) => t.taskId).slice(0, 5),
    readyIds: readyTasks(store).map((t) => t.taskId).slice(0, 5),
  };
}

export interface CollectHudOptions {
  cwd?: string;
  nowMs?: number;
  /** override transcript dirs (tests) */
  usageDirs?: string[];
  /** skip the transcript scan entirely (tests / --no-usage) */
  skipUsage?: boolean;
}

export function collectHudData(opts: CollectHudOptions = {}): HudData {
  const cwd = opts.cwd ?? process.cwd();
  const nowMs = opts.nowMs ?? Date.now();

  let activeBlock: ActiveBlockStats | null = null;
  let todayCostUsd = 0;
  if (!opts.skipUsage) {
    // Bound the scan to yesterday-onward: an active 5h block can never
    // start earlier, and it keeps the HUD refresh cheap on big histories.
    const since = localDateKey(new Date(nowMs - 36 * 3_600_000));
    const collection = collectUsage({ dirs: opts.usageDirs, since });
    activeBlock = activeBlockStats(aggregateBlocks(collection.events, { nowMs }), nowMs);
    const today = localDateKey(new Date(nowMs));
    todayCostUsd = collection.events
      .filter((e) => e.dateKey === today)
      .reduce((sum, e) => sum + e.costUsd, 0);
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    cwd,
    activeBlock,
    todayCostUsd,
    tasks: readTasks(cwd),
    daemon: readDaemon(cwd),
    memory: readMemory(cwd),
  };
}
