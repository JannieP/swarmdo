/**
 * notify.ts — real desktop notifications for `swarmdo hooks notify`.
 *
 * The hook previously only echoed to the console + memory. The popular Claude
 * Code pattern is "ping me when the task/session finishes" — wire a Stop or
 * Notification hook to `swarmdo hooks notify --desktop -m "done"` and get an
 * OS-native toast. Delivery is via execFile of a fixed binary (osascript on
 * macOS, notify-send on Linux) — argv form, no shell, no network sink — so the
 * command-building is pure and unit-tested and there is nothing to inject risk.
 */

import { execFile } from 'node:child_process';

export type NotifyLevel = 'info' | 'warn' | 'error';
export interface NotifyMessage {
  title: string;
  message: string;
  level: NotifyLevel;
}

/** Escape a string for embedding inside an AppleScript double-quoted literal
 * (backslash and quote); newlines/tabs collapse to spaces (AppleScript string
 * literals can't span lines). */
export function escapeAppleScript(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Build the argv for an OS-native desktop notification, or null if the
 * platform is unsupported (Windows/other). Pure — takes the platform. */
export function desktopNotifyCommand(platform: NodeJS.Platform, msg: NotifyMessage): { cmd: string; args: string[] } | null {
  const oneLine = msg.message.replace(/\s+/g, ' ').trim();
  const title = msg.title.replace(/\s+/g, ' ').trim() || 'swarmdo';
  if (platform === 'darwin') {
    const script = `display notification "${escapeAppleScript(oneLine)}" with title "${escapeAppleScript(title)}"`;
    return { cmd: 'osascript', args: ['-e', script] };
  }
  if (platform === 'linux') {
    const urgency = msg.level === 'error' ? 'critical' : msg.level === 'warn' ? 'normal' : 'low';
    return { cmd: 'notify-send', args: ['-u', urgency, title, oneLine] };
  }
  return null;
}

export interface SendDeps {
  platform: NodeJS.Platform;
  /** run cmd with argv; resolve on success, reject on failure */
  runCommand: (cmd: string, args: string[]) => Promise<void>;
}
export interface SendResult {
  delivered: boolean;
  /** why it wasn't delivered (unsupported platform, or the command failed) */
  reason?: string;
}

/** Fire a desktop notification via the injected runner. Never throws — a
 * failed notification must not break the hook that called it. */
export async function sendDesktopNotification(msg: NotifyMessage, deps: SendDeps): Promise<SendResult> {
  const cmd = desktopNotifyCommand(deps.platform, msg);
  if (!cmd) return { delivered: false, reason: `desktop notifications not supported on ${deps.platform}` };
  try {
    await deps.runCommand(cmd.cmd, cmd.args);
    return { delivered: true };
  } catch (e) {
    return { delivered: false, reason: (e as Error).message };
  }
}

/** Default runner: execFile the binary (argv form, no shell), short timeout so
 * a missing/hanging notifier can't stall the caller. */
export function defaultRunCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (err) => (err ? reject(err) : resolve()));
  });
}

export function makeDefaultDeps(): SendDeps {
  return { platform: process.platform, runCommand: defaultRunCommand };
}
