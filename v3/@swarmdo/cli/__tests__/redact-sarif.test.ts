import { describe, it, expect } from 'vitest';
import { scanText } from '../src/redact/redact.ts';
import { toSarif } from '../src/redact/sarif.ts';

// Three secrets on three distinct lines: AWS key, GitHub PAT, private-key header.
// No keyword-prefixed assignments → no entropy-fallback noise, so exactly the
// catalog rules fire and the line mapping is unambiguous.
const SAMPLE = [
  'aws AKIAIOSFODNN7EXAMPLE here',
  'gh ghp_1234567890abcdefghij1234567890abcdef done',
  '-----BEGIN PRIVATE KEY-----',
].join('\n');

describe('toSarif — redact findings → SARIF 2.1.0', () => {
  it('emits a well-formed SARIF document mapping every finding', () => {
    const findings = scanText(SAMPLE);
    expect(findings.length).toBeGreaterThanOrEqual(3);

    const doc = JSON.parse(toSarif(findings)); // JSON round-trips

    expect(doc.version).toBe('2.1.0');
    expect(typeof doc.$schema).toBe('string');
    expect(doc.$schema.length).toBeGreaterThan(0);

    const run = doc.runs[0];
    expect(run.tool.driver.name).toBe('swarmdo-redact');
    expect(run.results.length).toBe(findings.length);

    const ruleIds = new Set(run.tool.driver.rules.map((r: any) => r.id));
    run.results.forEach((res: any, i: number) => {
      expect(res.ruleId.length).toBeGreaterThan(0);
      expect(res.level).toBe('error');
      expect(res.message.text.length).toBeGreaterThan(0);
      const region = res.locations[0].physicalLocation.region;
      expect(region.startLine).toBe(findings[i].line);
      expect(region.startColumn).toBe(findings[i].column);
      // every result's ruleId must be declared in the driver's rules[]
      expect(ruleIds.has(res.ruleId)).toBe(true);
      // ruleIndex points at the matching descriptor
      expect(run.tool.driver.rules[res.ruleIndex].id).toBe(res.ruleId);
    });
  });

  it('omits artifactLocation without --source, includes it with one', () => {
    const findings = scanText(SAMPLE);
    const bare = JSON.parse(toSarif(findings));
    expect(bare.runs[0].results[0].locations[0].physicalLocation.artifactLocation).toBeUndefined();
    const anchored = JSON.parse(toSarif(findings, { artifactUri: 'src/config.ts' }));
    expect(anchored.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('src/config.ts');
  });

  it('dedupes rule descriptors by ruleId (N results can share one rule)', () => {
    // two AWS keys → 2 results, 1 rule descriptor
    const findings = scanText('AKIAIOSFODNN7EXAMPLE\nAKIA1234567890ABCDEF');
    const doc = JSON.parse(toSarif(findings));
    expect(doc.runs[0].results.length).toBe(2);
    expect(doc.runs[0].tool.driver.rules.length).toBe(1);
    expect(doc.runs[0].tool.driver.rules[0].id).toBe('aws-access-key');
  });

  it('emits a valid empty run when there are no findings', () => {
    const doc = JSON.parse(toSarif([]));
    expect(doc.version).toBe('2.1.0');
    expect(doc.runs[0].results).toEqual([]);
    expect(doc.runs[0].tool.driver.rules).toEqual([]);
  });

  it('includes tool version only when provided', () => {
    const findings = scanText(SAMPLE);
    expect(JSON.parse(toSarif(findings)).runs[0].tool.driver.version).toBeUndefined();
    expect(JSON.parse(toSarif(findings, { toolVersion: '1.43.0' })).runs[0].tool.driver.version).toBe('1.43.0');
  });
});
