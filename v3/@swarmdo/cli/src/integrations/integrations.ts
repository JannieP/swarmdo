/**
 * integrations.ts — wire swarmdo into agent CLIs beyond Claude Code.
 *
 * Targets: OpenAI Codex CLI, GitHub Copilot CLI, pi. Two standards do the
 * heavy lifting: AGENTS.md (the cross-agent instructions file all three
 * read) and MCP (swarmdo already ships a stdio server — `swarmdo mcp
 * start`). Each merge below is PURE (string/JSON in → out), additive, and
 * idempotent, so the whole surface is unit-testable and re-running install
 * never duplicates or clobbers.
 *
 * INVARIANT (do-not-break-Claude): nothing in this module produces content
 * for `.claude/**`, `.mcp.json`, or `CLAUDE.md` — the Claude Code surfaces
 * are owned by init/mcp-generator and are only ever READ for status here.
 */

export const MCP_COMMAND = 'npx';
export const MCP_ARGS = ['-y', 'swarmdo@latest', 'mcp', 'start'];

const TOML_BEGIN = '# >>> swarmdo mcp (managed by `swarmdo integrations`) >>>';
const TOML_END = '# <<< swarmdo mcp <<<';

/** Codex CLI (~/.codex/config.toml): add the marked [mcp_servers.swarmdo]
 * block when absent. Existing content — including a user's own hand-written
 * swarmdo server — is left untouched. */
export function mergeCodexToml(existing: string | null): { content: string; changed: boolean } {
  const base = existing ?? '';
  if (base.includes(TOML_BEGIN) || /\[mcp_servers\.swarmdo\]/.test(base)) {
    return { content: base, changed: false };
  }
  const block = [
    TOML_BEGIN,
    '[mcp_servers.swarmdo]',
    `command = "${MCP_COMMAND}"`,
    `args = [${MCP_ARGS.map((a) => `"${a}"`).join(', ')}]`,
    TOML_END,
    '',
  ].join('\n');
  const sep = base.length > 0 && !base.endsWith('\n\n') ? (base.endsWith('\n') ? '\n' : '\n\n') : '';
  return { content: base + sep + block, changed: true };
}

/** Copilot CLI (~/.copilot/mcp-config.json): same mcpServers schema Claude
 * uses. Adds the swarmdo entry when absent; other servers preserved. */
export function mergeCopilotMcpJson(existing: string | null): { content: string; changed: boolean } {
  let cfg: { mcpServers?: Record<string, unknown> };
  try {
    cfg = existing ? JSON.parse(existing) : {};
  } catch {
    // never clobber an unparseable user file
    return { content: existing ?? '', changed: false };
  }
  if (cfg.mcpServers && Object.prototype.hasOwnProperty.call(cfg.mcpServers, 'swarmdo')) {
    return { content: JSON.stringify(cfg, null, 2) + '\n', changed: false };
  }
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), swarmdo: { type: 'local', command: MCP_COMMAND, args: MCP_ARGS, tools: ['*'] } };
  return { content: JSON.stringify(cfg, null, 2) + '\n', changed: true };
}

/** Cross-agent AGENTS.md for projects that don't have one. Existing files
 * are never rewritten (report-only) — teams own their AGENTS.md. */
export function crossAgentAgentsMd(): string {
  return `# AGENTS.md — swarmdo project

> Read by Codex CLI, GitHub Copilot CLI, pi, and other AGENTS.md-aware
> agents. Claude Code uses CLAUDE.md instead — both coexist in this repo.

## What swarmdo gives you

This project is wired to **swarmdo** — agent orchestration with persistent
vector memory, swarm coordination, and 300+ MCP tools.

- **MCP server**: \`swarmdo mcp start\` (stdio). If your CLI supports MCP,
  \`swarmdo integrations install <your-cli>\` wires it; key tools:
  \`memory_search\`, \`memory_store\`, \`swarm_init\`, \`agent_spawn\`.
- **CLI**: \`npx swarmdo@latest <command>\` — \`memory search -q "topic"\`,
  \`usage\`, \`task\`, \`hud\`, \`security scan\`, \`config lint\`.

## Working agreement (any agent)

1. **Search memory BEFORE starting**: \`memory_search(query="task keywords")\`
   — patterns with score > 0.7 are load-bearing precedent.
2. **You are the executor** — swarmdo coordinates and remembers; it never
   writes your code for you.
3. **Store what worked AFTER success**:
   \`memory_store(key="pattern-…", value="what worked", namespace="patterns")\`.
4. Claude Code users: the same surfaces are namespaced under \`/sDo:\`
   commands and \`/sdo-\` skills.

## Do not

- Do not commit secrets or .env files.
- Do not edit \`.claude/\`, \`.mcp.json\`, or \`CLAUDE.md\` — those belong to
  the Claude Code integration and are managed by \`swarmdo init\`.
`;
}

