import { describe, it, expect } from 'vitest';
import {
  emptyMailbox,
  createMessage,
  addMessage,
  filterInbox,
  unreadCount,
  markRead,
  pruneMailbox,
  BROADCAST,
  type Mailbox,
  type Message,
} from '../src/comms/mailbox.ts';

const msg = (over: Partial<Message>): Message => ({
  id: 'm1',
  from: 'alice',
  to: 'bob',
  subject: 's',
  body: 'b',
  createdAt: '2026-07-12T10:00:00.000Z',
  read: false,
  ...over,
});

const boxOf = (...ms: Message[]): Mailbox => ({
  messages: Object.fromEntries(ms.map((m) => [m.id, m])),
  version: '1.0.0',
});

describe('createMessage', () => {
  it('trims fields, defaults a blank subject, and starts unread', () => {
    const m = createMessage({ id: 'x', from: '  alice ', to: ' bob ', body: 'hi', createdAt: 'T', subject: '  ' });
    expect(m).toMatchObject({ id: 'x', from: 'alice', to: 'bob', subject: '(no subject)', body: 'hi', read: false });
  });
  it('defaults an empty sender to "unknown" and body to ""', () => {
    const m = createMessage({ id: 'x', from: '', to: 'bob', body: undefined as unknown as string, createdAt: 'T' });
    expect(m.from).toBe('unknown');
    expect(m.body).toBe('');
  });
});

describe('addMessage', () => {
  it('adds a message immutably', () => {
    const box = emptyMailbox();
    const next = addMessage(box, msg({ id: 'm1' }));
    expect(Object.keys(next.messages)).toEqual(['m1']);
    expect(Object.keys(box.messages)).toEqual([]); // input untouched
  });
  it('is idempotent — same id is a no-op (guaranteed-once delivery)', () => {
    const box = addMessage(emptyMailbox(), msg({ id: 'm1', body: 'first' }));
    const again = addMessage(box, msg({ id: 'm1', body: 'second' }));
    expect(again).toBe(box); // unchanged reference
    expect(again.messages.m1.body).toBe('first');
  });
});

describe('filterInbox', () => {
  const a = msg({ id: 'a', to: 'bob', from: 'alice', createdAt: '2026-07-12T10:00:00.000Z' });
  const b = msg({ id: 'b', to: 'BOB', from: 'carol', createdAt: '2026-07-12T11:00:00.000Z' });
  const c = msg({ id: 'c', to: 'dave', from: 'alice', createdAt: '2026-07-12T12:00:00.000Z' });
  const bc = msg({ id: 'bc', to: BROADCAST, from: 'carol', createdAt: '2026-07-12T09:00:00.000Z' });
  const box = boxOf(a, b, c, bc);

  it('matches a recipient case-insensitively and includes broadcasts, excludes others', () => {
    const inbox = filterInbox(box, { to: 'bob' });
    expect(inbox.map((m) => m.id)).toEqual(['b', 'a', 'bc']); // newest-first; dave excluded; broadcast included
  });
  it('filters by sender', () => {
    expect(filterInbox(box, { from: 'alice' }).map((m) => m.id)).toEqual(['c', 'a']);
  });
  it('filters unread only', () => {
    const withRead = boxOf(msg({ id: 'a', read: true }), msg({ id: 'b', createdAt: '2026-07-12T11:00:00.000Z' }));
    expect(filterInbox(withRead, { unreadOnly: true }).map((m) => m.id)).toEqual(['b']);
  });
  it('filters strictly after `since`', () => {
    expect(filterInbox(box, { since: '2026-07-12T10:00:00.000Z' }).map((m) => m.id)).toEqual(['c', 'b']);
  });
  it('returns every message sorted newest-first when unfiltered', () => {
    expect(filterInbox(box).map((m) => m.id)).toEqual(['c', 'b', 'a', 'bc']);
  });
});

describe('unreadCount', () => {
  it('counts unread for a recipient including broadcasts', () => {
    const box = boxOf(
      msg({ id: 'a', to: 'bob', read: false }),
      msg({ id: 'b', to: 'bob', read: true }),
      msg({ id: 'c', to: BROADCAST, read: false }),
      msg({ id: 'd', to: 'eve', read: false }),
    );
    expect(unreadCount(box, 'bob')).toBe(2); // a + broadcast c; not b (read), not d (eve)
  });
});

describe('markRead', () => {
  it('flips unread→read and reports the count, immutably', () => {
    const box = boxOf(msg({ id: 'a', read: false }), msg({ id: 'b', read: false }));
    const { box: next, marked } = markRead(box, ['a']);
    expect(marked).toBe(1);
    expect(next.messages.a.read).toBe(true);
    expect(next.messages.b.read).toBe(false);
    expect(box.messages.a.read).toBe(false); // original untouched
  });
  it('does not recount already-read ids and is a no-op reference when nothing changes', () => {
    const box = boxOf(msg({ id: 'a', read: true }));
    const { box: next, marked } = markRead(box, ['a', 'missing']);
    expect(marked).toBe(0);
    expect(next).toBe(box);
  });
});

describe('pruneMailbox', () => {
  const now = Date.parse('2026-07-12T12:00:00.000Z');
  it('drops read messages older than maxAge but keeps unread of any age', () => {
    const box = boxOf(
      msg({ id: 'oldRead', read: true, createdAt: '2026-07-01T00:00:00.000Z' }),
      msg({ id: 'oldUnread', read: false, createdAt: '2026-07-01T00:00:00.000Z' }),
      msg({ id: 'newRead', read: true, createdAt: '2026-07-12T11:59:00.000Z' }),
    );
    const pruned = pruneMailbox(box, { maxAgeMs: 24 * 3600 * 1000, nowMs: now });
    expect(Object.keys(pruned.messages).sort()).toEqual(['newRead', 'oldUnread']);
  });
  it('enforces maxCount by dropping oldest read first, never unread', () => {
    const box = boxOf(
      msg({ id: 'r1', read: true, createdAt: '2026-07-10T00:00:00.000Z' }),
      msg({ id: 'r2', read: true, createdAt: '2026-07-11T00:00:00.000Z' }),
      msg({ id: 'u1', read: false, createdAt: '2026-07-01T00:00:00.000Z' }),
    );
    const pruned = pruneMailbox(box, { maxCount: 2, nowMs: now });
    // r1 (oldest read) dropped; u1 kept despite being oldest overall (unread never dropped)
    expect(Object.keys(pruned.messages).sort()).toEqual(['r2', 'u1']);
  });
});
