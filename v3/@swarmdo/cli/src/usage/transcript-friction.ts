/**
 * transcript-friction.ts — interruption + error-category analytics over the same
 * Claude Code transcripts the `usage` command already reads. `usage errors`
 * answers "which tools fail"; this answers "where does Claude waste my turns" —
 * how often you interrupt it (ESC mid-turn), which tool was running when you did,
 * and what KIND of errors dominate (NotFound/Permission/Timeout/Network/Syntax).
 * The interruption axis + human-meaningful error categories are the sniffly
 * (chiphuyen, 1.2k★) headline signals `usage errors` left on the table (#102).
 *
 * The fold is pure and unit-tested; only collectFriction touches the filesystem.
 * Reuses blockText / ParsedLine (transcript-errors) + the transcript plumbing.
 */

import * as fs from 'node:fs';
import { defaultClaudeProjectDirs, findTranscriptFiles, normalizeDateBound } from './transcript-usage.js';
import { blockText, type ParsedLine } from './transcript-errors.js';

export type ErrorCategory = 'NotFound' | 'Permission' | 'Timeout' | 'Network' | 'Syntax' | 'Other';
export const ERROR_CATEGORIES: ErrorCategory[] = ['NotFound', 'Permission', 'Timeout', 'Network', 'Syntax', 'Other'];

export interface ToolInterruptions {
  /** tool name that was running when interrupted, or '(idle)' when none was */
  tool: string;
  interruptions: number;
}
export interface CategoryShare {
  category: ErrorCategory;
  count: number;
  /** count / totalErrors, 0..1 (0 when no errors) */
  share: number;
}
export interface FrictionReport {
  interruptions: number;
  assistantTurns: number;
  /** interruptions / assistantTurns, 0 when no turns (never divides by zero) */
  interruptionRate: number;
  byTool: ToolInterruptions[];
  categories: CategoryShare[];
  totalErrors: number;
  filesScanned: number;
}

interface Block { type?: string; id?: string; name?: string; tool_use_id?: string; is_error?: boolean; content?: unknown; text?: unknown; }

/** Bucket used when an interruption happened outside any running tool. */
export const IDLE_CONTEXT = '(idle)';

/**
 * Does a user-role text block read as an ESC interruption sentinel? Matches the
 * whole family at the START of the text (real transcripts show "[Request
 * interrupted by user]", "… for tool use]", "…]", and bare "Request
 * interrupted") — anchored so an incidental mid-sentence mention doesn't count.
 */
