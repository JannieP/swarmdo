/**
 * openrouter-config.ts — configurable OpenRouter model pool for swarms.
 *
 * The execution core has dispatched to OpenRouter since #2042, but only via
 * env vars and a single default slug. This module makes the integration
 * CONFIGURABLE: users declare the OpenRouter models they want their agent
 * swarms to draw from in swarmdo.config.json, each mapped to a routing tier,
 * and the router selects among same-tier candidates by Thompson sampling —
 * the concrete consumer for the ADR-149 per-modelId priors.
 *
 *   "openrouter": {
 *     "enabled": true,
 *     "models": [
 *       { "id": "meta-llama/llama-3.3-70b-instruct", "tier": "haiku" },
 *       { "id": "deepseek/deepseek-chat",            "tier": "sonnet" },
 *       { "id": "anthropic/claude-opus-4-5",         "tier": "opus" }
 *     ],
 *     "defaultModel": "anthropic/claude-sonnet-4-6"
 *   }
 *
 * Everything here is pure (validation, filtering, sampling with injectable
 * randomness) except loadOpenRouterConfig, a thin fs reader.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type RoutingTier = 'haiku' | 'sonnet' | 'opus';
const TIERS: readonly string[] = ['haiku', 'sonnet', 'opus'];

export interface OpenRouterModelEntry {
  /** OpenRouter slug, e.g. 'meta-llama/llama-3.3-70b-instruct' */
  id: string;
  /** Which routing tier this model can serve. Untiered models are only
   * reachable as defaultModel or by explicit slug. */
  tier?: RoutingTier;
  /** Free-form operator note (why it's in the pool, cost expectations…) */
  note?: string;
}

export interface OpenRouterConfig {
  enabled: boolean;
  /** env var holding the key (default OPENROUTER_API_KEY) */
  apiKeyEnv: string;
  baseUrl: string;
  defaultModel?: string;
  models: OpenRouterModelEntry[];
}

export interface ParseResult {
  config: OpenRouterConfig;
  /** human-readable reasons for every entry/field that was dropped */
  warnings: string[];
}

const DEFAULTS: OpenRouterConfig = {
  enabled: false,
  apiKeyEnv: 'OPENROUTER_API_KEY',
  baseUrl: 'https://openrouter.ai/api',
  models: [],
};

/** OpenRouter slugs are provider/model paths ('org/name[:variant]'). */
export function isOpenRouterSlug(model: string | undefined | null): boolean {
  return typeof model === 'string' && /^[\w.-]+\/[\w.:-]+$/.test(model);
}

/** Validate the raw `openrouter` config section. Tolerant at the boundary:
 * bad entries are dropped with a warning, never thrown. */
export function parseOpenRouterConfig(raw: unknown): ParseResult {
  const warnings: string[] = [];
  if (raw === undefined || raw === null) return { config: { ...DEFAULTS }, warnings };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: { ...DEFAULTS }, warnings: ['openrouter: expected an object — section ignored'] };
  }
  const o = raw as Record<string, unknown>;
  const config: OpenRouterConfig = { ...DEFAULTS, models: [] };
  config.enabled = o.enabled === true;
  if (typeof o.apiKeyEnv === 'string' && o.apiKeyEnv.trim()) config.apiKeyEnv = o.apiKeyEnv.trim();
  if (typeof o.baseUrl === 'string' && /^https?:\/\//.test(o.baseUrl)) config.baseUrl = o.baseUrl.replace(/\/$/, '');
  else if (o.baseUrl !== undefined) warnings.push('openrouter.baseUrl: not an http(s) URL — using default');
  if (typeof o.defaultModel === 'string' && isOpenRouterSlug(o.defaultModel)) config.defaultModel = o.defaultModel;
  else if (o.defaultModel !== undefined) warnings.push(`openrouter.defaultModel: "${String(o.defaultModel)}" is not an OpenRouter slug (org/model) — ignored`);

  const rawModels = Array.isArray(o.models) ? o.models : [];
  if (o.models !== undefined && !Array.isArray(o.models)) warnings.push('openrouter.models: expected an array — ignored');
  const seen = new Set<string>();
  for (const [i, m] of rawModels.entries()) {
    if (typeof m === 'string') {
      // shorthand: bare slug, no tier
      if (isOpenRouterSlug(m) && !seen.has(m)) { config.models.push({ id: m }); seen.add(m); }
      else warnings.push(`openrouter.models[${i}]: "${m}" is not a valid slug or is a duplicate — dropped`);
      continue;
    }
    if (!m || typeof m !== 'object') { warnings.push(`openrouter.models[${i}]: not an object — dropped`); continue; }
    const e = m as Record<string, unknown>;
    if (typeof e.id !== 'string' || !isOpenRouterSlug(e.id)) {
      warnings.push(`openrouter.models[${i}]: missing/invalid id (want 'org/model' slug) — dropped`);
      continue;
    }
    if (seen.has(e.id)) { warnings.push(`openrouter.models[${i}]: duplicate id "${e.id}" — dropped`); continue; }
    const entry: OpenRouterModelEntry = { id: e.id };
    if (e.tier !== undefined) {
      if (typeof e.tier === 'string' && TIERS.includes(e.tier)) entry.tier = e.tier as RoutingTier;
      else { warnings.push(`openrouter.models[${i}]: tier "${String(e.tier)}" not in ${TIERS.join('|')} — entry kept untiered`); }
    }
    if (typeof e.note === 'string') entry.note = e.note;
    config.models.push(entry);
    seen.add(e.id);
  }
  return { config, warnings };
}

