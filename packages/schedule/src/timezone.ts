/**
 * Wall-clock time in a named time zone ("20:00 on Tuesday in America/Chicago")
 * using only Intl, so it works the same in Node (whatever the container's TZ)
 * and in browsers, across daylight-saving changes.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(ms)) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour! % 24, minute: parts.minute!, second: parts.second! };
}

/** How far the zone's wall clock is ahead of UTC at `ms`. */
function offsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a wall-clock time happens in the zone. A time skipped by a
 * spring-forward resolves to just after the jump; a repeated fall-back time
 * resolves to its first occurrence.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = asUtc - offsetMs(asUtc, timeZone);
  // Re-check at the guess: the offset can differ across a DST change.
  const second = asUtc - offsetMs(guess, timeZone);
  if (second !== guess) {
    const firstOccurrence = Math.min(guess, second);
    guess = zonedParts(firstOccurrence, timeZone).hour === hour ? firstOccurrence : Math.max(guess, second);
  }
  return guess;
}

/** Calendar date (in the zone) of an instant, as a UTC-midnight timestamp, plus its weekday (0 = Sunday). */
export function zonedDate(ms: number, timeZone: string): { dateMs: number; weekday: number } {
  const p = zonedParts(ms, timeZone);
  const dateMs = Date.UTC(p.year, p.month - 1, p.day);
  return { dateMs, weekday: new Date(dateMs).getUTCDay() };
}
