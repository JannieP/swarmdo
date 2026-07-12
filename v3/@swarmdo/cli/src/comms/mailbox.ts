/**
 * comms/mailbox.ts — pure engine for the cross-session agent mailbox (#44).
 *
 * A shared `.swarmdo/comms/store.json` lets any Claude Code session on the same
 * repo/machine leave messages for another by session name ("multiplayer
 * swarms"). This module is the pure, I/O-free core: the message model, immutable
 * add, inbox filtering/ordering, read-state tracking, and retention. The command
 * layer (`swarmdo comms`) supplies id/timestamp generation and fs persistence.
 *
 * A message addressed to `all` (case-insensitive) is a broadcast — it appears in
 * every session's inbox.
 */

export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** ISO-8601 creation time. */
  createdAt: string;
  read: boolean;
}

export interface Mailbox {
  messages: Record<string, Message>;
  version: string;
}

/** The broadcast recipient — a message to this address reaches every inbox. */
export const BROADCAST = 'all';

export function emptyMailbox(): Mailbox {
  return { messages: {}, version: '1.0.0' };
}

/**
 * Build a message. `id` and `createdAt` are injected (not generated here) so the
 * engine stays pure and unit-testable; the command layer supplies a crypto id
 * and the wall clock. from/to/subject are trimmed; a blank subject becomes
 * '(no subject)'.
 */
export function createMessage(opts: {
  id: string;
  from: string;
  to: string;
  body: string;
  createdAt: string;
  subject?: string;
}): Message {
  return {
    id: opts.id,
    from: (opts.from || '').trim() || 'unknown',
    to: (opts.to || '').trim(),
    subject: (opts.subject || '').trim() || '(no subject)',
    body: opts.body ?? '',
    createdAt: opts.createdAt,
    read: false,
  };
}

/** Immutably add a message. Same id is a no-op (idempotent delivery). */
export function addMessage(box: Mailbox, msg: Message): Mailbox {
  if (box.messages[msg.id]) return box;
  return { ...box, messages: { ...box.messages, [msg.id]: msg } };
}

export interface InboxFilter {
  /** Recipient session name; matches this recipient plus `all` broadcasts. Omit for every message. */
  to?: string;
  /** Only messages from this sender (case-insensitive). */
  from?: string;
  /** Only unread messages. */
  unreadOnly?: boolean;
  /** Only messages created strictly after this ISO timestamp. */
  since?: string;
}

const eqCI = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Filter the mailbox to an inbox view, sorted NEWEST-FIRST (tiebreak by id).
 * A `to` filter matches the named recipient and `all` broadcasts.
 */
export function filterInbox(box: Mailbox, filter: InboxFilter = {}): Message[] {
  const all = Object.values(box.messages || {});
  const filtered = all.filter((m) => {
    if (filter.to !== undefined && !(eqCI(m.to, filter.to) || eqCI(m.to, BROADCAST))) return false;
    if (filter.from !== undefined && !eqCI(m.from, filter.from)) return false;
    if (filter.unreadOnly && m.read) return false;
    if (filter.since !== undefined && !(m.createdAt > filter.since)) return false;
    return true;
  });
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id.localeCompare(b.id)));
}

/** Count unread messages for a recipient (includes `all` broadcasts). */
export function unreadCount(box: Mailbox, to?: string): number {
  return filterInbox(box, { to, unreadOnly: true }).length;
}

/**
 * Render a set of messages as a compact context block for hook delivery — the
 * "surface new mail without polling" path. Returns '' for no messages (caller
 * injects nothing). Each body is whitespace-collapsed and capped at maxBodyChars.
 */
export function renderInboxContext(
  messages: Message[],
  opts: { header?: string; maxBodyChars?: number } = {},
): string {
  if (!messages || messages.length === 0) return '';
  const header = opts.header ?? '## 📬 New messages (swarmdo comms)';
  const maxBody = opts.maxBodyChars ?? 500;
  const lines = [
    header,
    `You have ${messages.length} new message${messages.length === 1 ? '' : 's'} from other sessions:`,
    '',
  ];
  for (const m of messages) {
    const body = (m.body || '').replace(/\s+/g, ' ').trim();
    const trimmed = body.length > maxBody ? body.slice(0, maxBody).trimEnd() + '…' : body;
    lines.push(`- **from ${m.from}** — ${m.subject}: ${trimmed}`);
  }
  return lines.join('\n');
}

/** Immutably mark the given ids read. Returns the new box + how many flipped unread→read. */
export function markRead(box: Mailbox, ids: string[]): { box: Mailbox; marked: number } {
  const idSet = new Set(ids);
  let marked = 0;
  const messages: Record<string, Message> = {};
  for (const [id, m] of Object.entries(box.messages || {})) {
    if (idSet.has(id) && !m.read) {
      messages[id] = { ...m, read: true };
      marked++;
    } else {
      messages[id] = m;
    }
  }
  return { box: marked ? { ...box, messages } : box, marked };
}

/**
 * Retention: drop READ messages older than maxAgeMs, then — if still over
 * maxCount — drop the oldest READ messages until at the cap. UNREAD messages are
 * never dropped (delivery is guaranteed until acknowledged). `nowMs` is injected
 * to keep this pure.
 */
export function pruneMailbox(
  box: Mailbox,
  opts: { maxAgeMs?: number; maxCount?: number; nowMs: number },
): Mailbox {
  const entries = Object.values(box.messages || {});
  const keep = new Map<string, Message>();
  const droppableRead: Message[] = [];

  for (const m of entries) {
    if (!m.read) {
      keep.set(m.id, m);
      continue;
    }
    const ageMs = opts.nowMs - Date.parse(m.createdAt);
    if (opts.maxAgeMs !== undefined && Number.isFinite(ageMs) && ageMs > opts.maxAgeMs) continue; // aged out
    keep.set(m.id, m);
    droppableRead.push(m);
  }

  if (opts.maxCount !== undefined && keep.size > opts.maxCount) {
    // Drop oldest read first until at the cap (unread are never in droppableRead).
    droppableRead.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    for (const m of droppableRead) {
      if (keep.size <= opts.maxCount) break;
      keep.delete(m.id);
    }
  }

  const messages: Record<string, Message> = {};
  for (const [id, m] of keep) messages[id] = m;
  return { ...box, messages };
}
