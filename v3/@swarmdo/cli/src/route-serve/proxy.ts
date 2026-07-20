/**
 * route-serve/proxy.ts — a lightweight, Anthropic-compatible model-router proxy.
 *
 * `swarmdo route serve` starts this on 127.0.0.1:PORT. Point Claude Code (or any
 * Anthropic client) at it with `ANTHROPIC_BASE_URL=http://127.0.0.1:PORT` and it
 * routes each `/v1/messages` request to an OpenRouter model chosen from the
 * user's configured pool (swarmdo.config.json `openrouter`), translating the
 * Anthropic <-> OpenAI-compatible request/response shapes.
 *
 * Deliberately built on swarmdo's existing pieces — no vendored proxy, no new
 * deps beyond Node's own `http`:
 *   - model selection: resolveOpenRouterModel() with Thompson-sampled `priors`
 *     (== learned routing) from providers/openrouter-config.
 *   - resilience: computeBackoffMs / isRetryableError / sleep from resilience/backoff.
 *
 * The only new surface is the HTTP serving layer + request/response translation,
 * both kept PURE and fixture-tested (see __tests__/route-serve-proxy.test.ts).
 *
 * INCREMENT 1: non-streaming (forwards `stream:false` upstream and returns a
 * single Anthropic message). Incremental SSE streaming is increment 2; until
 * then a client that asked for stream still gets a correct, complete response
 * (buffered), just not token-by-token.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { OpenRouterConfig, RoutingTier } from '../providers/openrouter-config.js';
import { resolveOpenRouterModel } from '../providers/openrouter-config.js';
import { computeBackoffMs, isRetryableError, sleep } from '../resilience/backoff.js';

// ── Minimal Anthropic Messages API shapes ────────────────────────────────────
export interface AnthropicContentBlock { type: string; text?: string; [k: string]: unknown; }
export interface AnthropicMessage { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[]; }
export interface AnthropicRequest {
  model?: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

// ── OpenAI Chat Completions shapes (subset we produce/consume) ────────────────
export interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}
export interface OpenAIChatResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// ── Pure: map an Anthropic model hint to one of our pool tiers ────────────────
/** Claude Code sends model ids like 'claude-3-5-haiku…', 'claude-sonnet-4…',
 *  'claude-opus-4…'. Map by family; unknown → 'sonnet' (the safe middle tier). */
export function tierForRequest(body: Pick<AnthropicRequest, 'model'>): RoutingTier {
  const m = (body.model || '').toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('opus')) return 'opus';
  return 'sonnet';
}

// ── Pure: flatten Anthropic content (string | text blocks) to a plain string ──
export function flattenContent(content: AnthropicMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
}

// ── Pure: Anthropic /v1/messages request -> OpenAI /v1/chat/completions ────────
export function anthropicToOpenAI(body: AnthropicRequest, model: string): OpenAIChatRequest {
  const messages: OpenAIChatRequest['messages'] = [];
  const system =
    typeof body.system === 'string'
      ? body.system
      : Array.isArray(body.system)
        ? body.system.filter((b) => b?.text).map((b) => b.text as string).join('\n')
        : '';
  if (system) messages.push({ role: 'system', content: system });
  for (const m of body.messages || []) {
    messages.push({ role: m.role, content: flattenContent(m.content) });
  }
  return {
    model,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: false,
  };
}

// ── Pure: OpenAI chat response -> Anthropic /v1/messages response ─────────────
const STOP_MAP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'end_turn',
};
export function openAIToAnthropic(resp: OpenAIChatResponse, model: string): Record<string, unknown> {
  const choice = resp?.choices?.[0] ?? {};
  const text = choice?.message?.content ?? '';
  const usage = resp?.usage ?? {};
  return {
    id: resp?.id ? `msg_${resp.id}` : `msg_${model}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: typeof text === 'string' ? text : '' }],
    stop_reason: STOP_MAP[choice?.finish_reason ?? 'stop'] ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}

// ── Pure: select the concrete model for a request via the configured pool ─────
export interface Priors {
  [modelId: string]: { alpha: number; beta: number };
}
export function selectModelForRequest(
  body: AnthropicRequest,
  cfg: OpenRouterConfig,
  priors?: Priors,
): { model: string; source: string; tier: RoutingTier } | null {
  const tier = tierForRequest(body);
  const picked = resolveOpenRouterModel({ requested: body.model, tier, cfg, priors });
  return picked ? { ...picked, tier } : null;
}

// ── Learned routing (increment 3): pluggable shared priors store ──────────────
// route serve does NOT own a priors store of its own. It delegates to a
// RouteLearner so its outcomes feed — and its picks read — the SAME learned
// state as the rest of swarmdo's model routing (swarmvector/model-router's
// per-modelId `priorsById`), instead of a parallel file. The serve command
// supplies one backed by ModelRouter; tests supply a fake. resolveOpenRouterModel
// Thompson-samples over the returned priors, so models that succeed get picked
// more, and route serve's usage matures the per-modelId shadow state.
export interface RouteLearner {
  /** Beta priors ({ modelId → {alpha,beta} }) for this request, for Thompson sampling. */
  priorsFor(body: AnthropicRequest): Priors;
  /** Fold this request's outcome (for the chosen model) into the shared store. */
  record(body: AnthropicRequest, model: string, success: boolean): void;
}

// ── Forward to OpenRouter with jittered backoff on retryable failures ─────────
export interface ForwardDeps {
  cfg: OpenRouterConfig;
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}
export async function forwardChat(openaiReq: OpenAIChatRequest, deps: ForwardDeps): Promise<OpenAIChatResponse> {
  const doFetch = deps.fetchImpl ?? fetch;
  const url = `${deps.cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const maxRetries = deps.maxRetries ?? 2;
  let lastErr = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(computeBackoffMs(attempt - 1));
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
          'HTTP-Referer': 'https://swarmdo.com',
          'X-Title': 'swarmdo route serve',
        },
        body: JSON.stringify(openaiReq),
      });
      if (res.ok) return (await res.json()) as OpenAIChatResponse;
      lastErr = `${res.status} ${await res.text().catch(() => '')}`.trim();
      // 4xx (except 429) is not worth retrying — the request itself is bad.
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = (e as Error).message;
      if (!isRetryableError(lastErr)) break;
    }
  }
  throw new Error(`OpenRouter forward failed after ${maxRetries + 1} attempt(s): ${lastErr}`);
}

