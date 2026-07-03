/**
 * doctor checkEdgeReadiness tests — Move Pi (Raspberry Pi / edge).
 *
 * Uses the injectable EdgeProbe so the check is deterministic regardless of
 * the host running the tests.
 */

import { describe, it, expect } from 'vitest';
import { checkEdgeReadiness, type EdgeProbe } from '../src/commands/doctor.js';

const probe = (over: Partial<EdgeProbe> = {}): EdgeProbe => ({
  arch: 'arm64',
  totalMemBytes: 4 * 1024 ** 3,
  cpus: 4,
  platform: 'linux',
  offlineProvider: false,
  ...over,
});

describe('checkEdgeReadiness', () => {
  it('passes on a Pi 4 (arm64, 4GB) and labels it edge-native', async () => {
    const c = await checkEdgeReadiness(probe());
    expect(c.name).toBe('Edge Readiness');
    expect(c.status).toBe('pass');
    expect(c.message).toMatch(/Pi\/edge native/);
    expect(c.message).toMatch(/4 CPU/);
  });

  it('reports offline-capable when Ollama is configured', async () => {
    const c = await checkEdgeReadiness(probe({ offlineProvider: true }));
    expect(c.message).toMatch(/offline-capable/);
  });

  it('reports network-needed when no offline provider', async () => {
    const c = await checkEdgeReadiness(probe({ offlineProvider: false }));
    expect(c.message).toMatch(/needs network/);
  });

  it('fails under 512MB RAM', async () => {
    const c = await checkEdgeReadiness(probe({ totalMemBytes: 400 * 1024 ** 2 }));
    expect(c.status).toBe('fail');
    expect(c.fix).toMatch(/lean/);
  });

  it('warns in the 0.5–1GB band (Pi Zero 2 / Pi 3) with a lean-profile fix', async () => {
    const c = await checkEdgeReadiness(probe({ totalMemBytes: 768 * 1024 ** 2 }));
    expect(c.status).toBe('warn');
    expect(c.fix).toMatch(/tools-profile lean/);
    expect(c.fix).toMatch(/skip-llm/);
  });

  it('passes on a non-ARM dev box too (x64, 16GB)', async () => {
    const c = await checkEdgeReadiness(probe({ arch: 'x64', totalMemBytes: 16 * 1024 ** 3, offlineProvider: false }));
    expect(c.status).toBe('pass');
    expect(c.message).toMatch(/x64/);
  });
});
