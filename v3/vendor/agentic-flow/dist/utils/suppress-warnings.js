/**
 * Warning Suppression Utilities
 *
 * Suppresses noisy warnings like ExperimentalWarning for WASM imports
 * while preserving important warnings.
 */
let warningsSetup = false;
/**
 * Suppress experimental warnings for WASM module imports
 */
export function suppressExperimentalWarnings() {
    if (warningsSetup)
        return;
    warningsSetup = true;
    const originalEmit = process.emit.bind(process);
    // @ts-ignore - Override emit to filter warnings
    process.emit = function (event, ...args) {
        if (event === 'warning') {
            const warning = args[0];
            if (warning && typeof warning === 'object') {
                const name = warning.name;
                const message = warning.message || '';
                // Suppress ExperimentalWarning for import assertions/attributes
                if (name === 'ExperimentalWarning') {
                    if (message.includes('Import') ||
                        message.includes('import.meta') ||
                        message.includes('--experimental')) {
                        return false;
                    }
                }
                // Suppress noisy deprecation warnings from dependencies
                if (name === 'DeprecationWarning') {
                    if (message.includes('punycode') ||
                        message.includes('Buffer()')) {
                        return false;
                    }
                }
            }
        }
        return originalEmit(event, ...args);
    };
}
/**
 * Run a function with warnings suppressed
 */
export async function withSuppressedWarnings(fn) {
    suppressExperimentalWarnings();
    return fn();
}
/**
 * Import a module with experimental warnings suppressed
 */
export async function quietImport(modulePath) {
    suppressExperimentalWarnings();
    return import(modulePath);
}
// Auto-setup on module load
suppressExperimentalWarnings();
//# sourceMappingURL=suppress-warnings.js.map