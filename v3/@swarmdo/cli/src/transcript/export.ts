/**
 * export.ts — render a Claude Code session transcript to readable Markdown.
 *
 * Claude Code has no built-in "export this conversation" — a frequent community
 * request (many third-party exporters exist). swarmdo already reads the same
 * ~/.claude/projects/*.jsonl transcripts for `usage`, so this reuses that infra
 * (findTranscriptFiles/defaultClaudeProjectDirs) and adds a pure, unit-tested
 * Markdown renderer on top. Only the fs helpers touch disk.
 *
 * Transcript shape (observed): each JSONL line has a `type`; only `user` and
 * `assistant` lines are conversational (mode/attachment/ai-title/system/… are
 * skipped). Message content is a string or an array of blocks: text / thinking /
 * tool_use {name,input} / tool_result {is_error,content}.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultClaudeProjectDirs, findTranscriptFiles } from '../usage/transcript-usage.js';

const RENDERABLE = new Set(['user', 'assistant']);

export interface Block {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  is_error?: boolean;
  content?: unknown;
}
export interface RawTranscriptLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  message?: { role?: string; content?: unknown; model?: string };
}

export interface RenderOptions {
  /** include tool_use / tool_result blocks (default true) */
  tools?: boolean;
  /** include assistant thinking blocks (default false) */
  thinking?: boolean;
  /** truncate tool input/output and thinking to this many chars (default 600) */
  maxToolChars?: number;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (+${s.length - max} chars)`;
}

/** Strip harness-injected <system-reminder> blocks — they're not user-authored
 * and dominate user turns. Everything else (incl. slash-command wrappers, which
 * are useful context) is kept. */
export function cleanUserText(s: string): string {
  return s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
}

/** Flatten tool_result content (string | array of {text}) to text. */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && typeof (c as Block).text === 'string' ? (c as Block).text : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

function heading(role: string): string {
  return role === 'assistant' ? '### 🤖 Assistant' : '### 👤 User';
}

function renderToolUse(b: Block, max: number): string {
  const name = b.name || 'tool';
  let input = '';
  if (b.input !== undefined && b.input !== null) {
    try {
      input = typeof b.input === 'string' ? b.input : JSON.stringify(b.input, null, 2);
    } catch {
      input = String(b.input);
    }
  }
  const body = input ? `\n\n\`\`\`json\n${truncate(input, max)}\n\`\`\`` : '';
  return `> 🔧 **${name}**${body}`;
}

function renderToolResult(b: Block, max: number): string {
  const icon = b.is_error ? '❌' : '✅';
  const text = contentToText(b.content);
  return text ? `> ${icon} \`${truncate(text.replace(/\n/g, ' '), max)}\`` : `> ${icon} (no output)`;
}

/** Render one parsed line. Pure-result user lines get no "User" heading. */
function renderLine(role: string, content: unknown, opts: Required<RenderOptions>): string {
  if (typeof content === 'string') {
    const t = role === 'user' ? cleanUserText(content) : content.trim();
    return t ? `${heading(role)}\n\n${t}` : '';
  }
  if (!Array.isArray(content)) return '';

  const body: string[] = [];
  const results: string[] = [];
  for (const b of content as Block[]) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text) body.push(role === 'user' ? cleanUserText(b.text) : b.text.trim());
    else if (b.type === 'thinking' && b.thinking && opts.thinking) body.push(`*(thinking)* ${truncate(b.thinking, opts.maxToolChars)}`);
    else if (b.type === 'tool_use' && opts.tools) body.push(renderToolUse(b, opts.maxToolChars));
    else if (b.type === 'tool_result' && opts.tools) results.push(renderToolResult(b, opts.maxToolChars));
  }
  const filteredBody = body.filter((s) => s && s.trim());
  const sections: string[] = [];
  if (filteredBody.length) sections.push(`${heading(role)}\n\n${filteredBody.join('\n\n')}`);
  if (results.length) sections.push(results.join('\n'));
  return sections.join('\n\n');
}

/** Count the conversational turns in a rendered body by matching only the
 * exact role-heading lines. Anchored to end-of-line so `### Foo` markdown
 * headings written *inside* a user/assistant message don't inflate the count.
 * Pure. */
