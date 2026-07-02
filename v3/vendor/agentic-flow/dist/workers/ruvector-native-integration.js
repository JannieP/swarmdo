/**
 * RuVector Native Integration
 *
 * REFACTORED: Core phases are now in consolidated-phases.ts
 * This module provides the native runner wrapper and adapters.
 */
import { createUnifiedContext, getUnifiedPhase } from './consolidated-phases.js';
// ============================================================================
// Native Phase Registry (delegates to consolidated phases)
// ============================================================================
const nativePhases = new Map();
// Map consolidated phases to native phase format
const consolidatedToNative = [
    'file-discovery',
    'pattern-extraction',
    'embedding-generation',
    'vector-storage',
    'security-analysis',
    'complexity-analysis',
    'dependency-discovery',
    'summarization',
    'api-discovery',
    'todo-extraction'
];
// Register wrapper phases that delegate to consolidated
for (const phaseName of consolidatedToNative) {
    const unifiedPhase = getUnifiedPhase(phaseName);
    if (unifiedPhase) {
        nativePhases.set(phaseName, {
            name: phaseName,
            description: `Unified ${phaseName} phase`,
            execute: async (context) => {
                const workerContext = {
                    workerId: 'native-runner',
                    trigger: 'optimize',
                    topic: null,
                    sessionId: `native-${Date.now()}`,
                    startTime: Date.now(),
                    signal: new AbortController().signal,
                    onProgress: () => { },
                    onMemoryDeposit: () => { }
                };
                const phaseContext = createUnifiedContext();
                phaseContext.files = [...context.files];
                phaseContext.patterns = [...context.patterns];
                const result = await unifiedPhase(workerContext, phaseContext, context.options);
                // Sync back
                context.files.push(...phaseContext.files.filter(f => !context.files.includes(f)));
                context.patterns.push(...phaseContext.patterns.filter(p => !context.patterns.includes(p)));
                for (const [k, v] of phaseContext.embeddings)
                    context.embeddings.set(k, v);
                for (const [k, v] of phaseContext.vectors)
                    context.vectors.set(k, v);
                return {
                    success: result.success,
                    filesProcessed: phaseContext.files.length,
                    patternsFound: phaseContext.patterns.length,
                    embeddingsGenerated: phaseContext.embeddings.size,
                    vectorsStored: phaseContext.vectors.size,
                    data: result.data,
                    error: result.error
                };
            }
        });
    }
}
// Alias security-scan to security-analysis for backwards compatibility
const securityPhase = nativePhases.get('security-analysis');
if (securityPhase) {
    nativePhases.set('security-scan', {
        ...securityPhase,
        name: 'security-scan'
    });
}
/**
 * Register a native ruvector phase
 */
export function registerNativePhase(name, phase) {
    nativePhases.set(name, phase);
}
/**
 * Get registered native phases
 */
