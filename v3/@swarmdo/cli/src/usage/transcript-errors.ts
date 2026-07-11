/**
 * transcript-errors.ts — tool-failure & error analytics over the same Claude
 * Code transcripts the `usage` command already reads. Cost analytics answers
 * "what did I spend"; this answers "what's failing" — which tools error most,
 * how often, and the most common failure messages. (Axis popularized by sniffly,
 * chiphuyen, 1.2k★.) Reuses defaultClaudeProjectDirs/findTranscriptFiles.
 *
 * Correlation: assistant `tool_use` blocks carry {id, name}; the following user
 * `tool_result` block carries {tool_use_id, is_error, content}. Matching id →
 * name gives per-tool call and error counts. The fold is pure and unit-tested;
 * only collectToolErrors touches the filesystem.
 */

import * as fs from 'node:fs';
import { defaultClaudeProjectDirs, findTranscriptFiles, normalizeDateBound } from './transcript-usage.js';

export interface ToolStat {
  tool: string;
  calls: number;
  errors: number;
  /** errors / calls, 0..1 */
  errorRate: number;
}
export interface ErrorSample {
  signature: string;
  tool: string;
  count: number;
  sample: string;
}
export interface ToolErrorReport {
  tools: ToolStat[];
  topErrors: ErrorSample[];
  totalCalls: number;
  totalErrors: number;
  filesScanned: number;
  sessionsWithErrors: number;
}

export interface Delegation {
  /** tool_use calls to the `Task` tool (subagent spawns) */
  taskCalls: number;
  /** all tool_use calls */
  toolCalls: number;
  /** taskCalls / toolCalls, 0..1 (0 when no tool calls) */
  ratio: number;
}

/**
 * Delegation ratio: what fraction of tool calls spawned a subagent (the `Task`
 * tool), from an already-collected tool report. The report's parsing/counting
 * is the tested collectToolErrors path — this just extracts the Task share. Pure.
 */
export function delegationFromReport(report: Pick<ToolErrorReport, 'tools' | 'totalCalls'>): Delegation {
  const taskCalls = report.tools.find((t) => t.tool === 'Task')?.calls ?? 0;
  const toolCalls = report.totalCalls;
  return { taskCalls, toolCalls, ratio: toolCalls > 0 ? taskCalls / toolCalls : 0 };
}

interface Block {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}
export interface ParsedLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  message?: { role?: string; content?: unknown };
}

export interface ErrorAccum {
  idToTool: Map<string, string>;
  calls: Map<string, number>;
  errors: Map<string, number>;
  sigs: Map<string, { tool: string; count: number; sample: string }>;
  sessionsWithErrors: Set<string>;
}

export function newAccum(): ErrorAccum {
  return { idToTool: new Map(), calls: new Map(), errors: new Map(), sigs: new Map(), sessionsWithErrors: new Set() };
}

/** Flatten tool_result content (string, or array of {type:'text',text}) to text. */
export function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

/** Bucket an error message to its *kind* so like errors group together: take
 * the first non-empty line, then collapse the parts that vary run-to-run —
 * quoted values (usually paths/args) → '…', bare absolute paths → <path>,
 * hex ids and numbers → #. Truncated to keep buckets tidy. */
export function errorSignature(raw: string): string {
  const firstLine = (raw.split('\n').find((l) => l.trim()) ?? raw).trim();
  const norm = firstLine
    .replace(/'[^']*'/g, "'…'")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/(?:\/[\w.-]+){2,}/g, '<path>')
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/\b[0-9a-f]{7,}\b/gi, '#')
    .replace(/\d+/g, '#');
  return norm.slice(0, 120) || '(empty error)';
}

/** Process one parsed transcript line into the accumulator. */
export function foldLine(acc: ErrorAccum, line: ParsedLine): void {
  const content = line.message?.content;
  if (!Array.isArray(content)) return;
  const sid = line.sessionId ?? '';
  for (const b of content as Block[]) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'tool_use' && b.id && b.name) {
      acc.idToTool.set(b.id, b.name);
    } else if (b.type === 'tool_result') {
      const tool = (b.tool_use_id && acc.idToTool.get(b.tool_use_id)) || 'unknown';
      acc.calls.set(tool, (acc.calls.get(tool) ?? 0) + 1);
      if (b.is_error) {
        acc.errors.set(tool, (acc.errors.get(tool) ?? 0) + 1);
        if (sid) acc.sessionsWithErrors.add(sid);
        const text = blockText(b.content);
        const sig = errorSignature(text);
        const cur = acc.sigs.get(sig) ?? { tool, count: 0, sample: text.slice(0, 200) };
        cur.count++;
        acc.sigs.set(sig, cur);
      }
    }
  }
}

export function finalizeReport(acc: ErrorAccum, filesScanned: number, topN = 12): ToolErrorReport {
  const tools: ToolStat[] = [...acc.calls.entries()]
    .map(([tool, calls]) => {
      const errors = acc.errors.get(tool) ?? 0;
      return { tool, calls, errors, errorRate: calls > 0 ? errors / calls : 0 };
    })
    .sort((a, b) => b.errors - a.errors || b.calls - a.calls);
  const topErrors: ErrorSample[] = [...acc.sigs.entries()]
    .map(([signature, v]) => ({ signature, tool: v.tool, count: v.count, sample: v.sample }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
  const totalCalls = tools.reduce((s, t) => s + t.calls, 0);
  const totalErrors = tools.reduce((s, t) => s + t.errors, 0);
  return { tools, topErrors, totalCalls, totalErrors, filesScanned, sessionsWithErrors: acc.sessionsWithErrors.size };
}

export interface CollectErrorsOptions {
  dirs?: string[];
  since?: string;
  until?: string;
}

/** Walk transcripts and produce the tool-error report. Malformed lines and
 * unreadable files are skipped, never fatal (same discipline as collectUsage). */
export function collectToolErrors(opts: CollectErrorsOptions = {}): ToolErrorReport {
  const dirs = opts.dirs && opts.dirs.length > 0 ? opts.dirs : defaultClaudeProjectDirs();
  const since = normalizeDateBound(opts.since);
  const until = normalizeDateBound(opts.until);
  const acc = newAccum();
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
        foldLine(acc, line);
      }
    }
  }
  return finalizeReport(acc, filesScanned);
}