export function countRenderedTurns(markdown: string): number {
  return (markdown.match(/^### (?:🤖 Assistant|👤 User)$/gm) || []).length;
}

/** Render an ordered list of parsed transcript lines into Markdown. */
export function renderTranscriptMarkdown(lines: RawTranscriptLine[], opts: RenderOptions = {}): string {
  const resolved: Required<RenderOptions> = {
    tools: opts.tools ?? true,
    thinking: opts.thinking ?? false,
    maxToolChars: opts.maxToolChars ?? 600,
  };
  const parts: string[] = [];
  for (const line of lines) {
    if (line.type && !RENDERABLE.has(line.type)) continue;
    const role = line.message?.role;
    if (!role || !RENDERABLE.has(role)) continue;
    const rendered = renderLine(role, line.message?.content, resolved);
    if (rendered.trim()) parts.push(rendered);
  }
  return parts.join('\n\n');
}

// ── fs helpers ──────────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  file: string;
  project: string;
  turns: number;
  firstPrompt: string;
  mtimeMs: number;
  sizeBytes: number;
}

export function sessionIdFromFile(file: string): string {
  return path.basename(file).replace(/\.jsonl$/, '');
}

interface FileStat { file: string; project: string; mtimeMs: number; sizeBytes: number }

function statTranscripts(dirs: string[]): FileStat[] {
  const out: FileStat[] = [];
  for (const dir of dirs) {
    for (const { file, project } of findTranscriptFiles(dir)) {
      try {
        const st = fs.statSync(file);
        out.push({ file, project, mtimeMs: st.mtimeMs, sizeBytes: st.size });
      } catch { /* vanished mid-scan */ }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** First user prompt + conversational turn count for a transcript file. */
export function summarizeFile(fs_stat: FileStat): SessionSummary {
  let turns = 0;
  let firstPrompt = '';
  try {
    const content = fs.readFileSync(fs_stat.file, 'utf8');
    const lines: RawTranscriptLine[] = [];
    for (const raw of content.split('\n')) {
      if (!raw.trim()) continue;
      let line: RawTranscriptLine;
      try { line = JSON.parse(raw) as RawTranscriptLine; } catch { continue; }
      lines.push(line);
      if (line.type && !RENDERABLE.has(line.type)) continue;
      if (!firstPrompt && line.message?.role === 'user') {
        const txt = cleanUserText(contentToText(line.message?.content) || (typeof line.message?.content === 'string' ? line.message.content : ''));
        if (txt) firstPrompt = txt.replace(/\s+/g, ' ').slice(0, 100);
      }
    }
    // Count turns EXACTLY as exportSession does — render, then count role
    // headings — so `transcript list` and `transcript export` can never disagree
    // (#70). A pure tool-result carrier line renders no heading, so it's not a
    // turn; the old raw per-line count inflated `list` for any session with tools.
    turns = countRenderedTurns(renderTranscriptMarkdown(lines));
  } catch { /* unreadable */ }
  return { sessionId: sessionIdFromFile(fs_stat.file), file: fs_stat.file, project: fs_stat.project, turns, firstPrompt, mtimeMs: fs_stat.mtimeMs, sizeBytes: fs_stat.sizeBytes };
}

/** Recent sessions, newest first. Only the top `limit` files are parsed. */
export function listSessions(dirs?: string[], limit = 20): SessionSummary[] {
  const d = dirs && dirs.length ? dirs : defaultClaudeProjectDirs();
  return statTranscripts(d).slice(0, limit).map(summarizeFile);
}

/** Resolve 'latest' or a (possibly abbreviated) session id to a transcript path. */
export function resolveSessionFile(idOrLatest: string, dirs?: string[]): string | null {
  const d = dirs && dirs.length ? dirs : defaultClaudeProjectDirs();
  const stats = statTranscripts(d);
  if (stats.length === 0) return null;
  if (idOrLatest === 'latest' || idOrLatest === '') return stats[0].file;
  const exact = stats.find((s) => sessionIdFromFile(s.file) === idOrLatest);
  if (exact) return exact.file;
  const prefix = stats.find((s) => sessionIdFromFile(s.file).startsWith(idOrLatest));
  return prefix ? prefix.file : null;
}

export interface ExportResult {
  markdown: string;
  sessionId: string;
  project: string;
  turns: number;
  file: string;
}

/** Read a session file and render it to a full Markdown document (with header). */
export function exportSession(idOrLatest: string, opts: RenderOptions & { dirs?: string[] } = {}): ExportResult | null {
  const file = resolveSessionFile(idOrLatest, opts.dirs);
  if (!file) return null;
  let content: string;
  try { content = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const lines: RawTranscriptLine[] = [];
  for (const raw of content.split('\n')) {
    if (!raw.trim()) continue;
    try { lines.push(JSON.parse(raw) as RawTranscriptLine); } catch { /* skip */ }
  }
  const sessionId = sessionIdFromFile(file);
  const project = path.basename(path.dirname(file));
  const body = renderTranscriptMarkdown(lines, opts);
  const turns = countRenderedTurns(body);
  const header = `# Claude Code session \`${sessionId}\`\n\n- Project: \`${project}\`\n- Turns: ${turns}\n\n---\n\n`;
  return { markdown: header + body, sessionId, project, turns, file };
}
