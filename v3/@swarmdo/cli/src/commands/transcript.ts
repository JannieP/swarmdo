/**
 * transcript.ts — `swarmdo transcript` — export Claude Code sessions to Markdown.
 *
 *   swarmdo transcript list                 recent sessions (newest first)
 *   swarmdo transcript export latest        render newest session to stdout
 *   swarmdo transcript export <id> --out f  write a session to a Markdown file
 *
 * Renderer + fs helpers live in ../transcript/export.ts (pure renderer is
 * unit-tested; reuses the usage transcript infra).
 */

import * as fs from 'node:fs';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { parseQuery, searchLines, rankMatches, type SessionMatch } from '../transcript/search.js';
import { output } from '../output.js';
import { listSessions, exportSession, type SessionSummary } from '../transcript/export.js';

function fmtAge(mtimeMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - mtimeMs) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 36) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List recent Claude Code sessions (newest first)',
  options: [
    { name: 'limit', short: 'n', type: 'number', description: 'how many sessions to show', default: 20 },
    { name: 'json', type: 'boolean', description: 'machine-readable output', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const limit = typeof ctx.flags.limit === 'number' ? ctx.flags.limit : 20;
    const sessions = listSessions(undefined, limit);
    if (ctx.flags.json === true) { output.printJson(sessions); return { success: true, data: sessions }; }
    if (sessions.length === 0) { output.printInfo('no Claude Code sessions found under ~/.claude/projects'); return { success: true, exitCode: 0 }; }
    const nowMs = Date.now();
    output.printTable({
      columns: [
        { key: 'id', header: 'Session', width: 12 },
        { key: 'turns', header: 'Turns', width: 7, align: 'right' },
        { key: 'size', header: 'Size', width: 7, align: 'right' },
        { key: 'age', header: 'Age', width: 6, align: 'right' },
        { key: 'prompt', header: 'First prompt', width: 52 },
      ],
      data: sessions.map((s: SessionSummary) => ({
        id: s.sessionId.slice(0, 8),
        turns: String(s.turns),
        size: fmtSize(s.sizeBytes),
        age: fmtAge(s.mtimeMs, nowMs),
        prompt: s.firstPrompt || output.dim('(no prompt)'),
      })),
    });
    output.writeln(output.dim(`export one with:  swarmdo transcript export <session> --out session.md`));
    return { success: true, data: sessions };
  },
};

const exportCommand: Command = {
  name: 'export',
  aliases: ['md'],
  description: 'Render a session to Markdown (stdout, or --out <file>)',
  options: [
    { name: 'session', short: 's', type: 'string', description: "session id, abbreviation, or 'latest' (default)" },
    { name: 'out', short: 'o', type: 'string', description: 'write to this file instead of stdout' },
    { name: 'no-tools', type: 'boolean', description: 'omit tool calls and results', default: false },
    { name: 'thinking', type: 'boolean', description: 'include assistant thinking blocks', default: false },
    { name: 'max-chars', type: 'number', description: 'truncate tool I/O to this many chars', default: 600 },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const id = (ctx.flags.session as string) || ctx.args[0] || 'latest';
    const res = exportSession(id, {
      tools: ctx.flags['no-tools'] !== true,
      thinking: ctx.flags.thinking === true,
      maxToolChars: typeof ctx.flags['max-chars'] === 'number' ? (ctx.flags['max-chars'] as number) : 600,
    });
    if (!res) {
      output.printError(`no session found for '${id}' (try 'swarmdo transcript list')`);
      return { success: false, exitCode: 1 };
    }
    const outFile = ctx.flags.out as string | undefined;
    if (outFile) {
      try {
        fs.writeFileSync(outFile, res.markdown, 'utf8');
      } catch (e) {
        output.printError(`failed to write ${outFile}: ${(e as Error).message}`);
        return { success: false, exitCode: 1 };
      }
      output.printSuccess(`Exported session ${res.sessionId.slice(0, 8)} (${res.turns} turns) → ${outFile}`);
      return { success: true, data: { file: outFile, turns: res.turns, sessionId: res.sessionId } };
    }
    output.writeln(res.markdown);
    return { success: true, data: { turns: res.turns, sessionId: res.sessionId } };
  },
};

