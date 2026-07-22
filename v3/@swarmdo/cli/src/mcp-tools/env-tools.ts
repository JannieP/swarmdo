/**
 * Env MCP Tool
 *
 * Let an agent check env-var drift in-session before it writes code that reads
 * a var, or before it green-lights a deploy: reconcile the vars referenced in
 * given source against a `.env` (and optional `.env.example`). Deterministic —
 * shares the pure engine in ../env/env.ts with the CLI command. String-in, so
 * it works without touching the filesystem.
 */

import type { MCPTool } from './types.js';
import { extractEnvRefs, parseDotenv, reconcile } from '../env/env.js';

const envCheckTool: MCPTool = {
  name: 'env_check',
  description:
    'Reconcile env vars referenced in source against a .env declaration. Returns missing (referenced, not declared — breaks at runtime), unused (declared, never referenced), and undocumented (in .env, not .env.example). Use before adding a var or approving a deploy. Deterministic.',
  category: 'env',
  tags: ['env', 'dotenv', 'config', 'drift', 'ci'],
  inputSchema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: 'source files to scan',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'file path (for reporting)' },
            content: { type: 'string', description: 'file contents' },
          },
          required: ['path', 'content'],
        },
      },
      env: { type: 'string', description: 'contents of the .env file (declarations)' },
      example: { type: 'string', description: 'contents of .env.example (optional, enables the undocumented bucket)' },
      ignore: { type: 'array', items: { type: 'string' }, description: 'extra keys to ignore' },
    },
    required: ['sources', 'env'],
  },
  handler: async (params: Record<string, unknown>) => {
    const sources = params.sources;
    if (!Array.isArray(sources)) return { error: true, message: 'sources[] is required' };
    if (typeof params.env !== 'string') return { error: true, message: 'env (string) is required' };
    const refs = sources.flatMap((s: unknown) => {
      const o = s as { path?: unknown; content?: unknown };
      if (typeof o.path !== 'string' || typeof o.content !== 'string') return [];
      return extractEnvRefs(o.content, o.path);
    });
    const declared = parseDotenv(params.env);
    const example = typeof params.example === 'string' ? parseDotenv(params.example) : undefined;
    const ignore = Array.isArray(params.ignore) ? params.ignore.filter((x): x is string => typeof x === 'string') : undefined;
    const report = reconcile({ refs, declared, example, ignore });
    return {
      clean: report.missing.length === 0 && report.unused.length === 0 && report.undocumented.length === 0,
      missing: report.missing,
      unused: report.unused,
      undocumented: report.undocumented,
    };
  },
};

export const envTools: MCPTool[] = [envCheckTool];
