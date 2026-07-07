/**
 * Affected MCP Tool
 *
 * Given the files an agent just changed, return the transitive set of files —
 * and the test files — that the change could break, by walking codegraph's
 * import graph. Lets an agent run only the relevant tests after an edit instead
 * of the whole suite. Shares the pure engine in ../affected/affected.ts; loads
 * (or builds) the codegraph index for the repo.
 */

import type { MCPTool } from './types.js';
import { computeAffected } from '../affected/affected.js';
import { loadIndex, scanRepo } from '../codegraph/store.js';

const affectedTool: MCPTool = {
  name: 'affected',
  description:
    'Given the repo-relative files you just changed, return the transitive set of files (and the test files) that the change could break, via the import graph. Call this after editing to run only the relevant tests instead of the whole suite. Composes codegraph.',
  category: 'affected',
  tags: ['tests', 'impact', 'import-graph', 'diff'],
  inputSchema: {
    type: 'object',
    properties: {
      changed: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths you changed' },
      path: { type: 'string', description: 'repo root to resolve the import graph in (default cwd)' },
    },
    required: ['changed'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (!Array.isArray(params.changed) || params.changed.some((c) => typeof c !== 'string')) {
      return { error: true, message: 'changed (string[]) is required' };
    }
    const root = typeof params.path === 'string' ? params.path : process.cwd();
    const index = loadIndex(root) ?? scanRepo(root);
    const result = computeAffected(params.changed as string[], index);
    return { changed: params.changed, ...result };
  },
};

export const affectedTools: MCPTool[] = [affectedTool];