// Full-text search across session transcripts ("which session did I discuss X in?")
const searchCommand: Command = {
  name: 'search',
  description: 'Search what you and Claude actually said across all session transcripts',
  options: [
    { name: 'limit', short: 'n', type: 'number', description: 'sessions to show', default: 10 },
    { name: 'json', type: 'boolean', description: 'machine-readable output', default: false },
  ],
  examples: [
    { command: 'swarmdo transcript search obsidian vault', description: 'Sessions mentioning both terms (AND)' },
    { command: 'swarmdo tx search "npm publish" -n 5', description: 'Top 5 sessions about npm publish' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const fs = await import('node:fs');
    const { defaultClaudeProjectDirs, findTranscriptFiles } = await import('../usage/transcript-usage.js');
    const { sessionIdFromFile } = await import('../transcript/export.js');
    let terms: string[];
    try {
      terms = parseQuery(ctx.args.slice(1).join(' '));
    } catch {
      output.printError('usage: swarmdo transcript search <terms…>');
      return { success: false, exitCode: 1 };
    }
    const matches: SessionMatch[] = [];
    let scanned = 0;
    for (const dir of defaultClaudeProjectDirs()) {
      for (const { file, project } of findTranscriptFiles(dir)) {
        scanned++;
        let raw: string;
        try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const lines = raw.split('\n').flatMap((l) => {
          if (!l.trim()) return [];
          try { return [JSON.parse(l)]; } catch { return []; }
        });
        const { hits, snippets } = searchLines(lines, terms);
        if (hits > 0) {
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(file).mtimeMs; } catch { /* keep 0 */ }
          matches.push({ sessionId: sessionIdFromFile(file), project, mtimeMs, hits, snippets });
        }
      }
    }
    const ranked = rankMatches(matches).slice(0, Number(ctx.flags.limit) || 10);
    if (ctx.flags.json === true) {
      output.printJson({ query: terms, scanned, matched: matches.length, sessions: ranked });
      return { success: true, data: ranked };
    }
    if (ranked.length === 0) {
      output.writeln(output.dim(`no sessions matched "${terms.join(' ')}" (${scanned} transcripts scanned)`));
      return { success: true, exitCode: 0 };
    }
    output.writeln(output.bold(`${matches.length} session(s) match "${terms.join(' ')}"`) + output.dim(`  — ${scanned} transcripts scanned`));
    for (const m of ranked) {
      const when = m.mtimeMs ? new Date(m.mtimeMs).toISOString().slice(0, 16).replace('T', ' ') : '?';
      output.writeln('');
      output.writeln(`${output.info(m.sessionId.slice(0, 8))}  ${output.dim(when)}  ${m.hits} hit${m.hits === 1 ? '' : 's'}  ${output.dim(m.project)}`);
      for (const sn of m.snippets) {
        output.writeln(`   ${sn.role === 'user' ? '👤' : '🤖'} ${sn.snippet}`);
      }
    }
    output.writeln('');
    output.writeln(output.dim('open one:  swarmdo transcript export -s <id-prefix>'));
    return { success: true, data: ranked };
  },
};

export const transcriptCommand: Command = {
  name: 'transcript',
  aliases: ['tx'],
  description: 'Export Claude Code sessions to readable Markdown (list/export)',
  subcommands: [listCommand, exportCommand, searchCommand],
  options: [],
  examples: [
    { command: 'swarmdo transcript list', description: 'Recent sessions, newest first' },
    { command: 'swarmdo transcript export latest --out session.md', description: 'Export the newest session' },
    { command: 'swarmdo transcript export 1a2b3c4d --no-tools', description: 'Export a session, prose only' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.writeln(output.bold('swarmdo transcript — export Claude Code sessions to Markdown'));
    output.printList([
      'list                    recent sessions (newest first)',
      'export <id|latest>      render a session to stdout',
      'export <id> --out f.md  write a session to a file',
    ]);
    return { success: true, exitCode: 0 };
  },
};

export default transcriptCommand;
