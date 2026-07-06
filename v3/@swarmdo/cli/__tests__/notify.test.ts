import { describe, it, expect } from 'vitest';
import {
  escapeAppleScript,
  desktopNotifyCommand,
  sendDesktopNotification,
  type NotifyMessage,
  type SendDeps,
} from '../src/notify/notify.ts';

const msg = (over: Partial<NotifyMessage> = {}): NotifyMessage => ({ title: 'swarmdo', message: 'done', level: 'info', ...over });

describe('notify: escapeAppleScript', () => {
  it('escapes quotes and backslashes', () => {
    expect(escapeAppleScript('say "hi"')).toBe('say \\"hi\\"');
    expect(escapeAppleScript('a\\b')).toBe('a\\\\b');
  });
  it('collapses newlines/tabs to spaces', () => {
    expect(escapeAppleScript('line1\nline2\tend')).toBe('line1 line2 end');
  });
});

describe('notify: desktopNotifyCommand', () => {
  it('builds an osascript command on macOS', () => {
    const cmd = desktopNotifyCommand('darwin', msg({ message: 'build ok', title: 'CI' }))!;
    expect(cmd.cmd).toBe('osascript');
    expect(cmd.args[0]).toBe('-e');
    expect(cmd.args[1]).toBe('display notification "build ok" with title "CI"');
  });
  it('escapes quotes inside the AppleScript', () => {
    const cmd = desktopNotifyCommand('darwin', msg({ message: 'say "hi"' }))!;
    expect(cmd.args[1]).toContain('\\"hi\\"');
  });
  it('builds a notify-send command on Linux with level→urgency', () => {
    expect(desktopNotifyCommand('linux', msg({ level: 'error', message: 'boom' }))!.args).toEqual(['-u', 'critical', 'swarmdo', 'boom']);
    expect(desktopNotifyCommand('linux', msg({ level: 'warn' }))!.args[1]).toBe('normal');
    expect(desktopNotifyCommand('linux', msg({ level: 'info' }))!.args[1]).toBe('low');
  });
  it('collapses multi-line messages to one line', () => {
    expect(desktopNotifyCommand('linux', msg({ message: 'a\n\nb   c' }))!.args[3]).toBe('a b c');
  });
  it('defaults an empty title to swarmdo', () => {
    expect(desktopNotifyCommand('linux', msg({ title: '   ' }))!.args[2]).toBe('swarmdo');
  });
  it('returns null on unsupported platforms', () => {
    expect(desktopNotifyCommand('win32', msg())).toBeNull();
    expect(desktopNotifyCommand('aix', msg())).toBeNull();
  });
});

describe('notify: sendDesktopNotification', () => {
  function deps(platform: NodeJS.Platform, runCommand: SendDeps['runCommand']): SendDeps {
    return { platform, runCommand };
  }

  it('delivers when the runner succeeds and passes the right argv', async () => {
    const calls: Array<[string, string[]]> = [];
    const res = await sendDesktopNotification(msg({ message: 'ok' }), deps('darwin', async (c, a) => { calls.push([c, a]); }));
    expect(res.delivered).toBe(true);
    expect(calls[0][0]).toBe('osascript');
  });

  it('reports unsupported platform without running anything', async () => {
    let ran = false;
    const res = await sendDesktopNotification(msg(), deps('win32', async () => { ran = true; }));
    expect(res.delivered).toBe(false);
    expect(res.reason).toMatch(/not supported on win32/);
    expect(ran).toBe(false);
  });

  it('never throws — a failed notifier is reported, not thrown', async () => {
    const res = await sendDesktopNotification(msg(), deps('linux', async () => { throw new Error('notify-send: not found'); }));
    expect(res.delivered).toBe(false);
    expect(res.reason).toMatch(/not found/);
  });
});
