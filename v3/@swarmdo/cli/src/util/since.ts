/**
 * since.ts — normalize compact age windows for `git log --since`.
 *
 * git's approxidate parser does NOT understand the bare compact form `90d`
 * (it silently matches nothing — `git log --since=90d` returns zero commits),
 * yet `hotspots`/`coupling` document `--since 90d`. This maps the compact forms
 * (`90d`, `6mo`, `2w`, `1y`, `3h`) to the spelled-out `"90 days ago"` git DOES
 * understand. Anything already spelled out (`"3 months ago"`), an ISO date, or
 * an unrecognized token passes through unchanged. Pure + unit-tested.
 */

const COMPACT = /^\s*(\d+)\s*(d|days?|w|wks?|weeks?|mo|mons?|months?|y|yrs?|years?|h|hrs?|hours?)\s*$/i;

/** Convert `90d`→`90 days ago`, `6mo`→`6 months ago`, etc. Passthrough otherwise. */
export function normalizeSince(since: string): string {
  const m = COMPACT.exec(since);
  if (!m) return since;
  const c0 = m[2][0].toLowerCase(); // the allowed units are uniquely keyed by first letter
  const unit = c0 === 'd' ? 'days' : c0 === 'w' ? 'weeks' : c0 === 'y' ? 'years' : c0 === 'h' ? 'hours' : 'months';
  return `${m[1]} ${unit} ago`;
}
