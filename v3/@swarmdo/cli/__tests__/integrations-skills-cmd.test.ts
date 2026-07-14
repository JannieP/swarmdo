/**
 * `swarmdo integrations skills` — command-level lifecycle over a real temp HOME.
 *
 * Invokes the command action directly (no CLI bootstrap → no session hooks / ONNX
 * model load), pointing os.homedir() at a temp dir via $HOME (libuv checks $HOME
 * first on POSIX). Exercises the genuine path: packaged .claude/skills source →
 * curate → normalize → write per-target + manifest → reconcile → remove.
 *
 * The pure engine has its own exhaustive suite (skills-sync.test.ts); this guards
 * the fs wiring the engine can't see.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import integrationsCommand from '../src/commands/integrations.js';
import { SKILLS_MANIFEST, parseManifestSkills } from '../src/integrations/skills-sync.js';

const realHome = process.env.HOME;
let tmp: string | null = null;

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** Run the action with a temp HOME. cwd = package root so the source resolver's
 * cwd fallback finds .claude/skills under vitest (import.meta.url is the src). */
async function run(flags: Record<string, unknown>, args: string[] = ['skills']): Promise<void> {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-skills-cmd-'));
  process.env.HOME = tmp;
  const ctx = { args, flags, cwd: process.cwd(), config: {}, interactive: false } as unknown as Parameters<
    NonNullable<typeof integrationsCommand.action>
  >[0];
  const res = await integrationsCommand.action!(ctx);
  expect(res.success).toBe(true);
}

const rootFor = (target: string): string =>
  target === 'shared'
    ? path.join(tmp!, '.agents', 'skills')
    : target === 'codex'
      ? path.join(tmp!, '.codex', 'skills')
      : path.join(tmp!, '.pi', 'agent', 'skills');

const countSkills = (target: string): number => {
  try {
    return fs.readdirSync(rootFor(target)).filter((n) => n.startsWith('sdo-')).length;
  } catch {
    return 0;
  }
};

describe('integrations skills — apply', () => {
  it('deploys the full curated set to all three targets with a manifest', async () => {
    await run({ apply: true });
    for (const t of ['shared', 'codex', 'pi']) expect(countSkills(t)).toBeGreaterThanOrEqual(18);

    // manifest records exactly what was written and matches the dir count
    const manifest = parseManifestSkills(fs.readFileSync(path.join(rootFor('shared'), SKILLS_MANIFEST), 'utf8'));
    expect(manifest.length).toBe(countSkills('shared'));

    // a synced skill is a normalized SKILL.md whose name == its dir slug
    const skillMd = fs.readFileSync(path.join(rootFor('codex'), 'sdo-browser', 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('name: "sdo-browser"');
    expect(skillMd).toContain('description:');
  });

  it('respects --targets (writes only the named target)', async () => {
    await run({ apply: true, targets: 'codex' });
    expect(countSkills('codex')).toBeGreaterThanOrEqual(18);
    expect(countSkills('shared')).toBe(0);
    expect(countSkills('pi')).toBe(0);
  });

  it('dry-run by default writes nothing', async () => {
    await run({});
    expect(countSkills('shared')).toBe(0);
    expect(countSkills('codex')).toBe(0);
  });

  it('rejects an unknown --targets value', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-skills-cmd-'));
    process.env.HOME = tmp;
    const ctx = { args: ['skills'], flags: { targets: 'bogus' }, cwd: process.cwd(), config: {}, interactive: false } as unknown as Parameters<
      NonNullable<typeof integrationsCommand.action>
    >[0];
    const res = await integrationsCommand.action!(ctx);
    expect(res.success).toBe(false);
  });
});

describe('integrations skills — remove', () => {
  it('uninstalls exactly the managed skills and drops the manifest', async () => {
    // apply, then remove against the SAME temp HOME
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-skills-cmd-'));
    process.env.HOME = tmp;
    const mk = (flags: Record<string, unknown>) =>
      ({ args: ['skills'], flags, cwd: process.cwd(), config: {}, interactive: false }) as unknown as Parameters<
        NonNullable<typeof integrationsCommand.action>
      >[0];

    expect((await integrationsCommand.action!(mk({ apply: true }))).success).toBe(true);
    expect(countSkills('shared')).toBeGreaterThan(0);

    expect((await integrationsCommand.action!(mk({ remove: true, apply: true }))).success).toBe(true);
    expect(countSkills('shared')).toBe(0);
    expect(countSkills('codex')).toBe(0);
    expect(countSkills('pi')).toBe(0);
    expect(fs.existsSync(path.join(rootFor('shared'), SKILLS_MANIFEST))).toBe(false);
  });

  it('leaves a user-authored skill in the shared dir untouched', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-skills-cmd-'));
    process.env.HOME = tmp;
    const mk = (flags: Record<string, unknown>) =>
      ({ args: ['skills'], flags, cwd: process.cwd(), config: {}, interactive: false }) as unknown as Parameters<
        NonNullable<typeof integrationsCommand.action>
      >[0];

    await integrationsCommand.action!(mk({ apply: true }));
    // drop a non-swarmdo skill next to the managed ones
    const mine = path.join(rootFor('shared'), 'my-own-skill');
    fs.mkdirSync(mine, { recursive: true });
    fs.writeFileSync(path.join(mine, 'SKILL.md'), '---\nname: "my-own-skill"\ndescription: "d"\n---\n\nmine');

    await integrationsCommand.action!(mk({ remove: true, apply: true }));
    expect(fs.existsSync(path.join(mine, 'SKILL.md'))).toBe(true); // survived
    expect(countSkills('shared')).toBe(0); // every managed sdo-* skill is gone
    expect(fs.readdirSync(rootFor('shared'))).toContain('my-own-skill'); // but the user's remains
  });
});
