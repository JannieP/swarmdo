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
  priors?: Priors;
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
  const sel = selectModelForRequest(body, opts.cfg, opts.priors);
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
    opts.log?.(`routed ${body.model ?? '(default)'} → ${sel.model} [${sel.tier}] (${sel.source})`);
    return { status: 200, json: openAIToAnthropic(resp, sel.model) };
  } catch (e) {
    return { status: 502, json: { type: 'error', error: { type: 'api_error', message: (e as Error).message } } };
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
