/**
 * csv.ts — minimal RFC 4180 CSV serialization for exporting tabular command
 * output (e.g. `usage --csv` into a spreadsheet / expense report).
 *
 * Pure and dependency-free. A field is quoted only when it must be — it contains
 * a comma, a double-quote, or a line break — and interior double-quotes are
 * doubled. Rows are joined with '\n' (LF), which every spreadsheet importer
 * accepts.
 */

/** Quote + escape a single CSV field per RFC 4180 (only when necessary). Pure. */
export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a header row + data rows to a CSV string. Pure. */
export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const line = (cells: Array<string | number | boolean | null | undefined>): string => cells.map(escapeCsvField).join(',');
  return [line(headers), ...rows.map(line)].join('\n');
}
