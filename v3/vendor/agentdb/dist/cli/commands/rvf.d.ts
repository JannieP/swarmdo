/**
 * RVF CLI Command - Manage RVF vector stores and AGI capabilities
 *
 * Provides subcommands for:
 * - status: Show RVF store status and statistics
 * - compact: Reclaim dead space in an RVF store
 * - derive: Create a COW branch from an existing store
 * - segments: List store segments and their metadata
 * - detect: Detect RVF SDK and backend availability
 * - witness: Verify SHAKE-256 witness chain integrity
 * - freeze: Snapshot-freeze store state
 * - index-stats: Show HNSW index statistics
 * - solver train: Train the self-learning solver
 * - solver test: Run A/B/C acceptance test
 */
import { Command } from 'commander';
/**
 * Main rvf command
 */
export declare const rvfCommand: Command;
//# sourceMappingURL=rvf.d.ts.map