import { describe, it, expect } from 'vitest';
import {
  transportOf,
  parseServers,
  classifyServer,
  collectServerDefs,
  runMcpDoctor,
  type McpServerDef,
  type DoctorDeps,
} from '../src/mcp-doctor/mcp-doctor.ts';

const def = (over: Partial<McpServerDef>): McpServerDef => ({ name: 'x', source: 's', ...over });
const yes = () => true;
const no = () => false;

describe('mcp-doctor: transportOf', () => {
  it('honors explicit type', () => {
    expect(transportOf(def({ type: 'http', url: 'x' }))).toBe('http');
    expect(transportOf(def({ type: 'sse', url: 'x' }))).toBe('sse');
    expect(transportOf(def({ type: 'stdio', command: 'x' }))).toBe('stdio');
  });
  it('infers stdio from command and http from url', () => {
    expect(transportOf(def({ command: 'npx' }))).toBe('stdio');
    expect(transportOf(def({ url: 'https://x' }))).toBe('http');
  });
  it('is unknown when neither present', () => {
    expect(transportOf(def({}))).toBe('unknown');
  });
});

describe('mcp-doctor: parseServers', () => {
  it('extracts command/args/url/type', () => {
    const servers = parseServers({
      a: { command: 'npx', args: ['-y', 'pkg'] },
      b: { type: 'http', url: 'https://h' },
    }, '.mcp.json');
    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({ name: 'a', command: 'npx', args: ['-y', 'pkg'], source: '.mcp.json' });
    expect(servers[1]).toMatchObject({ name: 'b', type: 'http', url: 'https://h' });
  });
  it('keeps non-object entries as name-only (→ malformed later)', () => {
    const servers = parseServers({ bad: 'oops' }, 's');
    expect(servers[0]).toEqual({ name: 'bad', source: 's' });
  });
  it('returns [] for missing/invalid maps', () => {
    expect(parseServers(undefined, 's')).toEqual([]);
    expect(parseServers('nope', 's')).toEqual([]);
  });
});

describe('mcp-doctor: classifyServer', () => {
  it('stdio ok when the binary resolves', () => {
    const r = classifyServer(def({ command: 'npx', args: ['-y', 'pkg'] }), yes);
    expect(r.status).toBe('ok');
    expect(r.transport).toBe('stdio');
    expect(r.detail).toBe('npx -y pkg');
  });
  it('stdio binary-missing when it does not resolve', () => {
    const r = classifyServer(def({ command: 'nope-bin' }), no);
    expect(r.status).toBe('binary-missing');
    expect(r.detail).toContain('nope-bin');
  });
  it('stdio malformed when no command', () => {
    expect(classifyServer(def({ type: 'stdio' }), yes).status).toBe('malformed');
  });
  it('http ok with a valid url', () => {
    expect(classifyServer(def({ type: 'http', url: 'https://h/mcp' }), no).status).toBe('ok');
  });
  it('http bad-url when scheme is not http(s)', () => {
    const r = classifyServer(def({ type: 'http', url: 'ftp://h' }), no);
    expect(r.status).toBe('bad-url');
  });
  it('http malformed when no url', () => {
    expect(classifyServer(def({ type: 'sse' }), no).status).toBe('malformed');
  });
  it('malformed when neither command nor url', () => {
    expect(classifyServer(def({}), yes).status).toBe('malformed');
  });
});

describe('mcp-doctor: collectServerDefs + runMcpDoctor', () => {
  function deps(files: Record<string, unknown>, binaryExists = yes): DoctorDeps {
    return {
      cwd: '/repo',
      home: '/home/u',
      readJson: (f: string) => files[f] ?? null,
      binaryExists,
    };
  }

  it('gathers from .mcp.json and ~/.claude.json (global + project)', () => {
    const d = deps({
      '/repo/.mcp.json': { mcpServers: { proj: { command: 'node' } } },
      '/home/u/.claude.json': {
        mcpServers: { global: { command: 'npx' } },
        projects: { '/repo': { mcpServers: { local: { type: 'http', url: 'https://h' } } } },
      },
    });
    const defs = collectServerDefs(d);
    expect(defs.map((x) => x.name).sort()).toEqual(['global', 'local', 'proj']);
    expect(defs.find((x) => x.name === 'proj')!.source).toBe('.mcp.json');
    expect(defs.find((x) => x.name === 'local')!.source).toContain('project');
  });

  it('runs end-to-end and flags a missing binary', () => {
    const d = deps(
      { '/repo/.mcp.json': { mcpServers: { good: { command: 'node' }, broken: { command: 'ghost' } } } },
      (cmd) => cmd === 'node',
    );
    const reports = runMcpDoctor(d);
    expect(reports.find((r) => r.name === 'good')!.status).toBe('ok');
    expect(reports.find((r) => r.name === 'broken')!.status).toBe('binary-missing');
  });

  it('returns [] when no config files exist', () => {
    expect(runMcpDoctor(deps({}))).toEqual([]);
  });
});
