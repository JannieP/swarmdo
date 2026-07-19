/**
 * route serve (increment 1) — pure translation + model selection + forward/handle.
 * Engine-first: no network, no server bind. forwardChat/handleMessages use an
 * injected fetch so the whole path is deterministic and fast.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { OpenRouterConfig } from '../src/providers/openrouter-config.ts';
import {
  tierForRequest,
  flattenContent,
  anthropicToOpenAI,
  openAIToAnthropic,
  selectModelForRequest,
  forwardChat,
  handleMessages,
  serializeSSE,
  translateOpenAIStream,
  parseSSEBuffer,
  betaUpdate,
  recordOutcome,
  loadPriors,
  savePriors,
  type AnthropicRequest,
  type OpenAIChatResponse,
  type OpenAIStreamChunk,
  type ProxyOptions,
} from '../src/route-serve/proxy.ts';

const cfg: OpenRouterConfig = {
  enabled: true,
  apiKeyEnv: 'OPENROUTER_API_KEY',
  baseUrl: 'https://openrouter.ai/api',
  models: [
    { id: 'meta-llama/llama-3.3-70b-instruct', tier: 'sonnet' },
    { id: 'anthropic/claude-3.5-haiku', tier: 'haiku' },
    { id: 'openai/gpt-4o', tier: 'opus' },
  ],
};

/** Build a fetch stub that returns the given (ok/status/json/text) per call. */
function stubFetch(...responses: Array<{ ok?: boolean; status?: number; json?: unknown; text?: string }>) {
  let i = 0;
  const calls: Array<{ url: string; body: unknown }> = [];
  const fn = (async (url: string, init: { body?: string }) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json ?? {},
      text: async () => r.text ?? '',
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const OPENAI_OK: OpenAIChatResponse = {
  id: 'chatcmpl-123',
  choices: [{ message: { content: 'hello from the pool' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 11, completion_tokens: 4 },
};

describe('route serve — tierForRequest', () => {
  it('maps model families to pool tiers, unknown → sonnet', () => {
    expect(tierForRequest({ model: 'claude-3-5-haiku-20241022' })).toBe('haiku');
    expect(tierForRequest({ model: 'claude-opus-4-20250101' })).toBe('opus');
    expect(tierForRequest({ model: 'claude-sonnet-4-6' })).toBe('sonnet');
    expect(tierForRequest({ model: 'something-weird' })).toBe('sonnet');
    expect(tierForRequest({})).toBe('sonnet');
  });
});

describe('route serve — flattenContent', () => {
  it('passes strings through and joins text blocks, dropping non-text', () => {
    expect(flattenContent('plain')).toBe('plain');
    expect(flattenContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb');
    expect(flattenContent([{ type: 'image', source: {} }, { type: 'text', text: 'c' }])).toBe('c');
  });
});

describe('route serve — anthropicToOpenAI', () => {
  it('lifts system (string) + messages and forces stream:false', () => {
    const body: AnthropicRequest = {
      model: 'claude-sonnet-4',
      system: 'be terse',
      max_tokens: 256,
      temperature: 0.2,
      messages: [{ role: 'user', content: 'hi' }],
    };
    const out = anthropicToOpenAI(body, 'meta-llama/llama-3.3-70b-instruct');
    expect(out.model).toBe('meta-llama/llama-3.3-70b-instruct');
    expect(out.messages[0]).toEqual({ role: 'system', content: 'be terse' });
    expect(out.messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(out.max_tokens).toBe(256);
    expect(out.temperature).toBe(0.2);
    expect(out.stream).toBe(false);
  });

  it('lifts system given as text blocks', () => {
    const out = anthropicToOpenAI(
      { system: [{ type: 'text', text: 'sys' }], messages: [{ role: 'user', content: 'q' }] },
      'openai/gpt-4o',
    );
    expect(out.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });
});

describe('route serve — openAIToAnthropic', () => {
  it('produces a valid Anthropic message, mapping finish_reason + usage', () => {
    const out = openAIToAnthropic(OPENAI_OK, 'openai/gpt-4o') as Record<string, any>;
    expect(out.type).toBe('message');
    expect(out.role).toBe('assistant');
    expect(out.model).toBe('openai/gpt-4o');
    expect(out.content).toEqual([{ type: 'text', text: 'hello from the pool' }]);
    expect(out.stop_reason).toBe('end_turn');
    expect(out.usage).toEqual({ input_tokens: 11, output_tokens: 4 });
  });

  it('maps length → max_tokens and tolerates a missing choice', () => {
    expect((openAIToAnthropic({ choices: [{ finish_reason: 'length' }] }, 'm') as any).stop_reason).toBe('max_tokens');
    const empty = openAIToAnthropic({}, 'm') as any;
    expect(empty.content).toEqual([{ type: 'text', text: '' }]);
    expect(empty.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });
});

describe('route serve — selectModelForRequest', () => {
  it('picks the tier model from the pool', () => {
    expect(selectModelForRequest({ model: 'claude-3-5-haiku', messages: [] }, cfg)).toMatchObject({
      model: 'anthropic/claude-3.5-haiku',
      tier: 'haiku',
    });
  });
  it('passes an explicit OpenRouter slug straight through', () => {
    expect(selectModelForRequest({ model: 'deepseek/deepseek-chat', messages: [] }, cfg)).toMatchObject({
      model: 'deepseek/deepseek-chat',
      source: 'explicit',
    });
  });
  it('returns null when the pool is disabled', () => {
    expect(selectModelForRequest({ model: 'claude-opus-4', messages: [] }, { ...cfg, enabled: false })).toBeNull();
  });
});

describe('route serve — forwardChat', () => {
  it('POSTs to the OpenRouter chat endpoint with bearer auth and returns JSON', async () => {
    const { fn, calls } = stubFetch({ ok: true, json: OPENAI_OK });
    const resp = await forwardChat(
      { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      { cfg, apiKey: 'sk-test', fetchImpl: fn },
    );
    expect(resp).toEqual(OPENAI_OK);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((calls[0].body as any).model).toBe('openai/gpt-4o');
  });

  it('does not retry a non-retryable 4xx and surfaces the error', async () => {
    const { fn, calls } = stubFetch({ ok: false, status: 400, text: 'bad request' });
    await expect(
      forwardChat({ model: 'm', messages: [] }, { cfg, apiKey: 'k', fetchImpl: fn, maxRetries: 3 }),
    ).rejects.toThrow(/400/);
    expect(calls.length).toBe(1); // broke immediately, no retry
  });
});

describe('route serve — handleMessages (end to end, injected fetch)', () => {
  const opts = (fetchImpl: typeof fetch): ProxyOptions => ({ cfg, apiKey: 'sk-test', fetchImpl } as ProxyOptions);

  it('routes → forwards → returns an Anthropic message (200)', async () => {
    const { fn } = stubFetch({ ok: true, json: OPENAI_OK });
    const { status, json } = await handleMessages(
      { model: 'claude-3-5-haiku', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] },
      opts(fn),
    );
    expect(status).toBe(200);
    expect((json as any).content[0].text).toBe('hello from the pool');
  });

  it('503 when no model is configured for the request', async () => {
    const { fn } = stubFetch({ ok: true, json: OPENAI_OK });
    const { status, json } = await handleMessages(
      { model: 'claude-opus-4', messages: [] },
      { ...opts(fn), cfg: { ...cfg, enabled: false } },
    );
    expect(status).toBe(503);
    expect((json as any).error.type).toBe('api_error');
  });

  it('502 when the provider call fails', async () => {
    const { fn } = stubFetch({ ok: false, status: 500, text: 'upstream boom' });
    const { status } = await handleMessages(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      { ...opts(fn), cfg, maxRetries: 0 },
    );
    expect(status).toBe(502);
  });
});

describe('route serve — streaming translation (increment 2)', () => {
  it('serializeSSE emits event + data + blank line', () => {
    expect(serializeSSE({ event: 'ping', data: { type: 'ping' } })).toBe('event: ping\ndata: {"type":"ping"}\n\n');
  });

  it('translateOpenAIStream produces the full ordered Anthropic event sequence', () => {
    const chunks: OpenAIStreamChunk[] = [
      { usage: { prompt_tokens: 9 }, choices: [{ delta: { role: 'assistant' } }] },
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 2 } },
    ];
    const ev = translateOpenAIStream(chunks, 'openai/gpt-4o');
    expect(ev.map((e) => e.event)).toEqual([
      'message_start', 'content_block_start',
      'content_block_delta', 'content_block_delta',
      'content_block_stop', 'message_delta', 'message_stop',
    ]);
    expect((ev[0].data as any).message.usage.input_tokens).toBe(9);
    expect((ev[2].data as any).delta.text).toBe('Hel');
    expect((ev[5].data as any).delta.stop_reason).toBe('end_turn');
    expect((ev[5].data as any).usage.output_tokens).toBe(2);
  });

  it('parseSSEBuffer extracts complete data chunks, flags [DONE], keeps the incomplete tail', () => {
    const buf =
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content"';
    const { chunks, done, rest } = parseSSEBuffer(buf);
    expect(chunks.length).toBe(1);
    expect(chunks[0].choices?.[0]?.delta?.content).toBe('a');
    expect(done).toBe(true);
    expect(rest).toContain('{"delta":{"content"');
  });
});

describe('route serve — learned priors (increment 3)', () => {
  it('betaUpdate bumps α on success, β on failure, seeding from {1,1}', () => {
    expect(betaUpdate(undefined, true)).toEqual({ alpha: 2, beta: 1 });
    expect(betaUpdate(undefined, false)).toEqual({ alpha: 1, beta: 2 });
    expect(betaUpdate({ alpha: 3, beta: 2 }, true)).toEqual({ alpha: 4, beta: 2 });
  });

  it('recordOutcome folds an outcome into a priors map immutably', () => {
    const p0 = {};
    const p1 = recordOutcome(p0, 'openai/gpt-4o', true);
    expect(p1['openai/gpt-4o']).toEqual({ alpha: 2, beta: 1 });
    expect(p0).toEqual({}); // original untouched
    expect(recordOutcome(p1, 'openai/gpt-4o', false)['openai/gpt-4o']).toEqual({ alpha: 2, beta: 2 });
  });

  it('savePriors → loadPriors round-trips through .swarm/, missing dir → {}', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-priors-'));
    try {
      const priors = { 'anthropic/claude-3.5-haiku': { alpha: 5, beta: 2 } };
      savePriors(priors, dir);
      expect(loadPriors(dir)).toEqual(priors);
      expect(loadPriors(path.join(tmpdir(), 'nonexistent-swarmdo-xyz-123'))).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handleMessages reports success/failure to onOutcome for the picked model', async () => {
    const okCalls: Array<[string, boolean]> = [];
    await handleMessages(
      { model: 'claude-3-5-haiku', messages: [{ role: 'user', content: 'hi' }] },
      { cfg, apiKey: 'k', fetchImpl: stubFetch({ ok: true, json: OPENAI_OK }).fn, onOutcome: (m, s) => okCalls.push([m, s]) } as ProxyOptions,
    );
    expect(okCalls).toEqual([['anthropic/claude-3.5-haiku', true]]);

    const failCalls: Array<[string, boolean]> = [];
    await handleMessages(
      { model: 'claude-opus-4', messages: [] },
      { cfg, apiKey: 'k', fetchImpl: stubFetch({ ok: false, status: 500, text: 'boom' }).fn, maxRetries: 0, onOutcome: (m, s) => failCalls.push([m, s]) } as ProxyOptions,
    );
    expect(failCalls).toEqual([['openai/gpt-4o', false]]);
  });
});
