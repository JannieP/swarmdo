/**
 * Custom Worker Configuration System
 *
 * Enables creation of custom workers by mixing and matching:
 * - Phases (discovery, analysis, pattern-matching, etc.)
 * - Capabilities (ONNX embeddings, VectorDB, SONA learning, etc.)
 * - Settings (timeouts, concurrency, output formats)
 */
export const DEFAULT_CAPABILITIES = {
    onnxEmbeddings: true,
    vectorDb: true,
    sonaLearning: true,
    reasoningBank: true,
    intelligenceStore: true,
    progressEvents: true,
    memoryDeposits: true,
    persistResults: true
};
export const DEFAULT_FILE_FILTER = {
    include: ['**/*.{ts,js,tsx,jsx,py,go,rs,java,c,cpp,h}'],
    exclude: ['node_modules/**', 'dist/**', '.git/**', 'vendor/**', '__pycache__/**'],
    extensions: ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'],
    maxFileSize: 1024 * 1024, // 1MB
    maxFiles: 500,
    maxDepth: 10
};
export const DEFAULT_OUTPUT = {
    format: 'summary',
    includeSamples: true,
    maxSamples: 10,
    includeFileList: false,
    includeMetrics: true
};
// ============================================================================
// Worker Template Presets
// ============================================================================
export const WORKER_PRESETS = {
    /** Quick file scan - fast discovery only */
    'quick-scan': {
        description: 'Quick file discovery and basic stats',
        priority: 'low',
        timeout: 30000,
        phases: [
            { type: 'file-discovery' },
            { type: 'summarization' }
        ],
        capabilities: {
            onnxEmbeddings: false,
            vectorDb: false,
            sonaLearning: false
        }
    },
    /** Deep analysis - comprehensive code analysis */
    'deep-analysis': {
        description: 'Comprehensive code analysis with all capabilities',
        priority: 'medium',
        timeout: 300000,
        phases: [
            { type: 'file-discovery' },
            { type: 'static-analysis' },
            { type: 'complexity-analysis' },
            { type: 'import-analysis' },
            { type: 'pattern-extraction' },
            { type: 'graph-build' },
            { type: 'vectorization' },
            { type: 'summarization' }
        ],
        capabilities: DEFAULT_CAPABILITIES
    },
    /** Security focused - security analysis only */
    'security-scan': {
        description: 'Security-focused analysis',
        priority: 'high',
        timeout: 120000,
        phases: [
            { type: 'file-discovery' },
            { type: 'security-analysis' },
            { type: 'secret-detection' },
            { type: 'dependency-discovery' },
            { type: 'report-generation' }
        ],
        capabilities: {
            onnxEmbeddings: false,
            persistResults: true
        }
    },
    /** Learning focused - pattern learning and storage */
    'learning': {
        description: 'Pattern learning and memory storage',
        priority: 'low',
        timeout: 180000,
        phases: [
            { type: 'file-discovery' },
            { type: 'pattern-extraction' },
            { type: 'embedding-generation' },
            { type: 'pattern-storage' },
            { type: 'sona-training' }
        ],
        capabilities: {
            onnxEmbeddings: true,
            vectorDb: true,
            sonaLearning: true,
            reasoningBank: true
        }
    },
    /** API documentation - API discovery and docs */
    'api-docs': {
        description: 'API endpoint discovery and documentation',
        priority: 'medium',
        timeout: 120000,
        phases: [
            { type: 'file-discovery', options: { include: ['**/*.{ts,js}'] } },
            { type: 'api-discovery' },
            { type: 'type-analysis' },
            { type: 'report-generation' }
        ],
        fileFilter: {
            include: ['**/routes/**', '**/api/**', '**/controllers/**', '**/handlers/**']
        }
    },
    /** Test coverage - test file analysis */
    'test-analysis': {
        description: 'Test file discovery and coverage analysis',
        priority: 'medium',
        timeout: 90000,
        phases: [
            { type: 'file-discovery', options: { pattern: '**/*.{test,spec}.{ts,js}' } },
            { type: 'static-analysis' },
            { type: 'pattern-extraction' },
            { type: 'summarization' }
        ],
        fileFilter: {
            include: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js', '**/test/**', '**/tests/**']
        }
    }
};
// ============================================================================
// Example Configuration
// ============================================================================
export const EXAMPLE_CONFIG = {
    version: '1.0',
    workers: [
        {
            name: 'auth-scanner',
            description: 'Scan for authentication patterns and security issues',
            triggers: ['auth-scan', 'scan-auth'],
            priority: 'high',
            timeout: 120000,
            topicExtractor: 'auth(?:entication)?\\s+(.+)',
            phases: [
                { type: 'file-discovery', options: { include: ['**/auth/**', '**/login/**', '**/session/**'] } },
                { type: 'pattern-extraction', options: { patterns: ['jwt', 'oauth', 'session', 'token'] } },
                { type: 'security-analysis' },
                { type: 'secret-detection' },
                { type: 'vectorization' },
                { type: 'report-generation' }
            ],
            capabilities: {
                onnxEmbeddings: true,
                vectorDb: true,
                persistResults: true
            },
            output: {
                format: 'detailed',
                includeSamples: true
            }
        },
        {
            name: 'perf-analyzer',
            description: 'Analyze code for performance bottlenecks',
            triggers: ['perf-scan', 'analyze-perf'],
            priority: 'medium',
            phases: [
                { type: 'file-discovery' },
                { type: 'complexity-analysis' },
                { type: 'performance-analysis' },
                { type: 'call-graph' },
                { type: 'summarization' }
            ]
        }
    ],
    settings: {
        defaultCapabilities: {
            onnxEmbeddings: true,
            progressEvents: true
        },
        maxConcurrent: 5,
        debug: false
    }
};
// ============================================================================
// Validation
// ============================================================================
export function validateWorkerDefinition(def) {
    const errors = [];
    if (!def.name || def.name.length < 2) {
        errors.push('Worker name must be at least 2 characters');
    }
    if (!/^[a-z][a-z0-9-]*$/.test(def.name)) {
        errors.push('Worker name must be lowercase alphanumeric with hyphens');
    }
    if (!def.description) {
        errors.push('Worker description is required');
    }
    if (!def.phases || def.phases.length === 0) {
        errors.push('At least one phase is required');
    }
    for (const phase of def.phases || []) {
        if (phase.type === 'custom' && !phase.executor && !phase.name) {
            errors.push('Custom phases require a name or executor');
        }
    }
    return { valid: errors.length === 0, errors };
}
//# sourceMappingURL=custom-worker-config.js.map