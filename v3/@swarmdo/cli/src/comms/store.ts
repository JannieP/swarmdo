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

/** This session's name: explicit override → SWARMDO_SESSION → hostname → "me". */
export function resolveSelf(flag?: unknown): string {
  const f = typeof flag === 'string' ? flag.trim() : '';
  return f || (process.env.SWARMDO_SESSION || '').trim() || hostname() || 'me';
}

/** Crypto-strong message id. */
export function newMessageId(): string {
  return 'msg_' + randomBytes(6).toString('hex');
}
