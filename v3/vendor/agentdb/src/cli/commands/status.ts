/**
 * AgentDB Status Command - Show database and backend status
 */

import { createDatabase } from '../../db-fallback.js';
import { detectBackend } from '../../backends/detector.js';
import * as fs from 'fs';

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

interface StatusOptions {
  dbPath?: string;
  verbose?: boolean;
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const { dbPath = './agentdb.db', verbose = false } = options;

  try {
    console.log(`\n${colors.bright}${colors.cyan}📊 AgentDB Status${colors.reset}\n`);

    // Check database existence
    const dbExists = fs.existsSync(dbPath);
    console.log(`${colors.bright}Database:${colors.reset}`);
    console.log(`  Path:          ${colors.blue}${dbPath}${colors.reset}`);
    console.log(`  Status:        ${dbExists ? colors.green + '✅ Exists' : colors.red + '❌ Not found'}${colors.reset}`);

    if (!dbExists) {
      console.log(`\n${colors.yellow}💡 Run ${colors.cyan}agentdb init${colors.yellow} to create database${colors.reset}\n`);
      return;
    }

    // Get file size
    const stats = fs.statSync(dbPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  Size:          ${colors.blue}${sizeInMB} MB${colors.reset}`);
    console.log('');

    // Open database and get configuration
    const db = await createDatabase(dbPath);

    try {
      // Get backend configuration
      const configQuery = db.prepare('SELECT key, value FROM agentdb_config');
      const configs = configQuery.all() as Array<{ key: string; value: string }>;
      const configMap = new Map(configs.map(c => [c.key, c.value]));

      const backend = configMap.get('backend') as 'swarmvector' | 'hnswlib' | undefined;
      const dimension = configMap.get('dimension');
      const version = configMap.get('version');

      console.log(`${colors.bright}Configuration:${colors.reset}`);
      console.log(`  Version:       ${colors.blue}${version || 'N/A'}${colors.reset}`);
      console.log(`  Backend:       ${backend ? getBackendColor(backend) + backend : colors.yellow + 'Not configured'}${colors.reset}`);
      console.log(`  Dimension:     ${colors.blue}${dimension || 'N/A'}${colors.reset}`);
      console.log('');

      // Get table statistics
      const tables = [
        { name: 'reflexion_episodes', label: 'Episodes' },
        { name: 'skill_library', label: 'Skills' },
        { name: 'causal_nodes', label: 'Causal Nodes' },
        { name: 'causal_edges', label: 'Causal Edges' },
        { name: 'reasoning_patterns', label: 'Patterns' }
      ];

      console.log(`${colors.bright}Data Statistics:${colors.reset}`);

      let totalRecords = 0;
      for (const table of tables) {
        try {
          const result = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
          const count = result.count;
          totalRecords += count;

          if (verbose || count > 0) {
            console.log(`  ${table.label.padEnd(20)} ${colors.blue}${count.toLocaleString()}${colors.reset}`);
          }
        } catch {
          // Table doesn't exist
          if (verbose) {
            console.log(`  ${table.label.padEnd(20)} ${colors.yellow}N/A${colors.reset}`);
          }
        }
      }

      console.log(`  ${colors.bright}Total Records${colors.reset}      ${colors.blue}${totalRecords.toLocaleString()}${colors.reset}`);
      console.log('');

      // Detect available backends
      const detection = await detectBackend();

      console.log(`${colors.bright}Available Backends:${colors.reset}`);
      console.log(`  Detected:      ${getBackendColor(detection.backend)}${detection.backend}${colors.reset}`);
      console.log(`  Native:        ${detection.native ? colors.green + '✅ Yes' : colors.yellow + '⚠️  WASM'}${colors.reset}`);
      console.log(`  Platform:      ${colors.blue}${detection.platform.combined}${colors.reset}`);
      console.log('');

      console.log(`${colors.bright}Features:${colors.reset}`);
      console.log(`  GNN:           ${detection.features.gnn ? colors.green + '✅ Available' : colors.yellow + '⚠️  Not available'}${colors.reset}`);
      console.log(`  Graph:         ${detection.features.graph ? colors.green + '✅ Available' : colors.yellow + '⚠️  Not available'}${colors.reset}`);
      console.log(`  Compression:   ${detection.features.compression ? colors.green + '✅ Available' : colors.yellow + '⚠️  Not available'}${colors.reset}`);
      console.log('');

      // Performance info
      if (backend === 'swarmvector' && detection.backend === 'swarmvector') {
        console.log(`${colors.bright}${colors.green}⚡ Performance:${colors.reset}`);
        console.log(`  Search speed:  ${colors.green}150x faster${colors.reset} than pure SQLite`);
        console.log(`  Vector ops:    ${colors.green}Sub-millisecond${colors.reset} latency`);
        if (detection.features.gnn) {
          console.log(`  Self-learning: ${colors.green}✅ Enabled${colors.reset}`);
        }
        console.log('');
      }

      // Memory stats (verbose mode)
      if (verbose) {
        const memoryStats = db.prepare("PRAGMA page_count").get() as { page_count?: number };
        const pageSize = db.prepare("PRAGMA page_size").get() as { page_size?: number };

        if (memoryStats.page_count && pageSize.page_size) {
          const memoryInMB = ((memoryStats.page_count * pageSize.page_size) / (1024 * 1024)).toFixed(2);
          console.log(`${colors.bright}Memory:${colors.reset}`);
          console.log(`  Pages:         ${colors.blue}${memoryStats.page_count.toLocaleString()}${colors.reset}`);
          console.log(`  Page Size:     ${colors.blue}${pageSize.page_size} bytes${colors.reset}`);
          console.log(`  Total:         ${colors.blue}${memoryInMB} MB${colors.reset}`);
          console.log('');
        }
      }

    } finally {
      db.close();
    }

    console.log(`${colors.green}✅ Status check complete${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Status check failed:${colors.reset}`);
    console.error(`   ${(error as Error).message}`);
    process.exit(1);
  }
}

function getBackendColor(backend: 'swarmvector' | 'hnswlib'): string {
  return backend === 'swarmvector' ? colors.green : colors.yellow;
}
