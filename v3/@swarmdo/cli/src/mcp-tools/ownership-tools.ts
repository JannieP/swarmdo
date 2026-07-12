/**
 * Ownership MCP Tool
 *
 * Let an agent ask "who owns this file, and is it a bus-factor-1 key-person
 * file?" and get ranked JSON — the risk/reviewer dimension it is otherwise
 * blind to. An agent about to refactor a fragile single-owner file gets the
 * signal that the change needs extra care, and "who should review this" gets a
 * data-backed answer (the file's main-dev). Completes the git-mining trio's
 * agent-callable set (hotspots + coupling + ownership). Shares the pure engine
 * in ../ownership/ownership.ts with the CLI; captures git history via subprocess.
 */

import { execFileSync } from 'node:child_process';
import type { MCPTool } from './types.js';
import { parseGitLog } from '../hotspots/hotspots.js';
import { computeOwnership, repoBusFactor } from '../ownership/ownership.js';
import { normalizeSince } from '../util/since.js';

const ownershipTool: MCPTool = {
  name: 'ownership',
  description:
    'Map per-file authorship concentration + bus factor from git history — "who owns each file, and what breaks if they leave?" (code-maat main-dev / knowledge map). Returns ranked JSON, most-fragile-first, so an agent editing a file knows if it is a single-owner (bus factor 1) key-person risk that needs extra care, and who its main-dev reviewer is. Includes a repo-level truck factor. Runs in a git repository.',
  category: 'ownership',
  tags: ['git', 'ownership', 'bus-factor', 'knowledge-map', 'risk', 'review'],
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'repo path to run in (default cwd)' },
      since: { type: 'string', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)' },
      top: { type: 'number', description: 'keep only the top N files (default 40; 0 = all)' },
      minChurn: { type: 'number', description: 'drop files with total churn below N (default 1)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const cwd = typeof params.path === 'string' ? params.path : process.cwd();
    const since = typeof params.since === 'string' ? params.since : '1 year ago';
    const top = typeof params.top === 'number' ? params.top : 40;
    const minChurn = typeof params.minChurn === 'number' ? params.minChurn : 1;
    // Same `--numstat` dump `hotspots`/`coupling` parse; `%aN` folds author
    // name/email variants through .mailmap so one person is one owner.
    const args = ['log', '--no-merges', '--numstat', `--since=${normalizeSince(since)}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
    let raw: string;
    try {
      raw = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    } catch {
      return { error: true, message: 'git log failed — not a git repository?' };
    }
    const commits = parseGitLog(raw);
    const ownership = computeOwnership(commits, { minChurn, top: top > 0 ? top : undefined });
    return { since, minChurn, repoBusFactor: repoBusFactor(commits), count: ownership.length, ownership };
  },
};

export const ownershipTools: MCPTool[] = [ownershipTool];
