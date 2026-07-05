/**
 * transcript-usage.ts — reads Claude Code's local transcript JSONL files
 * (`~/.claude/projects/<encoded-cwd>/<session>.jsonl`) and aggregates token
 * usage + dollar cost per day / month / model / project / session.
 *
 * Capability modeled on ccusage (github.com/ccusage/ccusage, MIT © ryoppippi)
 * — the highest-adopted Claude Code companion tool — as an independent
 * implementation against swarmdo CLI conventions.
 *
 * Cost per entry: the transcript's own `costUSD` when present, else computed
 * from claude-pricing.ts, else 0 with the model surfaced as "unpriced".
 *
 * Dedup: resumed/forked sessions copy prior history into new files, and one
 * API response with several content blocks is written as several JSONL lines
 * that all carry the same (message.id, requestId). Counting each pair once is
 * what makes the totals match what Anthropic billed.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveTranscriptPrice, transcriptCostUsd } from './claude-pricing.js';

/** One deduplicated billed API response. */
export interface UsageEvent {
  /** local-time YYYY-MM-DD */ dateKey: string;
  /** local-time YYYY-MM */ monthKey: string;
  timestampMs: number;
  model: string;
  /** real cwd when the entry carries one, else the encoded project dir name */
  project: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  costSource: 'transcript' | 'computed' | 'unpriced';
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  entries: number;
}

export interface UsageCollection {
  events: UsageEvent[];
  filesScanned: number;
  dirsScanned: string[];
  unpricedModels: string[];
}

export interface CollectOptions {
  /** explicit `projects` dirs; replaces auto-discovery when set */
  dirs?: string[];
  /** inclusive local-date bound, YYYY-MM-DD */
  since?: string;
  /** inclusive local-date bound, YYYY-MM-DD */
  until?: string;
}

/** YYYY-MM-DD in the process-local timezone (en-CA renders ISO order). */
export function localDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * Claude Code data roots that exist on this machine, in precedence order:
 * $CLAUDE_CONFIG_DIR, ~/.claude, ~/.config/claude — each contributing its
 * `projects/` subdir.
 */
export function defaultClaudeProjectDirs(): string[] {
  const home = os.homedir();
  const roots = [
    process.env.CLAUDE_CONFIG_DIR,
    path.join(home, '.claude'),
    path.join(home, '.config', 'claude'),
  ].filter((r): r is string => typeof r === 'string' && r.length > 0);

  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const root of roots) {
    const projects = path.join(root, 'projects');
    let real: string;
    try {
      real = fs.realpathSync(projects);
    } catch {
      continue; // does not exist
    }
    if (!seen.has(real)) {
      seen.add(real);
      dirs.push(projects);
    }
  }
  return dirs;
}

interface TranscriptFile {
  file: string;
  /** encoded project dir name, e.g. '-Users-jan-Projects-ruflo' */
  project: string;
}

/** All .jsonl files under a `projects/` dir (recursive — subagents nest). */
export function findTranscriptFiles(projectsDir: string): TranscriptFile[] {
  const out: TranscriptFile[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    walk(path.join(projectsDir, entry.name), entry.name, out);
  }
  return out;
}

function walk(dir: string, project: string, out: TranscriptFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, project, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push({ file: p, project });
  }
}

/** Loose shape of the transcript lines we care about. */
interface TranscriptLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  requestId?: string;
  cwd?: string;
  costUSD?: number;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/** Accept 'YYYY-MM-DD' or 'YYYYMMDD'; returns YYYY-MM-DD or undefined. */
export function normalizeDateBound(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return undefined;
}

/**
 * Scan transcripts and return deduplicated usage events.
 * Malformed lines and unreadable files are skipped, never fatal — a usage
 * report must not fail because one session file is mid-write.
 */
