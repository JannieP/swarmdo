"use strict";
/**
 * SwarmLTRA Model Registry and Downloader
 *
 * Automatically downloads GGUF models from HuggingFace Hub.
 *
 * @example
 * ```typescript
 * import { ModelDownloader, SWARMLTRA_MODELS } from '@swarmvector/swarmllm';
 *
 * // Download the Claude Code optimized model
 * const downloader = new ModelDownloader();
 * const modelPath = await downloader.download('claude-code');
 *
 * // Or download all models
 * await downloader.downloadAll();
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelDownloader = exports.MODEL_ALIASES = exports.SWARMLTRA_MODELS = void 0;
exports.getDefaultModelsDir = getDefaultModelsDir;
exports.resolveModelId = resolveModelId;
exports.getModelInfo = getModelInfo;
exports.listModels = listModels;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
/** HuggingFace repository */
const HF_REPO = 'swarmdo/swarmltra';
const HF_BASE_URL = `https://huggingface.co/${HF_REPO}/resolve/main`;
/** Available SwarmLTRA models */
exports.SWARMLTRA_MODELS = {
    'claude-code': {
        id: 'claude-code',
        name: 'SwarmLTRA Claude Code',
        filename: 'swarmltra-claude-code-0.5b-q4_k_m.gguf',
        sizeBytes: 398000000,
        size: '398 MB',
        parameters: '0.5B',
        useCase: 'Claude Code workflows, agentic coding',
        quantization: 'Q4_K_M',
        contextLength: 4096,
        url: `${HF_BASE_URL}/swarmltra-claude-code-0.5b-q4_k_m.gguf`,
    },
    'small': {
        id: 'small',
        name: 'SwarmLTRA Small',
        filename: 'swarmltra-small-0.5b-q4_k_m.gguf',
        sizeBytes: 398000000,
        size: '398 MB',
        parameters: '0.5B',
        useCase: 'Edge devices, IoT, resource-constrained environments',
        quantization: 'Q4_K_M',
        contextLength: 4096,
        url: `${HF_BASE_URL}/swarmltra-small-0.5b-q4_k_m.gguf`,
    },
    'medium': {
        id: 'medium',
        name: 'SwarmLTRA Medium',
        filename: 'swarmltra-medium-1.1b-q4_k_m.gguf',
        sizeBytes: 669000000,
        size: '669 MB',
        parameters: '1.1B',
        useCase: 'General purpose, balanced performance',
        quantization: 'Q4_K_M',
        contextLength: 8192,
        url: `${HF_BASE_URL}/swarmltra-medium-1.1b-q4_k_m.gguf`,
    },
};
/** Model aliases for convenience */
exports.MODEL_ALIASES = {
    'cc': 'claude-code',
    'claudecode': 'claude-code',
    'claude': 'claude-code',
    's': 'small',
    'sm': 'small',
    'm': 'medium',
    'med': 'medium',
    'default': 'claude-code',
};
/**
 * Get the default models directory
 */
function getDefaultModelsDir() {
    return (0, path_1.join)((0, os_1.homedir)(), '.swarmllm', 'models');
}
/**
 * Resolve model ID from alias or direct ID
 */
function resolveModelId(modelIdOrAlias) {
    const normalized = modelIdOrAlias.toLowerCase().trim();
    // Direct match
    if (exports.SWARMLTRA_MODELS[normalized]) {
        return normalized;
    }
    // Alias match
    if (exports.MODEL_ALIASES[normalized]) {
        return exports.MODEL_ALIASES[normalized];
    }
    return null;
}
/**
 * Get model info by ID or alias
 */
function getModelInfo(modelIdOrAlias) {
    const id = resolveModelId(modelIdOrAlias);
    return id ? exports.SWARMLTRA_MODELS[id] : null;
}
/**
 * List all available models
 */
function listModels() {
    return Object.values(exports.SWARMLTRA_MODELS);
}
/**
 * Model downloader for SwarmLTRA GGUF models
 */
