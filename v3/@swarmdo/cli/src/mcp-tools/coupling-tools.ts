/**
 * Coupling MCP Tool
 *
 * Let an agent ask "which files change together?" and get ranked JSON — the
 * EMPIRICAL complement to `affected`'s static import graph. Files that keep
 * landing in the same commit are coupled in practice even when no import edge
 * connects them (a JSON schema and its TS type, a serializer/deserializer split
 * across modules, a doc that must track an API). Surfacing that lets an agent
 * catch the co-edit it would otherwise forget. Shares the pure engine in
 * ../coupling/coupling.ts with the CLI; captures git history via subprocess.
 */

import { execFileSync } from 'node:child_process';
import type { MCPTool } from './types.js';
import { parseGitLog } from '../hotspots/hotspots.js';
import { computeCoupling } from '../coupling/coupling.js';
import { normalizeSince } from '../util/since.js';

const couplingTool: MCPTool = {
  name: 'coupling',
  description:
    'Rank file pairs that change together in git history (temporal/co-change coupling) — the empirical complement to `affected`. Returns ranked JSON so an agent editing one file can see what else historically moves with it and avoid a forgotten co-edit. Pass `file` for a "what changes with X?" query. Runs in a git repository.',
  category: 'coupling',
  tags: ['git', 'co-change', 'coupling', 'impact', 'refactor'],
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'repo path to run in (default cwd)' },
      since: { type: 'string', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)' },
      top: { type: 'number', description: 'keep only the top N pairs (default 30; 0 = all)' },
      minShared: { type: 'number', description: 'drop pairs sharing fewer than N commits (default 2)' },
      maxFiles: { type: 'number', description: 'skip commits touching more than N files (default 30; 0 = no cap)' },
      file: { type: 'string', description: 'show only pairs involving this exact path ("what changes with X?")' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const cwd = typeof params.path === 'string' ? params.path : process.cwd();
    const since = typeof params.since === 'string' ? params.since : '1 year ago';
    const top = typeof params.top === 'number' ? params.top : 30;
    const minShared = typeof params.minShared === 'number' ? params.minShared : 2;
    const maxFiles = typeof params.maxFiles === 'number' ? params.maxFiles : 30;
    const focus = typeof params.file === 'string' && params.file ? params.file : undefined;
    // Capture the FULL history (no pathspec filter even when focused) — filtering
    // the log to `focus` would strip the co-changed files out of each commit's
    // numstat. We filter PAIRS in the engine (opts.focus) instead. Same
    // `--numstat` dump `hotspots` parses.
    const args = ['log', '--no-merges', '--numstat', `--since=${normalizeSince(since)}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
    let raw: string;
    try {
      raw = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    } catch {
      return { error: true, message: 'git log failed — not a git repository?' };
    }
    const coupling = computeCoupling(parseGitLog(raw), { minShared, maxFiles, top: top > 0 ? top : undefined, focus });
    return { since, minShared, count: coupling.length, coupling };
  },
};

export const couplingTools: MCPTool[] = [couplingTool];
