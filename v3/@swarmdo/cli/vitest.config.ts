import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  plugins: [
    {
      name: 'externalize-optional-deps',
      enforce: 'pre',
      resolveId(source) {
        // Don't let Vite resolve optional deps that may have missing subpath
        // exports. These are imported via try/catch dynamic import in src/
        // (sona-optimizer falls back to no-SONA when the package isn't
        // installed). External-marking them keeps vitest from failing
        // module resolution at transform time.
        if (source.startsWith('agentic-flow')) return { id: source, external: true };
        if (source.startsWith('agentdb')) return { id: source, external: true };
        if (source.startsWith('@swarmvector/')) return { id: source, external: true };
        if (source.startsWith('@huggingface/transformers')) return { id: source, external: true };
        if (source.startsWith('@xenova/transformers')) return { id: source, external: true };
        if (source.startsWith('@noble/ed25519')) return { id: source, external: true };
        return null;
      },
    },
  ],
  test: {
    environment: 'node',
    // Force the forks pool (child processes) rather than threads (worker_threads).
    // Some suites call process.chdir() (e.g. intelligence-context-injection) and
    // resolve fixtures via process.cwd(); worker_threads reject chdir ("not
    // supported in workers") and can start from a different cwd, so those pass
    // locally (forks is the CLI default) but fail under CI's threads pool. #2195-adjacent.
    pool: 'forks',
    include: ['__tests__/**/*.test.ts'],
    globals: true,
    coverage: {
      enabled: false,
    },
  },
});
