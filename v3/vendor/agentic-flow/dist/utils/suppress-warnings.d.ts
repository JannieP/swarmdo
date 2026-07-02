/**
 * Warning Suppression Utilities
 *
 * Suppresses noisy warnings like ExperimentalWarning for WASM imports
 * while preserving important warnings.
 */
/**
 * Suppress experimental warnings for WASM module imports
 */
export declare function suppressExperimentalWarnings(): void;
/**
 * Run a function with warnings suppressed
 */
export declare function withSuppressedWarnings<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Import a module with experimental warnings suppressed
 */
export declare function quietImport<T>(modulePath: string): Promise<T>;
//# sourceMappingURL=suppress-warnings.d.ts.map