/**
 * release.ts — `swarmdo release [patch|minor|major|x.y.z]`
 *
 * One command for the whole proven release train: bump the version trio +
 * lockfile, sync doc version strings, commit+push, build + stage the
 * self-contained @swarmdo/cli, publish both packages, verify the registry,
 * tag, and cut a GitHub release with `swarmdo changelog` notes.
 *
 * DRY-RUN BY DEFAULT — prints the exact plan; `--confirm` executes it
 * step-by-step and stops on the first failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { planRelease, renderStep, type ReleasePlan, type ReleaseStep } from '../release/release.js';

function repoRootFrom(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

function bumpJson(file: string, version: string): void {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  d.version = version;
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
}

function bumpLock(file: string, version: string): void {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  d.version = version;
  if (d.packages && d.packages['']) d.packages[''].version = version;
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
}

/** Replace the previous version's known doc occurrences with the next. */
function syncDocs(root: string, files: string[], current: string, next: string): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const touched: string[] = [];
  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const before = fs.readFileSync(abs, 'utf8');
    let after = before;
    // exact patterns used by every release since 1.4.x
    after = after.replaceAll(`**Swarmdo v${current}** (`, `**Swarmdo v${next}** (`);
    after = after.replace(new RegExp(`\\*\\*Swarmdo v${next.replace(/\./g, '\\.')}\\*\\* \\(\\d{4}-\\d{2}-\\d{2}\\)`), `**Swarmdo v${next}** (${today})`);
    after = after.replaceAll(`swarmdo@${current}\` (umbrella), \`@swarmdo/cli@${current}\`, \`swarmdo-bridge@${current}\``, `swarmdo@${next}\` (umbrella), \`@swarmdo/cli@${next}\`, \`swarmdo-bridge@${next}\``);
    after = after.replaceAll(`npx%20swarmdo-v${current}-cb3837`, `npx%20swarmdo-v${next}-cb3837`);
    after = after.replaceAll(`"softwareVersion":"${current}"`, `"softwareVersion":"${next}"`);
    after = after.replaceAll(`<span class="ver">v${current} · MIT</span>`, `<span class="ver">v${next} · MIT</span>`);
    after = after.replaceAll(`▊ Swarmdo V${current} `, `▊ Swarmdo V${next} `);
    if (after !== before) { fs.writeFileSync(abs, after); touched.push(rel); }
  }
  return touched;
}

