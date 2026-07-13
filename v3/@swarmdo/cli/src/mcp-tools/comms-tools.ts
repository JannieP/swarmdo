/**
 * Comms MCP Tools — cross-session agent mailbox (#44).
 *
 * Thin wrappers over the pure comms/mailbox.ts engine + comms/store.ts fs
 * persistence, so an in-Claude session can message another session (or read its
 * own inbox) without shelling out. Same `.swarmdo/comms/store.json` the
 * `swarmdo comms` CLI uses.
 */

import { type MCPTool, getProjectCwd } from './types.js';
import { createMessage, addMessage, filterInbox, markRead, pruneMailbox } from '../comms/mailbox.js';
import { loadMailbox, saveMailbox, resolveSelf, newMessageId, RETENTION } from '../comms/store.js';

export const commsTools: MCPTool[] = [
  {
    name: 'comms_send',
    description:
      'Send a message to another agent session — Claude Code, Codex, Copilot, pi, or any tool on the same repo (a cross-session/cross-tool mailbox). Address "all" to broadcast to every session. Use for multi-agent "multiplayer" coordination; delivery is via a shared file, not the network.',
    category: 'comms',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient session name, or "all" to broadcast' },
        message: { type: 'string', description: 'Message body' },
        subject: { type: 'string', description: 'Optional subject line' },
        from: { type: 'string', description: 'Sender name. Default: this session ($SWARMDO_SESSION, else $SWARMDO_AGENT, else hostname). Non-Claude agents should pass this (or export $SWARMDO_AGENT) so replies address them, not the shared hostname.' },
      },
      required: ['to', 'message'],
    },
    handler: async (input) => {
      const to = String(input.to ?? '').trim();
      const body = String(input.message ?? '');
      if (!to) return { success: false, error: 'recipient (to) is required' };
      if (!body.trim()) return { success: false, error: 'message is required' };

      const cwd = getProjectCwd();
      const from = resolveSelf(input.from);
      const msg = createMessage({
        id: newMessageId(),
        from,
        to,
        subject: input.subject as string | undefined,
        body,
        createdAt: new Date().toISOString(),
      });
      let box = addMessage(loadMailbox(cwd), msg);
      box = pruneMailbox(box, { ...RETENTION, nowMs: Date.now() });
      saveMailbox(cwd, box);
      return { success: true, id: msg.id, to: msg.to, from: msg.from, subject: msg.subject };
    },
  },
  {
    name: 'comms_inbox',
    description:
      'List messages other agent sessions (Claude Code, Codex, Copilot, pi, …) have sent to this one — a cross-session/cross-tool mailbox — newest first. Includes "all" broadcasts. Set markRead to acknowledge them.',
    category: 'comms',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Whose inbox (default: this session — $SWARMDO_SESSION, else $SWARMDO_AGENT, else hostname)' },
        unreadOnly: { type: 'boolean', description: 'Only unread messages' },
        from: { type: 'string', description: 'Only messages from this sender' },
        since: { type: 'string', description: 'Only messages after this ISO-8601 timestamp' },
        markRead: { type: 'boolean', description: 'Mark the returned messages as read' },
      },
    },
    handler: async (input) => {
      const cwd = getProjectCwd();
      const self = resolveSelf(input.to);
      let box = loadMailbox(cwd);
      const messages = filterInbox(box, {
        to: self,
        unreadOnly: input.unreadOnly === true,
        from: input.from as string | undefined,
        since: input.since as string | undefined,
      });
      let marked = 0;
      if (input.markRead === true && messages.length > 0) {
        const res = markRead(box, messages.map((m) => m.id));
        if (res.marked > 0) saveMailbox(cwd, res.box);
        box = res.box;
        marked = res.marked;
      }
      return {
        success: true,
        to: self,
        count: messages.length,
        unread: filterInbox(box, { to: self, unreadOnly: true }).length,
        marked,
        messages,
      };
    },
  },
];
