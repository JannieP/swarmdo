/**
 * comms.ts — `swarmdo comms` — a cross-session agent mailbox (#44).
 *
 *   swarmdo comms send -t <session> -m "<message>"   leave a message for a session
 *   swarmdo comms inbox [-t <self>] [-u]              list your messages (newest first)
 *   swarmdo comms read <id>                           show a full message + mark it read
 *
 * Any Claude Code session on the same repo shares `.swarmdo/comms/store.json`, so
 * one session can message another by name ("multiplayer swarms"). Address `all`
 * to broadcast. The message model, filtering, and retention live in the pure
 * comms/mailbox.ts engine; this layer is fs persistence + presentation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  emptyMailbox,
  createMessage,
  addMessage,
  filterInbox,
  unreadCount,
  markRead,
  pruneMailbox,
  renderInboxContext,
  type Mailbox,
} from '../comms/mailbox.js';

const STORE_REL = join('.swarmdo', 'comms', 'store.json');
// Retention applied opportunistically on send: keep read messages ≤30d, ≤500 total.
const RETENTION = { maxAgeMs: 30 * 24 * 3600 * 1000, maxCount: 500 };

function storePath(cwd: string): string {
  return join(cwd, STORE_REL);
}

function loadMailbox(cwd: string): Mailbox {
  try {
    const p = storePath(cwd);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as Mailbox;
  } catch {
    /* corrupt/missing → fresh mailbox */
  }
  return emptyMailbox();
}

function saveMailbox(cwd: string, box: Mailbox): void {
  const p = storePath(cwd);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(box, null, 2) + '\n', 'utf-8');
}

/** This session's name: --from/-t override → SWARMDO_SESSION → hostname. */
function resolveSelf(flag?: unknown): string {
  const f = typeof flag === 'string' ? flag.trim() : '';
  return f || (process.env.SWARMDO_SESSION || '').trim() || hostname() || 'me';
}

function newId(): string {
  return 'msg_' + randomBytes(6).toString('hex');
}

/** Compact relative age, e.g. "3m", "2h", "5d", or "now". */
function relAge(iso: string, nowMs: number): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const sendCommand: Command = {
  name: 'send',
  description: 'Send a message to another session (address "all" to broadcast)',
  options: [
    { name: 'to', short: 't', description: 'Recipient session name (or "all")', type: 'string' },
    { name: 'message', short: 'm', description: 'Message body', type: 'string' },
    { name: 'subject', short: 's', description: 'Subject line', type: 'string' },
    { name: 'from', short: 'f', description: 'Sender name (default: this session)', type: 'string' },
    { name: 'json', description: 'Machine-readable output', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo comms send -t reviewer -m "auth PR is ready" -s "PR #42"', description: 'Message the "reviewer" session' },
    { command: 'swarmdo comms send -t all -m "rebasing main in 5min"', description: 'Broadcast to every session' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const to = ((ctx.flags.to as string) || ctx.args[0] || '').trim();
    const body = ((ctx.flags.message as string) ?? ctx.args[1] ?? '').toString();
    if (!to) {
      output.printError('Recipient required. Use --to/-t <session> (or "all").');
      return { success: false, exitCode: 1 };
    }
    if (!body.trim()) {
      output.printError('Message body required. Use --message/-m "<text>".');
      return { success: false, exitCode: 1 };
    }
    const from = resolveSelf(ctx.flags.from);
    const msg = createMessage({
      id: newId(),
      from,
      to,
      subject: ctx.flags.subject as string | undefined,
      body,
      createdAt: new Date().toISOString(),
    });
    let box = addMessage(loadMailbox(cwd), msg);
    box = pruneMailbox(box, { ...RETENTION, nowMs: Date.now() });
    saveMailbox(cwd, box);

    if (ctx.flags.json === true) {
      output.printJson({ sent: true, id: msg.id, to: msg.to, from: msg.from });
      return { success: true, data: { id: msg.id } };
    }
    output.printSuccess(`Sent to ${output.highlight(msg.to)} — id ${output.dim(msg.id)}`);
    return { success: true, data: { id: msg.id } };
  },
};

const inboxCommand: Command = {
  name: 'inbox',
  aliases: ['list'],
  description: 'List messages addressed to you (newest first)',
  options: [
    { name: 'to', short: 't', description: 'Whose inbox (default: this session)', type: 'string' },
    { name: 'from', short: 'f', description: 'Only messages from this sender', type: 'string' },
    { name: 'unread', short: 'u', description: 'Only unread messages', type: 'boolean' },
    { name: 'since', description: 'Only messages after this ISO timestamp', type: 'string' },
    { name: 'mark-read', description: 'Mark all shown messages as read', type: 'boolean' },
    { name: 'hook', description: 'Emit unread messages as UserPromptSubmit additionalContext JSON, then mark them read (for hook delivery)', type: 'boolean' },
    { name: 'json', description: 'Machine-readable output', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo comms inbox', description: 'Your unread + read messages' },
    { command: 'swarmdo comms inbox -u --mark-read', description: 'Show unread, then mark them read' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const self = resolveSelf(ctx.flags.to);

    // --hook: delivery path. Emit unread mail as UserPromptSubmit additionalContext
    // and mark it read so it surfaces once, without polling. Hook-safe: NEVER
    // errors (that would break the prompt) and stays silent when there's no mail.
    if (ctx.flags.hook === true) {
      try {
        if (process.env.SWARMDO_COMMS_DISABLE === '1') return { success: true };
        const box = loadMailbox(cwd);
        const unread = filterInbox(box, { to: self, unreadOnly: true });
        if (unread.length > 0) {
          const block = renderInboxContext(unread);
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: block },
          }) + '\n');
          const { box: next, marked } = markRead(box, unread.map((m) => m.id));
          if (marked > 0) saveMailbox(cwd, next);
        }
      } catch {
        /* never fail a hook */
      }
      return { success: true };
    }

    const box = loadMailbox(cwd);
    const inbox = filterInbox(box, {
      to: self,
      from: ctx.flags.from as string | undefined,
      unreadOnly: ctx.flags.unread === true,
      since: ctx.flags.since as string | undefined,
    });
    const now = Date.now();

    if (ctx.flags.json === true) {
      output.printJson({ to: self, unread: unreadCount(box, self), messages: inbox });
    } else if (inbox.length === 0) {
      output.printInfo(`No messages for ${output.highlight(self)}.`);
    } else {
      output.writeln(output.bold(`Inbox: ${self}`) + output.dim(`  (${unreadCount(box, self)} unread)`));
      output.printTable({
        columns: [
          { key: 'flag', header: '', width: 2 },
          { key: 'id', header: 'ID', width: 14 },
          { key: 'from', header: 'From', width: 16 },
          { key: 'subject', header: 'Subject', width: 34 },
          { key: 'age', header: 'Age', width: 6, align: 'right' },
        ],
        data: inbox.map((m) => ({ flag: m.read ? ' ' : '●', id: m.id, from: m.from, subject: m.subject, age: relAge(m.createdAt, now) })),
      });
      output.writeln(output.dim('● = unread · read a message:  swarmdo comms read <id>'));
    }

    if (ctx.flags['mark-read'] === true && inbox.length > 0) {
      const { box: next, marked } = markRead(box, inbox.map((m) => m.id));
      if (marked > 0) saveMailbox(cwd, next);
      if (ctx.flags.json !== true) output.printInfo(`Marked ${marked} read.`);
    }
    return { success: true, data: { to: self, count: inbox.length } };
  },
};

