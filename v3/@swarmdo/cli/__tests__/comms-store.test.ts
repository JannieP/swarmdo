import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { loadMailbox, saveMailbox, resolveSelf, newMessageId, storePath } from '../src/comms/store.ts';
import { addMessage, createMessage, emptyMailbox } from '../src/comms/mailbox.ts';

let dir: string;
let prevSession: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-comms-'));
  prevSession = process.env.SWARMDO_SESSION;
  delete process.env.SWARMDO_SESSION;
});
afterEach(() => {
  if (prevSession === undefined) delete process.env.SWARMDO_SESSION;
  else process.env.SWARMDO_SESSION = prevSession;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('comms/store: load & save', () => {
  it('returns an empty mailbox when the store file is absent', () => {
    expect(loadMailbox(dir)).toEqual(emptyMailbox());
    expect(existsSync(storePath(dir))).toBe(false);
  });

  it('round-trips a message through disk', () => {
    const box = addMessage(
      emptyMailbox(),
      createMessage({ id: 'm1', from: 'a', to: 'b', body: 'hi', createdAt: '2026-07-12T10:00:00.000Z' }),
    );
    saveMailbox(dir, box);
    expect(existsSync(storePath(dir))).toBe(true);
    const reloaded = loadMailbox(dir);
    expect(reloaded.messages.m1).toMatchObject({ from: 'a', to: 'b', body: 'hi', read: false });
  });
});

describe('comms/store: resolveSelf precedence', () => {
  it('prefers an explicit flag over env and hostname', () => {
    process.env.SWARMDO_SESSION = 'envname';
    expect(resolveSelf('flagname')).toBe('flagname');
  });
  it('falls back to $SWARMDO_SESSION when no flag', () => {
    process.env.SWARMDO_SESSION = 'envname';
    expect(resolveSelf(undefined)).toBe('envname');
    expect(resolveSelf('  ')).toBe('envname'); // blank flag ignored
  });
  it('falls back to hostname when neither flag nor env is set', () => {
    expect(resolveSelf()).toBe(hostname());
  });
});

describe('comms/store: newMessageId', () => {
  it('is prefixed and unique', () => {
    const a = newMessageId();
    const b = newMessageId();
    expect(a).toMatch(/^msg_[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
