/**
 * skills-sync.ts — sync curated swarmdo skills into the cross-agent skill dirs.
 *
 * SKILL.md is a universal cross-agent standard (2026): Codex, pi, Copilot, and
 * Cursor all read skills from a `<dir>/SKILL.md` layout with `name`+`description`
 * YAML frontmatter. swarmdo already ships its surface as `sdo-*` skills, so the
 * "integration" for these tools is a near-passthrough copy — no per-tool format
 * conversion, no deprecated Codex `~/.codex/prompts` (removed in favour of skills)
 * and no Copilot slash-command dir (Copilot CLI has none).
 *
 * Targets (GLOBAL scope — every project the user opens):
 *   shared → ~/.agents/skills/     the cross-client convention (Codex, pi,
 *                                  Copilot, Cursor all scan it)
 *   codex  → ~/.codex/skills/      Codex's own global dir (guaranteed pickup)
 *   pi     → ~/.pi/agent/skills/   pi's own global dir (guaranteed pickup)
 *
 * Every function here is PURE (data in → data out) so the whole surface is
 * unit-testable and re-running the sync never duplicates or clobbers. All fs
 * lives in the command layer (commands/integrations.ts).
 *
 * INVARIANT (do-not-break-Claude): nothing here targets `.claude/**` — the
 * Claude Code skill surface is owned by `swarmdo init`/`efficiency` and is only
 * ever the READ source, never a write target.
 */

import * as path from 'node:path';

export type SkillTarget = 'shared' | 'codex' | 'pi';
export const SKILL_TARGETS: SkillTarget[] = ['shared', 'codex', 'pi'];

/**
 * Curated essentials — the ~20 skills worth exposing to non-Claude agents.
 * An explicit allowlist (not "everything minus internal") so the cross-agent
 * surface stays a deliberate, stable set. Excludes: the swarmdo-internal
 * `sdo-v3-*` build skills, `sdo-dual-mode` (no SKILL.md), and
 * `sdo-caveman-compress` (Claude-slash-command-bound; bundles python bytecode).
 */
export const CURATED_SKILLS: string[] = [
  // memory + intelligence (swarmdo's core differentiator)
  'sdo-agentdb-memory-patterns',
  'sdo-agentdb-vector-search',
  'sdo-agentdb-optimization',
  'sdo-reasoningbank-intelligence',
  // swarm + coordination
  'sdo-swarm-orchestration',
  'sdo-swarm-advanced',
  'sdo-hive-mind-advanced',
  'sdo-hooks-automation',
  // github
  'sdo-github-code-review',
  'sdo-github-workflow-automation',
  'sdo-github-multi-repo',
  'sdo-github-release-management',
  'sdo-github-project-management',
  // methodology + quality
  'sdo-sparc-methodology',
  'sdo-verification-quality',
  'sdo-pair-programming',
  'sdo-performance-analysis',
  // tooling
  'sdo-stream-chain',
  'sdo-browser',
  'sdo-agentic-jujutsu',
];

/** Manifest dropped at each target root so `--remove`/reconcile only ever
 * touches the exact `sdo-*` dirs swarmdo installed — never a user's own or
 * another tool's skills. */
export const SKILLS_MANIFEST = '.swarmdo-skills.json';

/**
 * Intersect the curated allowlist with what's actually on disk, preserving
 * curated order. Absent skills are silently skipped so a trimmed package (the
 * standalone build ships a subset) never errors.
 */
export function curateSkills(available: readonly string[]): string[] {
  const have = new Set(available);
  return CURATED_SKILLS.filter((s) => have.has(s));
}

/** The global skills root for a target under `home`. */
export function skillTargetRoot(home: string, target: SkillTarget): string {
  switch (target) {
    case 'shared':
      return path.join(home, '.agents', 'skills');
    case 'codex':
      return path.join(home, '.codex', 'skills');
    case 'pi':
      return path.join(home, '.pi', 'agent', 'skills');
  }
}

/**
 * Rewrite a skill's SKILL.md for cross-agent portability. The cross-agent spec
 * requires `name` to equal the skill's directory name; swarmdo's source uses a
 * pretty display name (`name: "Swarm Orchestration"`), so we force `name` to the
 * `sdo-*` slug and preserve everything else (crucially `description`, the field
 * agents match on to decide when to activate). Missing frontmatter is repaired.
 */
