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
        if (source.startsWith('@ruvector/')) return { id: source, external: true };
        if (source.startsWith('@huggingface/transformers')) return { id: source, external: true };
        if (source.startsWith('@xenova/transformers')) return { id: source, external: true };
        if (source.startsWith('@noble/ed25519')) return { id: source, external: true };
        return null;
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: true,
    coverage: {
      enabled: false,
    },
  },
});
