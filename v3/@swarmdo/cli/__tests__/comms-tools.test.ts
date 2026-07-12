import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commsTools } from '../src/mcp-tools/comms-tools.ts';

const tool = (name: string) => commsTools.find((t) => t.name === name)!;
const send = (input: Record<string, unknown>) => tool('comms_send').handler(input);
const inbox = (input: Record<string, unknown>) => tool('comms_inbox').handler(input);

let dir: string;
let prevCwd: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-comms-mcp-'));
  prevCwd = process.env.SWARMDO_CWD;
  process.env.SWARMDO_CWD = dir; // getProjectCwd() honors this
});
afterEach(() => {
  if (prevCwd === undefined) delete process.env.SWARMDO_CWD; else process.env.SWARMDO_CWD = prevCwd;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('comms MCP tools', () => {
  it('exposes comms_send and comms_inbox in the comms category', () => {
    expect(commsTools.map((t) => t.name).sort()).toEqual(['comms_inbox', 'comms_send']);
    for (const t of commsTools) expect(t.category).toBe('comms');
  });

  it('comms_send validates recipient and body', async () => {
    expect(await send({ message: 'hi' })).toMatchObject({ success: false });
    expect(await send({ to: 'bob', message: '  ' })).toMatchObject({ success: false });
  });

  it('round-trips a message from one session to another', async () => {
    const sent = await send({ to: 'reviewer', message: 'PR ready', subject: 'PR #42', from: 'alice' });
    expect(sent).toMatchObject({ success: true, to: 'reviewer', from: 'alice' });

    const view = await inbox({ to: 'reviewer' });
    expect(view).toMatchObject({ success: true, to: 'reviewer', count: 1, unread: 1 });
    expect((view as { messages: { body: string; from: string }[] }).messages[0]).toMatchObject({
      body: 'PR ready',
      from: 'alice',
    });
  });

  it('delivers "all" broadcasts to any inbox and markRead acknowledges them', async () => {
    await send({ to: 'all', message: 'standup in 5', from: 'alice' });
    const first = await inbox({ to: 'dev', markRead: true });
    expect(first).toMatchObject({ count: 1, marked: 1 });
    // After acknowledging, the same inbox shows it read (unread back to 0).
    const second = await inbox({ to: 'dev', unreadOnly: true });
    expect(second).toMatchObject({ count: 0, unread: 0 });
  });
});
