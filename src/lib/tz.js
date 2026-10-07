/* Time-zone helpers for drop countdowns — no library needed.
   The admin picks a wall-clock time in a named zone ("Fri 7:00 PM in
   New York"); we store the exact instant (UTC ISO) so every visitor, in any
   zone, counts down to the same moment. */

export const COMMON_ZONES = [
  ['America/New_York', 'Eastern (New York)'],
  ['America/Chicago', 'Central (Chicago)'],
  ['America/Denver', 'Mountain (Denver)'],
  ['America/Phoenix', 'Arizona (Phoenix)'],
  ['America/Los_Angeles', 'Pacific (Los Angeles)'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Toronto', 'Toronto'],
  ['America/Vancouver', 'Vancouver'],
  ['Europe/London', 'London'],
  ['UTC', 'UTC'],
];

/** offset (ms) of `tz` from UTC at instant `ms` */
function offsetAt(ms, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-10-31T19:00" in "America/New_York" → "2026-10-31T23:00:00.000Z" */
export function zonedToUtcIso(local, tz) {
  if (!local) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return '';
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetAt(guess, tz || 'UTC');
  utc = guess - offsetAt(utc, tz || 'UTC'); // second pass settles DST edges
  return new Date(utc).toISOString();
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" wall time in `tz` (for the admin input) */
export function utcToZonedLocal(iso, tz) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms + offsetAt(ms, tz || 'UTC'));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** "Fri, Oct 31, 7:00 PM EDT" in the drop's own zone */
export function formatInZone(iso, tz) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('en-US', {
    timeZone: tz || undefined, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
