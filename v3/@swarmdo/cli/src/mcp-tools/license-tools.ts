/**
 * License MCP Tool
 *
 * Let an agent audit dependency licenses in-session — e.g. before adding a
 * package or approving a release — against an allow/deny policy. Deterministic;
 * shares the pure engine in ../license/license.ts with the CLI command. The
 * caller passes the dependency list (name/version/license), so no fs access.
 */

import type { MCPTool } from './types.js';
import { auditLicenses, type DepLicense, type LicensePolicy } from '../license/license.js';

const licenseCheckTool: MCPTool = {
  name: 'license_check',
  description:
    'Audit a dependency list against a license allow/deny policy. Returns violations (denied, not-allowed, or unknown license) plus a license breakdown. Use before adding a dependency or approving a release to keep a permissive tree clean. Deterministic; pass the deps directly.',
  category: 'license',
  tags: ['license', 'compliance', 'supply-chain', 'ci'],
  inputSchema: {
    type: 'object',
    properties: {
      deps: {
        type: 'array',
        description: 'dependencies to audit',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            license: { type: 'string', description: 'SPDX id/expression (e.g. MIT, "(MIT OR Apache-2.0)", or UNKNOWN)' },
          },
          required: ['name', 'license'],
        },
      },
      allow: { type: 'array', items: { type: 'string' }, description: 'SPDX allowlist; a dep must match at least one' },
      deny: { type: 'array', items: { type: 'string' }, description: 'SPDX denylist; any match is a violation' },
      allowUnknown: { type: 'boolean', description: 'treat UNKNOWN as allowed even under an allowlist', default: false },
    },
    required: ['deps'],
  },
  handler: async (params: Record<string, unknown>) => {
    if (!Array.isArray(params.deps)) return { error: true, message: 'deps[] is required' };
    const deps: DepLicense[] = params.deps
      .filter((d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object')
      .map((d) => ({
        name: String((d as { name?: unknown }).name ?? '?'),
        version: String((d as { version?: unknown }).version ?? '0.0.0'),
        license: String((d as { license?: unknown }).license ?? 'UNKNOWN'),
      }));
    const policy: LicensePolicy = {
      allow: Array.isArray(params.allow) ? params.allow.filter((x): x is string => typeof x === 'string') : undefined,
      deny: Array.isArray(params.deny) ? params.deny.filter((x): x is string => typeof x === 'string') : undefined,
      allowUnknown: params.allowUnknown === true,
    };
    const report = auditLicenses(deps, policy);
    return { clean: report.violations.length === 0, total: report.total, violations: report.violations, byLicense: report.byLicense };
  },
};

export const licenseTools: MCPTool[] = [licenseCheckTool];
