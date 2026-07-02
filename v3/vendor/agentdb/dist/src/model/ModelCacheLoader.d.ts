/**
 * ModelCacheLoader - Extracts bundled ONNX models from .rvf files
 *
 * Resolution order:
 * 1. AGENTDB_MODEL_PATH env var (user override)
 * 2. Bundled .rvf at <package>/dist/models/<modelId>.rvf
 * 3. Existing @xenova/transformers/.cache/ directory
 * 4. Previously extracted temp dir
 * 5. null (caller falls through to network download)
 */
export interface ModelCacheResult {
    localPath: string;
    fromBundle: boolean;
}
export declare class ModelCacheLoader {
    static resolve(modelId: string): Promise<ModelCacheResult | null>;
    /**
     * Extract model files from a .rvf bundle to a temp directory.
     * Skips files whose on-disk checksum already matches.
     */
    static extractFromRvf(rvfPath: string, modelId: string): Promise<string>;
    private static findBundledRvf;
}
//# sourceMappingURL=ModelCacheLoader.d.ts.map