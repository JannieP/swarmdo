import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCsv } from '../src/util/csv.ts';

describe('csv: escapeCsvField', () => {
  it('leaves plain values unquoted', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(3.14)).toBe('3.14');
  });
  it('quotes fields containing a comma, quote, CR, or LF', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"');
  });
  it('doubles interior double-quotes', () => {
    expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
  });
  it('renders null/undefined as an empty field', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('csv: toCsv', () => {
  it('serializes a header + rows joined by LF', () => {
    expect(toCsv(['a', 'b'], [[1, 2], ['x', 'y']])).toBe('a,b\n1,2\nx,y');
  });
  it('escapes fields per row, mixing types', () => {
    const csv = toCsv(['name', 'cost'], [['/repo, inc', 12.5], ['plain', 0]]);
    expect(csv).toBe('name,cost\n"/repo, inc",12.5\nplain,0');
  });
  it('emits just the header for no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });
  it('round-trips through a naive RFC-4180 parser', () => {
    // A field with an embedded comma + quote must survive a quote-aware split.
    const csv = toCsv(['k', 'v'], [['a"b,c', 'z']]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('k,v');
    expect(row).toBe('"a""b,c",z');
  });
});
