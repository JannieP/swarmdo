/**
 * V3 CLI SwarmVector PostgreSQL Bridge Command
 * Management commands for SwarmVector PostgreSQL integration
 *
 * Features:
 * - swarmvector/pgvector integration for vector operations
 * - Attention mechanism embeddings
 * - Graph Neural Network support
 * - Hyperbolic embeddings (Poincare ball)
 * - Performance benchmarking
 * - Migration management
 *
 * Created with care by swarmdo.com
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';

// Import subcommands
import { initCommand } from './init.js';
import { migrateCommand } from './migrate.js';
import { statusCommand } from './status.js';
import { benchmarkCommand } from './benchmark.js';
import { optimizeCommand } from './optimize.js';
import { backupCommand } from './backup.js';
import { setupCommand } from './setup.js';
import { importCommand } from './import.js';

/**
 * SwarmVector PostgreSQL Bridge main command
 */
export const swarmvectorCommand: Command = {
  name: 'swarmvector',
  description: 'SwarmVector PostgreSQL Bridge management',
  aliases: ['rv', 'pgvector'],
  subcommands: [
    initCommand,
    setupCommand,
    importCommand,
    migrateCommand,
    statusCommand,
    benchmarkCommand,
    optimizeCommand,
    backupCommand,
  ],
  options: [
    {
      name: 'host',
      short: 'h',
      description: 'PostgreSQL host',
      type: 'string',
      default: 'localhost',
    },
    {
      name: 'port',
      short: 'p',
      description: 'PostgreSQL port',
      type: 'number',
      default: 5432,
    },
    {
      name: 'database',
      short: 'd',
      description: 'Database name',
      type: 'string',
    },
    {
      name: 'user',
      short: 'u',
      description: 'Database user',
      type: 'string',
    },
    {
      name: 'schema',
      short: 's',
      description: 'Schema name',
      type: 'string',
      default: 'swarmdo',
    },
  ],
  examples: [
    { command: 'swarmdo swarmvector setup', description: 'Output Docker files and SQL for setup' },
    { command: 'swarmdo swarmvector import --input memory.json', description: 'Import from sql.js/JSON export' },
    { command: 'swarmdo swarmvector init --database mydb', description: 'Initialize SwarmVector in PostgreSQL' },
    { command: 'swarmdo swarmvector status --verbose', description: 'Check connection and schema status' },
    { command: 'swarmdo swarmvector migrate --up', description: 'Run pending migrations' },
    { command: 'swarmdo swarmvector benchmark --vectors 10000', description: 'Run performance benchmark' },
    { command: 'swarmdo swarmvector optimize --analyze', description: 'Analyze and suggest optimizations' },
    { command: 'swarmdo swarmvector backup --output backup.sql', description: 'Backup SwarmVector data' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Default action: show help/status overview
    output.writeln();
    output.writeln(output.bold('SwarmVector PostgreSQL Bridge'));
    output.writeln(output.dim('=' .repeat(60)));
    output.writeln();

    output.printBox([
      'SwarmVector provides PostgreSQL integration for Swarmdo with:',
      '',
      '  - swarmvector/pgvector extension for vector operations',
      '  - Attention mechanism embeddings',
      '  - Graph Neural Network (GNN) support',
      '  - Hyperbolic embeddings (Poincare ball model)',
      '  - HNSW indexing (150x-12,500x faster)',
      '',
      'Available subcommands:',
      '',
      '  setup      Output Docker files and SQL for setup',
      '  import     Import from sql.js/JSON to PostgreSQL',
      '  init       Initialize SwarmVector in PostgreSQL',
      '  migrate    Run database migrations',
      '  status     Check connection and schema status',
      '  benchmark  Run performance benchmarks',
      '  optimize   Analyze and optimize performance',
      '  backup     Backup and restore data',
    ].join('\n'), 'SwarmVector PostgreSQL Bridge');

    output.writeln();
    output.printInfo('Run `swarmdo swarmvector <command> --help` for details');
    output.writeln();

    return { success: true };
  },
};

export default swarmvectorCommand;

// Re-export subcommands for direct access
export { initCommand } from './init.js';
export { setupCommand } from './setup.js';
export { importCommand } from './import.js';
export { migrateCommand } from './migrate.js';
export { statusCommand } from './status.js';
export { benchmarkCommand } from './benchmark.js';
export { optimizeCommand } from './optimize.js';
export { backupCommand } from './backup.js';
