/**
 * mcp-doctor.ts — static validation of configured MCP servers.
 *
 * Misconfigured MCP servers are a common Claude Code pain point (a wrong command,
 * a binary not on PATH, a malformed entry) and the failure is opaque at runtime.
 * This reads the server definitions Claude Code uses — project `.mcp.json` and
 * `~/.claude.json` (global + per-project) — and validates each one WITHOUT
 * spawning it: shape check + (for stdio) does the command resolve on PATH.
 *
 * Parsing and classification are pure; the PATH probe and file reads are injected
 * so the whole thing is unit-tested without touching disk or the environment.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type Transport = 'stdio' | 'http' | 'sse' | 'unknown';
export type ServerStatus = 'ok' | 'binary-missing' | 'bad-url' | 'malformed';

export interface McpServerDef {
  name: string;
  source: string;
  command?: string;
  args?: string[];
  url?: string;
  type?: string;
}
export interface ServerReport {
  name: string;
  source: string;
  transport: Transport;
  status: ServerStatus;
  detail: string;
}

export function transportOf(def: McpServerDef): Transport {
  const t = (def.type ?? '').toLowerCase();
  if (t === 'http') return 'http';
  if (t === 'sse') return 'sse';
  if (t === 'stdio') return 'stdio';
  if (def.command) return 'stdio';
  if (def.url) return 'http';
  return 'unknown';
}

/** Pull server defs out of a `mcpServers` map. Pure — bad entries become defs
 * with no command/url so they classify as malformed rather than being dropped. */
export function parseServers(mcpServers: unknown, source: string): McpServerDef[] {
  if (!mcpServers || typeof mcpServers !== 'object') return [];
  const out: McpServerDef[] = [];
  for (const [name, raw] of Object.entries(mcpServers as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') { out.push({ name, source }); continue; }
    const r = raw as Record<string, unknown>;
    out.push({
      name,
      source,
      command: typeof r.command === 'string' ? r.command : undefined,
      args: Array.isArray(r.args) ? r.args.map(String) : undefined,
      url: typeof r.url === 'string' ? r.url : undefined,
      type: typeof r.type === 'string' ? r.type : undefined,
    });
  }
  return out;
}

/** Classify + validate one server, using the injected PATH probe for stdio. Pure. */
export function classifyServer(def: McpServerDef, binaryExists: (cmd: string) => boolean): ServerReport {
  const transport = transportOf(def);
  const base = { name: def.name, source: def.source, transport };
  if (transport === 'stdio') {
    if (!def.command) return { ...base, status: 'malformed', detail: 'stdio server has no "command"' };
    if (!binaryExists(def.command)) return { ...base, status: 'binary-missing', detail: `not found on PATH: ${def.command}` };
    return { ...base, status: 'ok', detail: [def.command, ...(def.args ?? [])].join(' ') };
  }
  if (transport === 'http' || transport === 'sse') {
    if (!def.url) return { ...base, status: 'malformed', detail: `${transport} server has no "url"` };
    if (!/^https?:\/\//i.test(def.url)) return { ...base, status: 'bad-url', detail: `url must be http(s): ${def.url}` };
    return { ...base, status: 'ok', detail: def.url };
  }
  return { ...base, status: 'malformed', detail: 'no "command" (stdio) or "url" (http/sse)' };
}

export interface DoctorDeps {
  cwd: string;
  home: string;
  /** parse a JSON file, or null if missing/unreadable/invalid */
  readJson: (file: string) => unknown | null;
  binaryExists: (cmd: string) => boolean;
}

/** Gather server defs from project `.mcp.json` and `~/.claude.json` (global +
 * this project's entry). Pure given injected readJson. */
export function collectServerDefs(deps: DoctorDeps): McpServerDef[] {
  const defs: McpServerDef[] = [];
  const proj = deps.readJson(path.join(deps.cwd, '.mcp.json'));
  if (proj && typeof proj === 'object') defs.push(...parseServers((proj as Record<string, unknown>).mcpServers, '.mcp.json'));
  const claude = deps.readJson(path.join(deps.home, '.claude.json'));
  if (claude && typeof claude === 'object') {
    defs.push(...parseServers((claude as Record<string, unknown>).mcpServers, '~/.claude.json'));
    const projects = (claude as Record<string, unknown>).projects;
    if (projects && typeof projects === 'object') {
      const here = (projects as Record<string, unknown>)[deps.cwd];
      if (here && typeof here === 'object') {
        defs.push(...parseServers((here as Record<string, unknown>).mcpServers, '~/.claude.json (project)'));
      }
    }
  }
  return defs;
}

export function runMcpDoctor(deps: DoctorDeps): ServerReport[] {
  return collectServerDefs(deps).map((d) => classifyServer(d, deps.binaryExists));
}

// ── default (real) dependencies ──────────────────────────────────────────────

function fileExecutable(candidate: string, exts: string[]): boolean {
  for (const ext of exts) {
    try {
      if (fs.statSync(candidate + ext).isFile()) return true;
    } catch { /* not here */ }
  }
  return false;
}

/** Build a PATH probe: absolute/relative paths checked directly; bare names
 * resolved against each PATH dir (PATHEXT on Windows). */
export function makeBinaryChecker(): (cmd: string) => boolean {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  return (cmd: string): boolean => {
    if (!cmd) return false;
    if (cmd.includes('/') || cmd.includes('\\')) return fileExecutable(cmd, exts);
    return pathDirs.some((dir) => fileExecutable(path.join(dir, cmd), exts));
  };
}

export function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function makeDefaultDeps(): DoctorDeps {
  return { cwd: process.cwd(), home: os.homedir(), readJson: readJsonFile, binaryExists: makeBinaryChecker() };
}
