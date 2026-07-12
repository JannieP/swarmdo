/**
 * lint.ts — static validation of a project's swarmdo config surfaces.
 *
 * Complements the runtime doctors: `doctor` probes the environment and
 * `mcp doctor` probes server binaries/URLs; `config lint` is the PURE shape
 * layer — parse errors, schema violations, unknown keys, malformed hook
 * entries, and pre-1.4 layout leftovers — with no PATH probing and no
 * network. Every rule takes parsed input and returns findings, so the whole
 * ruleset is unit-testable; the command layer only reads files.
 */

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  file: string;
  severity: Severity;
  rule: string;
  message: string;
}

const f = (file: string, severity: Severity, rule: string, message: string): Finding => ({ file, severity, rule, message });

export const TOPOLOGIES = ['hierarchical', 'mesh', 'hierarchical-mesh', 'ring', 'star', 'hybrid', 'adaptive'];
export const MEMORY_BACKENDS = ['agentdb', 'sqlite', 'hybrid', 'memory'];
import { parseOpenRouterConfig } from '../providers/openrouter-config.js';
import { lintAgents, type AgentFile } from './agents-lint.js';
import { lintCommandFiles, type CommandFile } from './commands-lint.js';

export const KNOWN_CONFIG_KEYS = ['topology', 'maxAgents', 'strategy', 'consensus', 'memory', 'memoryBackend', 'hnsw', 'neural', 'embeddings', 'providers', 'mcp', 'logging', 'daemon', 'hooks', 'version', 'openrouter', '$schema'];
// Current Claude Code hook events (source: code.claude.com/docs/en/hooks).
// Kept in sync with the runtime; a stale list here false-warns on valid hooks.
export const HOOK_EVENTS = [
  // session lifecycle
  'SessionStart', 'Setup', 'SessionEnd',
  // per-turn
  'UserPromptSubmit', 'UserPromptExpansion', 'Stop', 'StopFailure',
  // agentic loop
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'PermissionRequest', 'PermissionDenied',
  // subagent & task
  'SubagentStart', 'SubagentStop', 'TeammateIdle', 'TaskCreated', 'TaskCompleted',
  // system & file
  'Notification', 'MessageDisplay', 'CwdChanged', 'FileChanged', 'ConfigChange', 'InstructionsLoaded', 'PreCompact', 'PostCompact',
  // MCP elicitation
  'Elicitation', 'ElicitationResult',
  // worktree
  'WorktreeCreate', 'WorktreeRemove',
];

/** Parse a JSON file's raw text; a null raw means "file absent" (fine). */
export function lintJson(file: string, raw: string | null): { obj: unknown; findings: Finding[] } {
  if (raw === null) return { obj: undefined, findings: [] };
  try {
    return { obj: JSON.parse(raw), findings: [] };
  } catch (e) {
    return { obj: undefined, findings: [f(file, 'error', 'invalid-json', `not valid JSON: ${(e as Error).message}`)] };
  }
}

/** swarmdo.config.json: enums + ranges + unknown keys. */
export function lintSwarmdoConfig(file: string, obj: unknown): Finding[] {
  if (obj === undefined) return [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [f(file, 'error', 'config-shape', 'top level must be a JSON object')];
  }
  const out: Finding[] = [];
  const c = obj as Record<string, unknown>;
  for (const key of Object.keys(c)) {
    if (!KNOWN_CONFIG_KEYS.includes(key)) out.push(f(file, 'warn', 'unknown-key', `unknown key "${key}" (known: ${KNOWN_CONFIG_KEYS.filter(k => k !== '$schema').join(', ')})`));
    if (key === 'openrouter') {
      // reuse the runtime parser so lint findings and runtime behavior can't drift
      const { config: orCfg, warnings } = parseOpenRouterConfig(c.openrouter);
      for (const w of warnings) out.push(f(file, 'warn', 'openrouter-config', w));
      if (orCfg.enabled && orCfg.models.length === 0 && !orCfg.defaultModel) {
        out.push(f(file, 'warn', 'openrouter-config', 'openrouter.enabled=true but no valid models[] or defaultModel — swarms have nothing to select from'));
      }
    }
  }
  if (c.topology !== undefined && !TOPOLOGIES.includes(String(c.topology))) {
    out.push(f(file, 'error', 'bad-topology', `topology "${String(c.topology)}" is not one of: ${TOPOLOGIES.join(', ')}`));
  }
  if (c.maxAgents !== undefined && (typeof c.maxAgents !== 'number' || !Number.isInteger(c.maxAgents) || c.maxAgents < 1 || c.maxAgents > 64)) {
    out.push(f(file, 'error', 'bad-max-agents', `maxAgents must be an integer 1–64 (got ${JSON.stringify(c.maxAgents)})`));
  }
  const backend = (c.memoryBackend ?? (c.memory as Record<string, unknown> | undefined)?.backend) as unknown;
  if (backend !== undefined && !MEMORY_BACKENDS.includes(String(backend))) {
    out.push(f(file, 'error', 'bad-memory-backend', `memory backend "${String(backend)}" is not one of: ${MEMORY_BACKENDS.join(', ')}`));
  }
  return out;
}

