/**
 * Chalk fallback — chalk is an optionalDependency.
 * When installed with --no-optional (e.g. Docker clean-install),
 * we fall back to a no-op passthrough so console.log still works.
 */
const passthrough = (s) => s;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- chalk's chaining API requires dynamic proxy
const noopChalk = new Proxy(passthrough, {
    get: () => passthrough,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- chalk's default export typing is complex
let resolvedChalk = noopChalk;
try {
    resolvedChalk = (await import('chalk')).default;
}
catch {
    // chalk not installed — keep no-op
}
export default resolvedChalk;
//# sourceMappingURL=chalk-fallback.js.map