export function normalizeSkillMd(slug: string, raw: string): string {
  const nameLine = `name: "${slug}"`;
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(raw);
  if (!fm) {
    // No frontmatter — synthesize a minimal valid header.
    return `---\n${nameLine}\ndescription: "swarmdo skill: ${slug}"\n---\n\n${raw.replace(/^\r?\n+/, '')}`;
  }
  const body = raw.slice(fm[0].length).replace(/^\r?\n+/, '');
  let sawName = false;
  const inner = fm[1].split(/\r?\n/).map((ln) => {
    if (/^\s*name\s*:/.test(ln)) {
      sawName = true;
      return nameLine;
    }
    return ln;
  });
  if (!sawName) inner.unshift(nameLine);
  return `---\n${inner.join('\n')}\n---\n\n${body}`;
}

/** Serialize the ownership manifest (deterministic — no timestamps). */
export function buildManifest(slugs: readonly string[], version: string): string {
  return (
    JSON.stringify(
      { managedBy: 'swarmdo integrations skills', version, skills: [...slugs] },
      null,
      2,
    ) + '\n'
  );
}

/** Read the skill slugs a prior sync recorded at a target root (null = none). */
export function parseManifestSkills(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as { skills?: unknown };
    return Array.isArray(j.skills) ? j.skills.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export interface PlannedSkillWrite {
  target: SkillTarget;
  slug: string;
  /** absolute path of the SKILL.md to write */
  path: string;
  content: string;
}
export interface PlannedManifest {
  target: SkillTarget;
  path: string;
  content: string;
}
export interface StaleSkillDir {
  target: SkillTarget;
  slug: string;
  /** absolute path of the skill directory to delete */
  path: string;
}
export interface SkillSyncPlan {
  writes: PlannedSkillWrite[];
  manifests: PlannedManifest[];
  /** dirs from a PRIOR sync that are no longer curated — pruned on --apply */
  stale: StaleSkillDir[];
}

/**
 * Plan a sync. Pure: given the curated skills (already read from the source) and
 * the previously-installed slugs per target (from each manifest), produce the
 * exact writes, per-root manifests, and the stale dirs to reconcile away. All
 * curated skills are single-file SKILL.md (bundled-resource skills are excluded
 * from the allowlist), so one write per skill per target.
 */
export function planSkillSync(opts: {
  home: string;
  targets: readonly SkillTarget[];
  skills: ReadonlyArray<{ slug: string; skillMd: string }>;
  version: string;
  previous?: ReadonlyArray<{ target: SkillTarget; slugs: readonly string[] }>;
}): SkillSyncPlan {
  const { home, targets, skills, version } = opts;
  const prevByTarget = new Map<SkillTarget, Set<string>>();
  for (const p of opts.previous ?? []) prevByTarget.set(p.target, new Set(p.slugs));

  const slugs = skills.map((s) => s.slug);
  const nextSet = new Set(slugs);
  const writes: PlannedSkillWrite[] = [];
  const manifests: PlannedManifest[] = [];
  const stale: StaleSkillDir[] = [];

  for (const target of targets) {
    const root = skillTargetRoot(home, target);
    for (const { slug, skillMd } of skills) {
      writes.push({
        target,
        slug,
        path: path.join(root, slug, 'SKILL.md'),
        content: normalizeSkillMd(slug, skillMd),
      });
    }
    manifests.push({ target, path: path.join(root, SKILLS_MANIFEST), content: buildManifest(slugs, version) });
    for (const old of prevByTarget.get(target) ?? []) {
      if (!nextSet.has(old)) stale.push({ target, slug: old, path: path.join(root, old) });
    }
  }
  return { writes, manifests, stale };
}

export interface SkillRemovePlan {
  dirs: StaleSkillDir[];
  manifests: PlannedManifest[];
}

/**
 * Plan a full uninstall. Pure: given the installed slugs per target (from the
 * manifests), produce every skill dir to delete plus the manifest files to drop.
 * Only ever names slugs the manifest recorded, so a user's own skills in the
 * same root are untouched.
 */
export function planSkillRemove(opts: {
  home: string;
  installed: ReadonlyArray<{ target: SkillTarget; slugs: readonly string[] }>;
}): SkillRemovePlan {
  const dirs: StaleSkillDir[] = [];
  const manifests: PlannedManifest[] = [];
  for (const { target, slugs } of opts.installed) {
    const root = skillTargetRoot(opts.home, target);
    for (const slug of slugs) dirs.push({ target, slug, path: path.join(root, slug) });
    manifests.push({ target, path: path.join(root, SKILLS_MANIFEST), content: '' });
  }
  return { dirs, manifests };
}
