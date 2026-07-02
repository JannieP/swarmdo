/**
 * Backend Selection Helper for ReasoningBank
 *
 * Automatically selects the optimal ReasoningBank backend based on runtime environment.
 *
 * Usage:
 * ```typescript
 * import { createOptimalReasoningBank, getRecommendedBackend } from 'agentic-flow/reasoningbank/backend-selector';
 *
 * // Automatic backend selection
 * const rb = await createOptimalReasoningBank('my-db');
 *
 * // Manual check
 * const backend = getRecommendedBackend();
 * console.log(`Using ${backend} backend`);
 * ```
 */
/**
 * Detect runtime environment and recommend optimal backend
 *
 * @returns 'nodejs' for Node.js/Deno environments, 'wasm' for browsers
 */
export function getRecommendedBackend() {
    // Check for browser environment
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        return 'wasm';
    }
    // Check for Node.js/Deno
    if (typeof process !== 'undefined' && process.versions?.node) {
        return 'nodejs';
    }
    // Default to WASM for unknown environments (likely web workers, etc.)
    return 'wasm';
}
/**
 * Check if IndexedDB is available (browser environment)
 */
export function hasIndexedDB() {
    return typeof indexedDB !== 'undefined';
}
/**
 * Check if SQLite native module is available (Node.js)
 */
export function hasSQLite() {
    try {
        require.resolve('better-sqlite3');
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if sql.js (WASM SQLite) is available
 */
export function hasSqlJs() {
    try {
        require.resolve('sql.js');
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get best available SQLite implementation
 * Priority: better-sqlite3 > sql.js > none
 */
export function getSQLiteImplementation() {
    if (hasSQLite())
        return 'better-sqlite3';
    if (hasSqlJs())
        return 'sql.js';
    return 'none';
}
/**
 * Create ReasoningBank instance with optimal backend for current environment
 *
 * @param dbName - Database name (used differently by each backend)
 * @param options - Additional configuration options
 * @returns ReasoningBank instance using optimal backend
 *
 * @example
 * ```typescript
 * // Node.js: Creates SQLite database at .swarm/my-app.db
 * const rb = await createOptimalReasoningBank('my-app');
 *
 * // Browser: Creates IndexedDB database named 'my-app'
 * const rb = await createOptimalReasoningBank('my-app');
 * ```
 */
export async function createOptimalReasoningBank(dbName = 'reasoningbank', options = {}) {
    const backend = options.forceBackend || getRecommendedBackend();
    if (options.verbose) {
        console.log(`[ReasoningBank] Environment: ${backend}`);
        console.log(`[ReasoningBank] Database: ${dbName}`);
    }
    if (backend === 'nodejs') {
        const sqliteImpl = getSQLiteImplementation();
        if (options.verbose) {
            console.log(`[ReasoningBank] SQLite implementation: ${sqliteImpl}`);
        }
        // If better-sqlite3 not available, fallback to WASM/sql.js
        if (sqliteImpl === 'none' || sqliteImpl === 'sql.js') {
            if (options.verbose) {
                console.log(`[ReasoningBank] Native SQLite not available, using WASM backend`);
            }
            // Use WASM backend as fallback (works on Windows without native compilation)
            const { createReasoningBank } = await import('./wasm-adapter.js');
            return await createReasoningBank(dbName);
        }
        // Import Node.js backend (SQLite)
        const reasoningBankModule = await import('./index.js');
        const dbPath = options.dbPath || `.swarm/${dbName}.db`;
        if (options.verbose) {
            console.log(`[ReasoningBank] Using Node.js backend with better-sqlite3`);
            console.log(`[ReasoningBank] Database path: ${dbPath}`);
        }
        // The Node.js backend uses the db module and core algorithms
        // Initialize the database
        await reasoningBankModule.initialize();
        // Note: The Node.js backend has a different API than WASM
        // It uses the functions from db/queries.ts and core algorithms
        // We return the full module for direct access to all functions
        return reasoningBankModule;
    }
    else {
        // Import WASM backend (IndexedDB in browser, Memory in Node.js)
        const { createReasoningBank } = await import('./wasm-adapter.js');
        if (options.verbose) {
            const storageType = hasIndexedDB() ? 'IndexedDB (persistent)' : 'Memory (ephemeral)';
            console.log(`[ReasoningBank] Using WASM backend with ${storageType}`);
            console.log(`[ReasoningBank] Database name: ${dbName}`);
        }
        return await createReasoningBank(dbName);
    }
}
/**
 * Get backend information and capabilities
 */
export function getBackendInfo() {
    const backend = getRecommendedBackend();
    return {
        backend,
        environment: typeof window !== 'undefined' ? 'browser' : 'nodejs',
        features: {
            persistent: backend === 'nodejs' || hasIndexedDB(),
            sqlite: backend === 'nodejs' && hasSQLite(),
            indexeddb: backend === 'wasm' && hasIndexedDB(),
            wasm: backend === 'wasm',
        },
        storage: backend === 'nodejs'
            ? 'SQLite (disk)'
            : hasIndexedDB()
                ? 'IndexedDB (browser)'
                : 'Memory (ephemeral)',
    };
}
/**
 * Validate environment and warn about limitations
 */
export function validateEnvironment() {
    const backend = getRecommendedBackend();
    const sqliteImpl = getSQLiteImplementation();
    const warnings = [];
    let valid = true;
    if (backend === 'nodejs' && sqliteImpl === 'none') {
        warnings.push('No SQLite implementation available - will use WASM fallback');
        warnings.push('Install sql.js for persistence: npm install sql.js');
    }
    else if (backend === 'nodejs' && sqliteImpl === 'sql.js') {
        warnings.push('Using sql.js (WASM) instead of better-sqlite3 - this is normal on Windows');
    }
    if (backend === 'wasm' && typeof window !== 'undefined' && !hasIndexedDB()) {
        warnings.push('IndexedDB not available - using ephemeral memory storage');
        warnings.push('Data will be lost when page/process exits');
    }
    if (backend === 'wasm' && typeof window === 'undefined') {
        warnings.push('WASM in Node.js uses in-memory storage (ephemeral)');
        warnings.push('Consider using Node.js backend for persistence');
    }
    return { valid, warnings, backend, sqliteImpl };
}
// Export validation helper for use in initialization
export { validateEnvironment as checkEnvironment };
//# sourceMappingURL=backend-selector.js.map