/** .claude/settings*.json: the hooks block must match Claude Code's schema. */
export function lintSettingsHooks(file: string, obj: unknown): Finding[] {
  if (obj === undefined || obj === null || typeof obj !== 'object') return [];
  const hooks = (obj as Record<string, unknown>).hooks;
  if (hooks === undefined) return [];
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) {
    return [f(file, 'error', 'hooks-shape', '`hooks` must be an object of event → entries[]')];
  }
  const out: Finding[] = [];
  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!HOOK_EVENTS.includes(event)) out.push(f(file, 'warn', 'unknown-hook-event', `unknown hook event "${event}" (known: ${HOOK_EVENTS.join(', ')})`));
    if (!Array.isArray(entries)) {
      out.push(f(file, 'error', 'hook-entries-shape', `hooks.${event} must be an array`));
      continue;
    }
    entries.forEach((entry, i) => {
      const where = `hooks.${event}[${i}]`;
      if (entry === null || typeof entry !== 'object') {
        out.push(f(file, 'error', 'hook-entry-shape', `${where} must be an object`));
        return;
      }
      const e = entry as Record<string, unknown>;
      if (e.matcher !== undefined && typeof e.matcher !== 'string') out.push(f(file, 'error', 'hook-matcher-type', `${where}.matcher must be a string`));
      if (!Array.isArray(e.hooks) || e.hooks.length === 0) {
        out.push(f(file, 'error', 'hook-inner-shape', `${where}.hooks must be a non-empty array of {type, command}`));
        return;
      }
      (e.hooks as unknown[]).forEach((h, j) => {
        const hw = `${where}.hooks[${j}]`;
        const hh = (h ?? {}) as Record<string, unknown>;
        if (hh.type !== 'command') out.push(f(file, 'error', 'hook-type', `${hw}.type must be "command" (got ${JSON.stringify(hh.type)})`));
        if (typeof hh.command !== 'string' || hh.command.trim() === '') out.push(f(file, 'error', 'hook-command', `${hw}.command must be a non-empty string`));
      });
    });
  }
  return out;
}

/** .mcp.json: server entry SHAPES only (mcp doctor probes the runtime). */
export function lintMcpConfig(file: string, obj: unknown): Finding[] {
  if (obj === undefined) return [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [f(file, 'error', 'mcp-shape', 'top level must be a JSON object')];
  }
  const servers = (obj as Record<string, unknown>).mcpServers;
  if (servers === undefined) return [f(file, 'warn', 'mcp-no-servers', 'no `mcpServers` key — file has no effect')];
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
    return [f(file, 'error', 'mcp-servers-shape', '`mcpServers` must be an object of name → definition')];
  }
  const out: Finding[] = [];
  for (const [name, def] of Object.entries(servers as Record<string, unknown>)) {
    if (def === null || typeof def !== 'object') {
      out.push(f(file, 'error', 'mcp-server-shape', `server "${name}" must be an object`));
      continue;
    }
    const d = def as Record<string, unknown>;
    const transport = String(d.type ?? (d.url ? 'http' : 'stdio'));
    if (transport === 'stdio') {
      if (typeof d.command !== 'string' || d.command.trim() === '') out.push(f(file, 'error', 'mcp-missing-command', `server "${name}" (stdio) needs a non-empty \`command\``));
      if (d.args !== undefined && !Array.isArray(d.args)) out.push(f(file, 'error', 'mcp-args-type', `server "${name}": \`args\` must be an array`));
    } else {
      const url = String(d.url ?? '');
      if (!/^(https?|wss?):\/\/.+/.test(url)) out.push(f(file, 'error', 'mcp-bad-url', `server "${name}" (${transport}) needs a valid http(s)/ws(s) \`url\` (got ${JSON.stringify(d.url ?? null)})`));
    }
    if (d.env !== undefined && (d.env === null || typeof d.env !== 'object' || Array.isArray(d.env))) {
      out.push(f(file, 'error', 'mcp-env-type', `server "${name}": \`env\` must be an object`));
    }
  }
  return out;
}