export function listNativePhases() {
    return Array.from(nativePhases.keys());
}
// ============================================================================
// Native Worker Runner
// ============================================================================
export class RuVectorNativeRunner {
    config;
    constructor(config = {}) {
        this.config = {
            vectorDimension: 384,
            enableSIMD: true,
            cacheEmbeddings: true,
            ...config
        };
    }
    /**
     * Run a native worker with specified phases
     */
    async run(workDir, phases, options = {}) {
        const startTime = Date.now();
        const executedPhases = [];
        let totalFiles = 0;
        let totalPatterns = 0;
        let totalEmbeddings = 0;
        let totalVectors = 0;
        let onnxLatencyMs = 0;
        const context = {
            workDir,
            files: [],
            patterns: [],
            embeddings: new Map(),
            vectors: new Map(),
            options
        };
        const phaseResults = {};
        for (const phaseName of phases) {
            const phase = nativePhases.get(phaseName);
            if (!phase) {
                console.warn(`Unknown native phase: ${phaseName}`);
                continue;
            }
            try {
                const result = await phase.execute(context);
                phaseResults[phaseName] = result;
                executedPhases.push(phaseName);
                if (result.filesProcessed)
                    totalFiles = Math.max(totalFiles, result.filesProcessed);
                if (result.patternsFound)
                    totalPatterns = Math.max(totalPatterns, result.patternsFound);
                if (result.embeddingsGenerated)
                    totalEmbeddings = result.embeddingsGenerated;
                if (result.vectorsStored)
                    totalVectors = result.vectorsStored;
                if (result.data?.onnxLatencyMs)
                    onnxLatencyMs = result.data.onnxLatencyMs;
                if (result.data?.durationMs)
                    onnxLatencyMs = result.data.durationMs;
                if (!result.success) {
                    console.warn(`Phase ${phaseName} failed:`, result.error);
                }
            }
            catch (error) {
                console.error(`Phase ${phaseName} error:`, error);
            }
        }
        const durationMs = Date.now() - startTime;
        return {
            success: true,
            phases: executedPhases,
            metrics: {
                filesAnalyzed: totalFiles || context.files.length,
                patternsFound: totalPatterns || context.patterns.length,
                embeddingsGenerated: totalEmbeddings || context.embeddings.size,
                vectorsStored: totalVectors || context.vectors.size,
                durationMs,
                onnxLatencyMs,
                throughputOpsPerSec: context.embeddings.size > 0
                    ? context.embeddings.size / (durationMs / 1000)
                    : 0
            },
            data: phaseResults
        };
    }
    /**
     * Run security scan worker
     */
    async runSecurityScan(workDir) {
        return this.run(workDir, [
            'file-discovery',
            'security-analysis', // Uses consolidated phase
            'summarization'
        ], {
            patterns: ['**/*.{ts,js,tsx,jsx,py,go,java}'],
            ignore: ['node_modules/**', 'dist/**', '.git/**', 'vendor/**']
        });
    }
    /**
     * Run full analysis worker
     */
    async runFullAnalysis(workDir) {
        return this.run(workDir, [
            'file-discovery',
            'pattern-extraction',
            'embedding-generation',
            'vector-storage',
            'complexity-analysis',
            'summarization'
        ]);
    }
    /**
     * Run learning worker
     */
    async runLearning(workDir) {
        return this.run(workDir, [
            'file-discovery',
            'pattern-extraction',
            'embedding-generation',
            'vector-storage',
            'summarization'
        ]);
    }
}
// ============================================================================
// Phase Executor Adapters (for agentic-flow integration)
// ============================================================================
/**
 * Create agentic-flow phase executor from native phase
 */
export function createPhaseExecutorFromNative(nativePhaseName) {
    return async (workerContext, phaseContext, options) => {
        const phase = nativePhases.get(nativePhaseName);
        if (!phase) {
            return {
                success: false,
                data: {},
                patterns: [],
                error: `Native phase not found: ${nativePhaseName}`
            };
        }
        const nativeContext = {
            workDir: process.cwd(),
            files: phaseContext.files,
            patterns: phaseContext.patterns,
            embeddings: phaseContext.embeddings,
            vectors: phaseContext.vectors,
            options
        };
        const result = await phase.execute(nativeContext);
        return {
            success: result.success,
            data: result.data || {},
            patterns: nativeContext.patterns,
            error: result.error
        };
    };
}
// ============================================================================
// Singleton and Exports
// ============================================================================
export const nativeRunner = new RuVectorNativeRunner();
export async function runNativeSecurityScan(workDir = process.cwd()) {
    return nativeRunner.runSecurityScan(workDir);
}
export async function runNativeAnalysis(workDir = process.cwd()) {
    return nativeRunner.runFullAnalysis(workDir);
}
export async function runNativeLearning(workDir = process.cwd()) {
    return nativeRunner.runLearning(workDir);
}
//# sourceMappingURL=ruvector-native-integration.js.map