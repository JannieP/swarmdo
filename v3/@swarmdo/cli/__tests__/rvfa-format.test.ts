/**
 * appliance/rvfa-format.ts — the .rvfa header validator + helpers were the one
 * engine module with no test file. validateHeader is a load-time integrity gate
 * (a malformed header must be rejected before anything trusts the appliance), so
 * lock its accept/reject behaviour and the size/header helpers.
 */
import { describe, it, expect } from 'vitest';
import { formatSize, createDefaultHeader, validateHeader } from '../src/appliance/rvfa-format.ts';

describe('rvfa-format: formatSize', () => {
  it('clamps negatives and formats bytes without a decimal', () => {
    expect(formatSize(-5)).toBe('0 B');
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });
  it('steps up the unit ladder with one decimal', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1024 ** 2)).toBe('1.0 MB');
    expect(formatSize(1024 ** 3)).toBe('1.0 GB');
    expect(formatSize(1024 ** 4)).toBe('1.0 TB');
  });
  it('caps at TB rather than inventing a bigger unit', () => {
    expect(formatSize(2048 * 1024 ** 4)).toBe('2048.0 TB');
  });
});

describe('rvfa-format: createDefaultHeader', () => {
  it('produces a valid header for each profile', () => {
    for (const p of ['cloud', 'hybrid', 'offline'] as const) {
      const h = createDefaultHeader(p);
      expect(h.magic).toBe('RVFA');
      expect(h.profile).toBe(p);
      expect(validateHeader(h)).toBe(true); // default (name '') already validates
    }
  });
  it('picks profile-specific isolation and provider', () => {
    expect(createDefaultHeader('cloud').boot.isolation).toBe('container');
    expect(createDefaultHeader('cloud').models.provider).toBe('api-vault');
    expect(createDefaultHeader('offline').boot.isolation).toBe('native');
    expect(createDefaultHeader('offline').models.provider).toBe('swarmllm');
    expect(createDefaultHeader('offline').capabilities).toContain('swarmllm');
    expect(createDefaultHeader('cloud').capabilities).not.toContain('swarmllm');
  });
});

describe('rvfa-format: validateHeader', () => {
  const validSection = { id: 's1', type: 'model', sha256: 'deadbeef', offset: 0, size: 100, originalSize: 200, compression: 'gzip' };
  const valid = () => ({ ...createDefaultHeader('cloud'), name: 'demo', sections: [validSection] });

  it('accepts a well-formed header (incl. a section)', () => {
    expect(validateHeader(valid())).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const v of [null, undefined, 42, 'RVFA', []]) expect(validateHeader(v)).toBe(false);
  });

  it('rejects a bad magic or version', () => {
    expect(validateHeader({ ...valid(), magic: 'NOPE' })).toBe(false);
    expect(validateHeader({ ...valid(), version: 0 })).toBe(false);
    expect(validateHeader({ ...valid(), version: '1' })).toBe(false);
  });

  it('rejects missing/typed-wrong string fields and a bad profile', () => {
    expect(validateHeader({ ...valid(), name: 123 })).toBe(false);
    expect(validateHeader({ ...valid(), platform: undefined })).toBe(false);
    expect(validateHeader({ ...valid(), profile: 'edge' })).toBe(false);
  });

  it('rejects a malformed boot block', () => {
    expect(validateHeader({ ...valid(), boot: { entrypoint: '/x', args: 'nope', env: {}, isolation: 'native' } })).toBe(false);
    expect(validateHeader({ ...valid(), boot: { entrypoint: '/x', args: [], env: {}, isolation: 'jail' } })).toBe(false);
  });

  it('rejects a bad models.provider', () => {
    expect(validateHeader({ ...valid(), models: { provider: 'openai' } })).toBe(false);
  });

  it('rejects a section with a missing hash, non-number offset, or bad compression', () => {
    expect(validateHeader({ ...valid(), sections: [{ ...validSection, sha256: undefined }] })).toBe(false);
    expect(validateHeader({ ...valid(), sections: [{ ...validSection, offset: '0' }] })).toBe(false);
    expect(validateHeader({ ...valid(), sections: [{ ...validSection, compression: 'lz4' }] })).toBe(false);
  });
});
