/**
 * MCP tool profiles (Sprint 2 Move 2').
 *
 * The MCP server exposes ~270 tools by default. Every tool definition flows
 * into the client's context as a JSON-Schema block, so a large surface costs
 * real tokens AND degrades the model's tool-selection accuracy (the external
 * audit's "275 tools" critique). Profiles let `swarmdo mcp start --tools-profile
 * lean` expose a focused subset.
 *
 * A profile is a list of GROUP keys (see TOOL_GROUP_KEYS in mcp-client.ts).
 * `'all'` means every registered group.
 *
 * Pairs with the GitHub Copilot integration (Move C): Copilot's tool picker
 * works best with a small surface, so the documented `.vscode/mcp.json` uses
 * `--tools-profile lean`.
 */

export type ToolsProfileName = 'lean' | 'balanced' | 'full';

/** The canonical lean set — what an everyday coding session actually uses. */
const LEAN_GROUPS = [
  'agent',      // agent_spawn / agent_run / agent_execute / agent_list ...
  'swarm',      // swarm_init / swarm_status ...
  'memory',     // memory_store / search / retrieve (HNSW)
  'hooks',      // hooks_route / pre-task / post-edit / codemod ...
  'agentdb',    // agentdb pattern store/search
  'embeddings', // embeddings_generate / search / compare
  'codegraph',  // codegraph_query / file / index — "where is X defined?"
  'redact',     // redact_text / redact_scan — secret guard on the data path
  'env',        // env_check — env-var drift (missing/unused/undocumented)
  'apply',      // apply_patch — fuzzy unified-diff applier for agent edits
  'hotspots',   // hotspots — git-history change-risk ranking ("where's the debt?")
] as const;

/** Balanced = lean + orchestration/session/system the average user reaches for. */
const BALANCED_EXTRA = [
  'workflow',
  'task',
  'session',
  'system',
  'config',
  'coordination',
  'neural',
  'performance',
] as const;

export const TOOLS_PROFILES: Record<ToolsProfileName, readonly string[] | 'all'> = {
  lean: LEAN_GROUPS,
  balanced: [...LEAN_GROUPS, ...BALANCED_EXTRA],
  full: 'all',
};

export function isToolsProfileName(s: string): s is ToolsProfileName {
  return s === 'lean' || s === 'balanced' || s === 'full';
}

/**
 * Resolve a profile name to its group list, or `'all'`. Unknown names fall
 * back to `'all'` (fail-open — never hide tools because of a typo'd profile).
 */
export function resolveProfileGroups(name: string | undefined): readonly string[] | 'all' {
  if (!name) return 'all';
  if (isToolsProfileName(name)) return TOOLS_PROFILES[name];
  return 'all';
}
