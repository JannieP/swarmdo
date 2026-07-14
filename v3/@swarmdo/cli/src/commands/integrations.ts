/**
 * integrations.ts — `swarmdo integrations` (alias `integrate`)
 *
 * Wire swarmdo into agent CLIs beyond Claude Code: Codex CLI, GitHub
 * Copilot CLI, pi. Dry-run by default; `--apply` writes. All merges are
 * additive + idempotent (pure engine in ../integrations/integrations.js).
 *
 * NEVER writes `.claude/**`, `.mcp.json`, or `CLAUDE.md` — the Claude Code
 * integration is owned by `swarmdo init` and only read for status.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  mergeCodexToml,
  mergeCopilotMcpJson,
  crossAgentAgentsMd,
  copilotInstructionsMd,
  evaluateStatus,
  INSTALLABLE,
  type IntegrationTarget,
} from '../integrations/integrations.js';
import {
  SKILL_TARGETS,
  SKILLS_MANIFEST,
  curateSkills,
  parseManifestSkills,
  planSkillSync,
  planSkillRemove,
  skillTargetRoot,
  type SkillTarget,
} from '../integrations/skills-sync.js';

function readOrNull(p: string): string | null {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

interface PlannedWrite { file: string; kind: 'create' | 'update'; content: string }

// ── skills sync (cross-agent SKILL.md deployment) ──────────────────────────
// The packaged `.claude/skills` is the READ source; targets are the global
// cross-agent skill roots (~/.agents, ~/.codex, ~/.pi). Resolution mirrors
// init/executor.ts findSourceDir + efficiency.ts (dist/src/commands → up 3).
function resolveSkillsSourceDir(cwd: string): string | null {
  const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const candidates = [
    path.join(pkgRoot, '.claude', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    path.join(cwd, '..', '.claude', 'skills'),
  ];
  for (const c of candidates) {
    try { if (fs.statSync(c).isDirectory()) return c; } catch { /* try next */ }
  }
  return null;
}

function pkgVersion(): string {
  try {
    const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    return String(JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version ?? 'unknown');
  } catch { return 'unknown'; }
}

/** Immediate child dirs of the source that carry a SKILL.md. */
function listAvailableSkills(sourceDir: string): string[] {
  try {
    return fs.readdirSync(sourceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(sourceDir, e.name, 'SKILL.md')))
      .map((e) => e.name);
  } catch { return []; }
}

/** Parse `--targets a,b,c` → validated targets, or all three when unset.
 * Returns null on an unknown target name so the caller can error cleanly. */
function parseSkillTargets(raw: unknown): SkillTarget[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return [...SKILL_TARGETS];
  const out: SkillTarget[] = [];
  for (const w of raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (!(SKILL_TARGETS as string[]).includes(w)) return null;
    if (!out.includes(w as SkillTarget)) out.push(w as SkillTarget);
  }
  return out.length ? out : [...SKILL_TARGETS];
}

/** Belt-and-suspenders: the engine only ever emits ~/.agents|.codex|.pi paths,
 * but never let a bug write under a Claude Code surface. */
function firstClaudePath(paths: string[]): string | undefined {
  return paths.find((p) => p.split(path.sep).includes('.claude'));
}

function currentSkillManifests(home: string, targets: SkillTarget[]): { target: SkillTarget; slugs: string[] }[] {
  return targets.map((target) => ({
    target,
    slugs: parseManifestSkills(readOrNull(path.join(skillTargetRoot(home, target), SKILLS_MANIFEST))),
  }));
}

