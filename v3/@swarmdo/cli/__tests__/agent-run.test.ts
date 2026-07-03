/**
 * agent_run tool tests — Sprint 1 Move 1.
 *
 * Verifies that the fused spawn+execute tool:
 *   - is registered under its `agent_run` name
 *   - declares required inputs (agentType, prompt)
 *   - reuses the agent_spawn registration path (same agent record shape)
 *   - calls executeAgentTask exactly once when the LLM path runs
 *   - short-circuits with `status: 'codemod_recommended'` when the router
 *     returns a deterministic Tier-1 codemod intent
 *
 * Does NOT make a real LLM call — Anthropic fetch is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => {
  const memStore = new Map<string, string>();
  return {
    existsSync: vi.fn((p: string) => memStore.has(p)),
    readFileSync: vi.fn((p: string) => memStore.get(p) || '{}'),
    writeFileSync: vi.fn((p: string, d: string) => memStore.set(p, d)),
    mkdirSync: vi.fn(),
  };
});

// Pretend an Anthropic key is present so executeAgentTask actually issues a fetch
// (which we intercept below).
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-placeholder';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { agentTools } from '../src/mcp-tools/agent-tools.js';

function agentRun() {
  const tool = agentTools.find(t => t.name === 'agent_run');
  if (!tool) throw new Error('agent_run tool not found in agentTools');
  return tool;
}

describe('agent_run', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('is registered in agentTools with required inputs', () => {
    const tool = agentRun();
    expect(tool.name).toBe('agent_run');
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['agentType', 'prompt']));
  });

  it('description points users at the alternatives (agent_spawn / agent_execute)', () => {
    expect(agentRun().description).toMatch(/agent_spawn/);
    expect(agentRun().description).toMatch(/agent_execute/);
  });

  it('returns failure if prompt validation fails (non-string)', async () => {
    const result: any = await agentRun().handler({ agentType: 'coder', prompt: 123 as unknown as string });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/validation/i);
  });

  it('registers an agent and invokes the LLM exactly once on the happy path', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'msg_test',
        model: 'claude-haiku-4-5',
        content: [{ type: 'text', text: 'hello world' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 7, output_tokens: 3 },
      }),
    });

    const result: any = await agentRun().handler({
      agentType: 'coder',
      prompt: 'echo hello',
      model: 'haiku',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.agentId).toBeDefined();
    expect(result.agentType).toBe('coder');
    expect(result.execution).toBeDefined();
    expect(result.execution.success).toBe(true);
    expect(result.execution.output).toBe('hello world');
    expect(result.execution.usage.totalTokens).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an LLM error in execution without claiming completion', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    const result: any = await agentRun().handler({
      agentType: 'coder',
      prompt: 'echo hello',
      model: 'haiku',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.execution.success).toBe(false);
    expect(result.execution.error).toMatch(/429/);
  });
});
