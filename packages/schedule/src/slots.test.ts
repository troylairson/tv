import { describe, expect, it } from 'vitest';
import { airingAt, truncateLineup, type BreakOptions, type LineupAiring } from './lineup';
import { extendScheduledLineup, slotOccurrences, startScheduledLineup, type SlotSchedule } from './slots';
import { zonedParts, zonedTimeToUtc } from './timezone';
import type { ScheduleChannel, ScheduleItem } from './index';

const TZ = 'America/New_York';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('time zones', () => {
  it('converts wall-clock time in a zone to UTC, in and out of DST', () => {
    expect(new Date(zonedTimeToUtc(2026, 7, 1, 20, 0, TZ)).toISOString()).toBe('2026-07-02T00:00:00.000Z');
    expect(new Date(zonedTimeToUtc(2026, 1, 15, 20, 0, TZ)).toISOString()).toBe('2026-01-16T01:00:00.000Z');
  });

  it('handles the DST changeovers', () => {
    // 02:30 doesn't exist on spring-forward day: resolves to just after the jump.
    expect(zonedParts(zonedTimeToUtc(2026, 3, 8, 2, 30, TZ), TZ).hour).toBe(3);
    // 01:30 happens twice on fall-back day: the first (EDT) one.
    expect(new Date(zonedTimeToUtc(2026, 11, 1, 1, 30, TZ)).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
});

const show = (id: string, min: number): ScheduleItem => ({ id, durationSec: min * 60 });
const MON = Date.UTC(2026, 9, 12, 16); // Mon 12 Oct 2026, 12:00 New York

function weeknightSlot(items: ScheduleItem[], order: 'next' | 'random' = 'next', durationMin = 60): SlotSchedule {
  return { timeZone: TZ, slots: [{ id: 'cheers', days: [1, 2, 3, 4, 5], start: '20:00', durationMin, order, title: 'Cheers', items }] };
}

const cheers = Array.from({ length: 10 }, (_, i) => show(`cheers-${i + 1}`, 22));
const ads: ScheduleItem[] = Array.from({ length: 30 }, (_, i) => ({ id: `ad-${i}`, durationSec: 15 + (i % 4) * 15 }));
const breaks: BreakOptions = { pool: ads, min: 1, max: 3, avoidRepeat: 6 };

function build(channel: ScheduleChannel, schedule: SlotSchedule, hours: number, withBreaks = true) {
  return extendScheduledLineup(startScheduledLineup(channel, schedule, MON), channel, schedule, MON + hours * HOUR, withBreaks ? breaks : null);
}

function contiguous(airings: LineupAiring[]) {
  for (let i = 1; i < airings.length; i++) expect(airings[i]!.startMs).toBe(airings[i - 1]!.endMs);
}

describe('slotOccurrences', () => {
  it('lists weeknight 8 pm slots in local time', () => {
    const occ = slotOccurrences(weeknightSlot(cheers), MON, MON + 7 * DAY);
    expect(occ).toHaveLength(5);
    for (const o of occ) {
      const p = zonedParts(o.startMs, TZ);
      expect([p.hour, p.minute]).toEqual([20, 0]);
      expect(o.endMs - o.startMs).toBe(HOUR);
    }
  });
});

describe('scheduled lineups', () => {
  const sitcoms: ScheduleChannel = { id: 'sitcoms', mode: 'shuffle', anchorMs: MON - 30 * DAY, items: Array.from({ length: 20 }, (_, i) => show(`fill-${i}`, 25)) };

  it('starts every slot on time, with its episodes in order across nights', () => {
    const schedule = weeknightSlot(cheers);
    const lineup = build(sitcoms, schedule, 5 * 24);
    contiguous(lineup.airings);
    const occ = slotOccurrences(schedule, MON, MON + 5 * DAY);
    const slotEpisodes: string[] = [];
    for (const o of occ) {
      const first = airingAt(lineup.airings, o.startMs)!;
      expect(first.startMs).toBe(o.startMs);
      expect(first.slotId).toBe('cheers');
      expect(first.kind).toBe('show');
      // Nothing from the slot spills past its end, and fill resumes right after.
      const inSlot = lineup.airings.filter((a) => a.startMs >= o.startMs && a.startMs < o.endMs);
      expect(inSlot.every((a) => a.slotId === 'cheers')).toBe(true);
      expect(airingAt(lineup.airings, o.endMs)!.slotId).toBeUndefined();
      slotEpisodes.push(...inSlot.filter((a) => a.kind === 'show').map((a) => a.item.id));
    }
    // A 60-minute slot fits two 22-minute episodes; episodes continue night to night.
    expect(slotEpisodes).toEqual(cheers.map((c) => c.id).concat(cheers.map((c) => c.id)).slice(0, 10));
  });

  it('pads the gap before a slot with commercials and a "coming up" card', () => {
    const schedule = weeknightSlot(cheers);
    const lineup = build(sitcoms, schedule, 24);
    const slotStart = slotOccurrences(schedule, MON, MON + DAY)[0]!.startMs;
    const before = lineup.airings.filter((a) => a.endMs <= slotStart && a.endMs > slotStart - 20 * MIN);
    expect(before.some((a) => a.kind === 'commercial' || a.kind === 'ident')).toBe(true);
    const ident = lineup.airings.find((a) => a.kind === 'ident' && a.endMs === slotStart);
    if (ident) expect((ident.item as { title?: string }).title).toBe('Cheers');
  });

  it('fits a shorter show before a slot on shuffled channels, and does not repeat it in the cycle', () => {
    const mixed: ScheduleChannel = {
      id: 'mixed',
      mode: 'shuffle',
      anchorMs: MON - 30 * DAY,
      items: [...Array.from({ length: 6 }, (_, i) => show(`movie-${i}`, 100)), ...Array.from({ length: 6 }, (_, i) => show(`short-${i}`, 20))],
    };
    const schedule = weeknightSlot(cheers);
    const lineup = build(mixed, schedule, 5 * 24, false);
    contiguous(lineup.airings);
    for (const o of slotOccurrences(schedule, MON + 8 * HOUR, MON + 5 * DAY)) {
      expect(airingAt(lineup.airings, o.startMs)!.startMs).toBe(o.startMs);
    }
    // Within one pass through the items, nothing plays twice.
    const fill = lineup.airings.filter((a) => a.kind === 'show' && !a.slotId);
    for (let i = 0; i + mixed.items.length <= fill.length; i += mixed.items.length) {
      const pass = fill.slice(i, i + 4).map((a) => a.item.id);
      expect(new Set(pass).size).toBe(pass.length);
    }
  });

  it('lets an in-order movie run long rather than reorder (the slot starts late)', () => {
    const movies: ScheduleChannel = { id: 'movies', mode: 'loop', anchorMs: MON - 3 * HOUR, items: [show('epic', 200)] };
    const lineup = build(movies, weeknightSlot(cheers), 24, false);
    contiguous(lineup.airings);
    expect(lineup.airings.some((a) => a.slotId === 'cheers')).toBe(true);
  });

  it('is off the air between slots on a slot-only channel', () => {
    const empty: ScheduleChannel = { id: 'slots-only', mode: 'loop', anchorMs: MON, items: [] };
    const schedule = weeknightSlot(cheers);
    const lineup = build(empty, schedule, 48, false);
    contiguous(lineup.airings);
    const off = lineup.airings.filter((a) => a.kind === 'offair');
    expect(off.length).toBeGreaterThan(0);
    expect((off[0]!.item as { title?: string }).title).toBe('Cheers');
    expect(lineup.airings.filter((a) => a.slotId).length).toBeGreaterThan(0);
  });

  it('joins a slot in progress at its start', () => {
    const schedule = weeknightSlot(cheers);
    const slotStart = slotOccurrences(schedule, MON, MON + DAY)[0]!.startMs;
    const start = startScheduledLineup(sitcoms, schedule, slotStart + 10 * MIN);
    const lineup = extendScheduledLineup(start, sitcoms, schedule, slotStart + 3 * HOUR, breaks);
    expect(airingAt(lineup.airings, slotStart + 10 * MIN)!.slotId).toBe('cheers');
    expect(lineup.airings[0]!.startMs).toBe(slotStart);
  });

  it('regenerating from a truncation point reproduces the same schedule, slot progress included', () => {
    const schedule = weeknightSlot(cheers);
    const full = build(sitcoms, schedule, 4 * 24);
    // Cut just before a show starts. (Truncating keeps the airing in progress and drops the
    // rest of its break, so a cut mid-show or mid-break legitimately differs after that point.)
    const cut = full.airings.find((a) => a.kind === 'show' && a.startMs >= MON + 2 * DAY + 3 * HOUR)!.startMs - 1;
    const again = extendScheduledLineup(truncateLineup(full, cut), sitcoms, schedule, MON + 4 * 24 * HOUR, breaks);
    const sig = (l: typeof full) => l.airings.map((a) => `${a.kind}:${a.item.id}:${a.startMs}`);
    expect(sig(again)).toEqual(sig(full).slice(0, sig(again).length));
    expect(again.cursorMs).toBe(full.cursorMs);
  });

  it('random slots pick from the show', () => {
    const lineup = build(sitcoms, weeknightSlot(cheers, 'random'), 5 * 24);
    const ids = new Set(lineup.airings.filter((a) => a.slotId && a.kind === 'show').map((a) => a.item.id));
    expect([...ids].every((id) => id.startsWith('cheers-'))).toBe(true);
    expect(ids.size).toBeGreaterThan(2);
  });
});