function runSkillsSync(ctx: CommandContext, cwd: string, home: string): CommandResult {
  const targets = parseSkillTargets(ctx.flags.targets);
  if (!targets) {
    output.printError(`unknown --targets value (expected a comma list of ${SKILL_TARGETS.join('|')})`);
    return { success: false, exitCode: 1 };
  }
  const json = ctx.flags.json === true;
  const apply = ctx.flags.apply === true;
  const installed = currentSkillManifests(home, targets);

  // ── uninstall ──
  if (ctx.flags.remove === true) {
    const plan = planSkillRemove({ home, installed });
    const bad = firstClaudePath(plan.dirs.map((d) => d.path));
    if (bad) { output.printError(`refusing to touch a Claude Code surface: ${bad}`); return { success: false, exitCode: 1 }; }
    if (json) { output.printJson({ mode: 'remove', dryRun: !apply, dirs: plan.dirs.map((d) => d.path) }); return { success: true }; }
    output.writeln(output.bold('▸ skills — remove'));
    if (plan.dirs.length === 0) { output.writeln(output.dim('    nothing installed')); return { success: true }; }
    for (const d of plan.dirs) output.writeln(`    - ${d.path}`);
    if (!apply) {
      output.writeln('');
      output.writeln(output.dim(`dry run — ${plan.dirs.length} dir(s) would be removed; re-run with --apply`));
      return { success: true, data: { dryRun: true } };
    }
    let n = 0;
    for (const d of plan.dirs) { try { fs.rmSync(d.path, { recursive: true, force: true }); n++; } catch { /* ignore */ } }
    for (const m of plan.manifests) { try { fs.rmSync(m.path, { force: true }); } catch { /* ignore */ } }
    output.printSuccess(`removed ${n} skill dir(s) across ${targets.length} target(s)`);
    return { success: true, data: { removed: n } };
  }

  // ── sync ──
  const sourceDir = resolveSkillsSourceDir(cwd);
  if (!sourceDir) { output.printError('could not locate the packaged .claude/skills source'); return { success: false, exitCode: 1 }; }
  const curated = curateSkills(listAvailableSkills(sourceDir));
  if (curated.length === 0) { output.printError('no curated skills found to sync'); return { success: false, exitCode: 1 }; }
  const skills = curated.map((slug) => ({ slug, skillMd: fs.readFileSync(path.join(sourceDir, slug, 'SKILL.md'), 'utf8') }));
  const plan = planSkillSync({ home, targets, skills, version: pkgVersion(), previous: installed });
  const bad = firstClaudePath([...plan.writes, ...plan.manifests, ...plan.stale].map((w) => w.path));
  if (bad) { output.printError(`refusing to touch a Claude Code surface: ${bad}`); return { success: false, exitCode: 1 }; }

  if (json) {
    output.printJson({
      mode: 'sync', dryRun: !apply, targets, skills: curated,
      roots: targets.map((t) => skillTargetRoot(home, t)), stale: plan.stale.map((s) => s.path),
    });
    return { success: true };
  }

  output.writeln(output.bold(`▸ skills — ${curated.length} curated → ${targets.join(', ')}`));
  for (const t of targets) output.writeln(output.dim(`    ${skillTargetRoot(home, t)}`));
  for (const s of plan.stale) output.writeln(output.dim(`    - prune ${s.path} (no longer curated)`));
  if (!apply) {
    output.writeln('');
    output.writeln(output.dim(`dry run — ${plan.writes.length} skill file(s) across ${targets.length} target(s); re-run with --apply`));
    output.writeln(output.dim('cross-agent skills auto-activate by description (Codex, pi, Copilot read ~/.agents/skills) — no slash command needed'));
    return { success: true, data: { dryRun: true, writes: plan.writes.length } };
  }
  for (const w of plan.writes) { fs.mkdirSync(path.dirname(w.path), { recursive: true }); fs.writeFileSync(w.path, w.content, 'utf8'); }
  for (const s of plan.stale) { try { fs.rmSync(s.path, { recursive: true, force: true }); } catch { /* ignore */ } }
  for (const m of plan.manifests) { fs.mkdirSync(path.dirname(m.path), { recursive: true }); fs.writeFileSync(m.path, m.content, 'utf8'); }
  output.printSuccess(`synced ${curated.length} skill(s) to ${targets.length} target(s)${plan.stale.length ? `, pruned ${plan.stale.length}` : ''}`);
  output.writeln(output.dim('restart the target CLI(s) to pick up the new skills'));
  return { success: true, data: { synced: curated.length, targets } };
}

