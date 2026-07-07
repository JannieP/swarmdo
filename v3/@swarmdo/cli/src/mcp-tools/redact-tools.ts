/**
 * Redact MCP Tools
 *
 * Give agents a secret guard on the data path: before writing tool output or
 * context into memory / a message / a file, an agent can mask secrets
 * (redact_text) or check for their presence (redact_scan). Deterministic —
 * shares the pure engine in ../redact/redact.ts with the CLI command.
 */

import type { MCPTool } from './types.js';
import { redactText, scanText, type RedactOptions } from '../redact/redact.js';

function optsOf(params: Record<string, unknown>): RedactOptions {
  const opts: RedactOptions = { entropy: params.entropy !== false };
  if (typeof params.keepPrefix === 'number') opts.keepPrefix = params.keepPrefix;
  if (typeof params.token === 'string') opts.token = params.token;
  if (typeof params.entropyThreshold === 'number') opts.entropyThreshold = params.entropyThreshold;
  if (Array.isArray(params.allowlist)) opts.allowlist = params.allowlist.filter((a): a is string => typeof a === 'string');
  return opts;
}

const redactTextTool: MCPTool = {
  name: 'redact_text',
  description:
    'Mask secrets (API keys, tokens, private keys) in a string before you store it in memory, put it in a message, or write it to a file. Returns the redacted text plus what was found. Deterministic; run this on any untrusted or command-derived content you are about to persist or forward.',
  category: 'redact',
  tags: ['security', 'secrets', 'redaction', 'safety'],
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The content to redact' },
      keepPrefix: { type: 'number', description: 'Keep this many leading chars of each secret (default 3; 0 = full mask)' },
      token: { type: 'string', description: 'Replacement token after the kept prefix (default [REDACTED])' },
      entropy: { type: 'boolean', description: 'Enable the high-entropy keyword=value fallback (default true)' },
      entropyThreshold: { type: 'number', description: 'Entropy threshold in bits/char for the fallback (default 3.5)' },
      allowlist: { type: 'array', items: { type: 'string' }, description: 'Substrings; matching secrets are left untouched' },
    },
    required: ['text'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (typeof params.text !== 'string') return { error: true, message: 'text is required' };
    const { output, findings } = redactText(params.text, optsOf(params));
    return { redacted: output, count: findings.length, findings };
  },
};

const redactScanTool: MCPTool = {
  name: 'redact_scan',
  description:
    'Check a string for secrets WITHOUT rewriting it — returns the list of findings (rule, line, column, description). Use to decide whether content is safe to store/forward, or to gate on it. Pair with redact_text when you actually need the masked output.',
  category: 'redact',
  tags: ['security', 'secrets', 'scan', 'safety'],
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The content to scan' },
      entropy: { type: 'boolean', description: 'Enable the high-entropy keyword=value fallback (default true)' },
      entropyThreshold: { type: 'number', description: 'Entropy threshold in bits/char for the fallback (default 3.5)' },
      allowlist: { type: 'array', items: { type: 'string' }, description: 'Substrings to ignore' },
    },
    required: ['text'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (typeof params.text !== 'string') return { error: true, message: 'text is required' };
    const findings = scanText(params.text, optsOf(params));
    return { clean: findings.length === 0, count: findings.length, findings };
  },
};

export const redactTools: MCPTool[] = [redactTextTool, redactScanTool];
