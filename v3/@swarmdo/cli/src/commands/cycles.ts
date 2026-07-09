/**
 * `swarmdo cycles` — find circular import dependencies (madge --circular style).
 *
 *   swarmdo cycles              # report circular imports in the repo
 *   swarmdo cycles --ci         # exit 1 if any cycle exists (gate a build)
 *   swarmdo cycles --format json
 *
 * Composes codegraph's import graph; the detection is a provably-correct SCC
 * scan (../cycles/cycles.ts, pure + tested). This loads or builds the index.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { findCycles, formatCycles } from '../cycles/cycles.js';
import { loadIndex, scanRepo, saveIndex } from '../codegraph/store.js';

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const asJson = ctx.flags.format === 'json';
  const ci = ctx.flags.ci === true;
  const includeTypeOnly = ctx.flags['include-type-only'] === true;

  let index = loadIndex(root);
  if (!index) {
    index = scanRepo(root);
    try { saveIndex(root, index); } catch { /* read-only fs — index is in memory */ }
  }

  const res = findCycles(index, { includeTypeOnly });
  const count = res.cycles.length + res.selfLoops.length;

  if (asJson) {
    process.stdout.write(JSON.stringify({ count, ...res }, null, 2) + '\n');
  } else {
    output.writeln(formatCycles(res));
  }

  // In --ci mode, a cycle is a failure; otherwise report and succeed.
  const code = ci && count > 0 ? 1 : 0;
  return { success: code === 0, exitCode: code };
}

export const cyclesCommand: Command = {
  name: 'cycles',
  description: 'Find circular import dependencies via the import graph (madge --circular style) — catch the TDZ/undefined-export bugs they cause',
  options: [
    { name: 'ci', description: 'exit 1 if any circular dependency exists (gate a build)', type: 'boolean' },
    { name: 'include-type-only', description: 'also count TypeScript `import type` edges (excluded by default — they erase at compile time and cause no runtime cycle)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo cycles', description: 'List circular imports in the repo' },
    { command: 'swarmdo cycles --ci', description: 'Fail CI when a cycle is introduced' },
    { command: 'swarmdo cycles --include-type-only', description: 'Strict view: count type-only imports too' },
  ],
  action: run,
};

export default cyclesCommand;
