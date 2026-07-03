/**
 * AgentDB Migration Command
 * Migrate legacy AgentDB v1 and claude-flow memory databases to v2 format
 * with SwarmVector GNN optimization
 */
interface MigrationOptions {
    sourceDb: string;
    targetDb?: string;
    to?: 'v2' | 'v3' | 'rvf';
    rvfPath?: string;
    optimize?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
}
/** Stats returned by migrateV2ToV3 */
export interface V3MigrationStats {
    tablesProcessed: string[];
    rowsCopied: Record<string, number>;
    totalRows: number;
}
/**
 * Migrate a v2 AgentDB .db file to the v3 unified .rvf format.
 * Both versions use the same 24-table schema, so this is a direct data copy.
 */
export declare function migrateV2ToV3(sourceDbPath: string, targetRvfPath: string, options?: {
    verbose?: boolean;
}): Promise<V3MigrationStats>;
export declare function migrateCommand(options: MigrationOptions): Promise<void>;
export {};
//# sourceMappingURL=migrate.d.ts.map