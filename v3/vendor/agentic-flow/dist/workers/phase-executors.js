/**
 * Phase Executors - Composable analysis phases for custom workers
 *
 * REFACTORED: Core phases are now in consolidated-phases.ts to eliminate duplication.
 * This module provides backwards compatibility and additional specialized phases.
 */
import { createUnifiedContext, getUnifiedPhase, listUnifiedPhases } from './consolidated-phases.js';
export const createPhaseContext = createUnifiedContext;
const executors = new Map();
export function registerPhaseExecutor(type, executor) {
    executors.set(type, executor);
}
export function getPhaseExecutor(type) {
    // First check consolidated phases (primary)
    const unified = getUnifiedPhase(type);
    if (unified)
        return unified;
    // Then check local registry (specialized phases)
    return executors.get(type);
}
export function listPhaseExecutors() {
    const unifiedPhases = listUnifiedPhases();
    const localPhases = Array.from(executors.keys());
    return [...new Set([...unifiedPhases, ...localPhases])];
}
// ============================================================================
// Specialized Discovery Phases (not in consolidated)
// ============================================================================
registerPhaseExecutor('pattern-discovery', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const patterns = options.patterns || [];
    const topic = workerContext.topic?.toLowerCase() || '';
    const foundPatterns = [];
    for (const file of phaseContext.files.slice(0, 50)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            phaseContext.bytes += content.length;
            // Search for topic mentions
            if (topic) {
                const lines = content.split('\n');
                lines.forEach((line, i) => {
                    if (line.toLowerCase().includes(topic)) {
                        foundPatterns.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
                    }
                });
            }
            // Search for custom patterns
            for (const pattern of patterns) {
                const regex = new RegExp(pattern, 'gi');
                const matches = content.match(regex);
                if (matches) {
                    foundPatterns.push(`${file}: ${matches.length} matches for "${pattern}"`);
                }
            }
        }
        catch { /* skip unreadable files */ }
    }
    phaseContext.patterns.push(...foundPatterns);
    return {
        success: true,
        data: { patternsFound: foundPatterns.length },
        patterns: foundPatterns
    };
});
// dependency-discovery and api-discovery are now in consolidated-phases.ts
// ============================================================================
// Analysis Phases
// ============================================================================
registerPhaseExecutor('static-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const stats = {
        functions: 0,
        classes: 0,
        exports: 0,
        imports: 0,
        comments: 0,
        todos: 0
    };
    for (const file of phaseContext.files.slice(0, 50)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            phaseContext.bytes += content.length;
            stats.functions += (content.match(/function\s+\w+|=>\s*{|\(\)\s*{/g) || []).length;
            stats.classes += (content.match(/class\s+\w+/g) || []).length;
            stats.exports += (content.match(/export\s+(default\s+)?(function|class|const|let|var)/g) || []).length;
            stats.imports += (content.match(/import\s+/g) || []).length;
            stats.comments += (content.match(/\/\/|\/\*|\*\//g) || []).length;
            stats.todos += (content.match(/TODO|FIXME|HACK|XXX/gi) || []).length;
            if (stats.todos > 0) {
                const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX):.*/gi) || [];
                phaseContext.patterns.push(...todoMatches.slice(0, 5).map(t => `${file}: ${t.trim()}`));
            }
        }
        catch { /* skip */ }
    }
    Object.entries(stats).forEach(([key, val]) => {
        phaseContext.metrics[key] = val;
    });
    return {
        success: true,
        data: stats
    };
});
// complexity-analysis and security-analysis are now in consolidated-phases.ts
registerPhaseExecutor('performance-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const warnings = [];
    const perfPatterns = [
        { pattern: /\.forEach\s*\(/gi, type: 'forEach-in-hot-path' },
        { pattern: /JSON\.parse\s*\(.*JSON\.stringify/gi, type: 'deep-clone' },
        { pattern: /new\s+RegExp\s*\(/gi, type: 'dynamic-regex' },
        { pattern: /async\s+.*\.map\s*\(/gi, type: 'async-in-loop' },
        { pattern: /await\s+.*\.forEach/gi, type: 'await-forEach' }
    ];
    for (const file of phaseContext.files.slice(0, 50)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            const lines = content.split('\n');
            phaseContext.bytes += content.length;
            lines.forEach((line, i) => {
                for (const { pattern, type } of perfPatterns) {
                    pattern.lastIndex = 0;
                    if (pattern.test(line)) {
                        warnings.push({ file, type, line: i + 1 });
                    }
                }
            });
        }
        catch { /* skip */ }
    }
    phaseContext.patterns.push(...warnings.map(w => `[perf] ${w.type}: ${w.file}:${w.line}`));
    phaseContext.metrics['perf_warnings'] = warnings.length;
    return {
        success: true,
        data: { warnings, count: warnings.length }
    };
});
registerPhaseExecutor('import-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const imports = {};
    for (const file of phaseContext.files.slice(0, 100)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            phaseContext.bytes += content.length;
            const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
            for (const match of importMatches) {
                const pkg = match.replace(/from\s+['"]/, '').replace(/['"]/, '');
                imports[pkg] = (imports[pkg] || 0) + 1;
            }
        }
        catch { /* skip */ }
    }
    const sorted = Object.entries(imports).sort((a, b) => b[1] - a[1]);
    phaseContext.patterns.push(...sorted.slice(0, 10).map(([pkg, count]) => `${pkg}: ${count} imports`));
    phaseContext.metrics['unique_imports'] = Object.keys(imports).length;
    return {
        success: true,
        data: { imports: Object.fromEntries(sorted.slice(0, 20)) }
    };
});
registerPhaseExecutor('type-analysis', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const types = [];
    for (const file of phaseContext.files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).slice(0, 50)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            phaseContext.bytes += content.length;
            // Extract interfaces
            const interfaces = content.match(/interface\s+(\w+)/g) || [];
            types.push(...interfaces.map(i => ({
                name: i.replace('interface ', ''),
                file,
                kind: 'interface'
            })));
            // Extract types
            const typeAliases = content.match(/type\s+(\w+)\s*=/g) || [];
            types.push(...typeAliases.map(t => ({
                name: t.replace(/type\s+/, '').replace(/\s*=/, ''),
                file,
                kind: 'type'
            })));
            // Extract enums
            const enums = content.match(/enum\s+(\w+)/g) || [];
            types.push(...enums.map(e => ({
                name: e.replace('enum ', ''),
                file,
                kind: 'enum'
            })));
        }
        catch { /* skip */ }
    }
    phaseContext.patterns.push(...types.slice(0, 20).map(t => `${t.kind} ${t.name} (${t.file})`));
    phaseContext.metrics['types_found'] = types.length;
    return {
        success: true,
        data: { types, count: types.length }
    };
});
// ============================================================================
// Pattern Extraction Phases (unique ones not in consolidated)
// ============================================================================
// pattern-extraction and todo-extraction are now in consolidated-phases.ts
registerPhaseExecutor('secret-detection', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const secrets = [];
    const secretPatterns = [
        { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'api-key' },
        { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'password' },
        { pattern: /secret\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'secret' },
        { pattern: /token\s*[:=]\s*['"][^'"]{20,}['"]/gi, type: 'token' },
        { pattern: /private[_-]?key/gi, type: 'private-key' },
        { pattern: /-----BEGIN.*PRIVATE KEY-----/gi, type: 'pem-key' },
        { pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi, type: 'bearer-token' },
        { pattern: /ghp_[a-zA-Z0-9]{36}/gi, type: 'github-token' },
        { pattern: /sk-[a-zA-Z0-9]{32,}/gi, type: 'openai-key' }
    ];
    for (const file of phaseContext.files.slice(0, 200)) {
        // Skip common safe files
        if (file.includes('.test.') || file.includes('.spec.') || file.includes('mock'))
            continue;
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            const lines = content.split('\n');
            phaseContext.bytes += content.length;
            lines.forEach((line, i) => {
                for (const { pattern, type } of secretPatterns) {
                    pattern.lastIndex = 0;
                    if (pattern.test(line)) {
                        secrets.push({ file, line: i + 1, type });
                    }
                }
            });
        }
        catch { /* skip */ }
    }
    phaseContext.patterns.push(...secrets.map(s => `[SECRET] ${s.type} in ${s.file}:${s.line}`));
    phaseContext.metrics['secrets_found'] = secrets.length;
    return {
        success: true,
        data: {
            secrets: secrets.slice(0, 20),
            count: secrets.length,
            riskLevel: secrets.length > 5 ? 'high' : secrets.length > 0 ? 'medium' : 'low'
        }
    };
});
registerPhaseExecutor('code-smell-detection', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const smells = [];
    const smellPatterns = [
        { pattern: /console\.(log|debug|info)\s*\(/gi, type: 'console-log' },
        { pattern: /debugger;/gi, type: 'debugger' },
        { pattern: /\/\/\s*@ts-ignore/gi, type: 'ts-ignore' },
        { pattern: /any(?:\s|[,;>)\]])/gi, type: 'any-type' },
        { pattern: /eslint-disable/gi, type: 'eslint-disable' },
        { pattern: /\s{4,}function|\s{4,}=>/gi, type: 'deep-nesting' }
    ];
    for (const file of phaseContext.files.slice(0, 50)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            const lines = content.split('\n');
            phaseContext.bytes += content.length;
            lines.forEach((line, i) => {
                for (const { pattern, type } of smellPatterns) {
                    pattern.lastIndex = 0;
                    if (pattern.test(line)) {
                        smells.push({ file, type, line: i + 1 });
                    }
                }
            });
        }
        catch { /* skip */ }
    }
    phaseContext.patterns.push(...smells.slice(0, 20).map(s => `[smell] ${s.type}: ${s.file}:${s.line}`));
    phaseContext.metrics['code_smells'] = smells.length;
    return {
        success: true,
        data: { smells: smells.slice(0, 30), count: smells.length }
    };
});
// ============================================================================
// Build Phases
// ============================================================================
registerPhaseExecutor('graph-build', async (workerContext, phaseContext, options) => {
    // Build on dependency-discovery results
    const graph = {};
    for (const [file, deps] of phaseContext.dependencies) {
        graph[file] = deps;
    }
    const nodes = Object.keys(graph).length;
    const edges = Object.values(graph).flat().length;
    phaseContext.patterns.push(`Dependency graph: ${nodes} nodes, ${edges} edges`);
    phaseContext.metrics['graph_nodes'] = nodes;
    phaseContext.metrics['graph_edges'] = edges;
    return {
        success: true,
        data: { nodes, edges, graph: Object.fromEntries(Object.entries(graph).slice(0, 20)) }
    };
});
registerPhaseExecutor('call-graph', async (workerContext, phaseContext, options) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const calls = {};
    for (const file of phaseContext.files.slice(0, 30)) {
        try {
            const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            phaseContext.bytes += content.length;
            // Extract function definitions
            const funcDefs = content.match(/(?:function\s+|const\s+|let\s+|var\s+)(\w+)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\s*=\s*function|\s*\([^)]*\)\s*{)/g) || [];
            const funcNames = funcDefs.map(f => {
                const match = f.match(/(?:function\s+|const\s+|let\s+|var\s+)(\w+)/);
                return match ? match[1] : '';
            }).filter(Boolean);
            // Extract function calls
            const funcCalls = content.match(/\b\w+\s*\(/g) || [];
            const calledFuncs = funcCalls.map(c => c.replace(/\s*\(/, '')).filter(Boolean);
            calls[file] = [...new Set(calledFuncs)];
        }
        catch { /* skip */ }
    }
    phaseContext.metrics['call_graph_files'] = Object.keys(calls).length;
    return {
        success: true,
        data: { callGraph: calls }
    };
});
registerPhaseExecutor('dependency-graph', async (workerContext, phaseContext, options) => {
    // Alias for graph-build
    return getPhaseExecutor('graph-build')(workerContext, phaseContext, options);
});
// ============================================================================
// Learning Phases
// ============================================================================
registerPhaseExecutor('vectorization', async (workerContext, phaseContext, options) => {
    // Placeholder - actual vectorization happens in RuVector integration
    phaseContext.patterns.push(`Vectorization: ${phaseContext.patterns.length} patterns ready`);
    return {
        success: true,
        data: { patternsForVectorization: phaseContext.patterns.length }
    };
});
// embedding-generation is now in consolidated-phases.ts with real ONNX implementation
registerPhaseExecutor('pattern-storage', async (workerContext, phaseContext, options) => {
    // Placeholder - storage happens in RuVector/ReasoningBank
    phaseContext.patterns.push(`Pattern storage: ${phaseContext.patterns.length} patterns`);
    return {
        success: true,
        data: { patternsStored: phaseContext.patterns.length }
    };
});
registerPhaseExecutor('sona-training', async (workerContext, phaseContext, options) => {
    // Placeholder - SONA training happens in RuVector integration
    phaseContext.patterns.push('SONA training triggered');
    return {
        success: true,
        data: { sonaTrainingTriggered: true }
    };
});
// ============================================================================
// Output Phases (summarization is in consolidated-phases.ts)
// ============================================================================
registerPhaseExecutor('report-generation', async (workerContext, phaseContext, options) => {
    const report = {
        workerId: workerContext.workerId,
        trigger: workerContext.trigger,
        topic: workerContext.topic,
        timestamp: new Date().toISOString(),
        summary: {
            filesAnalyzed: phaseContext.files.length,
            patternsFound: phaseContext.patterns.length,
            bytesProcessed: phaseContext.bytes
        },
        metrics: phaseContext.metrics,
        topPatterns: phaseContext.patterns.slice(0, 20),
        phaseData: Object.fromEntries(phaseContext.phaseData)
    };
    return {
        success: true,
        data: { report }
    };
});
registerPhaseExecutor('indexing', async (workerContext, phaseContext, options) => {
    phaseContext.patterns.push(`Indexed ${phaseContext.files.length} files`);
    return {
        success: true,
        data: { indexed: phaseContext.files.length }
    };
});
// ============================================================================
// Execute Phase Pipeline
// ============================================================================
export async function executePhasePipeline(workerContext, phases, onProgress) {
    const phaseContext = createPhaseContext();
    const results = new Map();
    const errors = [];
    for (let i = 0; i < phases.length; i++) {
        if (workerContext.signal.aborted) {
            errors.push('Pipeline aborted');
            break;
        }
        const phase = phases[i];
        const phaseName = phase.name || phase.type;
        onProgress?.(phaseName, Math.round((i / phases.length) * 100));
        const executor = phase.type === 'custom' && phase.executor
            ? async (ctx, pCtx, opts) => {
                return phase.executor(ctx, opts);
            }
            : getPhaseExecutor(phase.type);
        if (!executor) {
            errors.push(`Unknown phase type: ${phase.type}`);
            continue;
        }
        try {
            const result = await Promise.race([
                executor(workerContext, phaseContext, phase.options || {}),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Phase timeout')), phase.timeout || 60000))
            ]);
            results.set(phaseName, result);
            phaseContext.phaseData.set(phaseName, result.data);
            if (!result.success) {
                errors.push(`Phase ${phaseName} failed: ${result.error || 'Unknown error'}`);
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Phase execution failed';
            errors.push(`Phase ${phaseName}: ${errMsg}`);
            results.set(phaseName, { success: false, data: {}, error: errMsg });
        }
    }
    onProgress?.('complete', 100);
    return {
        success: errors.length === 0,
        phaseContext,
        results,
        errors
    };
}
//# sourceMappingURL=phase-executors.js.map