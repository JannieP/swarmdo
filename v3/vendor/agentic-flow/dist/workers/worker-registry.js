/**
 * WorkerRegistry - SQLite-backed persistence for background workers
 *
 * Supports both better-sqlite3 (native) and sql.js (WASM) backends.
 * Automatically falls back to sql.js on Windows or when native fails.
 */
import * as path from 'path';
import * as fs from 'fs';
import { ulid } from 'ulid';
const DB_DIR = '.agentic-flow';
const DB_FILE = 'workers.db';
// Create wrapper for better-sqlite3
function createBetterSqliteWrapper(db) {
    return {
        run: (sql, params) => db.prepare(sql).run(...(params || [])),
        get: (sql, params) => db.prepare(sql).get(...(params || [])),
        all: (sql, params) => db.prepare(sql).all(...(params || [])),
        exec: (sql) => db.exec(sql),
        pragma: (directive) => db.pragma(directive),
        prepare: (sql) => db.prepare(sql),
        close: () => db.close()
    };
}
// Create wrapper for sql.js
function createSqlJsWrapper(db, dbPath) {
    // sql.js needs manual save
    const saveDb = () => {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        }
        catch { /* ignore save errors */ }
    };
    return {
        run: (sql, params) => {
            db.run(sql, params);
            saveDb();
        },
        get: (sql, params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all: (sql, params) => {
            const results = [];
            const stmt = db.prepare(sql);
            if (params)
                stmt.bind(params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        },
        exec: (sql) => {
            db.exec(sql);
            saveDb();
        },
        pragma: () => { },
        prepare: (sql) => {
            const stmt = db.prepare(sql);
            return {
                run: (...params) => {
                    stmt.bind(params);
                    stmt.step();
                    stmt.reset();
                    saveDb();
                    return { changes: db.getRowsModified() };
                },
                get: (...params) => {
                    stmt.bind(params);
                    if (stmt.step()) {
                        const row = stmt.getAsObject();
                        stmt.reset();
                        return row;
                    }
                    stmt.reset();
                    return undefined;
                },
                all: (...params) => {
                    const results = [];
                    stmt.bind(params);
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    stmt.reset();
                    return results;
                }
            };
        },
        close: () => {
            saveDb();
            db.close();
        }
    };
}
export class WorkerRegistry {
    db;
    initialized = false;
    dbBackend = 'memory';
    dbPath;
    constructor(dbPath) {
        const dir = path.join(process.cwd(), DB_DIR);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.dbPath = dbPath || path.join(dir, DB_FILE);
        this.initializeSync();
    }
    initializeSync() {
        // Try better-sqlite3 first (fastest, native)
        try {
            const Database = require('better-sqlite3');
            this.db = createBetterSqliteWrapper(new Database(this.dbPath));
            this.dbBackend = 'better-sqlite3';
            this.initialize();
            return;
        }
        catch {
            // better-sqlite3 not available (Windows without build tools, etc.)
        }
        // Try sql.js (WASM, cross-platform)
        try {
            const initSqlJs = require('sql.js');
            // sql.js init is async, but we need sync for constructor
            // Use a synchronous workaround by loading existing data
            const sqlPromise = initSqlJs().then((SQL) => {
                let db;
                try {
                    const fileBuffer = fs.readFileSync(this.dbPath);
                    db = new SQL.Database(fileBuffer);
                }
                catch {
                    db = new SQL.Database();
                }
                this.db = createSqlJsWrapper(db, this.dbPath);
                this.dbBackend = 'sql.js';
                this.initialize();
            });
            // For now, use memory fallback until sql.js loads
            this.useMemoryFallback();
            // Replace with sql.js when ready
            sqlPromise.catch(() => {
                // Keep memory fallback
            });
            return;
        }
        catch {
            // sql.js not available
        }
        // Final fallback: in-memory Map (no persistence)
        this.useMemoryFallback();
    }
    useMemoryFallback() {
        const memory = new Map();
        this.db = {
            run: () => { },
            get: (sql, params) => memory.get(params?.[0]),
            all: () => Array.from(memory.values()),
            exec: () => { },
            pragma: () => { },
            prepare: (sql) => ({
                run: (...params) => {
                    if (sql.includes('INSERT')) {
                        memory.set(params[0], {
                            id: params[0],
                            session_id: params[1],
                            trigger: params[2],
                            topic: params[3],
                            status: 'queued',
                            progress: 0,
                            created_at: Date.now()
                        });
                    }
                    return { changes: 1 };
                },
                get: (...params) => memory.get(params[0]),
                all: () => Array.from(memory.values())
            }),
            close: () => memory.clear()
        };
        this.dbBackend = 'memory';
        this.initialized = true;
    }
    initialize() {
        if (this.initialized)
            return;
        // Enable WAL mode for better concurrent performance
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        // Create tables
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS background_workers (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        topic TEXT,
        status TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        current_phase TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        error_message TEXT,
        memory_deposits INTEGER DEFAULT 0,
        result_keys TEXT DEFAULT '[]',
        results_data TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_workers_session ON background_workers(session_id);
      CREATE INDEX IF NOT EXISTS idx_workers_status ON background_workers(status);
      CREATE INDEX IF NOT EXISTS idx_workers_trigger ON background_workers(trigger);
      CREATE INDEX IF NOT EXISTS idx_workers_created ON background_workers(created_at);

      CREATE TABLE IF NOT EXISTS worker_metrics (
        worker_id TEXT PRIMARY KEY,
        files_analyzed INTEGER DEFAULT 0,
        patterns_found INTEGER DEFAULT 0,
        memory_bytes_written INTEGER DEFAULT 0,
        cpu_time_ms INTEGER DEFAULT 0,
        peak_memory_mb REAL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        FOREIGN KEY (worker_id) REFERENCES background_workers(id)
      );
    `);
        this.initialized = true;
    }
    /**
     * Create a new worker entry
     */
    create(trigger, sessionId, topic) {
        const id = `worker-${ulid().slice(0, 8)}`;
        const now = Date.now();
        const stmt = this.db.prepare(`
      INSERT INTO background_workers (id, session_id, trigger, topic, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(id, sessionId, trigger, topic || null, now);
        // Create metrics entry
        const metricsStmt = this.db.prepare(`
      INSERT INTO worker_metrics (worker_id) VALUES (?)
    `);
        metricsStmt.run(id);
        return id;
    }
    /**
     * Get worker by ID
     */
    get(workerId) {
        const stmt = this.db.prepare(`
      SELECT * FROM background_workers WHERE id = ?
    `);
        const row = stmt.get(workerId);
        if (!row)
            return null;
        return this.rowToWorkerInfo(row);
    }
    /**
     * Update worker status
     */
    updateStatus(workerId, status, extra) {
        const updates = ['status = ?'];
        const params = [status];
        if (status === 'running' && !extra?.progress) {
            updates.push('started_at = ?');
            params.push(Date.now());
        }
        if (status === 'complete' || status === 'failed' || status === 'cancelled') {
            updates.push('completed_at = ?');
            params.push(Date.now());
        }
        if (extra?.progress !== undefined) {
            updates.push('progress = ?');
            params.push(extra.progress);
        }
        if (extra?.currentPhase !== undefined) {
            updates.push('current_phase = ?');
            params.push(extra.currentPhase);
        }
        if (extra?.error !== undefined) {
            updates.push('error_message = ?');
            params.push(extra.error);
        }
        if (extra?.results !== undefined) {
            updates.push('results_data = ?');
            params.push(JSON.stringify(extra.results));
        }
        params.push(workerId);
        const stmt = this.db.prepare(`
      UPDATE background_workers
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
        stmt.run(...params);
    }
    /**
     * Increment memory deposits counter
     */
    incrementMemoryDeposits(workerId, key) {
        const stmt = this.db.prepare(`
      UPDATE background_workers
      SET memory_deposits = memory_deposits + 1,
          result_keys = json_insert(result_keys, '$[#]', ?)
      WHERE id = ?
    `);
        stmt.run(key || '', workerId);
    }
    /**
     * Update worker metrics
     */
    updateMetrics(workerId, metrics) {
        const updates = [];
        const params = [];
        if (metrics.filesAnalyzed !== undefined) {
            updates.push('files_analyzed = ?');
            params.push(metrics.filesAnalyzed);
        }
        if (metrics.patternsFound !== undefined) {
            updates.push('patterns_found = ?');
            params.push(metrics.patternsFound);
        }
        if (metrics.memoryBytesWritten !== undefined) {
            updates.push('memory_bytes_written = ?');
            params.push(metrics.memoryBytesWritten);
        }
        if (metrics.cpuTimeMs !== undefined) {
            updates.push('cpu_time_ms = ?');
            params.push(metrics.cpuTimeMs);
        }
        if (metrics.peakMemoryMB !== undefined) {
            updates.push('peak_memory_mb = ?');
            params.push(metrics.peakMemoryMB);
        }
        if (metrics.errorCount !== undefined) {
            updates.push('error_count = ?');
            params.push(metrics.errorCount);
        }
        if (updates.length === 0)
            return;
        params.push(workerId);
        const stmt = this.db.prepare(`
      UPDATE worker_metrics
      SET ${updates.join(', ')}
      WHERE worker_id = ?
    `);
        stmt.run(...params);
    }
    /**
     * Get all workers, optionally filtered
     */
    getAll(options) {
        const conditions = [];
        const params = [];
        if (options?.sessionId) {
            conditions.push('session_id = ?');
            params.push(options.sessionId);
        }
        if (options?.status) {
            if (Array.isArray(options.status)) {
                conditions.push(`status IN (${options.status.map(() => '?').join(', ')})`);
                params.push(...options.status);
            }
            else {
                conditions.push('status = ?');
                params.push(options.status);
            }
        }
        if (options?.trigger) {
            conditions.push('trigger = ?');
            params.push(options.trigger);
        }
        if (options?.since) {
            conditions.push('created_at >= ?');
            params.push(options.since);
        }
        let sql = 'SELECT * FROM background_workers';
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY created_at DESC';
        if (options?.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);
        }
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => this.rowToWorkerInfo(row));
    }
    /**
     * Get active workers (queued or running)
     */
    getActive(sessionId) {
        return this.getAll({
            sessionId,
            status: ['queued', 'running']
        });
    }
    /**
     * Count workers by status
     */
    countByStatus(sessionId) {
        let sql = `
      SELECT status, COUNT(*) as count
      FROM background_workers
    `;
        const params = [];
        if (sessionId) {
            sql += ' WHERE session_id = ?';
            params.push(sessionId);
        }
        sql += ' GROUP BY status';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        const counts = {
            queued: 0,
            running: 0,
            complete: 0,
            failed: 0,
            cancelled: 0,
            timeout: 0
        };
        for (const row of rows) {
            counts[row.status] = row.count;
        }
        return counts;
    }
    /**
     * Get worker metrics
     */
    getMetrics(workerId) {
        const stmt = this.db.prepare(`
      SELECT * FROM worker_metrics WHERE worker_id = ?
    `);
        const row = stmt.get(workerId);
        if (!row)
            return null;
        return {
            workerId: row.worker_id,
            filesAnalyzed: row.files_analyzed,
            patternsFound: row.patterns_found,
            memoryBytesWritten: row.memory_bytes_written,
            cpuTimeMs: row.cpu_time_ms,
            peakMemoryMB: row.peak_memory_mb,
            errorCount: row.error_count
        };
    }
    /**
     * Delete old workers
     */
    cleanup(maxAge = 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;
        const stmt = this.db.prepare(`
      DELETE FROM background_workers
      WHERE created_at < ? AND status IN ('complete', 'failed', 'cancelled', 'timeout')
    `);
        const result = stmt.run(cutoff);
        return result.changes;
    }
    /**
     * Get aggregated stats for dashboard
     */
    getStats(timeframe = '24h') {
        const since = {
            '1h': Date.now() - 60 * 60 * 1000,
            '24h': Date.now() - 24 * 60 * 60 * 1000,
            '7d': Date.now() - 7 * 24 * 60 * 60 * 1000
        }[timeframe];
        const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        AVG(CASE WHEN completed_at IS NOT NULL THEN completed_at - started_at ELSE NULL END) as avg_duration
      FROM background_workers
      WHERE created_at >= ?
    `);
        const row = stmt.get(since);
        return {
            total: row.total,
            byStatus: this.countByStatus(),
            byTrigger: this.countByTrigger(since),
            avgDuration: row.avg_duration || 0
        };
    }
    countByTrigger(since) {
        const stmt = this.db.prepare(`
      SELECT trigger, COUNT(*) as count
      FROM background_workers
      WHERE created_at >= ?
      GROUP BY trigger
    `);
        const rows = stmt.all(since);
        const counts = {};
        for (const row of rows) {
            counts[row.trigger] = row.count;
        }
        return counts;
    }
    rowToWorkerInfo(row) {
        let results = undefined;
        try {
            const parsed = JSON.parse(row.results_data || '{}');
            if (Object.keys(parsed).length > 0) {
                results = parsed;
            }
        }
        catch {
            // Invalid JSON, ignore
        }
        return {
            id: row.id,
            trigger: row.trigger,
            topic: row.topic,
            sessionId: row.session_id,
            status: row.status,
            progress: row.progress,
            currentPhase: row.current_phase,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            error: row.error_message,
            memoryDeposits: row.memory_deposits,
            resultKeys: JSON.parse(row.result_keys || '[]'),
            createdAt: row.created_at,
            results
        };
    }
    /**
     * Close database connection
     */
    close() {
        this.db.close();
    }
}
// Singleton instance
let instance = null;
export function getWorkerRegistry() {
    if (!instance) {
        instance = new WorkerRegistry();
    }
    return instance;
}
//# sourceMappingURL=worker-registry.js.map