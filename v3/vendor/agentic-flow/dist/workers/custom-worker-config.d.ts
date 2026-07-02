/**
 * Custom Worker Configuration System
 *
 * Enables creation of custom workers by mixing and matching:
 * - Phases (discovery, analysis, pattern-matching, etc.)
 * - Capabilities (ONNX embeddings, VectorDB, SONA learning, etc.)
 * - Settings (timeouts, concurrency, output formats)
 */
import { WorkerPriority, WorkerContext } from './types.js';
export type PhaseType = 'file-discovery' | 'pattern-discovery' | 'dependency-discovery' | 'api-discovery' | 'static-analysis' | 'complexity-analysis' | 'security-analysis' | 'performance-analysis' | 'import-analysis' | 'type-analysis' | 'pattern-extraction' | 'todo-extraction' | 'secret-detection' | 'code-smell-detection' | 'graph-build' | 'call-graph' | 'dependency-graph' | 'vectorization' | 'embedding-generation' | 'pattern-storage' | 'sona-training' | 'summarization' | 'report-generation' | 'indexing' | 'custom';
export interface PhaseConfig {
    /** Phase type */
    type: PhaseType;
    /** Phase name (for custom phases) */
    name?: string;
    /** Phase description */
    description?: string;
    /** Timeout in ms */
    timeout?: number;
    /** Options passed to phase executor */
    options?: Record<string, unknown>;
    /** Custom executor function (for 'custom' type) */
    executor?: (context: WorkerContext, options: Record<string, unknown>) => Promise<PhaseResult>;
}
export interface PhaseResult {
    success: boolean;
    data: Record<string, unknown>;
    files?: string[];
    patterns?: string[];
    bytes?: number;
    error?: string;
}
export interface CapabilityConfig {
    /** Use ONNX WASM for embeddings (faster, SIMD) */
    onnxEmbeddings?: boolean;
    /** Use VectorDB for pattern storage */
    vectorDb?: boolean;
    /** Use SONA for trajectory learning */
    sonaLearning?: boolean;
    /** Use ReasoningBank for memory */
    reasoningBank?: boolean;
    /** Use IntelligenceStore for patterns */
    intelligenceStore?: boolean;
    /** Enable real-time progress events */
    progressEvents?: boolean;
    /** Enable memory deposits */
    memoryDeposits?: boolean;
    /** Enable result persistence */
    persistResults?: boolean;
}
export declare const DEFAULT_CAPABILITIES: CapabilityConfig;
export interface FileFilterConfig {
    /** Glob patterns to include */
    include?: string[];
    /** Glob patterns to exclude */
    exclude?: string[];
    /** File extensions to include */
    extensions?: string[];
    /** Max file size in bytes */
    maxFileSize?: number;
    /** Max files to process */
    maxFiles?: number;
    /** Max directory depth */
    maxDepth?: number;
}
export declare const DEFAULT_FILE_FILTER: FileFilterConfig;
export interface OutputConfig {
    /** Output format */
    format?: 'json' | 'summary' | 'detailed' | 'minimal';
    /** Include sample patterns in output */
    includeSamples?: boolean;
    /** Max samples to include */
    maxSamples?: number;
    /** Include file list in output */
    includeFileList?: boolean;
    /** Include timing metrics */
    includeMetrics?: boolean;
    /** Store output to file */
    outputPath?: string;
}
export declare const DEFAULT_OUTPUT: OutputConfig;
export interface CustomWorkerDefinition {
    /** Unique worker name (becomes trigger keyword) */
    name: string;
    /** Worker description */
    description: string;
    /** Trigger keywords (aliases) */
    triggers?: string[];
    /** Worker priority */
    priority?: WorkerPriority;
    /** Timeout in ms */
    timeout?: number;
    /** Cooldown between runs in ms */
    cooldown?: number;
    /** Topic extractor regex */
    topicExtractor?: string;
    /** Phases to execute in order */
    phases: PhaseConfig[];
    /** Capabilities to enable */
    capabilities?: Partial<CapabilityConfig>;
    /** File filter configuration */
    fileFilter?: Partial<FileFilterConfig>;
    /** Output configuration */
    output?: Partial<OutputConfig>;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
}
export declare const WORKER_PRESETS: Record<string, Partial<CustomWorkerDefinition>>;
export interface WorkerConfigFile {
    /** Version of config format */
    version: '1.0';
    /** Custom worker definitions */
    workers: CustomWorkerDefinition[];
    /** Global settings */
    settings?: {
        /** Default capabilities for all workers */
        defaultCapabilities?: Partial<CapabilityConfig>;
        /** Default file filter */
        defaultFileFilter?: Partial<FileFilterConfig>;
        /** Default output config */
        defaultOutput?: Partial<OutputConfig>;
        /** Max concurrent workers */
        maxConcurrent?: number;
        /** Enable debug logging */
        debug?: boolean;
    };
}
export declare const EXAMPLE_CONFIG: WorkerConfigFile;
export declare function validateWorkerDefinition(def: CustomWorkerDefinition): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=custom-worker-config.d.ts.map