export function collectUsage(opts: CollectOptions = {}): UsageCollection {
  const dirs = opts.dirs && opts.dirs.length > 0 ? opts.dirs : defaultClaudeProjectDirs();
  const since = normalizeDateBound(opts.since);
  const until = normalizeDateBound(opts.until);

  const events: UsageEvent[] = [];
  const unpriced = new Set<string>();
  const seen = new Set<string>();
  let filesScanned = 0;

  for (const dir of dirs) {
    for (const { file, project } of findTranscriptFiles(dir)) {
      filesScanned++;
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        let parsed: TranscriptLine;
        try {
          parsed = JSON.parse(line) as TranscriptLine;
        } catch {
          continue;
        }
        const event = toUsageEvent(parsed, project, seen, unpriced);
        if (!event) continue;
        if (since && event.dateKey < since) continue;
        if (until && event.dateKey > until) continue;
        events.push(event);
      }
    }
  }

  return {
    events,
    filesScanned,
    dirsScanned: dirs,
    unpricedModels: Array.from(unpriced).sort(),
  };
}

function toUsageEvent(
  line: TranscriptLine,
  project: string,
  seen: Set<string>,
  unpriced: Set<string>,
): UsageEvent | undefined {
  const usage = line.message?.usage;
  if (!usage) return undefined;
  const isAssistant = line.type === 'assistant' || line.message?.role === 'assistant';
  if (!isAssistant) return undefined;

  const model = line.message?.model ?? 'unknown';
  if (model === '<synthetic>') return undefined; // error placeholders carry no billing

  if (!line.timestamp) return undefined;
  const ts = new Date(line.timestamp);
  if (Number.isNaN(ts.getTime())) return undefined;

  // One (message.id, requestId) pair = one billed response, however many
  // content-block lines or resumed-session copies exist.
  if (line.message?.id) {
    const key = `${line.message.id}:${line.requestId ?? ''}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
  }

  const tokens = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };

  let costUsd: number;
  let costSource: UsageEvent['costSource'];
  const price = resolveTranscriptPrice(model);
  if (typeof line.costUSD === 'number') {
    costUsd = line.costUSD;
    costSource = 'transcript';
  } else if (price) {
    costUsd = transcriptCostUsd(price, tokens);
    costSource = 'computed';
  } else {
    costUsd = 0;
    costSource = 'unpriced';
    unpriced.add(model);
  }

  const dateKey = localDateKey(ts);
  return {
    dateKey,
    monthKey: dateKey.slice(0, 7),
    timestampMs: ts.getTime(),
    model,
    project: typeof line.cwd === 'string' && line.cwd.length > 0 ? line.cwd : project,
    sessionId: line.sessionId ?? 'unknown',
    ...tokens,
    costUsd,
    costSource,
  };
}

export type UsageDimension = 'day' | 'month' | 'model' | 'project' | 'session';

const DIMENSION_KEY: Record<UsageDimension, (e: UsageEvent) => string> = {
  day: (e) => e.dateKey,
  month: (e) => e.monthKey,
  model: (e) => e.model,
  project: (e) => e.project,
  session: (e) => `${e.project} · ${e.sessionId.slice(0, 8)}`,
};

function emptyTotals(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    entries: 0,
  };
}

function addEvent(t: UsageTotals, e: UsageEvent): void {
  t.inputTokens += e.inputTokens;
  t.outputTokens += e.outputTokens;
  t.cacheWriteTokens += e.cacheWriteTokens;
  t.cacheReadTokens += e.cacheReadTokens;
  t.totalTokens += e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens;
  t.costUsd += e.costUsd;
  t.entries += 1;
}

/**
 * Group events along one dimension. Time dimensions sort chronologically;
 * the rest sort by descending cost (what a "top spenders" view wants).
 */
export function aggregateUsage(
  events: UsageEvent[],
  dimension: UsageDimension,
): Array<{ key: string; totals: UsageTotals }> {
  const keyOf = DIMENSION_KEY[dimension];
  const groups = new Map<string, UsageTotals>();
  for (const e of events) {
    const key = keyOf(e);
    let t = groups.get(key);
    if (!t) {
      t = emptyTotals();
      groups.set(key, t);
    }
    addEvent(t, e);
  }
  const rows = Array.from(groups.entries()).map(([key, totals]) => ({ key, totals }));
  if (dimension === 'day' || dimension === 'month') {
    rows.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    rows.sort((a, b) => b.totals.costUsd - a.totals.costUsd || b.totals.totalTokens - a.totals.totalTokens);
  }
  return rows;
}

/** Grand total across all events. */
export function totalUsage(events: UsageEvent[]): UsageTotals {
  const t = emptyTotals();
  for (const e of events) addEvent(t, e);
  return t;
}