export function isInterruptionText(text: string): boolean {
  return /^\s*\[?\s*request interrupted/i.test(text);
}

/**
 * Map a tool-error message to a human-meaningful category. Order matters:
 * specific buckets come before the broad Syntax catch so e.g. "no such file"
 * lands in NotFound, not Syntax. Everything unmatched is Other. Pure.
 */
export function classifyError(raw: string): ErrorCategory {
  const s = raw.toLowerCase();
  if (/\bnot found\b|no such file|enoent|does not exist|cannot find|doesn'?t exist|\b404\b/.test(s)) return 'NotFound';
  if (/permission denied|\beacces\b|\beperm\b|not permitted|unauthori[sz]ed|forbidden|\b403\b/.test(s)) return 'Permission';
  if (/timed ?out|\betimedout\b|timeout|deadline exceeded/.test(s)) return 'Timeout';
  if (/econnrefused|econnreset|enotfound|network|socket hang|getaddrinfo|fetch failed|\bdns\b/.test(s)) return 'Network';
  if (/syntax|parse error|unexpected token|invalid |compil|typeerror|referenceerror|cannot read propert/.test(s)) return 'Syntax';
  return 'Other';
}

export interface FrictionAccum {
  interruptions: number;
  assistantTurns: number;
  byTool: Map<string, number>;
  categories: Map<ErrorCategory, number>;
  totalErrors: number;
  /** open tool_use id → name; cleared on its result, or on an interruption */
  openTools: Map<string, string>;
  /** most recent tool_use name (open or already-resolved); reset per turn on an
   * interruption. Used to attribute a "…for tool use]" sentinel even after the
   * interrupted tool's (often synthetic) result already landed. */
  lastToolName: string | null;
}

export function newFrictionAccum(): FrictionAccum {
  return { interruptions: 0, assistantTurns: 0, byTool: new Map(), categories: new Map(), totalErrors: 0, openTools: new Map(), lastToolName: null };
}

/** Fold one parsed transcript line into the accumulator. Pure (no fs). */
export function foldFriction(acc: FrictionAccum, line: ParsedLine): void {
  const role = line.message?.role;
  if (role === 'assistant') acc.assistantTurns++;
  const content = line.message?.content;
  if (!Array.isArray(content)) return;
  for (const b of content as Block[]) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'tool_use' && b.id && b.name) {
      acc.openTools.set(b.id, b.name);
      acc.lastToolName = b.name;
    } else if (b.type === 'tool_result') {
      if (b.tool_use_id) acc.openTools.delete(b.tool_use_id);
      if (b.is_error) {
        acc.totalErrors++;
        const cat = classifyError(blockText(b.content));
        acc.categories.set(cat, (acc.categories.get(cat) ?? 0) + 1);
      }
    } else if (b.type === 'text' && role === 'user' && typeof b.text === 'string' && isInterruptionText(b.text)) {
      acc.interruptions++;
      // Attribute to: a still-open tool (interrupted mid-execution) → else, when
      // the sentinel says "for tool use", the last tool used even if its
      // (synthetic) result already landed → else idle.
      const open = [...acc.openTools.values()];
      const tool = open.length > 0
        ? open[open.length - 1]
        : /for tool use/i.test(b.text) && acc.lastToolName
          ? acc.lastToolName
          : IDLE_CONTEXT;
      acc.byTool.set(tool, (acc.byTool.get(tool) ?? 0) + 1);
      acc.openTools.clear();       // an interrupt ends the pending turn
      acc.lastToolName = null;
    }
  }
}

export function finalizeFriction(acc: FrictionAccum, filesScanned: number): FrictionReport {
  const byTool = [...acc.byTool.entries()]
    .map(([tool, interruptions]) => ({ tool, interruptions }))
    .sort((a, b) => b.interruptions - a.interruptions || a.tool.localeCompare(b.tool));
  const categories = [...acc.categories.entries()]
    .map(([category, count]) => ({ category, count, share: acc.totalErrors > 0 ? count / acc.totalErrors : 0 }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return {
    interruptions: acc.interruptions,
    assistantTurns: acc.assistantTurns,
    interruptionRate: acc.assistantTurns > 0 ? acc.interruptions / acc.assistantTurns : 0,
    byTool,
    categories,
    totalErrors: acc.totalErrors,
    filesScanned,
  };
}

export interface CollectFrictionOptions { dirs?: string[]; since?: string; until?: string; }

/** Walk transcripts and produce the friction report. Malformed lines and
 * unreadable files are skipped, never fatal (same discipline as collectUsage). */
export function collectFriction(opts: CollectFrictionOptions = {}): FrictionReport {
  const dirs = opts.dirs && opts.dirs.length > 0 ? opts.dirs : defaultClaudeProjectDirs();
  const since = normalizeDateBound(opts.since);
  const until = normalizeDateBound(opts.until);
  const acc = newFrictionAccum();
  let filesScanned = 0;

  for (const dir of dirs) {
    for (const { file } of findTranscriptFiles(dir)) {
      filesScanned++;
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const raw of content.split('\n')) {
        if (!raw.trim()) continue;
        let line: ParsedLine;
        try {
          line = JSON.parse(raw) as ParsedLine;
        } catch {
          continue;
        }
        if (since || until) {
          const day = line.timestamp ? line.timestamp.slice(0, 10) : '';
          if (day) {
            if (since && day < since) continue;
            if (until && day > until) continue;
          }
        }
        foldFriction(acc, line);
      }
    }
  }
  return finalizeFriction(acc, filesScanned);
}
