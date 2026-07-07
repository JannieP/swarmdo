import { describe, it, expect } from 'vitest';
import {
  parseOpenRouterConfig,
  isOpenRouterSlug,
  modelsForTier,
  pickOpenRouterModel,
  resolveOpenRouterModel,
  type OpenRouterConfig,
} from '../src/providers/openrouter-config.ts';
import { lintSwarmdoConfig } from '../src/config-lint/lint.ts';

const cfg = (over: Partial<OpenRouterConfig> = {}): OpenRouterConfig => ({
  enabled: true,
  apiKeyEnv: 'OPENROUTER_API_KEY',
  baseUrl: 'https://openrouter.ai/api',
  models: [
    { id: 'meta-llama/llama-3.3-70b-instruct', tier: 'haiku' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', tier: 'haiku' },
    { id: 'deepseek/deepseek-chat', tier: 'sonnet' },
    { id: 'anthropic/claude-opus-4-5', tier: 'opus' },
  ],
  ...over,
});

describe('openrouter: slug + parsing at the boundary', () => {
  it('recognizes OpenRouter slugs', () => {
    expect(isOpenRouterSlug('meta-llama/llama-3.3-70b-instruct')).toBe(true);
    expect(isOpenRouterSlug('qwen/qwen3:free')).toBe(true);
    expect(isOpenRouterSlug('haiku')).toBe(false);
    expect(isOpenRouterSlug('claude-sonnet-4-6')).toBe(false);
    expect(isOpenRouterSlug(undefined)).toBe(false);
  });

  it('parses valid config, drops junk with warnings, never throws', () => {
    const { config, warnings } = parseOpenRouterConfig({
      enabled: true,
      defaultModel: 'anthropic/claude-sonnet-4-6',
      models: [
        { id: 'deepseek/deepseek-chat', tier: 'sonnet' },
        'meta-llama/llama-3.3-70b-instruct',              // shorthand
        { id: 'no-slash-model', tier: 'haiku' },          // bad slug
        { id: 'deepseek/deepseek-chat', tier: 'opus' },   // duplicate
        { id: 'org/model', tier: 'ultra' },               // bad tier → kept untiered
        42,                                               // junk
      ],
    });
    expect(config.enabled).toBe(true);
    expect(config.models.map((m) => m.id)).toEqual([
      'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct', 'org/model',
    ]);
    expect(config.models[2].tier).toBeUndefined();
    expect(warnings.length).toBe(4);
  });

  it('absent/invalid section yields disabled defaults', () => {
    expect(parseOpenRouterConfig(undefined).config.enabled).toBe(false);
    expect(parseOpenRouterConfig('nope').config.enabled).toBe(false);
    expect(parseOpenRouterConfig('nope').warnings.length).toBe(1);
  });
});

describe('openrouter: tier selection', () => {
  it('filters by tier; single candidate short-circuits', () => {
    expect(modelsForTier(cfg(), 'haiku')).toHaveLength(2);
    const pick = pickOpenRouterModel({ cfg: cfg(), tier: 'opus' });
    expect(pick).toMatchObject({ model: 'anthropic/claude-opus-4-5', candidates: 1 });
  });

  it('Thompson-samples among candidates using per-model priors', () => {
    // deterministic sampler: score = alpha (so higher alpha always wins)
    const pick = pickOpenRouterModel({
      cfg: cfg(),
      tier: 'haiku',
      priors: {
        'meta-llama/llama-3.3-70b-instruct': { alpha: 9, beta: 1 },
        'qwen/qwen-2.5-coder-32b-instruct': { alpha: 2, beta: 8 },
      },
      sample: (alpha) => alpha,
    });
    expect(pick!.model).toBe('meta-llama/llama-3.3-70b-instruct');
    expect(pick!.candidates).toBe(2);
  });

  it('returns null when disabled or tier has no candidates', () => {
    expect(pickOpenRouterModel({ cfg: cfg({ enabled: false }), tier: 'haiku' })).toBeNull();
    expect(pickOpenRouterModel({ cfg: cfg({ models: [] }), tier: 'haiku' })).toBeNull();
  });
});

describe('openrouter: resolution precedence', () => {
  it('explicit slug > tier pick > defaultModel > null', () => {
    const c = cfg({ defaultModel: 'anthropic/claude-sonnet-4-6' });
    expect(resolveOpenRouterModel({ requested: 'x-ai/grok-4', cfg: c })!)
      .toMatchObject({ model: 'x-ai/grok-4', source: 'explicit' });
    expect(resolveOpenRouterModel({ requested: 'opus', cfg: c })!.model)
      .toBe('anthropic/claude-opus-4-5');
    expect(resolveOpenRouterModel({ requested: 'claude-sonnet-4-6', cfg: c })!)
      .toMatchObject({ model: 'anthropic/claude-sonnet-4-6', source: 'config defaultModel' });
    expect(resolveOpenRouterModel({ requested: 'claude-x', cfg: cfg({ enabled: false }) })).toBeNull();
  });

  it('tier param wins over non-tier requested string', () => {
    const r = resolveOpenRouterModel({ requested: 'claude-haiku-4', tier: 'sonnet', cfg: cfg() });
    expect(r!.model).toBe('deepseek/deepseek-chat');
  });
});

describe('openrouter: config lint integration', () => {
  it('accepts the section and surfaces engine warnings as findings', () => {
    const findings = lintSwarmdoConfig('swarmdo.config.json', {
      openrouter: { enabled: true, models: ['bad slug here'] },
    });
    const or = findings.filter((x) => x.rule === 'openrouter-config');
    expect(or.length).toBe(2); // dropped entry + enabled-but-empty pool
    expect(findings.some((x) => x.rule === 'unknown-key')).toBe(false);
  });
});
