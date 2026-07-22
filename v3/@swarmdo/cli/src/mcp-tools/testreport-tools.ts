/**
 * Testreport MCP Tool
 *
 * Let an agent turn raw JUnit/TAP test output into a structured failure digest —
 * exact failing test + file:line + message — instead of re-reading hundreds of
 * log lines. The front-half of the test→fix loop: pair with `repair`. Shares the
 * pure parser in ../testreport/testreport.ts with the CLI; string-in/JSON-out.
 */

import type { MCPTool } from './types.js';
import { parseTestReport, detectFormat, type TestFormat } from '../testreport/testreport.js';

const testreportTool: MCPTool = {
  name: 'testreport',
  description:
    'Parse JUnit-XML or TAP test output into a structured summary: {passed, failed, skipped, total, durationMs, failures:[{suite,name,file,line,message}]}. Gets the exact failing tests + file:line instead of scanning logs; feed the failures into `repair`. Deterministic; auto-detects format.',
  category: 'testreport',
  tags: ['tests', 'junit', 'tap', 'ci', 'failures'],
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'the raw JUnit XML or TAP text' },
      format: { type: 'string', enum: ['junit', 'tap'], description: 'force the input format (default: auto-detect)' },
    },
    required: ['content'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (typeof params.content !== 'string') return { error: true, message: 'content (string) is required' };
    const fmt: TestFormat = params.format === 'junit' || params.format === 'tap'
      ? params.format
      : detectFormat(params.content);
    return { format: fmt, ...parseTestReport(params.content, fmt) };
  },
};

export const testreportTools: MCPTool[] = [testreportTool];
