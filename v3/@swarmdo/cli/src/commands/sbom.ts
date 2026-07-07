/**
 * `swarmdo sbom` — emit a Software Bill of Materials from the npm lockfile.
 *
 *   swarmdo sbom                       # CycloneDX JSON → stdout
 *   swarmdo sbom -f spdx -o sbom.json  # SPDX 2.3 JSON → file
 *   swarmdo sbom --production          # exclude dev-only dependencies
 *
 * Completes the supply-chain trio (env / license / sbom). Engine
 * (../sbom/sbom.ts) is pure + tested; this reads package-lock.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { componentsFromNpmLock, buildSbom, type SbomFormat } from '../sbom/sbom.js';
import { writeStdout } from '../util/stdout.js';

async function run(ctx: CommandContext): Promise<CommandResult> {
  const repoRoot = ctx.cwd || process.cwd();
  const lockPath = path.resolve(repoRoot, ctx.args[0] ?? (typeof ctx.flags.lockfile === 'string' ? ctx.flags.lockfile : 'package-lock.json'));

  let lock: { name?: string; version?: string; packages?: Record<string, unknown> };
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    output.printError(`could not read a JSON lockfile at ${path.relative(repoRoot, lockPath) || lockPath} (npm package-lock.json; pnpm/yaml unsupported)`);
    return { success: false, exitCode: 1 };
  }
  if (!lock.packages) {
    output.printError('lockfile has no `packages` map — needs npm lockfileVersion 2 or 3');
    return { success: false, exitCode: 1 };
  }

  // NB: use --spec, not --format — the global --format flag is choices-validated
  // to text|json|table and rejects 'spdx'/'cyclonedx' before this command runs.
  const raw = typeof ctx.flags.spec === 'string' ? ctx.flags.spec : 'cyclonedx';
  if (raw !== 'cyclonedx' && raw !== 'spdx') {
    output.printError(`unknown --spec '${raw}' (use cyclonedx|spdx)`);
    return { success: false, exitCode: 1 };
  }
  const format: SbomFormat = raw;

  const components = componentsFromNpmLock(lock as Parameters<typeof componentsFromNpmLock>[0], {
    productionOnly: ctx.flags.production === true,
  });

  // Prefer the lockfile's own project name/version; fall back to the repo dir.
  const meta = { name: lock.name ?? path.basename(repoRoot), version: lock.version ?? '0.0.0' };
  const bom = buildSbom(components, meta, format);
  const serialized = JSON.stringify(bom, null, 2);

  const outFile = (typeof ctx.flags.output === 'string' && ctx.flags.output) || (typeof ctx.flags.o === 'string' && ctx.flags.o);
  if (outFile) {
    fs.writeFileSync(path.resolve(repoRoot, outFile), serialized + '\n');
    output.printSuccess(`${format} SBOM: ${components.length} components → ${outFile}`);
  } else {
    await writeStdout(serialized + '\n');
    process.stderr.write(output.dim(`${format} SBOM: ${components.length} components\n`));
  }
  return { success: true, exitCode: 0 };
}

export const sbomCommand: Command = {
  name: 'sbom',
  description: 'Generate a Software Bill of Materials (CycloneDX or SPDX JSON) from the npm lockfile',
  options: [
    { name: 'spec', description: 'BOM spec: cyclonedx (default) or spdx', type: 'string' },
    { name: 'output', short: 'o', description: 'write the SBOM to a file instead of stdout', type: 'string' },
    { name: 'lockfile', description: 'path to the lockfile (default package-lock.json)', type: 'string' },
    { name: 'production', description: 'exclude dev-only dependencies', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo sbom -o sbom.json', description: 'Write a CycloneDX SBOM' },
    { command: 'swarmdo sbom --spec spdx --production', description: 'SPDX SBOM, production deps only' },
  ],
  action: run,
};

export default sbomCommand;
