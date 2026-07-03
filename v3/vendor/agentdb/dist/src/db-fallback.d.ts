/**
 * Database System backed by SQLite.
 *
 * Resolution order (swarmdo #2235 A):
 *   1. **better-sqlite3** if the optional peer is loadable — native, faster,
 *      what most callers actually want when they install the native module.
 *   2. **sql.js** (WASM) — pure-JS fallback, requires no build tools.
 *
 * Both implementations expose the same `db.prepare(sql).run/get/all(...)`
 * interface (the sql.js wrapper below was designed to mimic better-sqlite3),
 * so callers don't care which one served them.
 *
 * SECURITY: Fixed SQL injection vulnerabilities:
 * - PRAGMA commands validated against whitelist
 * - Removed eval() usage (replaced with async import)
 */
/**
 * Get the SQLite database implementation. Prefers native `better-sqlite3`
 * when loadable; falls back to WASM `sql.js` (no build tools required).
 */
export declare function getDatabaseImplementation(): Promise<any>;
/** Reset the cached implementation (intended for tests). */
export declare function _resetDatabaseImplementationForTests(): void;
/**
 * Create a database instance using sql.js
 */
export declare function createDatabase(filename: string, options?: unknown): Promise<any>;
/**
 * Wrap an EXISTING sql.js raw database with the better-sqlite3-compatible API.
 * Used by AgentDB unified mode to share one sql.js Database instance for both
 * vector (rvf) and relational tables in a single .rvf file.
 *
 * Unlike createDatabase(), this does NOT create a new SQL.Database — it wraps
 * the one already held by SqlJsRvfBackend.
 */
export declare function wrapExistingSqlJsDatabase(rawDb: any, filename?: string): any;
/**
 * Get information about current database implementation
 */
export declare function getDatabaseInfo(): {
    implementation: string;
    isNative: boolean;
    performance: 'high' | 'medium' | 'low';
    requiresBuildTools: boolean;
};
//# sourceMappingURL=db-fallback.d.ts.map