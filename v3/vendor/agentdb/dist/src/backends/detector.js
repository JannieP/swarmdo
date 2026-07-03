/**
 * Backend Detection - Auto-detect available vector backends
 *
 * Detection priority:
 * 1. SwarmVector (@swarmvector/core) - preferred for performance
 * 2. HNSWLib (hnswlib-node) - stable fallback
 *
 * Additional features detected:
 * - @swarmvector/gnn - GNN learning capabilities
 * - @swarmvector/graph-node - Graph database capabilities
 */
/**
 * Detect available vector backend and features
 *
 * @returns Detection result with backend type and available features
 */
export async function detectBackend() {
    // Get platform information
    const platform = getPlatformInfo();
    // Check for SwarmVector (preferred)
    const swarmvectorAvailable = await checkSwarmVector();
    if (swarmvectorAvailable.available) {
        return {
            backend: 'swarmvector',
            features: {
                gnn: swarmvectorAvailable.gnn,
                graph: swarmvectorAvailable.graph,
                compression: true, // SwarmVector always supports compression
            },
            platform,
            native: swarmvectorAvailable.native,
            versions: {
                core: swarmvectorAvailable.version,
            },
        };
    }
    // Fallback to HNSWLib
    const hnswlibNative = await checkHnswlib();
    return {
        backend: 'hnswlib',
        features: {
            gnn: false,
            graph: false,
            compression: false,
        },
        platform,
        native: hnswlibNative,
    };
}
/**
 * Check SwarmVector availability and features
 */
async function checkSwarmVector() {
    try {
        // Try to import @swarmvector/core
        const core = await import('@swarmvector/core');
        // Check if native bindings are available
        const native = core.isNative?.() ?? false;
        // Get version (if available)
        const version = core.version ?? 'unknown';
        // Check for GNN support
        let gnn = false;
        try {
            await import('@swarmvector/gnn');
            gnn = true;
        }
        catch {
            // GNN not available
        }
        // Check for Graph support
        let graph = false;
        try {
            await import('@swarmvector/graph-node');
            graph = true;
        }
        catch {
            // Graph not available
        }
        return {
            available: true,
            native,
            gnn,
            graph,
            version,
        };
    }
    catch (error) {
        // SwarmVector not available
        return {
            available: false,
            native: false,
            gnn: false,
            graph: false,
        };
    }
}
/**
 * Check HNSWLib availability
 */
async function checkHnswlib() {
    try {
        // Try to import hnswlib-node
        await import('hnswlib-node');
        return true;
    }
    catch (error) {
        console.warn('[AgentDB] HNSWLib not available:', error);
        return false;
    }
}
/**
 * Get platform information
 */
function getPlatformInfo() {
    return {
        platform: process.platform,
        arch: process.arch,
        combined: `${process.platform}-${process.arch}`,
    };
}
/**
 * Validate requested backend is available
 *
 * @param requested - Requested backend type
 * @param detected - Detected backend from auto-detection
 * @throws Error if requested backend is not available
 */
export function validateBackend(requested, detected) {
    if (requested === 'auto') {
        // Auto-detection always succeeds
        return;
    }
    if (requested === 'swarmvector' && detected.backend !== 'swarmvector') {
        throw new Error('SwarmVector backend requested but not available.\n' +
            'Install with: npm install @swarmvector/core\n' +
            'See: the upstream project (see NOTICE)');
    }
    if (requested === 'hnswlib' && detected.backend !== 'hnswlib') {
        throw new Error('HNSWLib backend requested but not available.\n' +
            'Install with: npm install hnswlib-node');
    }
}
/**
 * Get recommended backend for a given use case
 *
 * @param useCase - Use case identifier
 * @returns Recommended backend type
 */
export function getRecommendedBackend(useCase) {
    const useCaseLower = useCase.toLowerCase();
    // SwarmVector recommended for advanced features
    if (useCaseLower.includes('learning') ||
        useCaseLower.includes('gnn') ||
        useCaseLower.includes('graph') ||
        useCaseLower.includes('compression')) {
        return 'swarmvector';
    }
    // Auto-detection for general use
    return 'auto';
}
/**
 * Format detection result for display
 *
 * @param result - Detection result
 * @returns Formatted string for console output
 */
export function formatDetectionResult(result) {
    const lines = [];
    lines.push('📊 Backend Detection Results:');
    lines.push('');
    lines.push(`  Backend:     ${result.backend}`);
    lines.push(`  Platform:    ${result.platform.combined}`);
    lines.push(`  Native:      ${result.native ? '✅' : '❌ (using WASM)'}`);
    lines.push(`  GNN:         ${result.features.gnn ? '✅' : '❌'}`);
    lines.push(`  Graph:       ${result.features.graph ? '✅' : '❌'}`);
    lines.push(`  Compression: ${result.features.compression ? '✅' : '❌'}`);
    if (result.versions?.core) {
        lines.push(`  Version:     ${result.versions.core}`);
    }
    lines.push('');
    // Add recommendations
    if (result.backend === 'hnswlib') {
        lines.push('💡 Tip: Install @swarmvector/core for 150x faster performance');
        lines.push('   npm install @swarmvector/core');
    }
    else if (!result.features.gnn) {
        lines.push('💡 Tip: Install @swarmvector/gnn for adaptive learning');
        lines.push('   npm install @swarmvector/gnn');
    }
    return lines.join('\n');
}
//# sourceMappingURL=detector.js.map