function planFor(target: IntegrationTarget, cwd: string, home: string): { writes: PlannedWrite[]; notes: string[] } {
  const writes: PlannedWrite[] = [];
  const notes: string[] = [];
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const ensureAgentsMd = (): void => {
    if (readOrNull(agentsPath) === null) {
      writes.push({ file: agentsPath, kind: 'create', content: crossAgentAgentsMd() });
    } else {
      notes.push('AGENTS.md already exists — left untouched (teams own their AGENTS.md)');
    }
  };
  switch (target) {
    case 'codex': {
      ensureAgentsMd();
      const tomlPath = path.join(home, '.codex', 'config.toml');
      const merged = mergeCodexToml(readOrNull(tomlPath));
      if (merged.changed) writes.push({ file: tomlPath, kind: readOrNull(tomlPath) === null ? 'create' : 'update', content: merged.content });
      else notes.push('~/.codex/config.toml already has [mcp_servers.swarmdo]');
      break;
    }
    case 'copilot': {
      ensureAgentsMd();
      const instrPath = path.join(cwd, '.github', 'copilot-instructions.md');
      if (readOrNull(instrPath) === null) writes.push({ file: instrPath, kind: 'create', content: copilotInstructionsMd() });
      else notes.push('.github/copilot-instructions.md already exists — left untouched');
      const jsonPath = path.join(home, '.copilot', 'mcp-config.json');
      const merged = mergeCopilotMcpJson(readOrNull(jsonPath));
      if (merged.changed) writes.push({ file: jsonPath, kind: readOrNull(jsonPath) === null ? 'create' : 'update', content: merged.content });
      else notes.push('~/.copilot/mcp-config.json already has the swarmdo server (or is unparseable — never clobbered)');
      break;
    }
    case 'pi': {
      ensureAgentsMd();
      notes.push('pi reads AGENTS.md natively; if your pi build supports MCP servers, point it at: npx -y swarmdo@latest mcp start');
      break;
    }
    case 'claude':
      notes.push('Claude Code integration is managed by `swarmdo init` — nothing to install here (read-only status)');
      break;
  }
  return { writes, notes };
}