class ModelDownloader {
    constructor(modelsDir) {
        this.modelsDir = modelsDir || getDefaultModelsDir();
    }
    /**
     * Get the path where a model would be saved
     */
    getModelPath(modelIdOrAlias) {
        const model = getModelInfo(modelIdOrAlias);
        if (!model)
            return null;
        return (0, path_1.join)(this.modelsDir, model.filename);
    }
    /**
     * Check if a model is already downloaded
     */
    isDownloaded(modelIdOrAlias) {
        const path = this.getModelPath(modelIdOrAlias);
        if (!path)
            return false;
        if (!(0, fs_1.existsSync)(path))
            return false;
        // Verify size matches expected
        const model = getModelInfo(modelIdOrAlias);
        if (!model)
            return false;
        const stats = (0, fs_1.statSync)(path);
        // Allow 5% variance for size check
        const minSize = model.sizeBytes * 0.95;
        return stats.size >= minSize;
    }
    /**
     * Get download status for all models
     */
    getStatus() {
        return listModels().map(model => ({
            model,
            downloaded: this.isDownloaded(model.id),
            path: this.getModelPath(model.id),
        }));
    }
    /**
     * Download a model from HuggingFace
     */
    async download(modelIdOrAlias, options = {}) {
        const model = getModelInfo(modelIdOrAlias);
        if (!model) {
            const available = listModels().map(m => m.id).join(', ');
            throw new Error(`Unknown model: ${modelIdOrAlias}. Available models: ${available}`);
        }
        const destDir = options.modelsDir || this.modelsDir;
        const destPath = (0, path_1.join)(destDir, model.filename);
        // Check if already downloaded
        if (!options.force && this.isDownloaded(model.id)) {
            return destPath;
        }
        // Ensure directory exists
        if (!(0, fs_1.existsSync)(destDir)) {
            (0, fs_1.mkdirSync)(destDir, { recursive: true });
        }
        // Download with progress tracking
        const tempPath = `${destPath}.tmp`;
        let startTime = Date.now();
        let lastProgressTime = startTime;
        let lastDownloaded = 0;
        try {
            // Use dynamic import for node-fetch if native fetch not available
            const fetchFn = globalThis.fetch || (await Promise.resolve().then(() => __importStar(require('node:https')))).default;
            const response = await fetch(model.url, {
                headers: {
                    'User-Agent': 'SwarmLLM/2.3.0',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const contentLength = parseInt(response.headers.get('content-length') || String(model.sizeBytes));
            // Create write stream
            const fileStream = (0, fs_1.createWriteStream)(tempPath);
            let downloaded = 0;
            // Stream with progress
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                downloaded += value.length;
                fileStream.write(value);
                // Report progress
                if (options.onProgress) {
                    const now = Date.now();
                    const elapsed = (now - lastProgressTime) / 1000;
                    const bytesThisInterval = downloaded - lastDownloaded;
                    const speedBps = elapsed > 0 ? bytesThisInterval / elapsed : 0;
                    const remaining = contentLength - downloaded;
                    const etaSeconds = speedBps > 0 ? remaining / speedBps : 0;
                    options.onProgress({
                        modelId: model.id,
                        downloaded,
                        total: contentLength,
                        percent: Math.round((downloaded / contentLength) * 100),
                        speedBps,
                        etaSeconds,
                    });
                    lastProgressTime = now;
                    lastDownloaded = downloaded;
                }
            }
            fileStream.end();
            // Wait for file to be fully written
            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
            // Move temp file to final destination
            if ((0, fs_1.existsSync)(destPath)) {
                (0, fs_1.unlinkSync)(destPath);
            }
            (0, fs_1.renameSync)(tempPath, destPath);
            return destPath;
        }
        catch (error) {
            // Clean up temp file on error
            if ((0, fs_1.existsSync)(tempPath)) {
                try {
                    (0, fs_1.unlinkSync)(tempPath);
                }
                catch { }
            }
            throw error;
        }
    }
    /**
     * Download all available models
     */
    async downloadAll(options = {}) {
        const paths = [];
        for (const model of listModels()) {
            const path = await this.download(model.id, options);
            paths.push(path);
        }
        return paths;
    }
    /**
     * Delete a downloaded model
     */
    delete(modelIdOrAlias) {
        const path = this.getModelPath(modelIdOrAlias);
        if (!path || !(0, fs_1.existsSync)(path)) {
            return false;
        }
        (0, fs_1.unlinkSync)(path);
        return true;
    }
    /**
     * Delete all downloaded models
     */
    deleteAll() {
        let count = 0;
        for (const model of listModels()) {
            if (this.delete(model.id)) {
                count++;
            }
        }
        return count;
    }
}
exports.ModelDownloader = ModelDownloader;
exports.default = ModelDownloader;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL21vZGVscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTBISCxrREFFQztBQUtELHdDQWNDO0FBS0Qsb0NBR0M7QUFLRCxnQ0FFQztBQTVKRCwyQkFBZ0c7QUFDaEcsK0JBQXFDO0FBQ3JDLDJCQUE2QjtBQTJEN0IsNkJBQTZCO0FBQzdCLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQztBQUM5QixNQUFNLFdBQVcsR0FBRywwQkFBMEIsT0FBTyxlQUFlLENBQUM7QUFFckUsK0JBQStCO0FBQ2xCLFFBQUEsY0FBYyxHQUE4QjtJQUN2RCxhQUFhLEVBQUU7UUFDYixFQUFFLEVBQUUsYUFBYTtRQUNqQixJQUFJLEVBQUUscUJBQXFCO1FBQzNCLFFBQVEsRUFBRSxzQ0FBc0M7UUFDaEQsU0FBUyxFQUFFLFNBQVc7UUFDdEIsSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUUsTUFBTTtRQUNsQixPQUFPLEVBQUUsdUNBQXVDO1FBQ2hELFlBQVksRUFBRSxRQUFRO1FBQ3RCLGFBQWEsRUFBRSxJQUFJO1FBQ25CLEdBQUcsRUFBRSxHQUFHLFdBQVcsdUNBQXVDO0tBQzNEO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsRUFBRSxFQUFFLE9BQU87UUFDWCxJQUFJLEVBQUUsZUFBZTtRQUNyQixRQUFRLEVBQUUsZ0NBQWdDO1FBQzFDLFNBQVMsRUFBRSxTQUFXO1FBQ3RCLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFLE1BQU07UUFDbEIsT0FBTyxFQUFFLHNEQUFzRDtRQUMvRCxZQUFZLEVBQUUsUUFBUTtRQUN0QixhQUFhLEVBQUUsSUFBSTtRQUNuQixHQUFHLEVBQUUsR0FBRyxXQUFXLGlDQUFpQztLQUNyRDtJQUNELFFBQVEsRUFBRTtRQUNSLEVBQUUsRUFBRSxRQUFR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RSxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BELEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLGNBQXNCO1FBQzNCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUEsZUFBVSxFQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0IsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0QsSUFBQSxlQUFVLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDakIsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTO1FBQ1AsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsS0FBSyxNQUFNLEtBQUssSUFBSSxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ2pDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsS0FBSyxFQUFFLENBQUM7WUFDVixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztDQUNGO0FBdE1ELDBDQXNNQztBQUVELGtCQUFlLGVBQWUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUnV2TFRSQSBNb2RlbCBSZWdpc3RyeSBhbmQgRG93bmxvYWRlclxuICpcbiAqIEF1dG9tYXRpY2FsbHkgZG93bmxvYWRzIEdHVUYgbW9kZWxzIGZyb20gSHVnZ2luZ0ZhY2UgSHViLlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBpbXBvcnQgeyBNb2RlbERvd25sb2FkZXIsIFJVVkxUUkFfTU9ERUxTIH0gZnJvbSAnQHJ1ZnZlY3Rvci9ydWZsbG0nO1xuICpcbiAqIC8vIERvd25sb2FkIHRoZSBDbGF1ZGUgQ29kZSBvcHRpbWl6ZWQgbW9kZWxcbiAqIGNvbnN0IGRvd25sb2FkZXIgPSBuZXcgTW9kZWxEb3dubG9hZGVyKCk7XG4gKiBjb25zdCBtb2RlbFBhdGggPSBhd2FpdCBkb3dubG9hZGVyLmRvd25sb2FkKCdjbGF1ZGUtY29kZScpO1xuICpcbiAqIC8vIE9yIGRvd25sb2FkIGFsbCBtb2RlbHNcbiAqIGF3YWl0IGRvd25sb2FkZXIuZG93bmxvYWRBbGwoKTtcbiAqIGBgYFxuICovXG5cbmltcG9ydCB7IGNyZWF0ZVdyaXRlU3RyZWFtLCBleGlzdHNTeW5jLCBta2RpclN5bmMsIHN0YXRTeW5jLCB1bmxpbmtTeW5jLCByZW5hbWVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgam9pbiwgZGlybmFtZSB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHBpcGVsaW5lIH0gZnJvbSAnc3RyZWFtL3Byb21pc2VzJztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuXG4vKiogTW9kZWwgaW5mb3JtYXRpb24gZnJvbSBIdWdnaW5nRmFjZSAqL1xuZXhwb3J0IGludGVyZmFjZSBNb2RlbEluZm8ge1xuICAvKiogTW9kZWwgaWRlbnRpZmllciAqL1xuICBpZDogc3RyaW5nO1xuICAvKiogRGlzcGxheSBuYW1lICovXG4gIG5hbWU6IHN0cmluZztcbiAgLyoqIE1vZGVsIGZpbGVuYW1lIG9uIEh1Z2dpbmdGYWNlICovXG4gIGZpbGVuYW1lOiBzdHJpbmc7XG4gIC8qKiBNb2RlbCBzaXplIGluIGJ5dGVzICovXG4gIHNpemVCeXRlczogbnVtYmVyO1xuICAvKiogTW9kZWwgc2l6ZSAoaHVtYW4gcmVhZGFibGUpICovXG4gIHNpemU6IHN0cmluZztcbiAgLyoqIFBhcmFtZXRlciBjb3VudCAqL1xuICBwYXJhbWV0ZXJzOiBzdHJpbmc7XG4gIC8qKiBVc2UgY2FzZSBkZXNjcmlwdGlvbiAqL1xuICB1c2VDYXNlOiBzdHJpbmc7XG4gIC8qKiBRdWFudGl6YXRpb24gdHlwZSAqL1xuICBxdWFudGl6YXRpb246IHN0cmluZztcbiAgLyoqIENvbnRleHQgd2luZG93IHNpemUgKi9cbiAgY29udGV4dExlbmd0aDogbnVtYmVyO1xuICAvKiogSHVnZ2luZ0ZhY2UgZG93bmxvYWQgVVJMICovXG4gIHVybDogc3RyaW5nO1xufVxuXG4vKiogRG93bmxvYWQgcHJvZ3Jlc3MgY2FsbGJhY2sgKi9cbmV4cG9ydCB0eXBlIFByb2dyZXNzQ2FsbGJhY2sgPSAocHJvZ3Jlc3M6IERvd25sb2FkUHJvZ3Jlc3MpID0+IHZvaWQ7XG5cbi8qKiBEb3dubG9hZCBwcm9ncmVzcyBpbmZvcm1hdGlvbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEb3dubG9hZFByb2dyZXNzIHtcbiAgLyoqIE1vZGVsIGJlaW5nIGRvd25sb2FkZWQgKi9cbiAgbW9kZWxJZDogc3RyaW5nO1xuICAvKiogQnl0ZXMgZG93bmxvYWRlZCBzbyBmYXIgKi9cbiAgZG93bmxvYWRlZDogbnVtYmVyO1xuICAvKiogVG90YWwgYnl0ZXMgdG8gZG93bmxvYWQgKi9cbiAgdG90YWw6IG51bWJlcjtcbiAgLyoqIERvd25sb2FkIHBlcmNlbnRhZ2UgKDAtMTAwKSAqL1xuICBwZXJjZW50OiBudW1iZXI7XG4gIC8qKiBEb3dubG9hZCBzcGVlZCBpbiBieXRlcyBwZXIgc2Vjb25kICovXG4gIHNwZWVkQnBzOiBudW1iZXI7XG4gIC8qKiBFc3RpbWF0ZWQgdGltZSByZW1haW5pbmcgaW4gc2Vjb25kcyAqL1xuICBldGFTZWNvbmRzOiBudW1iZXI7XG59XG5cbi8qKiBEb3dubG9hZCBvcHRpb25zICovXG5leHBvcnQgaW50ZXJmYWNlIERvd25sb2FkT3B0aW9ucyB7XG4gIC8qKiBEaXJlY3RvcnkgdG8gc2F2ZSBtb2RlbHMgKGRlZmF1bHQ6IH4vLnJ1ZmxsbS9tb2RlbHMpICovXG4gIG1vZGVsc0Rpcj86IHN0cmluZztcbiAgLyoqIEZvcmNlIHJlLWRvd25sb2FkIGV2ZW4gaWYgZmlsZSBleGlzdHMgKi9cbiAgZm9yY2U/OiBib29sZWFuO1xuICAvKiogUHJvZ3Jlc3MgY2FsbGJhY2sgKi9cbiAgb25Qcm9ncmVzcz86IFByb2dyZXNzQ2FsbGJhY2s7XG4gIC8qKiBWZXJpZnkgZmlsZSBpbnRlZ3JpdHkgYWZ0ZXIgZG93bmxvYWQgKi9cbiAgdmVyaWZ5PzogYm9vbGVhbjtcbn1cblxuLyoqIEh1Z2dpbmdGYWNlIHJlcG9zaXRvcnkgKi9cbmNvbnN0IEhGX1JFUE8gPSAncnV2L3J1dmx0cmEnO1xuY29uc3QgSEZfQkFTRV9VUkwgPSBgaHR0cHM6Ly9odWdnaW5nZmFjZS5jby8ke0hGX1JFUE99L3Jlc29sdmUvbWFpbmA7XG5cbi8qKiBBdmFpbGFibGUgUnV2TFRSQSBtb2RlbHMgKi9cbmV4cG9ydCBjb25zdCBSVVZMVFJBX01PREVMUzogUmVjb3JkPHN0cmluZywgTW9kZWxJbmZvPiA9IHtcbiAgJ2NsYXVkZS1jb2RlJzoge1xuICAgIGlkOiAnY2xhdWRlLWNvZGUnLFxuICAgIG5hbWU6ICdSdXZMVFJBIENsYXVkZSBDb2RlJyxcbiAgICBmaWxlbmFtZTogJ3J1dmx0cmEtY2xhdWRlLWNvZGUtMC41Yi1xNF9rX20uZ2d1ZicsXG4gICAgc2l6ZUJ5dGVzOiAzOThfMDAwXzAwMCxcbiAgICBzaXplOiAnMzk4IE1CJyxcbiAgICBwYXJhbWV0ZXJzOiAnMC41QicsXG4gICAgdXNlQ2FzZTogJ0NsYXVkZSBDb2RlIHdvcmtmbG93cywgYWdlbnRpYyBjb2RpbmcnLFxuICAgIHF1YW50aXphdGlvbjogJ1E0X0tfTScsXG4gICAgY29udGV4dExlbmd0aDogNDA5NixcbiAgICB1cmw6IGAke0hGX0JBU0VfVVJMfS9ydXZsdHJhLWNsYXVkZS1jb2RlLTAuNWItcTRfa19tLmdndWZgLFxuICB9LFxuICAnc21hbGwnOiB7XG4gICAgaWQ6ICdzbWFsbCcsXG4gICAgbmFtZTogJ1J1dkxUUkEgU21hbGwnLFxuICAgIGZpbGVuYW1lOiAncnV2bHRyYS1zbWFsbC0wLjViLXE0X2tfbS5nZ3VmJyxcbiAgICBzaXplQnl0ZXM6IDM5OF8wMDBfMDAwLFxuICAgIHNpemU6ICczOTggTUInLFxuICAgIHBhcmFtZXRlcnM6ICcwLjVCJyxcbiAgICB1c2VDYXNlOiAnRWRnZSBkZXZpY2VzLCBJb1QsIHJlc291cmNlLWNvbnN0cmFpbmVkIGVudmlyb25tZW50cycsXG4gICAgcXVhbnRpemF0aW9uOiAnUTRfS19NJyxcbiAgICBjb250ZXh0TGVuZ3RoOiA0MDk2LFxuICAgIHVybDogYCR7SEZfQkFTRV9VUkx9L3J1dmx0cmEtc21hbGwtMC41Yi1xNF9rX20uZ2d1ZmAsXG4gIH0sXG4gICdtZWRpdW0nOiB7XG4gICAgaWQ6ICdtZWRpdW0nLFxuICAgIG5hbWU6ICdSdXZMVFJBIE1lZGl1bScsXG4gICAgZmlsZW5hbWU6ICdydXZsdHJhLW1lZGl1bS0xLjFiLXE0X2tfbS5nZ3VmJyxcbiAgICBzaXplQnl0ZXM6IDY2OV8wMDBfMDAwLFxuICAgIHNpemU6ICc2NjkgTUInLFxuICAgIHBhcmFtZXRlcnM6ICcxLjFCJyxcbiAgICB1c2VDYXNlOiAnR2VuZXJhbCBwdXJwb3NlLCBiYWxhbmNlZCBwZXJmb3JtYW5jZScsXG4gICAgcXVhbnRpemF0aW9uOiAnUTRfS19NJyxcbiAgICBjb250ZXh0TGVuZ3RoOiA4MTkyLFxuICAgIHVybDogYCR7SEZfQkFTRV9VUkx9L3J1dmx0cmEtbWVkaXVtLTEuMWItcTRfa19tLmdndWZgLFxuICB9LFxufTtcblxuLyoqIE1vZGVsIGFsaWFzZXMgZm9yIGNvbnZlbmllbmNlICovXG5leHBvcnQgY29uc3QgTU9ERUxfQUxJQVNFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgJ2NjJzogJ2NsYXVkZS1jb2RlJyxcbiAgJ2NsYXVkZWNvZGUnOiAnY2xhdWRlLWNvZGUnLFxuICAnY2xhdWRlJzogJ2NsYXVkZS1jb2RlJyxcbiAgJ3MnOiAnc21hbGwnLFxuICAnc20nOiAnc21hbGwnLFxuICAnbSc6ICdtZWRpdW0nLFxuICAnbWVkJzogJ21lZGl1bScsXG4gICdkZWZhdWx0JzogJ2NsYXVkZS1jb2RlJyxcbn07XG5cbi8qKlxuICogR2V0IHRoZSBkZWZhdWx0IG1vZGVscyBkaXJlY3RvcnlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRNb2RlbHNEaXIoKTogc3RyaW5nIHtcbiAgcmV0dXJuIGpvaW4oaG9tZWRpcigpLCAnLnJ1ZmxsbScsICdtb2RlbHMnKTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlIG1vZGVsIElEIGZyb20gYWxpYXMgb3IgZGlyZWN0IElEXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlTW9kZWxJZChtb2RlbElkT3JBbGlhczogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBtb2RlbElkT3JBbGlhcy50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblxuICAvLyBEaXJlY3QgbWF0Y2hcbiAgaWYgKFJVVkxUUkFfTU9ERUxTW25vcm1hbGl6ZWRdKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWQ7XG4gIH1cblxuICAvLyBBbGlhcyBtYXRjaFxuICBpZiAoTU9ERUxfQUxJQVNFU1tub3JtYWxpemVkXSkge1xuICAgIHJldHVybiBNT0RFTF9BTElBU0VTW25vcm1hbGl6ZWRdO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogR2V0IG1vZGVsIGluZm8gYnkgSUQgb3IgYWxpYXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGVsSW5mbyhtb2RlbElkT3JBbGlhczogc3RyaW5nKTogTW9kZWxJbmZvIHwgbnVsbCB7XG4gIGNvbnN0IGlkID0gcmVzb2x2ZU1vZGVsSWQobW9kZWxJZE9yQWxpYXMpO1xuICByZXR1cm4gaWQgPyBSVVZMVFJBX01PREVMU1tpZF0gOiBudWxsO1xufVxuXG4vKipcbiAqIExpc3QgYWxsIGF2YWlsYWJsZSBtb2RlbHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpc3RNb2RlbHMoKTogTW9kZWxJbmZvW10ge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhSVVZMVFJBX01PREVMUyk7XG59XG5cbi8qKlxuICogTW9kZWwgZG93bmxvYWRlciBmb3IgUnV2TFRSQSBHR1VGIG1vZGVsc1xuICovXG5leHBvcnQgY2xhc3MgTW9kZWxEb3dubG9hZGVyIHtcbiAgcHJpdmF0ZSBtb2RlbHNEaXI6IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihtb2RlbHNEaXI/OiBzdHJpbmcpIHtcbiAgICB0aGlzLm1vZGVsc0RpciA9IG1vZGVsc0RpciB8fCBnZXREZWZhdWx0TW9kZWxzRGlyKCk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBwYXRoIHdoZXJlIGEgbW9kZWwgd291bGQgYmUgc2F2ZWRcbiAgICovXG4gIGdldE1vZGVsUGF0aChtb2RlbElkT3JBbGlhczogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgbW9kZWwgPSBnZXRNb2RlbEluZm8obW9kZWxJZE9yQWxpYXMpO1xuICAgIGlmICghbW9kZWwpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBqb2luKHRoaXMubW9kZWxzRGlyLCBtb2RlbC5maWxlbmFtZSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBtb2RlbCBpcyBhbHJlYWR5IGRvd25sb2FkZWRcbiAgICovXG4gIGlzRG93bmxvYWRlZChtb2RlbElkT3JBbGlhczogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgcGF0aCA9IHRoaXMuZ2V0TW9kZWxQYXRoKG1vZGVsSWRPckFsaWFzKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiBmYWxzZTtcblxuICAgIGlmICghZXhpc3RzU3luYyhwYXRoKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gVmVyaWZ5IHNpemUgbWF0Y2hlcyBleHBlY3RlZFxuICAgIGNvbnN0IG1vZGVsID0gZ2V0TW9kZWxJbmZvKG1vZGVsSWRPckFsaWFzKTtcbiAgICBpZiAoIW1vZGVsKSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCBzdGF0cyA9IHN0YXRTeW5jKHBhdGgpO1xuICAgIC8vIEFsbG93IDUlIHZhcmlhbmNlIGZvciBzaXplIGNoZWNrXG4gICAgY29uc3QgbWluU2l6ZSA9IG1vZGVsLnNpemVCeXRlcyAqIDAuOTU7XG4gICAgcmV0dXJuIHN0YXRzLnNpemUgPj0gbWluU2l6ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZG93bmxvYWQgc3RhdHVzIGZvciBhbGwgbW9kZWxzXG4gICAqL1xuICBnZXRTdGF0dXMoKTogeyBtb2RlbDogTW9kZWxJbmZvOyBkb3dubG9hZGVkOiBib29sZWFuOyBwYXRoOiBzdHJpbmcgfVtdIHtcbiAgICByZXR1cm4gbGlzdE1vZGVscygpLm1hcChtb2RlbCA9PiAoe1xuICAgICAgbW9kZWwsXG4gICAgICBkb3dubG9hZGVkOiB0aGlzLmlzRG93bmxvYWRlZChtb2RlbC5pZCksXG4gICAgICBwYXRoOiB0aGlzLmdldE1vZGVsUGF0aChtb2RlbC5pZCkhLFxuICAgIH0pKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEb3dubG9hZCBhIG1vZGVsIGZyb20gSHVnZ2luZ0ZhY2VcbiAgICovXG4gIGFzeW5jIGRvd25sb2FkKFxuICAgIG1vZGVsSWRPckFsaWFzOiBzdHJpbmcsXG4gICAgb3B0aW9uczogRG93bmxvYWRPcHRpb25zID0ge31cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBtb2RlbCA9IGdldE1vZGVsSW5mbyhtb2RlbElkT3JBbGlhcyk7XG4gICAgaWYgKCFtb2RlbCkge1xuICAgICAgY29uc3QgYXZhaWxhYmxlID0gbGlzdE1vZGVscygpLm1hcChtID0+IG0uaWQpLmpvaW4oJywgJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBVbmtub3duIG1vZGVsOiAke21vZGVsSWRPckFsaWFzfS4gQXZhaWxhYmxlIG1vZGVsczogJHthdmFpbGFibGV9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZXN0RGlyID0gb3B0aW9ucy5tb2RlbHNEaXIgfHwgdGhpcy5tb2RlbHNEaXI7XG4gICAgY29uc3QgZGVzdFBhdGggPSBqb2luKGRlc3REaXIsIG1vZGVsLmZpbGVuYW1lKTtcblxuICAgIC8vIENoZWNrIGlmIGFscmVhZHkgZG93bmxvYWRlZFxuICAgIGlmICghb3B0aW9ucy5mb3JjZSAmJiB0aGlzLmlzRG93bmxvYWRlZChtb2RlbC5pZCkpIHtcbiAgICAgIHJldHVybiBkZXN0UGF0aDtcbiAgICB9XG5cbiAgICAvLyBFbnN1cmUgZGlyZWN0b3J5IGV4aXN0c1xuICAgIGlmICghZXhpc3RzU3luYyhkZXN0RGlyKSkge1xuICAgICAgbWtkaXJTeW5jKGRlc3REaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIC8vIERvd25sb2FkIHdpdGggcHJvZ3Jlc3MgdHJhY2tpbmdcbiAgICBjb25zdCB0ZW1wUGF0aCA9IGAke2Rlc3RQYXRofS50bXBgO1xuICAgIGxldCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGxldCBsYXN0UHJvZ3Jlc3NUaW1lID0gc3RhcnRUaW1lO1xuICAgIGxldCBsYXN0RG93bmxvYWRlZCA9IDA7XG5cbiAgICB0cnkge1xuICAgICAgLy8gVXNlIGR5bmFtaWMgaW1wb3J0IGZvciBub2RlLWZldGNoIGlmIG5hdGl2ZSBmZXRjaCBub3QgYXZhaWxhYmxlXG4gICAgICBjb25zdCBmZXRjaEZuID0gZ2xvYmFsVGhpcy5mZXRjaCB8fCAoYXdhaXQgaW1wb3J0KCdub2RlOmh0dHBzJykpLmRlZmF1bHQ7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gobW9kZWwudXJsLCB7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnVXNlci1BZ2VudCc6ICdSdWZMTE0vMi4zLjAnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjb250ZW50TGVuZ3RoID0gcGFyc2VJbnQoXG4gICAgICAgIHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdjb250ZW50LWxlbmd0aCcpIHx8IFN0cmluZyhtb2RlbC5zaXplQnl0ZXMpXG4gICAgICApO1xuXG4gICAgICAvLyBDcmVhdGUgd3JpdGUgc3RyZWFtXG4gICAgICBjb25zdCBmaWxlU3RyZWFtID0gY3JlYXRlV3JpdGVTdHJlYW0odGVtcFBhdGgpO1xuICAgICAgbGV0IGRvd25sb2FkZWQgPSAwO1xuXG4gICAgICAvLyBTdHJlYW0gd2l0aCBwcm9ncmVzc1xuICAgICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuYm9keT8uZ2V0UmVhZGVyKCk7XG4gICAgICBpZiAoIXJlYWRlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jlc3BvbnNlIGJvZHkgaXMgbm90IHJlYWRhYmxlJyk7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG4gICAgICAgIGlmIChkb25lKSBicmVhaztcblxuICAgICAgICBkb3dubG9hZGVkICs9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgZmlsZVN0cmVhbS53cml0ZSh2YWx1ZSk7XG5cbiAgICAgICAgLy8gUmVwb3J0IHByb2dyZXNzXG4gICAgICAgIGlmIChvcHRpb25zLm9uUHJvZ3Jlc3MpIHtcbiAgICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgICAgIGNvbnN0IGVsYXBzZWQgPSAobm93IC0gbGFzdFByb2dyZXNzVGltZSkgLyAxMDAwO1xuICAgICAgICAgIGNvbnN0IGJ5dGVzVGhpc0ludGVydmFsID0gZG93bmxvYWRlZCAtIGxhc3REb3dubG9hZGVkO1xuICAgICAgICAgIGNvbnN0IHNwZWVkQnBzID0gZWxhcHNlZCA+IDAgPyBieXRlc1RoaXNJbnRlcnZhbCAvIGVsYXBzZWQgOiAwO1xuICAgICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IGNvbnRlbnRMZW5ndGggLSBkb3dubG9hZGVkO1xuICAgICAgICAgIGNvbnN0IGV0YVNlY29uZHMgPSBzcGVlZEJwcyA+IDAgPyByZW1haW5pbmcgLyBzcGVlZEJwcyA6IDA7XG5cbiAgICAgICAgICBvcHRpb25zLm9uUHJvZ3Jlc3Moe1xuICAgICAgICAgICAgbW9kZWxJZDogbW9kZWwuaWQsXG4gICAgICAgICAgICBkb3dubG9hZGVkLFxuICAgICAgICAgICAgdG90YWw6IGNvbnRlbnRMZW5ndGgsXG4gICAgICAgICAgICBwZXJjZW50OiBNYXRoLnJvdW5kKChkb3dubG9hZGVkIC8gY29udGVudExlbmd0aCkgKiAxMDApLFxuICAgICAgICAgICAgc3BlZWRCcHMsXG4gICAgICAgICAgICBldGFTZWNvbmRzLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbGFzdFByb2dyZXNzVGltZSA9IG5vdztcbiAgICAgICAgICBsYXN0RG93bmxvYWRlZCA9IGRvd25sb2FkZWQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZmlsZVN0cmVhbS5lbmQoKTtcblxuICAgICAgLy8gV2FpdCBmb3IgZmlsZSB0byBiZSBmdWxseSB3cml0dGVuXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsIHJlc29sdmUpO1xuICAgICAgICBmaWxlU3RyZWFtLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gTW92ZSB0ZW1wIGZpbGUgdG8gZmluYWwgZGVzdGluYXRpb25cbiAgICAgIGlmIChleGlzdHNTeW5jKGRlc3RQYXRoKSkge1xuICAgICAgICB1bmxpbmtTeW5jKGRlc3RQYXRoKTtcbiAgICAgIH1cbiAgICAgIHJlbmFtZVN5bmModGVtcFBhdGgsIGRlc3RQYXRoKTtcblxuICAgICAgcmV0dXJuIGRlc3RQYXRoO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBDbGVhbiB1cCB0ZW1wIGZpbGUgb24gZXJyb3JcbiAgICAgIGlmIChleGlzdHNTeW5jKHRlbXBQYXRoKSkge1xuICAgICAgICB0cnkgeyB1bmxpbmtTeW5jKHRlbXBQYXRoKTsgfSBjYXRjaCB7fVxuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERvd25sb2FkIGFsbCBhdmFpbGFibGUgbW9kZWxzXG4gICAqL1xuICBhc3luYyBkb3dubG9hZEFsbChvcHRpb25zOiBEb3dubG9hZE9wdGlvbnMgPSB7fSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IG1vZGVsIG9mIGxpc3RNb2RlbHMoKSkge1xuICAgICAgY29uc3QgcGF0aCA9IGF3YWl0IHRoaXMuZG93bmxvYWQobW9kZWwuaWQsIG9wdGlvbnMpO1xuICAgICAgcGF0aHMucHVzaChwYXRoKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGhzO1xuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIGRvd25sb2FkZWQgbW9kZWxcbiAgICovXG4gIGRlbGV0ZShtb2RlbElkT3JBbGlhczogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgcGF0aCA9IHRoaXMuZ2V0TW9kZWxQYXRoKG1vZGVsSWRPckFsaWFzKTtcbiAgICBpZiAoIXBhdGggfHwgIWV4aXN0c1N5bmMocGF0aCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdW5saW5rU3luYyhwYXRoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGRvd25sb2FkZWQgbW9kZWxzXG4gICAqL1xuICBkZWxldGVBbGwoKTogbnVtYmVyIHtcbiAgICBsZXQgY291bnQgPSAwO1xuICAgIGZvciAoY29uc3QgbW9kZWwgb2YgbGlzdE1vZGVscygpKSB7XG4gICAgICBpZiAodGhpcy5kZWxldGUobW9kZWwuaWQpKSB7XG4gICAgICAgIGNvdW50Kys7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb3VudDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNb2RlbERvd25sb2FkZXI7XG4iXX0=