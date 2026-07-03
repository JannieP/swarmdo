/**
 * swarmdo statusline — config resolution and writing.
 *
 * The interactive checklist itself is a prompt-layer concern; these tests
 * cover the pure logic the command and the generated statusline script share:
 * segment validation, preset expansion, precedence (env → project → global →
 * default), and the config writer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  STATUSLINE_SEGMENTS,
  STATUSLINE_PRESETS,
  resolveCurrentSegments,
  writeStatuslineConfig,
  configPath,
} from '../src/commands/statusline.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-sl-'));

describe('statusline segments model', () => {
  it('presets only reference real segments', () => {
    const valid = new Set(STATUSLINE_SEGMENTS.map((s) => s.value));
    for (const [name, list] of Object.entries(STATUSLINE_PRESETS)) {
      for (const seg of list) {
        expect(valid.has(seg), `preset ${name} references unknown segment ${seg}`).toBe(true);
      }
    }
  });

  it('full preset covers every segment exactly once (the checklist superset)', () => {
    expect(STATUSLINE_PRESETS.full).toEqual(STATUSLINE_SEGMENTS.map((s) => s.value));
    expect(new Set(STATUSLINE_PRESETS.full).size).toBe(STATUSLINE_PRESETS.full!.length);
  });

  it('presets mirror the generator (SEGMENT_PRESETS in statusline-generator.ts)', () => {
    const gen = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'init', 'statusline-generator.ts'),
      'utf8'
    );
    for (const [name, list] of Object.entries(STATUSLINE_PRESETS)) {
      const m = gen.match(new RegExp(`${name}: \\[([^\\]]*)\\]`));
      expect(m, `generator missing preset ${name}`).toBeTruthy();
      const genList = m![1]!.split(',').map((x) => x.replace(/['"\s]/g, '')).filter(Boolean);
      expect(genList).toEqual(list);
    }
  });
});

describe('resolveCurrentSegments precedence', () => {
  let dir: string;
  const OLD_ENV = process.env.SWARMDO_STATUSLINE;

  beforeEach(() => {
    dir = tmp();
    delete process.env.SWARMDO_STATUSLINE;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (OLD_ENV === undefined) delete process.env.SWARMDO_STATUSLINE;
    else process.env.SWARMDO_STATUSLINE = OLD_ENV;
  });

  it('defaults to full when nothing is configured', () => {
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(STATUSLINE_PRESETS.full);
    expect(r.source).toContain('default');
  });

  it('env preset wins over everything', () => {
    writeStatuslineConfig({ preset: 'full' }, false, dir);
    process.env.SWARMDO_STATUSLINE = 'minimal';
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(STATUSLINE_PRESETS.minimal);
    expect(r.source).toContain('SWARMDO_STATUSLINE');
  });

  it('env custom list is validated and lowercased', () => {
    process.env.SWARMDO_STATUSLINE = 'Project, MODEL, bogus, swarm';
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(['project', 'model', 'swarm']);
  });

  it('project config preset is honored', () => {
    writeStatuslineConfig({ preset: 'compact' }, false, dir);
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(STATUSLINE_PRESETS.compact);
    expect(r.source).toContain('project');
  });

  it('project custom segments are honored and filtered', () => {
    writeStatuslineConfig({ segments: ['branch', 'nonsense', 'agentdb'] }, false, dir);
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(['branch', 'agentdb']);
  });

  it('invalid json in project config falls through to default', () => {
    const p = configPath(false, dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{not json');
    const r = resolveCurrentSegments(dir);
    expect(r.segments).toEqual(STATUSLINE_PRESETS.full);
  });
});

describe('writeStatuslineConfig', () => {
  it('creates .swarmdo/statusline.json with segments', () => {
    const dir = tmp();
    try {
      const p = writeStatuslineConfig({ segments: ['project', 'model'] }, false, dir);
      expect(p).toBe(path.join(dir, '.swarmdo', 'statusline.json'));
      expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ segments: ['project', 'model'] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('round-trips through resolveCurrentSegments', () => {
    const dir = tmp();
    try {
      writeStatuslineConfig({ segments: ['context', 'cost'] }, false, dir);
      expect(resolveCurrentSegments(dir).segments).toEqual(['context', 'cost']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