/** .github/copilot-instructions.md — Copilot reads this per-repo. Kept as a
 * thin pointer so AGENTS.md stays the single source of truth. */
export function copilotInstructionsMd(): string {
  return `# Copilot instructions

This repository uses **swarmdo** for agent orchestration and persistent
memory. Follow \`AGENTS.md\` at the repo root — it is the canonical
cross-agent working agreement (memory-first workflow, executor role, MCP
tools). The swarmdo MCP server (\`swarmdo mcp start\`) provides
memory_search / memory_store / swarm_init; wire it with
\`swarmdo integrations install copilot\`.
`;
}

export type IntegrationTarget = 'codex' | 'copilot' | 'pi' | 'claude';
export const INSTALLABLE: IntegrationTarget[] = ['codex', 'copilot', 'pi'];

export interface TargetStatus {
  target: IntegrationTarget;
  ok: boolean;
  details: string[];
}

/** Pure status evaluation over pre-read file contents (null = absent). */
export function evaluateStatus(files: {
  agentsMd: string | null;
  codexToml: string | null;
  copilotJson: string | null;
  copilotInstructions: string | null;
  claudeMcpJson: string | null;
  /** ~/.claude.json — Claude Code's user-level config (claude mcp add) */
  claudeUserJson?: string | null;
  claudeDirExists: boolean;
}): TargetStatus[] {
  const agentsOk = files.agentsMd !== null;
  const codexMcp = !!files.codexToml && /\[mcp_servers\.swarmdo\]/.test(files.codexToml);
  const copilotMcp = ((): boolean => {
    try { return !!files.copilotJson && 'swarmdo' in (JSON.parse(files.copilotJson).mcpServers ?? {}); } catch { return false; }
  })();
  const hasSwarmdoServer = (raw: string | null | undefined): boolean => {
    try { return !!raw && 'swarmdo' in (JSON.parse(raw).mcpServers ?? {}); } catch { return false; }
  };
  const claudeProject = hasSwarmdoServer(files.claudeMcpJson);
  const claudeUser = hasSwarmdoServer(files.claudeUserJson);
  const claudeMcp = claudeProject || claudeUser;
  return [
    {
      target: 'claude', ok: files.claudeDirExists && claudeMcp,
      details: [
        `.claude/ ${files.claudeDirExists ? 'present' : 'MISSING'}`,
        `swarmdo MCP server ${claudeMcp ? `wired (${claudeProject ? '.mcp.json' : '~/.claude.json'})` : 'missing from .mcp.json and ~/.claude.json'}`,
        '(read-only here — managed by `swarmdo init`)',
      ],
    },
    {
      target: 'codex', ok: agentsOk && codexMcp,
      details: [
        `AGENTS.md ${agentsOk ? 'present' : 'missing'}`,
        `~/.codex/config.toml [mcp_servers.swarmdo] ${codexMcp ? 'wired' : 'missing'}`,
      ],
    },
    {
      target: 'copilot', ok: agentsOk && copilotMcp && files.copilotInstructions !== null,
      details: [
        `AGENTS.md ${agentsOk ? 'present' : 'missing'}`,
        `.github/copilot-instructions.md ${files.copilotInstructions !== null ? 'present' : 'missing'}`,
        `~/.copilot/mcp-config.json swarmdo server ${copilotMcp ? 'wired' : 'missing'}`,
      ],
    },
    {
      target: 'pi', ok: agentsOk,
      details: [
        `AGENTS.md ${agentsOk ? 'present (pi reads it natively)' : 'missing'}`,
        'MCP: point pi at `npx -y swarmdo@latest mcp start` if your pi build supports MCP servers',
      ],
    },
  ];
}