// ── HTTP serving layer ────────────────────────────────────────────────────────
export interface ProxyOptions {
  cfg: OpenRouterConfig;
  apiKey: string;
  port?: number;
  host?: string;
  /** shared learned-routing store (priors read + outcome record); omit to disable learning */
  learner?: RouteLearner;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** retry budget per upstream call (default 2) */
  maxRetries?: number;
  log?: (msg: string) => void;
}

/** Orchestrate one /v1/messages request. Returns an HTTP status + Anthropic-shaped body. */
export async function handleMessages(
  body: AnthropicRequest,
  opts: ProxyOptions,
): Promise<{ status: number; json: unknown }> {
  const sel = selectModelForRequest(body, opts.cfg, opts.learner?.priorsFor(body));
  if (!sel) {
    return {
      status: 503,
      json: {
        type: 'error',
        error: {
          type: 'api_error',
          message:
            'no OpenRouter model configured for this request — set `openrouter.enabled` + a model pool in swarmdo.config.json',
        },
      },
    };
  }
  try {
    const openaiReq = anthropicToOpenAI(body, sel.model);
    const resp = await forwardChat(openaiReq, {
      cfg: opts.cfg,
      apiKey: opts.apiKey,
      fetchImpl: opts.fetchImpl,
      maxRetries: opts.maxRetries,
    });
    opts.learner?.record(body, sel.model, true);
    opts.log?.(`routed ${body.model ?? '(default)'} → ${sel.model} [${sel.tier}] (${sel.source})`);
    return { status: 200, json: openAIToAnthropic(resp, sel.model) };
  } catch (e) {
    opts.learner?.record(body, sel.model, false);
    return { status: 502, json: { type: 'error', error: { type: 'api_error', message: (e as Error).message } } };
  }
}

// ── Streaming (increment 2): OpenAI SSE  ->  Anthropic SSE events ─────────────
export interface SSEEvent {
  event: string;
  data: unknown;
}
/** Serialize one Anthropic SSE event to the wire format (`event:`/`data:` + blank line). */
export function serializeSSE(e: SSEEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export interface OpenAIStreamChunk {
  id?: string;
  choices?: Array<{ delta?: { content?: string; role?: string }; finish_reason?: string | null }>;
  usage?: { completion_tokens?: number; prompt_tokens?: number };
}

/** Pure: the opening events for an Anthropic streamed message. */
export function messageStartEvents(model: string, inputTokens = 0, id = `msg_${model}`): SSEEvent[] {
  return [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id, type: 'message', role: 'assistant', model, content: [],
          stop_reason: null, stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: 0 },
        },
      },
    },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  ];
}
/** Pure: one text delta event. */
export function textDeltaEvent(text: string): SSEEvent {
  return { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } };
}
/** Pure: the closing events, mapping the OpenAI finish_reason to an Anthropic stop_reason. */
export function messageStopEvents(finishReason: string | null | undefined, outputTokens: number): SSEEvent[] {
  const stop_reason = STOP_MAP[finishReason ?? 'stop'] ?? 'end_turn';
  return [
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: outputTokens } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ];
}

/** Pure: a full OpenAI streaming-chunk list -> the ordered Anthropic SSE events. */
export function translateOpenAIStream(chunks: OpenAIStreamChunk[], model: string): SSEEvent[] {
  const events: SSEEvent[] = [...messageStartEvents(model, chunks[0]?.usage?.prompt_tokens ?? 0)];
  let finish: string | null | undefined = 'stop';
  let outputTokens = 0;
  for (const c of chunks) {
    const choice = c.choices?.[0];
    const text = choice?.delta?.content;
    if (typeof text === 'string' && text.length) events.push(textDeltaEvent(text));
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (c.usage?.completion_tokens != null) outputTokens = c.usage.completion_tokens;
  }
  events.push(...messageStopEvents(finish, outputTokens));
  return events;
}