/** Pre-1.4 layout leftovers: flat commands / unprefixed skill duplicates. */
export function lintLegacyLayout(commandsRoot: string[], skills: string[], sdoCommands: string[] = []): Finding[] {
  const out: Finding[] = [];
  // A flat command is a pre-1.4 swarmdo leftover ONLY if the same command also
  // exists under sDo/ today (a twin) — mirroring the skill twin-check below.
  // `.claude/commands/` is Claude Code's shared, ecosystem-wide slash-command
  // dir, so a user's own command namespace or another plugin's coexisting with
  // sDo/ must NOT be flagged merely for not being `sDo` (that was #66).
  const base = (n: string) => n.replace(/\.md$/, '');
  const sdoBase = new Set(sdoCommands.map(base));
  const flat = commandsRoot.filter((n) => n !== 'sDo' && sdoBase.has(base(n)));
  if (flat.length > 0) {
    out.push(f('.claude/commands', 'warn', 'pre-1.4-commands',
      `${flat.length} swarmdo command${flat.length === 1 ? '' : 's'} left flat outside the sDo/ namespace (${flat.slice(0, 5).join(', ')}${flat.length > 5 ? ', …' : ''}) — swarmdo commands moved to /sDo:* in v1.4.0; re-run \`swarmdo init --force\` to migrate them`));
  }
  const skillSet = new Set(skills);
  const dupes = skills.filter((s) => !s.startsWith('sdo-') && skillSet.has(`sdo-${s}`));
  for (const d of dupes) {
    out.push(f(`.claude/skills/${d}`, 'warn', 'duplicate-legacy-skill',
      `both "${d}" and "sdo-${d}" exist — the unprefixed copy is a pre-1.4 leftover; remove it or re-run \`swarmdo efficiency on\`/\`init --force\``));
  }
  return out;
}

export interface LintInput {
  swarmdoConfig?: { file: string; raw: string | null };
  settingsFiles?: { file: string; raw: string | null }[];
  mcpConfig?: { file: string; raw: string | null };
  commandsRoot?: string[];
  /** entries under `.claude/commands/sDo/` — used to identify flat pre-1.4 twins */
  sdoCommands?: string[];
  skills?: string[];
  /** `.claude/agents/*.md` subagent definitions (raw text per file) */
  agentFiles?: AgentFile[];
  /** custom slash commands under the `.claude/commands` tree (raw text per file) */
  commandFiles?: CommandFile[];
  /** skill definitions at `.claude/skills/<name>/SKILL.md` (raw text per file) */
  skillFiles?: CommandFile[];
}

export interface LintReport {
  findings: Finding[];
  errors: number;
  warnings: number;
}

/** Run every rule over pre-read inputs. Pure. */
export function lintAll(input: LintInput): LintReport {
  const findings: Finding[] = [];
  if (input.swarmdoConfig) {
    const { obj, findings: jf } = lintJson(input.swarmdoConfig.file, input.swarmdoConfig.raw);
    findings.push(...jf, ...lintSwarmdoConfig(input.swarmdoConfig.file, obj));
  }
  for (const s of input.settingsFiles ?? []) {
    const { obj, findings: jf } = lintJson(s.file, s.raw);
    findings.push(...jf, ...lintSettingsHooks(s.file, obj));
  }
  if (input.mcpConfig) {
    const { obj, findings: jf } = lintJson(input.mcpConfig.file, input.mcpConfig.raw);
    findings.push(...jf, ...lintMcpConfig(input.mcpConfig.file, obj));
  }
  findings.push(...lintLegacyLayout(input.commandsRoot ?? [], input.skills ?? [], input.sdoCommands ?? []));
  if (input.agentFiles?.length) findings.push(...lintAgents(input.agentFiles));
  if (input.commandFiles?.length || input.skillFiles?.length) {
    findings.push(...lintCommandFiles(input.commandFiles ?? [], input.skillFiles ?? []));
  }
  return {
    findings,
    errors: findings.filter((x) => x.severity === 'error').length,
    warnings: findings.filter((x) => x.severity === 'warn').length,
  };
}
