/**
 * Cycles MCP Tool
 *
 * Let an agent check for circular import dependencies before it commits — the
 * TDZ/undefined-export bugs that `madge --circular` catches. Returns the cycle
 * groups (and self-imports) found in the repo's import graph. Shares the pure
 * SCC engine in ../cycles/cycles.ts; loads (or builds) the codegraph index.
 */

import type { MCPTool } from './types.js';
import { findCycles } from '../cycles/cycles.js';
import { loadIndex, scanRepo } from '../codegraph/store.js';

const cyclesTool: MCPTool = {
  name: 'cycles',
  description:
    'Find circular import dependencies in the repo via the import graph (madge --circular style). Returns the cyclic file groups — call this after wiring up modules to catch temporal-dead-zone / undefined-export bugs before they bite. Composes codegraph.',
  category: 'cycles',
  tags: ['imports', 'circular', 'graph', 'lint'],
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'repo root to analyze (default cwd)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const root = typeof params.path === 'string' ? params.path : process.cwd();
    const index = loadIndex(root) ?? scanRepo(root);
    const res = findCycles(index);
    return { count: res.cycles.length + res.selfLoops.length, ...res };
  },
};

export const cyclesTools: MCPTool[] = [cyclesTool];
