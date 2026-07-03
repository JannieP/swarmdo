/**
 * V3 CLI RufVector PostgreSQL Bridge Command
 * Management commands for RufVector PostgreSQL integration
 *
 * Features:
 * - rufvector/pgvector integration for vector operations
 * - Attention mechanism embeddings
 * - Graph Neural Network support
 * - Hyperbolic embeddings (Poincare ball)
 * - Performance benchmarking
 * - Migration management
 *
 * Created with care by ruv.io
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
 * RufVector PostgreSQL Bridge main command
 */
export const rufvectorCommand: Command = {
  name: 'rufvector',
  description: 'RufVector PostgreSQL Bridge management',
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
      default: 'rufflo',
    },
  ],
  examples: [
    { command: 'rufflo rufvector setup', description: 'Output Docker files and SQL for setup' },
    { command: 'rufflo rufvector import --input memory.json', description: 'Import from sql.js/JSON export' },
    { command: 'rufflo rufvector init --database mydb', description: 'Initialize RufVector in PostgreSQL' },
    { command: 'rufflo rufvector status --verbose', description: 'Check connection and schema status' },
    { command: 'rufflo rufvector migrate --up', description: 'Run pending migrations' },
    { command: 'rufflo rufvector benchmark --vectors 10000', description: 'Run performance benchmark' },
    { command: 'rufflo rufvector optimize --analyze', description: 'Analyze and suggest optimizations' },
    { command: 'rufflo rufvector backup --output backup.sql', description: 'Backup RufVector data' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Default action: show help/status overview
    output.writeln();
    output.writeln(output.bold('RufVector PostgreSQL Bridge'));
    output.writeln(output.dim('=' .repeat(60)));
    output.writeln();

    output.printBox([
      'RufVector provides PostgreSQL integration for Rufflo with:',
      '',
      '  - rufvector/pgvector extension for vector operations',
      '  - Attention mechanism embeddings',
      '  - Graph Neural Network (GNN) support',
      '  - Hyperbolic embeddings (Poincare ball model)',
      '  - HNSW indexing (150x-12,500x faster)',
      '',
      'Available subcommands:',
      '',
      '  setup      Output Docker files and SQL for setup',
      '  import     Import from sql.js/JSON to PostgreSQL',
      '  init       Initialize RufVector in PostgreSQL',
      '  migrate    Run database migrations',
      '  status     Check connection and schema status',
      '  benchmark  Run performance benchmarks',
      '  optimize   Analyze and optimize performance',
      '  backup     Backup and restore data',
    ].join('\n'), 'RufVector PostgreSQL Bridge');

    output.writeln();
    output.printInfo('Run `rufflo rufvector <command> --help` for details');
    output.writeln();

    return { success: true };
  },
};

export default rufvectorCommand;

// Re-export subcommands for direct access
export { initCommand } from './init.js';
export { setupCommand } from './setup.js';
export { importCommand } from './import.js';
export { migrateCommand } from './migrate.js';
export { statusCommand } from './status.js';
export { benchmarkCommand } from './benchmark.js';
export { optimizeCommand } from './optimize.js';
export { backupCommand } from './backup.js';
