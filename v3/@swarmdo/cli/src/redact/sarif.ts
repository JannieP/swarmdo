/**
 * sarif.ts — render redact secret-scan findings as a SARIF 2.1.0 document.
 *
 * SARIF (Static Analysis Results Interchange Format) is a ratified OASIS
 * standard that GitHub code-scanning ingests via `github/codeql-action/
 * upload-sarif`. Emit it from `redact --scan` in CI and leaked-secret findings
 * surface as alerts in the Security tab + PR annotations instead of dying in
 * the build log — the same thing gitleaks/trufflehog/ggshield do with their
 * `--report-format sarif`.
 *
 * Pure + deterministic: findings in, JSON string out. No fs/network.
 */

import type { Finding } from './redact.js';

export interface SarifOptions {
  /** SARIF tool.driver.name (default 'swarmdo-redact') */
  toolName?: string;
  /** SARIF tool.driver.version — omitted from the document when not given */
  toolVersion?: string;
  /**
   * URI for the artifact each finding lives in. `redact --scan` reads a STREAM
   * (stdin / wrapped output), so there is no committed file by default; pass
   * this (e.g. from `--source <path>`) to anchor the alerts onto a repo path.
   */
  artifactUri?: string;
}

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const INFO_URI = 'the upstream project (see NOTICE)';

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
}

/** Render `findings` as a SARIF 2.1.0 document string. Pure + deterministic. */
export function toSarif(findings: Finding[], opts: SarifOptions = {}): string {
  const toolName = opts.toolName ?? 'swarmdo-redact';

  // One rule descriptor per distinct ruleId, in first-seen order. Findings
  // carry their own description, so the entropy fallback (not in RULES) is
  // covered too — every result.ruleId is guaranteed to appear in rules[].
  const ruleIndex = new Map<string, number>();
  const rules: SarifRule[] = [];
  for (const f of findings) {
    if (ruleIndex.has(f.ruleId)) continue;
    ruleIndex.set(f.ruleId, rules.length);
    rules.push({ id: f.ruleId, name: f.ruleId, shortDescription: { text: f.description } });
  }

  const results = findings.map((f) => {
    const physicalLocation: Record<string, unknown> = {
      region: { startLine: f.line, startColumn: f.column },
    };
    if (opts.artifactUri) physicalLocation.artifactLocation = { uri: opts.artifactUri };
    return {
      ruleId: f.ruleId,
      ruleIndex: ruleIndex.get(f.ruleId)!,
      level: 'error' as const,
      message: { text: `Possible secret: ${f.description}` },
      locations: [{ physicalLocation }],
    };
  });

  const driver: Record<string, unknown> = { name: toolName, informationUri: INFO_URI, rules };
  if (opts.toolVersion) driver.version = opts.toolVersion;

  const doc = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{ tool: { driver }, results }],
  };

  return JSON.stringify(doc, null, 2);
}
