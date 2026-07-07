/**
 * Hotspots MCP Tool
 *
 * Let an agent ask "which files carry the most change-risk?" and get ranked
 * JSON — files that change often, churn heavily, are touched by many hands, and
 * were edited recently. Data-driven "where is the tech debt?" so an agent can
 * focus refactoring/testing/review effort. Shares the pure engine in
 * ../hotspots/hotspots.ts with the CLI; captures git history via subprocess.
 */

import { execFileSync } from 'node:child_process';
import type { MCPTool } from './types.js';
import { parseGitLog, computeHotspots, type SortKey } from '../hotspots/hotspots.js';

const SORT_KEYS: SortKey[] = ['risk', 'churn', 'commits', 'authors'];

const hotspotsTool: MCPTool = {
  name: 'hotspots',
  description:
    'Rank files by change-risk mined from git history (churn × recency × author-spread). Returns ranked JSON — call this to find the technical debt worth refactoring or testing before you start, instead of guessing. Runs in a git repository.',
  category: 'hotspots',
  tags: ['git', 'risk', 'churn', 'refactor', 'debt'],
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'repo path to run in (default cwd)' },
      subpath: { type: 'string', description: 'limit history to this subdirectory/file' },
      since: { type: 'string', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)' },
      top: { type: 'number', description: 'keep only the top N files (default 20)' },
      by: { type: 'string', enum: SORT_KEYS, description: 'sort key (default risk)' },
      minCommits: { type: 'number', description: 'drop files with fewer than N commits (default 1)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const cwd = typeof params.path === 'string' ? params.path : process.cwd();
    const since = typeof params.since === 'string' ? params.since : '1 year ago';
    const by = (typeof params.by === 'string' && SORT_KEYS.includes(params.by as SortKey) ? params.by : 'risk') as SortKey;
    const top = typeof params.top === 'number' ? params.top : 20;
    const minCommits = typeof params.minCommits === 'number' ? params.minCommits : 1;
    const args = ['log', '--no-merges', '--numstat', `--since=${since}`, '--format=format:%x01%H%x1f%an%x1f%aI'];
    if (typeof params.subpath === 'string' && params.subpath) args.push('--', params.subpath);
    let raw: string;
    try {
      raw = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    } catch {
      return { error: true, message: 'git log failed — not a git repository?' };
    }
    const now = Date.now();
    const hotspots = computeHotspots(parseGitLog(raw), now, { by, top: top > 0 ? top : undefined, minCommits });
    return { by, count: hotspots.length, hotspots };
  },
};

export const hotspotsTools: MCPTool[] = [hotspotsTool];
