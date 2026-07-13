/**
 * comms/store.ts — fs persistence + identity for the cross-session mailbox (#44).
 *
 * Shared by the `swarmdo comms` CLI command AND the comms_send/comms_inbox MCP
 * tools so both read/write the SAME `.swarmdo/comms/store.json` under a given
 * project root. The pure message logic lives in mailbox.ts; this is only I/O.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { emptyMailbox, type Mailbox } from './mailbox.js';

const STORE_REL = join('.swarmdo', 'comms', 'store.json');

/** Retention applied opportunistically on send: keep read messages ≤30d, ≤500 total. */
export const RETENTION = { maxAgeMs: 30 * 24 * 3600 * 1000, maxCount: 500 };

export function storePath(cwd: string): string {
  return join(cwd, STORE_REL);
}

export function loadMailbox(cwd: string): Mailbox {
  try {
    const p = storePath(cwd);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as Mailbox;
  } catch {
    /* corrupt/missing → fresh mailbox */
  }
  return emptyMailbox();
}

export function saveMailbox(cwd: string, box: Mailbox): void {
  const p = storePath(cwd);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(box, null, 2) + '\n', 'utf-8');
}

/**
 * This session's name, in precedence order:
 *   explicit override (flag/param)
 *   → $SWARMDO_SESSION   (set by Claude Code)
 *   → $SWARMDO_AGENT     (harness-neutral — Codex/Copilot/pi agents export this)
 *   → hostname → "me".
 *
 * The $SWARMDO_AGENT fallback lets a non-Claude agent declare a stable identity
 * once (instead of passing `from`/`--self` on every call); without it, every
 * agent on a host collapses to the shared hostname and direct addressing breaks.
 */
export function resolveSelf(flag?: unknown): string {
  const f = typeof flag === 'string' ? flag.trim() : '';
  return (
    f ||
    (process.env.SWARMDO_SESSION || '').trim() ||
    (process.env.SWARMDO_AGENT || '').trim() ||
    hostname() ||
    'me'
  );
}

/** Crypto-strong message id. */
export function newMessageId(): string {
  return 'msg_' + randomBytes(6).toString('hex');
}