const readCommand: Command = {
  name: 'read',
  description: 'Show a full message and mark it read',
  options: [{ name: 'json', description: 'Machine-readable output', type: 'boolean' }],
  examples: [{ command: 'swarmdo comms read msg_ab12cd34ef56', description: 'Open a message by id' }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const id = (ctx.args[0] || '').trim();
    if (!id) {
      output.printError('Message id required:  swarmdo comms read <id>');
      return { success: false, exitCode: 1 };
    }
    const box = loadMailbox(cwd);
    const m = box.messages[id];
    if (!m) {
      output.printError(`No message with id ${id}.`);
      return { success: false, exitCode: 1 };
    }
    const { box: next, marked } = markRead(box, [id]);
    if (marked > 0) saveMailbox(cwd, next);

    if (ctx.flags.json === true) {
      output.printJson({ ...m, read: true });
      return { success: true, data: { id } };
    }
    output.writeln();
    output.printList([
      `${output.bold('From')}:    ${m.from}`,
      `${output.bold('To')}:      ${m.to}`,
      `${output.bold('Subject')}: ${m.subject}`,
      `${output.bold('Sent')}:    ${m.createdAt}`,
    ]);
    output.writeln();
    output.writeln(m.body);
    output.writeln();
    return { success: true, data: { id } };
  },
};

export const commsCommand: Command = {
  name: 'comms',
  aliases: ['mailbox'],
  description: 'Cross-session agent mailbox — message another session by name',
  subcommands: [sendCommand, inboxCommand, readCommand],
  options: [],
  examples: [
    { command: 'swarmdo comms send -t reviewer -m "PR ready"', description: 'Send a message' },
    { command: 'swarmdo comms inbox -u', description: 'List your unread messages' },
    { command: 'swarmdo comms read <id>', description: 'Open a message' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const self = resolveSelf();
    const box = loadMailbox(cwd);
    const unread = unreadCount(box, self);
    output.writeln();
    output.writeln(output.bold('Cross-session agent mailbox'));
    output.writeln();
    output.writeln(`You are ${output.highlight(self)} — ${unread} unread message${unread === 1 ? '' : 's'}.`);
    output.writeln();
    output.writeln('Usage: swarmdo comms <send|inbox|read> [options]');
    output.printList([
      `${output.highlight('send')}   - Send a message (\`-t <session> -m "…"\`, \`-t all\` to broadcast)`,
      `${output.highlight('inbox')}  - List your messages (\`-u\` unread, \`--mark-read\`)`,
      `${output.highlight('read')}   - Show a full message by id and mark it read`,
    ]);
    output.writeln();
    output.writeln(output.dim('Sessions on the same repo share .swarmdo/comms/. Name yourself with $SWARMDO_SESSION.'));
    return { success: true, data: { self, unread } };
  },
};

export default commsCommand;
