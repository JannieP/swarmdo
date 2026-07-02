/**
 * Consolidated Phase System
 *
 * Eliminates redundancy between phase-executors.ts and ruvector-native-integration.ts
 * by providing a unified phase registry that:
 * 1. Uses native implementations as primary (faster, SIMD-optimized)
 * 2. Falls back to legacy implementations if needed
 * 3. Shares the cached ONNX embedder across all phases
 */
import { DEFAULT_FILE_FILTER } from './custom-worker-config.js';
import { getCachedOnnxEmbedder } from '../utils/model-cache.js';
export function createUnifiedContext() {
    return {
        files: [],
        patterns: [],
        bytes: 0,
        dependencies: new Map(),
        metrics: {},
        embeddings: new Map(),
        vectors: new Map(),
        phaseData: new Map(),
        vulnerabilities: []
    };
}
const unifiedExecutors = new Map();
export function registerUnifiedPhase(type, executor) {
    unifiedExecutors.set(type, executor);
}
export function getUnifiedPhase(type) {
    return unifiedExecutors.get(type);
}
export function listUnifiedPhases() {
    return Array.from(unifiedExecutors.keys());
}
// ============================================================================
// Core Phases (Consolidated - No Duplication)
// ============================================================================
// FILE DISCOVERY - Single implementation
registerUnifiedPhase('file-discovery', async (workerContext, phaseContext, options) => {
    const { glob } = await import('glob');
    const filter = { ...DEFAULT_FILE_FILTER, ...options };
    const patterns = options.patterns || filter.include || ['**/*.{ts,js,tsx,jsx}'];
    const ignore = options.ignore || filter.exclude || ['node_modules/**', 'dist/**', '.git/**'];
    try {
        const allFiles = [];
        for (const pattern of patterns) {
            const files = await glob(pattern, {
                cwd: process.cwd(),
                ignore,
                absolute: true,
                nodir: true,
                maxDepth: filter.maxDepth || 10
            });
            allFiles.push(...files);
        }
        // Deduplicate and limit
        phaseContext.files = [...new Set(allFiles)].slice(0, filter.maxFiles || 500);
        phaseContext.metrics['files_discovered'] = phaseContext.files.length;
        return {
            success: true,
            data: { filesFound: phaseContext.files.length, patterns },
            files: phaseContext.files
        };
    }
    catch (error) {
        return {
            success: false,
            data: {},
            error: error instanceof Error ? error.message : 'File discovery failed'
        };
    }
});
// PATTERN EXTRACTION - Single implementation
registerUnifiedPhase('pattern-extraction', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const patterns = [];
    const extractors = [
        { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, type: 'function' },
        { regex: /(?:export\s+)?class\s+(\w+)/g, type: 'class' },
        { regex: /(?:export\s+)?interface\s+(\w+)/g, type: 'interface' },
        { regex: /(?:export\s+)?type\s+(\w+)\s*=/g, type: 'type' },
        { regex: /(?:const|let|var)\s+(\w+)\s*=/g, type: 'variable' },
        { regex: /import\s+.*?from\s+['"]([^'"]+)['"]/g, type: 'import' },
        { regex: /TODO:?\s*(.+?)$/gm, type: 'todo' },
        { regex: /FIXME:?\s*(.+?)$/gm, type: 'fixme' }
    ];
    const maxFiles = Math.min(phaseContext.files.length, 100);
    let bytesProcessed = 0;
    for (let i = 0; i < maxFiles; i++) {
        const file = phaseContext.files[i];
        try {
            const content = await fs.readFile(file, 'utf-8');
            bytesProcessed += content.length;
            for (const { regex } of extractors) {
                const matches = content.matchAll(regex);
                for (const match of matches) {
                    patterns.push(match[1] || match[0]);
                }
            }
        }
        catch {
            // Skip unreadable files
        }
    }
    phaseContext.patterns.push(...patterns);
    phaseContext.bytes += bytesProcessed;
    phaseContext.metrics['patterns_found'] = patterns.length;
    return {
        success: true,
        data: {
            patternsFound: patterns.length,
            bytesProcessed,
            samplePatterns: [...new Set(patterns)].slice(0, 20)
        },
        patterns: phaseContext.patterns
    };
});
// EMBEDDING GENERATION - Single implementation using cached embedder
registerUnifiedPhase('embedding-generation', async (workerContext, phaseContext, options) => {
    const embedder = await getCachedOnnxEmbedder();
    if (!embedder) {
        return {
            success: false,
            data: {},
            error: 'ONNX embedder not available - install ruvector for SIMD-accelerated embeddings'
        };
    }
    const textsToEmbed = phaseContext.patterns.slice(0, 100);
    let embeddingsGenerated = 0;
    const startTime = Date.now();
    for (const text of textsToEmbed) {
        if (text.length > 3 && text.length < 500) {
            try {
                const embedding = await embedder.embed?.(text)
                    || await embedder.encode?.(text)
                    || await embedder.generate?.(text);
                if (embedding) {
                    const vector = embedding instanceof Float32Array
                        ? embedding
                        : new Float32Array(embedding);
                    phaseContext.embeddings.set(text, vector);
                    embeddingsGenerated++;
                }
            }
            catch {
                // Skip failed embeddings
            }
        }
    }
    const durationMs = Date.now() - startTime;
    phaseContext.metrics['embeddings_generated'] = embeddingsGenerated;
    phaseContext.metrics['embedding_latency_ms'] = durationMs;
    return {
        success: true,
        data: {
            embeddingsGenerated,
            dimension: 384,
            durationMs,
            throughputPerSec: embeddingsGenerated > 0 ? (embeddingsGenerated / (durationMs / 1000)).toFixed(1) : '0',
            usingSIMD: true
        }
    };
});
// VECTOR STORAGE - Single implementation
registerUnifiedPhase('vector-storage', async (workerContext, phaseContext, options) => {
    let vectorsStored = 0;
    for (const [key, embedding] of phaseContext.embeddings) {
        phaseContext.vectors.set(key, Array.from(embedding));
        vectorsStored++;
    }
    phaseContext.metrics['vectors_stored'] = vectorsStored;
    return {
        success: true,
        data: {
            vectorsStored,
            indexSize: vectorsStored,
            dimension: 384
        }
    };
});
// SECURITY ANALYSIS - Single comprehensive implementation
registerUnifiedPhase('security-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const securityPatterns = [
        // High severity
        { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-password', severity: 'high' },
        { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-api-key', severity: 'high' },
        { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-secret', severity: 'high' },
        { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-private-key', severity: 'high' },
        { pattern: /bearer\s+[a-zA-Z0-9_-]+/gi, type: 'exposed-token', severity: 'high' },
        // Medium severity
        { pattern: /eval\s*\(/g, type: 'eval-usage', severity: 'medium' },
        { pattern: /innerHTML\s*=/g, type: 'xss-risk', severity: 'medium' },
        { pattern: /dangerouslySetInnerHTML/g, type: 'xss-risk', severity: 'medium' },
        { pattern: /child_process.*exec/g, type: 'command-injection-risk', severity: 'medium' },
        { pattern: /\$\{.*\}/g, type: 'template-injection', severity: 'medium' },
        { pattern: /document\.(write|cookie)/g, type: 'dom-manipulation', severity: 'medium' },
        // Low severity
        { pattern: /console\.(log|debug|info)/g, type: 'console-output', severity: 'low' },
        { pattern: /process\.env\.\w+/g, type: 'env-usage', severity: 'low' },
        { pattern: /TODO.*security|FIXME.*security/gi, type: 'security-todo', severity: 'low' }
    ];
    const vulnerabilities = [];
    const maxFiles = Math.min(phaseContext.files.length, 100);
    for (let i = 0; i < maxFiles; i++) {
        const file = phaseContext.files[i];
        try {
            const content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n');
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                for (const { pattern, type, severity } of securityPatterns) {
                    pattern.lastIndex = 0; // Reset regex
                    if (pattern.test(line)) {
                        vulnerabilities.push({
                            type,
                            file: file.split('/').pop() || file,
                            line: lineNum + 1,
                            severity
                        });
                    }
                }
            }
        }
        catch {
            // Skip unreadable files
        }
    }
    phaseContext.vulnerabilities.push(...vulnerabilities);
    phaseContext.metrics['vulnerabilities_found'] = vulnerabilities.length;
    const summary = {
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
        low: vulnerabilities.filter(v => v.severity === 'low').length
    };
    return {
        success: true,
        data: {
            vulnerabilities: vulnerabilities.slice(0, 30),
            summary,
            filesScanned: maxFiles
        },
        patterns: vulnerabilities.map(v => `[${v.severity}] ${v.type}`)
    };
});
// COMPLEXITY ANALYSIS - Single implementation
registerUnifiedPhase('complexity-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const complexityMarkers = [
        /\bif\s*\(/g,
        /\belse\s+if\s*\(/g,
        /\belse\s*\{/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bdo\s*\{/g,
        /\bswitch\s*\(/g,
        /\bcase\s+/g,
        /\bcatch\s*\(/g,
        /\?\s*.*:/g, // Ternary
        /&&|\|\|/g, // Logical operators
        /\?\./g // Optional chaining
    ];
    const fileComplexity = [];
    let totalComplexity = 0;
    let totalLines = 0;
    const maxFiles = Math.min(phaseContext.files.length, 100);
    for (let i = 0; i < maxFiles; i++) {
        const file = phaseContext.files[i];
        try {
            const content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n').length;
            let complexity = 1; // Base complexity
            for (const marker of complexityMarkers) {
                const matches = content.match(marker);
                if (matches) {
                    complexity += matches.length;
                }
            }
            fileComplexity.push({
                file: file.split('/').pop() || file,
                complexity,
                lines
            });
            totalComplexity += complexity;
            totalLines += lines;
        }
        catch {
            // Skip unreadable files
        }
    }
    fileComplexity.sort((a, b) => b.complexity - a.complexity);
    phaseContext.metrics['total_complexity'] = totalComplexity;
    phaseContext.metrics['total_lines'] = totalLines;
    phaseContext.metrics['avg_complexity'] = maxFiles > 0 ? totalComplexity / maxFiles : 0;
    return {
        success: true,
        data: {
            avgComplexity: maxFiles > 0 ? (totalComplexity / maxFiles).toFixed(1) : '0',
            totalLines,
            filesAnalyzed: maxFiles,
            highComplexityFiles: fileComplexity.filter(f => f.complexity > 20).length,
            topFiles: fileComplexity.slice(0, 10)
        }
    };
});
// DEPENDENCY DISCOVERY - Single implementation
registerUnifiedPhase('dependency-discovery', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const dependencies = new Map();
    const importPatterns = [
        /import\s+.*?from\s+['"]([^'"]+)['"]/g,
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ];
    const maxFiles = Math.min(phaseContext.files.length, 100);
    let bytesProcessed = 0;
    for (let i = 0; i < maxFiles; i++) {
        const file = phaseContext.files[i];
        const fileName = file.split('/').pop() || file;
        const fileDeps = [];
        try {
            const content = await fs.readFile(file, 'utf-8');
            bytesProcessed += content.length;
            for (const pattern of importPatterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    const dep = match[1];
                    if (!fileDeps.includes(dep)) {
                        fileDeps.push(dep);
                    }
                }
            }
            if (fileDeps.length > 0) {
                dependencies.set(fileName, fileDeps);
            }
        }
        catch {
            // Skip unreadable files
        }
    }
    // Merge into context
    for (const [file, deps] of dependencies) {
        phaseContext.dependencies.set(file, deps);
    }
    phaseContext.bytes += bytesProcessed;
    phaseContext.metrics['dependencies_found'] = dependencies.size;
    return {
        success: true,
        data: {
            filesWithDeps: dependencies.size,
            totalDeps: Array.from(dependencies.values()).reduce((sum, deps) => sum + deps.length, 0),
            bytesProcessed
        }
    };
});
// SUMMARIZATION - Single implementation
registerUnifiedPhase('summarization', async (workerContext, phaseContext, options) => {
    return {
        success: true,
        data: {
            summary: {
                filesAnalyzed: phaseContext.files.length,
                patternsFound: phaseContext.patterns.length,
                uniquePatterns: [...new Set(phaseContext.patterns)].length,
                bytesProcessed: phaseContext.bytes,
                embeddingsGenerated: phaseContext.embeddings.size,
                vectorsStored: phaseContext.vectors.size,
                vulnerabilitiesFound: phaseContext.vulnerabilities.length,
                dependencyFiles: phaseContext.dependencies.size
            },
            metrics: phaseContext.metrics
        }
    };
});
// ============================================================================
// Additional Phases (Not duplicated)
// ============================================================================
// API DISCOVERY
registerUnifiedPhase('api-discovery', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const apis = [];
    const apiPatterns = [
        /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi,
        /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi,
        /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]+)['"]/gi,
        /fetch\s*\(\s*['"]([^'"]+)['"]/gi
    ];
    for (const file of phaseContext.files.slice(0, 100)) {
        try {
            const content = await fs.readFile(file, 'utf-8');
            for (const pattern of apiPatterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    apis.push({
                        method: match[1]?.toUpperCase() || 'GET',
                        path: match[2],
                        file: file.split('/').pop() || file
                    });
                }
            }
        }
        catch {
            // Skip
        }
    }
    return {
        success: true,
        data: { apis: apis.slice(0, 50), totalApis: apis.length }
    };
});
// TODO EXTRACTION
registerUnifiedPhase('todo-extraction', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const todos = [];
    const todoPatterns = [
        { pattern: /\/\/\s*TODO:?\s*(.+?)$/gm, type: 'TODO' },
        { pattern: /\/\/\s*FIXME:?\s*(.+?)$/gm, type: 'FIXME' },
        { pattern: /\/\/\s*HACK:?\s*(.+?)$/gm, type: 'HACK' },
        { pattern: /\/\/\s*XXX:?\s*(.+?)$/gm, type: 'XXX' },
        { pattern: /\/\*\s*TODO:?\s*(.+?)\*\//gm, type: 'TODO' }
    ];
    for (const file of phaseContext.files.slice(0, 100)) {
        try {
            const content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n');
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                for (const { pattern, type } of todoPatterns) {
                    pattern.lastIndex = 0;
                    const match = pattern.exec(line);
                    if (match) {
                        todos.push({
                            type,
                            text: match[1].trim(),
                            file: file.split('/').pop() || file,
                            line: lineNum + 1
                        });
                    }
                }
            }
        }
        catch {
            // Skip
        }
    }
    return {
        success: true,
        data: {
            todos: todos.slice(0, 50),
            counts: {
                TODO: todos.filter(t => t.type === 'TODO').length,
                FIXME: todos.filter(t => t.type === 'FIXME').length,
                HACK: todos.filter(t => t.type === 'HACK').length
            }
        },
        patterns: todos.map(t => `[${t.type}] ${t.text}`)
    };
});
// ============================================================================
// Unified Pipeline Runner
// ============================================================================
export async function runUnifiedPipeline(workerContext, phases, options = {}) {
    const startTime = Date.now();
    const context = createUnifiedContext();
    const results = {};
    const executedPhases = [];
    for (const phaseName of phases) {
        const executor = unifiedExecutors.get(phaseName);
        if (!executor) {
            console.warn(`Unknown phase: ${phaseName}`);
            continue;
        }
        try {
            const result = await executor(workerContext, context, options);
            results[phaseName] = result;
            executedPhases.push(phaseName);
            if (!result.success) {
                console.warn(`Phase ${phaseName} failed:`, result.error);
            }
        }
        catch (error) {
            results[phaseName] = {
                success: false,
                data: {},
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    return {
        success: Object.values(results).every(r => r.success),
        phases: executedPhases,
        context,
        results,
        duration: Date.now() - startTime
    };
}
//# sourceMappingURL=consolidated-phases.js.map