/** Pure: pull complete `data:` JSON chunks out of an accumulating SSE buffer, keeping the incomplete tail. */
export function parseSSEBuffer(buffer: string): { chunks: OpenAIStreamChunk[]; done: boolean; rest: string } {
  const chunks: OpenAIStreamChunk[] = [];
  let done = false;
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? ''; // possibly-incomplete final line
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') { done = true; continue; }
    if (!payload) continue;
    try { chunks.push(JSON.parse(payload) as OpenAIStreamChunk); } catch { /* incomplete/keepalive — skip */ }
  }
  return { chunks, done, rest };
}

/** Forward with `stream:true` and yield decoded OpenAI stream chunks. */
export async function* forwardChatStream(openaiReq: OpenAIChatRequest, deps: ForwardDeps): AsyncGenerator<OpenAIStreamChunk> {
  const doFetch = deps.fetchImpl ?? fetch;
  const url = `${deps.cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await doFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${deps.apiKey}`,
      'HTTP-Referer': 'https://swarmdo.com',
      'X-Title': 'swarmdo route serve',
    },
    body: JSON.stringify({ ...openaiReq, stream: true }),
  });
  if (!res.ok || !res.body) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`OpenRouter stream failed: ${res.status} ${detail}`.trim());
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSSEBuffer(buffer);
    buffer = parsed.rest;
    for (const c of parsed.chunks) yield c;
    if (parsed.done) return;
  }
}

/** Handle a streaming /v1/messages request by writing Anthropic SSE to `res`. */
export async function handleStreamingMessages(body: AnthropicRequest, opts: ProxyOptions, res: ServerResponse): Promise<void> {
  const sel = selectModelForRequest(body, opts.cfg, opts.learner?.priorsFor(body));
  if (!sel) {
    const json = { type: 'error', error: { type: 'api_error', message: 'no OpenRouter model configured for this request' } };
    const buf = Buffer.from(JSON.stringify(json));
    res.writeHead(503, { 'content-type': 'application/json', 'content-length': String(buf.length) });
    res.end(buf);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const write = (e: SSEEvent): void => { res.write(serializeSSE(e)); };
  try {
    const openaiReq = anthropicToOpenAI(body, sel.model);
    let started = false;
    let finish: string | null | undefined = 'stop';
    let outputTokens = 0;
    for await (const chunk of forwardChatStream(openaiReq, { cfg: opts.cfg, apiKey: opts.apiKey, fetchImpl: opts.fetchImpl })) {
      if (!started) { for (const e of messageStartEvents(sel.model, chunk.usage?.prompt_tokens ?? 0)) write(e); started = true; }
      const text = chunk.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length) write(textDeltaEvent(text));
      if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
      if (chunk.usage?.completion_tokens != null) outputTokens = chunk.usage.completion_tokens;
    }
    if (!started) for (const e of messageStartEvents(sel.model)) write(e);
    for (const e of messageStopEvents(finish, outputTokens)) write(e);
    opts.learner?.record(body, sel.model, true);
    opts.log?.(`streamed ${body.model ?? '(default)'} → ${sel.model} [${sel.tier}] (${sel.source})`);
  } catch (e) {
    opts.learner?.record(body, sel.model, false);
    write({ event: 'error', data: { type: 'error', error: { type: 'api_error', message: (e as Error).message } } });
  } finally {
    res.end();
  }
}

function readBody(req: IncomingMessage, limitBytes = 20 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limitBytes) reject(new Error('request body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function createProxyServer(opts: ProxyOptions): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, json: unknown): void => {
      const buf = Buffer.from(JSON.stringify(json));
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(buf.length) });
      res.end(buf);
    };
    try {
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        return send(200, { ok: true, service: 'swarmdo route serve', pool: opts.cfg.models.length });
      }
      if (req.method === 'POST' && req.url?.startsWith('/v1/messages')) {
        const body = JSON.parse(await readBody(req)) as AnthropicRequest;
        if (body.stream) return void (await handleStreamingMessages(body, opts, res));
        const { status, json } = await handleMessages(body, opts);
        return send(status, json);
      }
      send(404, { type: 'error', error: { type: 'not_found_error', message: `no route for ${req.method} ${req.url}` } });
    } catch (e) {
      send(400, { type: 'error', error: { type: 'invalid_request_error', message: (e as Error).message } });
    }
  });
}

/** Start the proxy; resolves with the bound port + base URL to set ANTHROPIC_BASE_URL to. */
export function startProxy(opts: ProxyOptions): Promise<{ server: Server; port: number; url: string }> {
  const host = opts.host ?? '127.0.0.1';
  const wantPort = opts.port ?? 3456;
  const server = createProxyServer(opts);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(wantPort, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : wantPort;
      resolve({ server, port, url: `http://${host}:${port}` });
    });
  });
}
