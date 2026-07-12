/**
 * command-usage/usage.ts — a hot/cold/orphan USAGE report for a project's
 * authored `.claude/` surface. `config lint` validates these files; this answers
 * the orthogonal "are they actually used?" by joining the DEFINED set
 * (`.claude/commands/**​/*.md` + `.claude/agents/**​/*.md`) against INVOCATION
 * counts mined from the local transcripts (`<command-name>` markers +
 * `"subagent_type"` fields). Three buckets: hot (defined & invoked), cold
 * (defined, never invoked → prune candidates), orphan (invoked, not defined →
 * typo / removed / builtin). #101.
 *
 * The parsers + join are pure and unit-tested; only collectCommandUsage touches
 * the filesystem. Reuses defaultClaudeProjectDirs/findTranscriptFiles.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultClaudeProjectDirs, findTranscriptFiles } from '../usage/transcript-usage.js';

export interface UsageItem { name: string; count: number; }
export interface UsageBuckets {
  /** defined AND invoked (count > 0), desc by count */
  hot: UsageItem[];
  /** defined but never invoked — prune candidates, sorted */
  cold: string[];
  /** invoked but not defined (typo / removed / builtin), sorted */
  orphan: string[];
}
export interface CommandUsageReport {
  commands: UsageBuckets;
  agents: UsageBuckets;
  filesScanned: number;
  definedCommands: number;
  definedAgents: number;
  scope: 'project' | 'all';
}

const uniqSort = (xs: string[]): string[] => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

/**
 * Count custom slash-command invocations from raw transcript lines. Scoped to
 * user-role lines (the `<command-name>` marker is injected on the user turn) so
 * an assistant merely quoting the marker never inflates a count. The captured
 * name is de-slashed (`/goal` → `goal`) to match the discovered-file key space.
 * Pure.
 */
export function parseCommandInvocations(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!/"(?:type|role)"\s*:\s*"user"/.test(line)) continue;
    for (const m of line.matchAll(/<command-name>([^<]+)<\/command-name>/g)) {
      const name = m[1].trim().replace(/^\/+/, '');
      if (!name || name === '…') continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Count subagent (Task tool) invocations by `subagent_type` from raw transcript
 * lines. Not user-scoped — the field lives in an assistant `tool_use` block. Pure.
 */
export function parseSubagentInvocations(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const m of line.matchAll(/"subagent_type"\s*:\s*"([^"]+)"/g)) {
      const name = m[1].trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** Merge src counts into dest (dest mutated). */
export function mergeCounts(dest: Map<string, number>, src: Map<string, number>): void {
  for (const [k, v] of src) dest.set(k, (dest.get(k) ?? 0) + v);
}

/**
 * Join a DEFINED name list against INVOCATION counts into hot/cold/orphan. Both
 * sides are compared de-slashed, so a defined `/build` matches a `build` count
 * (agents carry no slash, so they're unaffected). Pure & deterministic. */
export function joinUsage(defined: string[], counts: Map<string, number> | Record<string, number>): UsageBuckets {
  const asMap = counts instanceof Map ? counts : new Map(Object.entries(counts));
  const norm = (n: string): string => n.replace(/^\/+/, '');
  const get = (n: string): number => asMap.get(norm(n)) ?? 0;
  const definedNorm = new Set(defined.map(norm));

  const hot: UsageItem[] = [];
  const cold: string[] = [];
  for (const d of defined) {
    const c = get(d);
    if (c > 0) hot.push({ name: d, count: c });
    else cold.push(d);
  }
  const orphan: string[] = [];
  for (const [k, v] of asMap) {
    if (v > 0 && !definedNorm.has(norm(k))) orphan.push(k);
  }
  hot.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { hot, cold: uniqSort(cold), orphan: uniqSort(orphan) };
}

/** All `.md` files under `root`, as paths RELATIVE to root (recursive; skips
 * dotfiles). Mirrors config.ts's walkMd so `config lint` and this command agree
 * on what counts as "defined". */
function walkMdRel(root: string): string[] {
  const out: string[] = [];
  const rec = (dir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) rec(path.join(dir, e.name), rel);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(rel);
    }
  };
  rec(root, '');
  return out;
}

/**
 * Discover the authored `.claude/` surface for a project. Command names use
 * Claude Code's subdir namespacing (`.claude/commands/sDo/x.md` → `sDo:x`, top
 * level → `x`) to match the `<command-name>` marker; agent names are the file
 * basename (subagent_type is never namespaced). Pure w.r.t. inputs (reads fs).
 */
export function discoverAuthored(cwd: string): { commands: string[]; agents: string[] } {
  const commands = walkMdRel(path.join(cwd, '.claude', 'commands')).map((rel) =>
    rel.replace(/\.md$/, '').split('/').join(':'),
  );
  const agents = walkMdRel(path.join(cwd, '.claude', 'agents')).map((rel) =>
    path.basename(rel).replace(/\.md$/, ''),
  );
  return { commands: uniqSort(commands), agents: uniqSort(agents) };
}

export interface CollectOptions {
  cwd?: string;
  /** scan every project's transcripts (default: only the current project) */
  all?: boolean;
}

/** The encoded transcript-dir name Claude Code uses for a project path. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/** Build the full report: discover authored files, mine invocation counts from
 * the (project-scoped, or --all) transcripts, and join. fs-touching wrapper. */
export function collectCommandUsage(opts: CollectOptions = {}): CommandUsageReport {
  const cwd = opts.cwd ?? process.cwd();
  const { commands: definedCommands, agents: definedAgents } = discoverAuthored(cwd);
  const encoded = encodeProjectDir(cwd);

  const cmdCounts = new Map<string, number>();
  const agentCounts = new Map<string, number>();
  let filesScanned = 0;

  for (const dir of defaultClaudeProjectDirs()) {
    for (const t of findTranscriptFiles(dir)) {
      if (!opts.all && t.project !== encoded) continue;
      filesScanned++;
      let content: string;
      try { content = fs.readFileSync(t.file, 'utf8'); } catch { continue; }
      const fileLines = content.split('\n');
      mergeCounts(cmdCounts, parseCommandInvocations(fileLines));
      mergeCounts(agentCounts, parseSubagentInvocations(fileLines));
    }
  }

  return {
    commands: joinUsage(definedCommands, cmdCounts),
    agents: joinUsage(definedAgents, agentCounts),
    filesScanned,
    definedCommands: definedCommands.length,
    definedAgents: definedAgents.length,
    scope: opts.all ? 'all' : 'project',
  };
}
