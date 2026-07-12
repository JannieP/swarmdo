import { describe, it, expect } from 'vitest';
import { getUpdateType } from '../src/update/checker.ts';

describe('getUpdateType', () => {
  it('classifies genuine upgrades by the highest changed field', () => {
    expect(getUpdateType('1.30.0', '1.30.1')).toBe('patch');
    expect(getUpdateType('1.29.0', '1.30.0')).toBe('minor');
    expect(getUpdateType('1.9.0', '2.0.0')).toBe('major');
    expect(getUpdateType('1.5.9', '1.5.10')).toBe('patch');
    expect(getUpdateType('1.5.9', '1.6.0')).toBe('minor');
    expect(getUpdateType('1.5.9', '2.0.0')).toBe('major');
  });

  it('returns none when latest equals current', () => {
    expect(getUpdateType('1.30.0', '1.30.0')).toBe('none');
  });

  it('#79 — never flags a same-or-OLDER latest as an update (no auto-downgrade)', () => {
    // A less-significant field being higher must NOT read as an upgrade.
    expect(getUpdateType('1.30.2', '1.29.5')).toBe('none'); // patch 5>2 but 1.29.5 is older
    expect(getUpdateType('2.1.0', '1.5.0')).toBe('none'); // minor 5>1 but 1.5.0 is a downgrade
    expect(getUpdateType('1.5.3', '1.4.9')).toBe('none');
    // The live case: dev build ahead of npm latest.
    expect(getUpdateType('1.35.0', '1.27.0')).toBe('none');
  });

  it('returns none for invalid versions', () => {
    expect(getUpdateType('not-a-version', '1.0.0')).toBe('none');
    expect(getUpdateType('1.0.0', 'also-bad')).toBe('none');
  });
});
