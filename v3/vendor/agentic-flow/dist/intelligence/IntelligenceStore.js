/**
 * IntelligenceStore - SQLite persistence for RuVector intelligence layer
 *
 * Uses sql.js (pure JS SQLite) as primary backend for cross-platform compatibility
 * Falls back to better-sqlite3 only if sql.js fails
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
// sql.js wrapper
class SqlJsWrapper {
    db;
    dbPath;
    saveTimeout = null;
    constructor(db, dbPath) {
        this.db = db;
        this.dbPath = dbPath;
    }
    scheduleSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveNow();
        }, 100); // Debounce saves
    }
    saveNow() {
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            writeFileSync(this.dbPath, buffer);
        }
        catch {
            // Ignore save errors
        }
    }
    run(sql, params) {
        this.db.run(sql, params || []);
        const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0;
        const changes = this.db.getRowsModified();
        this.scheduleSave();
        return { lastInsertRowid: lastId, changes };
    }
    get(sql, params) {
        const stmt = this.db.prepare(sql);
        if (params)
            stmt.bind(params);
        if (stmt.step()) {
            const columns = stmt.getColumnNames();
            const values = stmt.get();
            stmt.free();
            const result = {};
            columns.forEach((col, i) => {
                result[col] = values[i];
            });
            return result;
        }
        stmt.free();
        return undefined;
    }
    all(sql, params) {
        const results = [];
        const stmt = this.db.prepare(sql);
        if (params)
            stmt.bind(params);
        while (stmt.step()) {
            const columns = stmt.getColumnNames();
            const values = stmt.get();
            const row = {};
            columns.forEach((col, i) => {
                row[col] = values[i];
            });
            results.push(row);
        }
        stmt.free();
        return results;
    }
    exec(sql) {
        this.db.exec(sql);
        this.scheduleSave();
    }
    close() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveNow();
        this.db.close();
    }
}
// better-sqlite3 wrapper
class BetterSqliteWrapper {
    db;
    constructor(db) {
        this.db = db;
    }
    run(sql, params) {
        const stmt = this.db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    }
    get(sql, params) {
        const stmt = this.db.prepare(sql);
        return params ? stmt.get(...params) : stmt.get();
    }
    all(sql, params) {
        const stmt = this.db.prepare(sql);
        return params ? stmt.all(...params) : stmt.all();
    }
    exec(sql) {
        this.db.exec(sql);
    }
    close() {
        this.db.close();
    }
}
export class IntelligenceStore {
    db = null;
    dbPath;
    initialized = false;
    initPromise = null;
    static instance = null;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    /**
     * Initialize the database (async to support sql.js)
     */
    async initialize() {
        if (this.initialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this.doInitialize();
        await this.initPromise;
    }
    async doInitialize() {
        // Ensure directory exists
        const dir = dirname(this.dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // Try sql.js first (pure JS, no native modules)
        try {
            const initSqlJs = (await import('sql.js')).default;
            const SQL = await initSqlJs();
            let db;
            if (existsSync(this.dbPath)) {
                const fileBuffer = readFileSync(this.dbPath);
                db = new SQL.Database(fileBuffer);
            }
            else {
                db = new SQL.Database();
            }
            this.db = new SqlJsWrapper(db, this.dbPath);
            this.initialized = true;
            this.initSchema();
            return;
        }
        catch (e) {
            // sql.js failed, try better-sqlite3
        }
        // Try better-sqlite3 as fallback
        try {
            const Database = (await import('better-sqlite3')).default;
            const db = new Database(this.dbPath);
            db.pragma('journal_mode = WAL');
            db.pragma('synchronous = NORMAL');
            this.db = new BetterSqliteWrapper(db);
            this.initialized = true;
            this.initSchema();
            return;
        }
        catch (e) {
            // Both failed, use in-memory fallback
        }
        // Last resort: in-memory sql.js (won't persist but won't crash)
        try {
            const initSqlJs = (await import('sql.js')).default;
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            this.db = new SqlJsWrapper(db, this.dbPath);
            this.initialized = true;
            this.initSchema();
            console.error('[IntelligenceStore] Warning: Using in-memory database (persistence disabled)');
        }
        catch {
            // Complete failure - create a no-op stub
            this.db = {
                run: () => ({ lastInsertRowid: 0, changes: 0 }),
                get: () => undefined,
                all: () => [],
                exec: () => { },
                close: () => { },
            };
            this.initialized = true;
            console.error('[IntelligenceStore] Warning: Database unavailable, intelligence features disabled');
        }
    }
    /**
     * Ensure database is initialized before operations
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    /**
     * Get singleton instance
     */
    static getInstance(dbPath) {
        if (!IntelligenceStore.instance) {
            const path = dbPath || IntelligenceStore.getDefaultPath();
            IntelligenceStore.instance = new IntelligenceStore(path);
        }
        return IntelligenceStore.instance;
    }
    /**
     * Get default database path (cross-platform)
     */
    static getDefaultPath() {
        // Check for project-local .agentic-flow directory first
        const localPath = join(process.cwd(), '.agentic-flow', 'intelligence.db');
        const localDir = dirname(localPath);
        if (existsSync(localDir)) {
            return localPath;
        }
        // Fall back to home directory
        const homeDir = homedir();
        return join(homeDir, '.agentic-flow', 'intelligence.db');
    }
    /**
     * Initialize database schema
     */
    initSchema() {
        if (!this.db)
            return;
        this.db.exec(`
      -- Trajectories table
      CREATE TABLE IF NOT EXISTS trajectories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_description TEXT NOT NULL,
        agent TEXT NOT NULL,
        steps INTEGER DEFAULT 0,
        outcome TEXT DEFAULT 'partial',
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Patterns table (for ReasoningBank)
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        approach TEXT NOT NULL,
        embedding BLOB,
        similarity REAL DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Routings table
      CREATE TABLE IF NOT EXISTS routings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        recommended_agent TEXT NOT NULL,
        confidence REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        was_successful INTEGER DEFAULT 0,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Stats table (single row)
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_trajectories INTEGER DEFAULT 0,
        successful_trajectories INTEGER DEFAULT 0,
        total_routings INTEGER DEFAULT 0,
        successful_routings INTEGER DEFAULT 0,
        total_patterns INTEGER DEFAULT 0,
        sona_adaptations INTEGER DEFAULT 0,
        hnsw_queries INTEGER DEFAULT 0,
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Initialize stats row if not exists
      INSERT OR IGNORE INTO stats (id) VALUES (1);
    `);
        // Create indexes separately (sql.js doesn't support CREATE INDEX IF NOT EXISTS in exec)
        try {
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_trajectories_agent ON trajectories(agent);`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_trajectories_outcome ON trajectories(outcome);`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_patterns_task_type ON patterns(task_type);`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_routings_agent ON routings(recommended_agent);`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_routings_timestamp ON routings(timestamp);`);
        }
        catch {
            // Indexes may already exist
        }
    }
    // ============ Trajectory Methods ============
    /**
     * Start a new trajectory
     */
    async startTrajectory(taskDescription, agent) {
        await this.ensureInitialized();
        if (!this.db)
            return 0;
        const result = this.db.run(`INSERT INTO trajectories (task_description, agent, start_time) VALUES (?, ?, ?)`, [taskDescription, agent, Date.now()]);
        await this.incrementStat('total_trajectories');
        return result.lastInsertRowid;
    }
    /**
     * Add step to trajectory
     */
    async addTrajectoryStep(trajectoryId) {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.run(`UPDATE trajectories SET steps = steps + 1 WHERE id = ?`, [trajectoryId]);
    }
    /**
     * End trajectory with outcome
     */
    async endTrajectory(trajectoryId, outcome, metadata) {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.run(`UPDATE trajectories SET outcome = ?, end_time = ?, metadata = ? WHERE id = ?`, [outcome, Date.now(), metadata ? JSON.stringify(metadata) : null, trajectoryId]);
        if (outcome === 'success') {
            await this.incrementStat('successful_trajectories');
        }
    }
    /**
     * Get active trajectories (no end_time)
     */
    async getActiveTrajectories() {
        await this.ensureInitialized();
        if (!this.db)
            return [];
        return this.db.all(`SELECT * FROM trajectories WHERE end_time IS NULL`);
    }
    /**
     * Get recent trajectories
     */
    async getRecentTrajectories(limit = 10) {
        await this.ensureInitialized();
        if (!this.db)
            return [];
        return this.db.all(`SELECT * FROM trajectories ORDER BY start_time DESC LIMIT ?`, [limit]);
    }
    // ============ Pattern Methods ============
    /**
     * Store a pattern
     */
    async storePattern(taskType, approach, embedding) {
        await this.ensureInitialized();
        if (!this.db)
            return 0;
        const embeddingBuffer = embedding ? Buffer.from(embedding.buffer) : null;
        const result = this.db.run(`INSERT INTO patterns (task_type, approach, embedding) VALUES (?, ?, ?)`, [taskType, approach, embeddingBuffer]);
        await this.incrementStat('total_patterns');
        return result.lastInsertRowid;
    }
    /**
     * Update pattern usage
     */
    async updatePatternUsage(patternId, wasSuccessful) {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.run(`UPDATE patterns SET usage_count = usage_count + 1, success_rate = (success_rate * usage_count + ?) / (usage_count + 1), updated_at = strftime('%s', 'now') WHERE id = ?`, [wasSuccessful ? 1 : 0, patternId]);
    }
    /**
     * Find patterns by task type
     */
    async findPatterns(taskType, limit = 5) {
        await this.ensureInitialized();
        if (!this.db)
            return [];
        return this.db.all(`SELECT * FROM patterns WHERE task_type LIKE ? ORDER BY success_rate DESC, usage_count DESC LIMIT ?`, [`%${taskType}%`, limit]);
    }
    // ============ Routing Methods ============
    /**
     * Record a routing decision
     */
    async recordRouting(task, recommendedAgent, confidence, latencyMs) {
        await this.ensureInitialized();
        if (!this.db)
            return 0;
        const result = this.db.run(`INSERT INTO routings (task, recommended_agent, confidence, latency_ms) VALUES (?, ?, ?, ?)`, [task, recommendedAgent, confidence, latencyMs]);
        await this.incrementStat('total_routings');
        return result.lastInsertRowid;
    }
    /**
     * Update routing outcome
     */
    async updateRoutingOutcome(routingId, wasSuccessful) {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.run(`UPDATE routings SET was_successful = ? WHERE id = ?`, [wasSuccessful ? 1 : 0, routingId]);
        if (wasSuccessful) {
            await this.incrementStat('successful_routings');
        }
    }
    /**
     * Get routing accuracy for an agent
     */
    async getAgentAccuracy(agent) {
        await this.ensureInitialized();
        if (!this.db)
            return { total: 0, successful: 0, accuracy: 0 };
        const result = this.db.get(`SELECT COUNT(*) as total, SUM(was_successful) as successful FROM routings WHERE recommended_agent = ?`, [agent]);
        return {
            total: result?.total || 0,
            successful: result?.successful || 0,
            accuracy: result?.total ? (result.successful || 0) / result.total : 0,
        };
    }
    // ============ Stats Methods ============
    /**
     * Get all stats
     */
    async getStats() {
        await this.ensureInitialized();
        if (!this.db) {
            return {
                totalTrajectories: 0,
                successfulTrajectories: 0,
                totalRoutings: 0,
                successfulRoutings: 0,
                totalPatterns: 0,
                sonaAdaptations: 0,
                hnswQueries: 0,
                lastUpdated: Date.now(),
            };
        }
        const row = this.db.get(`SELECT * FROM stats WHERE id = 1`);
        return {
            totalTrajectories: row?.total_trajectories || 0,
            successfulTrajectories: row?.successful_trajectories || 0,
            totalRoutings: row?.total_routings || 0,
            successfulRoutings: row?.successful_routings || 0,
            totalPatterns: row?.total_patterns || 0,
            sonaAdaptations: row?.sona_adaptations || 0,
            hnswQueries: row?.hnsw_queries || 0,
            lastUpdated: row?.last_updated || Date.now(),
        };
    }
    /**
     * Increment a stat counter
     */
    async incrementStat(statName, amount = 1) {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.run(`UPDATE stats SET ${statName} = ${statName} + ?, last_updated = strftime('%s', 'now') WHERE id = 1`, [amount]);
    }
    /**
     * Record SONA adaptation
     */
    async recordSonaAdaptation() {
        await this.incrementStat('sona_adaptations');
    }
    /**
     * Record HNSW query
     */
    async recordHnswQuery() {
        await this.incrementStat('hnsw_queries');
    }
    // ============ Utility Methods ============
    /**
     * Get summary for display (simplified for UI)
     */
    async getSummary() {
        const stats = await this.getStats();
        return {
            trajectories: stats.totalTrajectories,
            routings: stats.totalRoutings,
            patterns: stats.totalPatterns,
            operations: stats.sonaAdaptations + stats.hnswQueries,
        };
    }
    /**
     * Get detailed summary for reports
     */
    async getDetailedSummary() {
        const stats = await this.getStats();
        const active = await this.getActiveTrajectories();
        return {
            trajectories: {
                total: stats.totalTrajectories,
                active: active.length,
                successful: stats.successfulTrajectories,
            },
            routings: {
                total: stats.totalRoutings,
                accuracy: stats.totalRoutings > 0 ? stats.successfulRoutings / stats.totalRoutings : 0,
            },
            patterns: stats.totalPatterns,
            operations: {
                sona: stats.sonaAdaptations,
                hnsw: stats.hnswQueries,
            },
        };
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.initialized = false;
        IntelligenceStore.instance = null;
    }
    /**
     * Reset all data (for testing)
     */
    async reset() {
        await this.ensureInitialized();
        if (!this.db)
            return;
        this.db.exec(`
      DELETE FROM trajectories;
      DELETE FROM patterns;
      DELETE FROM routings;
      UPDATE stats SET
        total_trajectories = 0,
        successful_trajectories = 0,
        total_routings = 0,
        successful_routings = 0,
        total_patterns = 0,
        sona_adaptations = 0,
        hnsw_queries = 0,
        last_updated = strftime('%s', 'now')
      WHERE id = 1;
    `);
    }
}
// Export singleton getter
export function getIntelligenceStore(dbPath) {
    return IntelligenceStore.getInstance(dbPath);
}
//# sourceMappingURL=IntelligenceStore.js.map