/**
 * Pure skills-sync engine — the cross-agent skill deployment behind
 * `swarmdo integrations skills`. Everything here is data-in/data-out so the
 * whole surface is exercised without touching the filesystem.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  CURATED_SKILLS,
  SKILL_TARGETS,
  SKILLS_MANIFEST,
  curateSkills,
  skillTargetRoot,
  normalizeSkillMd,
  buildManifest,
  parseManifestSkills,
  planSkillSync,
  planSkillRemove,
} from '../src/integrations/skills-sync.js';

describe('curated skill list', () => {
  it('is a tight, deliberate ~20-skill allowlist', () => {
    expect(CURATED_SKILLS.length).toBeGreaterThanOrEqual(18);
    expect(CURATED_SKILLS.length).toBeLessThanOrEqual(22);
  });

  it('every entry is an sdo- skill and unique', () => {
    for (const s of CURATED_SKILLS) expect(s).toMatch(/^sdo-/);
    expect(new Set(CURATED_SKILLS).size).toBe(CURATED_SKILLS.length);
  });

  it('excludes swarmdo-internal + bundled-resource skills', () => {
    // sdo-v3-* are about BUILDING swarmdo, not using it from another agent.
    expect(CURATED_SKILLS.some((s) => s.startsWith('sdo-v3-'))).toBe(false);
    // no SKILL.md / bundles python bytecode — both are wrong to ship globally.
    expect(CURATED_SKILLS).not.toContain('sdo-dual-mode');
    expect(CURATED_SKILLS).not.toContain('sdo-caveman-compress');
  });
});

describe('curateSkills', () => {
  it('intersects with what is available and preserves curated order', () => {
    const available = ['sdo-browser', 'sdo-swarm-orchestration', 'some-other', 'sdo-hooks-automation'];
    const out = curateSkills(available);
    expect(out).toEqual(['sdo-swarm-orchestration', 'sdo-hooks-automation', 'sdo-browser']);
    expect(out).not.toContain('some-other');
  });

  it('silently skips curated skills that are absent on disk', () => {
    expect(curateSkills(['sdo-browser'])).toEqual(['sdo-browser']);
    expect(curateSkills([])).toEqual([]);
  });
});

describe('skillTargetRoot', () => {
  it('maps each target to its global skills root', () => {
    const home = '/home/u';
    expect(skillTargetRoot(home, 'shared')).toBe(path.join(home, '.agents', 'skills'));
    expect(skillTargetRoot(home, 'codex')).toBe(path.join(home, '.codex', 'skills'));
    expect(skillTargetRoot(home, 'pi')).toBe(path.join(home, '.pi', 'agent', 'skills'));
  });

  it('never targets a Claude Code surface', () => {
    for (const t of SKILL_TARGETS) {
      expect(skillTargetRoot('/home/u', t)).not.toContain(`${path.sep}.claude${path.sep}`);
    }
  });
});

describe('normalizeSkillMd', () => {
  const src = `---
name: "Swarm Orchestration"
description: "Orchestrate multi-agent swarms. Use when scaling beyond single agents."
---

# Swarm Orchestration

Body content here.
`;

  it('forces name to the dir slug but preserves description + body', () => {
    const out = normalizeSkillMd('sdo-swarm-orchestration', src);
    expect(out).toContain('name: "sdo-swarm-orchestration"');
    expect(out).not.toContain('Swarm Orchestration"'); // pretty name gone from frontmatter
    expect(out).toContain('description: "Orchestrate multi-agent swarms. Use when scaling beyond single agents."');
    expect(out).toContain('# Swarm Orchestration');
    expect(out).toContain('Body content here.');
  });

  it('preserves other frontmatter keys untouched', () => {
    const withExtra = `---
name: Foo
description: "d"
allowed-tools: Bash
---

body`;
    const out = normalizeSkillMd('sdo-foo', withExtra);
    expect(out).toContain('allowed-tools: Bash');
    expect(out).toContain('name: "sdo-foo"');
  });

  it('injects a name when the frontmatter lacks one', () => {
    const noName = `---
description: "d"
---

body`;
    const out = normalizeSkillMd('sdo-x', noName);
    expect(out).toContain('name: "sdo-x"');
    expect(out).toContain('description: "d"');
  });

  it('synthesizes a valid header when there is no frontmatter', () => {
    const out = normalizeSkillMd('sdo-y', '# Heading\n\ntext');
    expect(out.startsWith('---\nname: "sdo-y"\n')).toBe(true);
    expect(out).toContain('description:');
    expect(out).toContain('# Heading');
  });

  it('emits exactly one blank line between frontmatter and body (deterministic)', () => {
    const out = normalizeSkillMd('sdo-swarm-orchestration', src);
    expect(out).toMatch(/---\n\n# Swarm Orchestration/);
    // idempotent: normalizing the output again is a fixed point
    expect(normalizeSkillMd('sdo-swarm-orchestration', out)).toBe(out);
  });
});

describe('manifest round-trip', () => {
  it('builds and parses back the skill list', () => {
    const m = buildManifest(['sdo-a', 'sdo-b'], '1.2.3');
    expect(JSON.parse(m).managedBy).toBe('swarmdo integrations skills');
    expect(JSON.parse(m).version).toBe('1.2.3');
    expect(parseManifestSkills(m)).toEqual(['sdo-a', 'sdo-b']);
  });

  it('parse tolerates null and garbage', () => {
    expect(parseManifestSkills(null)).toEqual([]);
    expect(parseManifestSkills('not json')).toEqual([]);
    expect(parseManifestSkills('{"skills":"nope"}')).toEqual([]);
    expect(parseManifestSkills('{"skills":[1,"sdo-a",true]}')).toEqual(['sdo-a']);
  });

  it('is deterministic (no timestamps) so re-apply produces no churn', () => {
    expect(buildManifest(['sdo-a'], '1.0.0')).toBe(buildManifest(['sdo-a'], '1.0.0'));
  });
});

describe('planSkillSync', () => {
  const home = '/home/u';
  const skills = [
    { slug: 'sdo-browser', skillMd: '---\nname: "Browser"\ndescription: "d1"\n---\n\nb1' },
    { slug: 'sdo-hooks-automation', skillMd: '---\nname: "Hooks"\ndescription: "d2"\n---\n\nb2' },
  ];

  it('writes one normalized SKILL.md per skill per target, plus a manifest per root', () => {
    const plan = planSkillSync({ home, targets: ['shared', 'codex'], skills, version: '9.9.9' });
    expect(plan.writes).toHaveLength(4); // 2 skills × 2 targets
    const sharedBrowser = plan.writes.find(
      (w) => w.target === 'shared' && w.slug === 'sdo-browser',
    );
    expect(sharedBrowser?.path).toBe(path.join(home, '.agents', 'skills', 'sdo-browser', 'SKILL.md'));
    expect(sharedBrowser?.content).toContain('name: "sdo-browser"');
    expect(sharedBrowser?.content).toContain('description: "d1"');
    expect(plan.manifests.map((m) => m.target).sort()).toEqual(['codex', 'shared']);
    expect(plan.manifests[0].path.endsWith(SKILLS_MANIFEST)).toBe(true);
    expect(parseManifestSkills(plan.manifests[0].content)).toEqual(['sdo-browser', 'sdo-hooks-automation']);
  });

  it('reconciles away skills a prior sync installed that are no longer curated', () => {
    const plan = planSkillSync({
      home,
      targets: ['codex'],
      skills,
      version: '9.9.9',
      previous: [{ target: 'codex', slugs: ['sdo-browser', 'sdo-legacy-gone'] }],
    });
    expect(plan.stale).toHaveLength(1);
    expect(plan.stale[0].slug).toBe('sdo-legacy-gone');
    expect(plan.stale[0].path).toBe(path.join(home, '.codex', 'skills', 'sdo-legacy-gone'));
    // still-curated skills are not marked stale
    expect(plan.stale.some((s) => s.slug === 'sdo-browser')).toBe(false);
  });

  it('never plans a write under a .claude surface', () => {
    const plan = planSkillSync({ home, targets: SKILL_TARGETS, skills, version: '1.0.0' });
    for (const w of [...plan.writes, ...plan.manifests]) {
      expect(w.path).not.toContain(`${path.sep}.claude${path.sep}`);
    }
  });
});

describe('planSkillRemove', () => {
  it('deletes exactly the manifest-recorded skill dirs + the manifest files', () => {
    const plan = planSkillRemove({
      home: '/home/u',
      installed: [
        { target: 'shared', slugs: ['sdo-browser', 'sdo-hooks-automation'] },
        { target: 'pi', slugs: ['sdo-browser'] },
      ],
    });
    expect(plan.dirs.map((d) => d.path)).toEqual([
      path.join('/home/u', '.agents', 'skills', 'sdo-browser'),
      path.join('/home/u', '.agents', 'skills', 'sdo-hooks-automation'),
      path.join('/home/u', '.pi', 'agent', 'skills', 'sdo-browser'),
    ]);
    expect(plan.manifests).toHaveLength(2);
    expect(plan.manifests.every((m) => m.path.endsWith(SKILLS_MANIFEST))).toBe(true);
  });

  it('is empty when nothing was installed', () => {
    const plan = planSkillRemove({ home: '/home/u', installed: [] });
    expect(plan.dirs).toEqual([]);
    expect(plan.manifests).toEqual([]);
  });
});
