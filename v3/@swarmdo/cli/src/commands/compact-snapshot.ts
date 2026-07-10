/**
 * `swarmdo compact-snapshot` — capture / restore a compaction-survival digest.
 *
 *   swarmdo compact-snapshot write   # snapshot working state (call on PreCompact)
 *   swarmdo compact-snapshot read    # print the digest, then consume it (first
 *                                    # prompt after compaction re-injects it)
 *   swarmdo compact-snapshot read --keep   # print without consuming
 *
 * The digest (recently edited files, uncommitted changes, branch) lets an agent
 * re-ground after context compaction instead of re-exploring. The engine is
 * pure + tested (../compact-snapshot/compact-snapshot.ts); this wrapper does the
 * fs read (edit ledger), git calls, and one-shot persistence.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  buildDigest,
  formatDigest,
  isDigestEmpty,
  type EditRecord,
} from '../compact-snapshot/compact-snapshot.js';

const DIGEST_FILE = 'compact-digest.json';
const LEDGER_FILE = 'pending-insights.jsonl';

function dataDir(root: string): string {
  return path.join(root, '.swarmdo', 'data');
}

/** Best-effort git; returns '' on any failure (not-a-repo, no git). */
function git(root: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 });
  } catch {
    return '';
  }
}

/** Read edit records from the pending-insights ledger. Tolerant of junk lines. */
function readEdits(root: string): EditRecord[] {
  const p = path.join(dataDir(root), LEDGER_FILE);
  let raw: string;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return []; }
  const out: EditRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec && rec.type === 'edit' && typeof rec.file === 'string') {
        out.push({ file: rec.file, timestamp: typeof rec.timestamp === 'number' ? rec.timestamp : 0 });
      }
    } catch { /* skip malformed line */ }
  }
  return out;
}

function doWrite(root: string): CommandResult {
  // Drop swarmdo's own state dirs — they're not the user's working set and
  // are usually gitignored anyway; filtering keeps the digest signal clean.
  const gitStatus = git(root, ['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .filter((l) => !/(^|\s|"|-> )\.(swarmdo|swarm|git)\//.test(l));
  const digest = buildDigest({
    now: Date.now(),
    edits: readEdits(root),
    gitStatus,
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() || undefined,
  });
  if (isDigestEmpty(digest)) {
    // Nothing worth restoring — remove any stale digest so a later `read` is clean.
    try { fs.rmSync(path.join(dataDir(root), DIGEST_FILE)); } catch { /* none */ }
    output.writeln('compact-snapshot: no working state to capture');
    return { success: true, exitCode: 0 };
  }
  try {
    fs.mkdirSync(dataDir(root), { recursive: true });
    fs.writeFileSync(path.join(dataDir(root), DIGEST_FILE), JSON.stringify(digest, null, 2) + '\n');
  } catch (e) {
    output.printError(`compact-snapshot: could not write digest — ${(e as Error).message}`);
    return { success: false, exitCode: 1 };
  }
  output.writeln(`compact-snapshot: captured ${digest.recentFiles.length} edited + ${digest.uncommitted.length} uncommitted`);
  return { success: true, exitCode: 0 };
}

function doRead(root: string, keep: boolean): CommandResult {
  const file = path.join(dataDir(root), DIGEST_FILE);
  let digest;
  try { digest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { success: true, exitCode: 0 }; } // no digest → nothing to inject
  const text = formatDigest(digest, Date.now());
  if (text) process.stdout.write(text + '\n');
  if (!keep) { try { fs.rmSync(file); } catch { /* already gone */ } } // consume-once
  return { success: true, exitCode: 0 };
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const mode = (ctx.args[0] ?? 'read').toLowerCase();
  if (mode === 'write') return doWrite(root);
  if (mode === 'read') return doRead(root, ctx.flags.keep === true);
  output.printError(`compact-snapshot: unknown mode "${mode}" (use write | read)`);
  return { success: false, exitCode: 1 };
}

export const compactSnapshotCommand: Command = {
  name: 'compact-snapshot',
  description: 'Capture/restore a working-state digest that survives context compaction — recent edits, uncommitted changes, branch — so an agent re-grounds instead of re-exploring',
  options: [
    { name: 'keep', description: 'on read, print the digest without consuming it', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo compact-snapshot write', description: 'Snapshot working state (wire to a PreCompact hook)' },
    { command: 'swarmdo compact-snapshot read', description: 'Print + consume the digest (wire to the first post-compaction prompt)' },
  ],
  action: run,
};

export default compactSnapshotCommand;