/** Models eligible to serve a tier. */
export function modelsForTier(cfg: OpenRouterConfig, tier: RoutingTier): OpenRouterModelEntry[] {
  return cfg.models.filter((m) => m.tier === tier);
}

export interface BetaPrior { alpha: number; beta: number }
export type BetaSampler = (alpha: number, beta: number) => number;

/** Default Beta sampler via two Gamma(α,1)/Gamma(β,1) draws (Marsaglia-Tsang
 * for shape ≥ 1, boost trick below 1). Deterministic tests inject their own. */
export const defaultBetaSampler: BetaSampler = (alpha, beta) => {
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(Math.random() || 1e-12, 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const u1 = Math.random() || 1e-12;
      const u2 = Math.random() || 1e-12;
      const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const v = Math.pow(1 + c * n, 3);
      if (v <= 0) continue;
      if (Math.log(u2) < 0.5 * n * n + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  const a = gamma(alpha);
  const b = gamma(beta);
  return a / (a + b || 1e-12);
};

export interface PickInput {
  cfg: OpenRouterConfig;
  tier: RoutingTier;
  /** per-modelId Beta priors (ADR-149 shape) — absent models get uniform Beta(1,1) */
  priors?: Record<string, BetaPrior>;
  sample?: BetaSampler;
}

export interface PickResult {
  model: string;
  reason: string;
  candidates: number;
}

/** Thompson-sample a concrete OpenRouter model for a tier from the
 * user-configured pool. Returns null when disabled or no tier candidates. */
export function pickOpenRouterModel({ cfg, tier, priors, sample }: PickInput): PickResult | null {
  if (!cfg.enabled) return null;
  const candidates = modelsForTier(cfg, tier);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { model: candidates[0].id, reason: `only configured ${tier}-tier model`, candidates: 1 };
  }
  const draw = sample ?? defaultBetaSampler;
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const p = priors?.[c.id] ?? { alpha: 1, beta: 1 };
    const score = draw(Math.max(p.alpha, 1e-9), Math.max(p.beta, 1e-9));
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return {
    model: best!.id,
    reason: `Thompson pick among ${candidates.length} configured ${tier}-tier models`,
    candidates: candidates.length,
  };
}

export interface ResolveInput extends Omit<PickInput, 'tier'> {
  /** caller-supplied model: OpenRouter slug passes through; tier word routes via the pool */
  requested?: string;
  tier?: RoutingTier;
}

/** Full precedence for the execution path:
 *  explicit slug > tier pick from the configured pool > config defaultModel > null. */
export function resolveOpenRouterModel({ requested, tier, cfg, priors, sample }: ResolveInput): { model: string; source: string } | null {
  if (isOpenRouterSlug(requested)) return { model: requested as string, source: 'explicit' };
  const effectiveTier: RoutingTier | undefined =
    tier ?? (requested && TIERS.includes(requested) ? (requested as RoutingTier) : undefined);
  if (effectiveTier) {
    const picked = pickOpenRouterModel({ cfg, tier: effectiveTier, priors, sample });
    if (picked) return { model: picked.model, source: picked.reason };
  }
  if (cfg.enabled && cfg.defaultModel) return { model: cfg.defaultModel, source: 'config defaultModel' };
  return null;
}

/** Thin reader: swarmdo.config.json's `openrouter` section from cwd (or an
 * ancestor repo root). Absent/broken files yield the disabled default. */
export function loadOpenRouterConfig(cwd: string = process.cwd()): ParseResult {
  for (const dir of [cwd, path.resolve(cwd, '..'), path.resolve(cwd, '../..')]) {
    const p = path.join(dir, 'swarmdo.config.json');
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return parseOpenRouterConfig(parsed?.openrouter);
    } catch {
      return { config: { ...DEFAULTS }, warnings: [`openrouter: failed to read ${p} — integration disabled`] };
    }
  }
  return { config: { ...DEFAULTS }, warnings: [] };
}
