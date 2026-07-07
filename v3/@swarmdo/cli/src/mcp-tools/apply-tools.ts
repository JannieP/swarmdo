/**
 * Apply MCP Tool
 *
 * Let an agent apply its own unified diff to a piece of source with fuzzy
 * context matching — landing hunks even when line numbers drift — and get back
 * the patched text plus exactly which hunks were rejected. String-in/string-out
 * and deterministic; shares the pure engine in ../apply/apply.ts with the CLI.
 */

import type { MCPTool } from './types.js';
import { parsePatch, applyPatch } from '../apply/apply.js';

const applyPatchTool: MCPTool = {
  name: 'apply_patch',
  description:
    'Apply a unified diff to a source string with fuzzy context matching (a forgiving `git apply`). Returns the patched text and per-hunk results — use this when a diff you produced might have drifted line numbers or slightly-off context, instead of hand-editing. Deterministic; pass the file content and the diff for a single file.',
  category: 'apply',
  tags: ['patch', 'diff', 'apply', 'edit'],
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'the current file content the diff applies to' },
      patch: { type: 'string', description: 'a unified diff (one file); a/ b/ prefixes are tolerated' },
      fuzz: { type: 'number', description: 'max context lines to drop when matching a drifted hunk (default 2)', default: 2 },
    },
    required: ['source', 'patch'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (typeof params.source !== 'string') return { error: true, message: 'source (string) is required' };
    if (typeof params.patch !== 'string') return { error: true, message: 'patch (string) is required' };
    const patches = parsePatch(params.patch);
    if (patches.length === 0) return { error: true, message: 'no file patch found — is this a unified diff?' };
    const fuzz = typeof params.fuzz === 'number' ? params.fuzz : 2;
    const res = applyPatch(params.source, patches[0], { fuzz });
    return {
      ok: res.ok,
      result: res.result,
      applied: res.hunks.filter((h) => h.applied).length,
      rejected: res.hunks.filter((h) => !h.applied).length,
      hunks: res.hunks.map((h) => ({ applied: h.applied, at: h.at, fuzzUsed: h.fuzzUsed, oldStart: h.hunk.oldStart })),
    };
  },
};

export const applyTools: MCPTool[] = [applyPatchTool];