async function executePlan(plan: ReleasePlan, root: string): Promise<CommandResult> {
  const run = (s: Extract<ReleaseStep, { kind: 'exec' }>): void => {
    output.writeln(output.dim(`  $ ${s.cmd} ${s.args.join(' ')}   (${path.relative(root, s.cwd) || '.'})`));
    execFileSync(s.cmd, s.args, { cwd: s.cwd, stdio: 'inherit' });
  };
  for (const [i, step] of plan.steps.entries()) {
    output.writeln(output.bold(`[${i + 1}/${plan.steps.length}] ${renderStep(step)}`));
    switch (step.kind) {
      case 'bump-json': bumpJson(path.join(root, step.file), step.version); break;
      case 'bump-lock': bumpLock(path.join(root, step.file), step.version); break;
      case 'sync-docs': {
        const touched = syncDocs(root, step.files, plan.current, plan.next);
        output.writeln(output.dim(`  synced: ${touched.join(', ') || '(none)'}`));
        break;
      }
      case 'exec': run(step); break;
      case 'verify-npm': {
        for (const pkg of step.packages) {
          let seen = '';
          for (let attempt = 0; attempt < 20; attempt++) {
            try { seen = execFileSync('npm', ['view', `${pkg}@latest`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { seen = ''; }
            if (seen === step.version) break;
            execFileSync('sleep', ['3']);
          }
          if (seen !== step.version) {
            output.printError(`${pkg}@latest is "${seen || '(unset)'}" — expected ${step.version}`);
            return { success: false, exitCode: 1 };
          }
          output.writeln(output.dim(`  ${pkg}@latest = ${seen} ✓`));
        }
        break;
      }
      case 'deploy-site': {
        // user rule 2026-07-07: the live site ships with every release.
        // Copy the working copy into the SwarmDo/swarmdo.com repo, push,
        // and verify production actually serves the new version string.
        const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmdo-site-'));
        execFileSync('gh', ['repo', 'clone', 'SwarmDo/swarmdo.com', siteDir, '--', '-q'], { stdio: 'inherit' });
        fs.copyFileSync(path.join(root, 'website', 'index.html'), path.join(siteDir, 'index.html'));
        const smap = path.join(siteDir, 'sitemap.xml');
        if (fs.existsSync(smap)) {
          const today = new Date().toISOString().slice(0, 10);
          fs.writeFileSync(smap, fs.readFileSync(smap, 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`));
        }
        const g = (args: string[]): void => { execFileSync('git', args, { cwd: siteDir, stdio: 'inherit' }); };
        g(['add', '-A']);
        try {
          g(['commit', '-m', `release: sync site for v${plan.next}\n\nCo-Authored-By: Swarmdo <maintainers@swarmdo.com>`]);
        } catch {
          output.writeln(output.dim('  site already in sync — nothing to commit'));
          break;
        }
        g(['push', 'origin', 'main']);
        // poll production (GitHub Pages deploys in ~1min)
        let live = false;
        for (let i = 0; i < 30; i++) {
          try {
            const body = execFileSync('curl', ['-s', 'https://swarmdo.com'], { encoding: 'utf8' });
            if (body.includes(`v${plan.next}`)) { live = true; break; }
          } catch { /* transient */ }
          execFileSync('sleep', ['10']);
        }
        if (!live) {
          output.printError(`swarmdo.com is not serving v${plan.next} after 5min — check the Pages build`);
          return { success: false, exitCode: 1 };
        }
        output.writeln(output.dim(`  swarmdo.com serves v${plan.next} ✓`));
        break;
      }
      case 'gh-release': {
        const notes = path.join(os.tmpdir(), `swarmdo-relnotes-${process.pid}.md`);
        const { changelogCommand } = await import('./changelog.js');
        const r = await changelogCommand.action!({ args: [], flags: { from: step.notesFrom, version: plan.tag, out: notes }, cwd: root, interactive: false } as unknown as CommandContext);
        if (r && r.success === false) return { success: false, exitCode: 1 };
        execFileSync('gh', ['release', 'create', plan.tag, '--title', `${plan.tag}`, '--notes-file', notes], { cwd: root, stdio: 'inherit' });
        try { fs.rmSync(notes, { force: true }); } catch { /* best-effort */ }
        break;
      }
    }
  }
  output.printSuccess(`released ${plan.tag}`);
  return { success: true, exitCode: 0 };
}

export const releaseCommand: Command = {
  name: 'release',
  aliases: ['ship'],
  description: 'Run the full release train: bump trio+docs, commit, build+stage, publish both npm packages, verify, tag, GitHub release — dry-run unless --confirm',
  options: [
    { name: 'confirm', type: 'boolean', description: 'actually execute (default: print the plan)', default: false },
    { name: 'skip-publish', type: 'boolean', description: 'skip npm publish + registry verify steps', default: false },
    { name: 'skip-gh-release', type: 'boolean', description: 'skip the GitHub release step', default: false },
    { name: 'skip-site', type: 'boolean', description: 'skip the live-site deploy (docs-sync rule: only for zero-user-facing releases)', default: false },
    { name: 'json', type: 'boolean', description: 'print the plan as JSON', default: false },
  ],
  examples: [
    { command: 'swarmdo release', description: 'Plan a patch release (dry-run)' },
    { command: 'swarmdo release minor --confirm', description: 'Execute a minor release end-to-end' },
    { command: 'swarmdo release 2.0.0 --skip-publish --confirm', description: 'Bump/tag/release 2.0.0 without publishing to npm' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const root = repoRootFrom(cwd);
    if (!root) {
      output.printError('not a git repository');
      return { success: false, exitCode: 1 };
    }
    const trioHead = path.join(root, 'v3/@swarmdo/cli/package.json');
    if (!fs.existsSync(trioHead)) {
      output.printError('this does not look like the swarmdo repo (v3/@swarmdo/cli/package.json missing)');
      return { success: false, exitCode: 1 };
    }
    const current = String(JSON.parse(fs.readFileSync(trioHead, 'utf8')).version ?? '');
    let plan: ReleasePlan;
    try {
      plan = planRelease({
        current,
        bump: (ctx.args[0] || 'patch').toLowerCase(),
        repoRoot: root,
        skipPublish: ctx.flags['skip-publish'] === true,
        skipGhRelease: ctx.flags['skip-gh-release'] === true,
        skipSite: ctx.flags['skip-site'] === true,
      });
    } catch (e) {
      output.printError((e as Error).message);
      return { success: false, exitCode: 1 };
    }

    if (ctx.flags.json === true) {
      output.printJson(plan);
      return { success: true, data: plan };
    }
    if (ctx.flags.confirm !== true) {
      output.writeln(output.bold(`Release plan  ${plan.current} → ${plan.next}`) + output.dim('  (dry-run — re-run with --confirm to execute)'));
      plan.steps.forEach((s, i) => output.writeln(`  ${String(i + 1).padStart(2)}. ${renderStep(s)}`));
      return { success: true, data: { dryRun: true, ...plan } };
    }
    return executePlan(plan, root);
  },
};

export default releaseCommand;