export const integrationsCommand: Command = {
  name: 'integrations',
  aliases: ['integrate'],
  description: 'Wire swarmdo into other agent CLIs (codex, copilot, pi) via AGENTS.md + MCP + cross-agent skills — never touches the Claude Code surfaces',
  options: [
    { name: 'apply', type: 'boolean', description: 'write the changes (default: preview)', default: false },
    { name: 'json', type: 'boolean', description: 'machine-readable output', default: false },
    { name: 'remove', type: 'boolean', description: 'skills: uninstall the swarmdo-managed skills instead of syncing', default: false },
    { name: 'targets', type: 'string', description: 'skills: comma list of shared,codex,pi (default: all three)' },
  ],
  examples: [
    { command: 'swarmdo integrations', description: 'Status of every CLI integration' },
    { command: 'swarmdo integrations install all --apply', description: 'Wire codex + copilot + pi' },
    { command: 'swarmdo integrations install codex --apply', description: 'AGENTS.md + [mcp_servers.swarmdo] in ~/.codex/config.toml' },
    { command: 'swarmdo integrations skills', description: 'Preview the curated cross-agent skills sync (~/.agents, ~/.codex, ~/.pi)' },
    { command: 'swarmdo integrations skills --apply', description: 'Deploy ~20 curated skills to Codex + pi + the shared cross-agent dir' },
    { command: 'swarmdo integrations skills --remove --apply', description: 'Uninstall every swarmdo-managed cross-agent skill' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const home = os.homedir();
    const sub = (ctx.args[0] || 'status').toLowerCase();

    const gatherStatus = (): ReturnType<typeof evaluateStatus> => evaluateStatus({
      agentsMd: readOrNull(path.join(cwd, 'AGENTS.md')),
      codexToml: readOrNull(path.join(home, '.codex', 'config.toml')),
      copilotJson: readOrNull(path.join(home, '.copilot', 'mcp-config.json')),
      copilotInstructions: readOrNull(path.join(cwd, '.github', 'copilot-instructions.md')),
      claudeMcpJson: readOrNull(path.join(cwd, '.mcp.json')),
      claudeUserJson: readOrNull(path.join(home, '.claude.json')),
      claudeDirExists: fs.existsSync(path.join(cwd, '.claude')),
    });

    if (sub === 'status' || sub === 'list') {
      const statuses = gatherStatus();
      if (ctx.flags.json === true) { output.printJson(statuses); return { success: true, data: statuses }; }
      output.writeln(output.bold('Agent CLI integrations'));
      for (const s of statuses) {
        output.writeln(`  ${s.ok ? '◉' : '○'} ${s.target}`);
        for (const d of s.details) output.writeln(output.dim(`      ${d}`));
      }
      output.writeln(output.dim('install:  swarmdo integrations install <codex|copilot|pi|all> --apply'));
      const sk = SKILL_TARGETS.map((t) => parseManifestSkills(readOrNull(path.join(skillTargetRoot(home, t), SKILLS_MANIFEST))).length);
      output.writeln(`  ${sk.some((n) => n > 0) ? '◉' : '○'} skills (cross-agent SKILL.md)`);
      output.writeln(output.dim(`      ~/.agents ${sk[0]} · ~/.codex ${sk[1]} · ~/.pi ${sk[2]}  —  sync: swarmdo integrations skills --apply`));
      return { success: true };
    }

    if (sub === 'skills') {
      return runSkillsSync(ctx, cwd, home);
    }

    if (sub !== 'install') {
      output.printError(`unknown subcommand "${sub}" (expected status|install|skills)`);
      return { success: false, exitCode: 1 };
    }

    const rawTarget = (ctx.args[1] || '').toLowerCase();
    const targets: IntegrationTarget[] = rawTarget === 'all'
      ? INSTALLABLE
      : (INSTALLABLE as string[]).includes(rawTarget) ? [rawTarget as IntegrationTarget] : [];
    if (targets.length === 0) {
      output.printError(`install what? (${INSTALLABLE.join('|')}|all) — claude is managed by \`swarmdo init\``);
      return { success: false, exitCode: 1 };
    }

    const allWrites: PlannedWrite[] = [];
    for (const t of targets) {
      const { writes, notes } = planFor(t, cwd, home);
      output.writeln(output.bold(`▸ ${t}`));
      for (const w of writes) {
        // safety invariant: never under .claude/, never .mcp.json, never CLAUDE.md
        const rel = path.relative(cwd, w.file);
        if (rel.startsWith('.claude') || rel === '.mcp.json' || rel === 'CLAUDE.md') {
          output.printError(`refusing to touch Claude Code surface: ${w.file}`);
          return { success: false, exitCode: 1 };
        }
        output.writeln(`    ${w.kind === 'create' ? '+' : '~'} ${w.file}`);
        allWrites.push(w);
      }
      for (const n of notes) output.writeln(output.dim(`    · ${n}`));
    }

    if (ctx.flags.apply !== true) {
      output.writeln('');
      output.writeln(output.dim(`dry run — ${allWrites.length} write(s) planned; re-run with --apply`));
      return { success: true, data: { dryRun: true, writes: allWrites.map((w) => w.file) } };
    }
    for (const w of allWrites) {
      fs.mkdirSync(path.dirname(w.file), { recursive: true });
      fs.writeFileSync(w.file, w.content, 'utf8');
    }
    output.printSuccess(`applied ${allWrites.length} write(s)`);
    output.writeln(output.dim('restart the target CLI(s) to pick up MCP config changes'));
    output.writeln(output.dim('tip: `swarmdo integrations skills --apply` also deploys ~20 curated skills to these CLIs'));
    return { success: true, data: { applied: allWrites.map((w) => w.file) } };
  },
};

export default integrationsCommand;
