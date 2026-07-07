/**
 * `swarmdo license` — audit installed dependency licenses against an allow/deny
 * policy. Reads each package's own package.json under node_modules and checks
 * the SPDX license, so a GPL or unknown license in a permissive tree is caught
 * (and can fail CI) before it ships.
 *
 *   swarmdo license                              # list licenses in the tree
 *   swarmdo license --allow MIT,Apache-2.0,ISC   # fail on anything else
 *   swarmdo license --deny GPL-3.0 --ci          # exit 1 on a forbidden license
 *
 * Engine (../license/license.ts) is pure + tested; this walks node_modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { classifyLicense, auditLicenses, formatLicenseSummary, type DepLicense, type LicensePolicy } from '../license/license.js';

/** Collect installed packages from a node_modules dir (incl. one level of @scope). */
function collectDeps(nodeModules: string): DepLicense[] {
  const deps: DepLicense[] = [];
  const seen = new Set<string>();
  let top: fs.Dirent[];
  try { top = fs.readdirSync(nodeModules, { withFileTypes: true }); } catch { return deps; }
  const pkgDirs: string[] = [];
  for (const e of top) {
    if (!e.isDirectory() || e.name === '.bin' || e.name === '.cache') continue;
    if (e.name.startsWith('@')) {
      // scoped: descend one level
      let scoped: fs.Dirent[];
      try { scoped = fs.readdirSync(path.join(nodeModules, e.name), { withFileTypes: true }); } catch { continue; }
      for (const s of scoped) if (s.isDirectory()) pkgDirs.push(path.join(nodeModules, e.name, s.name));
    } else {
      pkgDirs.push(path.join(nodeModules, e.name));
    }
  }
  for (const dir of pkgDirs) {
    let pkg: { name?: string; version?: string; license?: unknown; licenses?: unknown };
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
    const name = pkg.name ?? path.basename(dir);
    if (seen.has(name)) continue;
    seen.add(name);
    deps.push({ name, version: pkg.version ?? '0.0.0', license: classifyLicense(pkg) });
  }
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

function csv(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const repoRoot = ctx.cwd || process.cwd();
  const nodeModules = path.resolve(repoRoot, ctx.args[0] ?? 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    output.printError(`no node_modules at ${path.relative(repoRoot, nodeModules) || nodeModules} (install deps first, or pass a path)`);
    return { success: false, exitCode: 1 };
  }

  const deps = collectDeps(nodeModules);
  if (deps.length === 0) {
    output.printError('no packages found under node_modules');
    return { success: false, exitCode: 1 };
  }

  const policy: LicensePolicy = {
    allow: csv(ctx.flags.allow),
    deny: csv(ctx.flags.deny),
    allowUnknown: ctx.flags['allow-unknown'] === true,
  };
  const report = auditLicenses(deps, policy);

  if (ctx.flags.json === true) {
    output.printJson(report);
  } else {
    if (report.violations.length > 0) {
      output.writeln(output.bold(`Violations (${report.violations.length})`));
      output.printList(report.violations.map((v) => `${v.name}@${v.version}  ${output.dim(`[${v.license}]`)}  ${v.reason}`));
    }
    // license breakdown, most common first
    output.writeln(output.bold('Licenses'));
    output.printList(
      Object.entries(report.byLicense).sort((a, b) => b[1] - a[1]).map(([lic, n]) => `${lic}: ${n}`),
    );
    output.writeln(output.dim(formatLicenseSummary(report)));
  }

  const gate = ctx.flags.ci === true || policy.allow || policy.deny;
  const code = gate && report.violations.length > 0 ? 1 : 0;
  return { success: code === 0, exitCode: code };
}

export const licenseCommand: Command = {
  name: 'license',
  aliases: ['licenses'],
  description: 'Audit dependency licenses against an allow/deny policy — catch GPL/unknown licenses before they ship',
  options: [
    { name: 'allow', description: 'comma-separated SPDX allowlist; anything else is a violation', type: 'string' },
    { name: 'deny', description: 'comma-separated SPDX denylist; any match is a violation', type: 'string' },
    { name: 'allow-unknown', description: 'treat UNKNOWN licenses as allowed (default: violation under an allowlist)', type: 'boolean' },
    { name: 'ci', description: 'exit 1 if there are any violations', type: 'boolean' },
    { name: 'json', description: 'machine-readable report', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo license', description: 'List the licenses present in node_modules' },
    { command: 'swarmdo license --allow MIT,Apache-2.0,ISC,BSD-3-Clause --ci', description: 'Fail CI on any non-permissive license' },
    { command: 'swarmdo license --deny GPL-3.0,AGPL-3.0', description: 'Fail on specific copyleft licenses' },
  ],
  action: run,
};

export default licenseCommand;
