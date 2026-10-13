/**
 * Time slots: "Mon–Fri 20:00, 30 min → Cheers, next episode". Slots sit on top
 * of a channel's regular (fill) content. Fill plays until the next show won't
 * fit before a slot; the gap is padded with commercials and a "coming up next"
 * card so the slot starts on time. Inside a slot, as many episodes as fit play,
 * padded to the slot's end. A channel with no fill content is off the air
 * between slots.
 */
import { cycleOrder, hashString, mulberry32, nowPlaying, type ScheduleChannel, type ScheduleItem } from './index';
import {
  itemsKey,
  successor,
  type BreakOptions,
  type Cursor,
  type Lineup,
  type LineupAiring,
  type SlotState,
} from './lineup';
import { zonedDate, zonedTimeToUtc } from './timezone';

export interface TimeSlot<T extends ScheduleItem = ScheduleItem> {
  id: string;
  /** 0 = Sunday … 6 = Saturday, in the schedule's time zone. */
  days: number[];
  /** "HH:MM", 24-hour, in the schedule's time zone. */
  start: string;
  durationMin: number;
  /** next: carry on through the episodes from airing to airing. random: any episode. */
  order: 'next' | 'random';
  title: string;
  items: T[];
}

export interface SlotSchedule<T extends ScheduleItem = ScheduleItem> {
  timeZone: string;
  slots: TimeSlot<T>[];
}

export interface SlotOccurrence<T extends ScheduleItem = ScheduleItem> {
  slot: TimeSlot<T>;
  startMs: number;
  endMs: number;
}

const DAY_MS = 86_400_000;
/** Gaps longer than this before a slot first try to fit a shorter show (shuffled channels). */
const FIT_MIN_MS = 8 * 60_000;
/** In-order channels pad gaps up to this long; beyond it the next show runs long instead (order matters more). */
const PAD_LIMIT_MS = 30 * 60_000;
/** At most this much of a pad is commercials; the rest is the "coming up next" card. */
const PAD_ADS_MAX_MS = 6 * 60_000;
/** A slot episode may run this far past the slot's end before we stop adding episodes. */
const SLOT_OVERRUN_MS = 60_000;
/** Shuffled channels look this far ahead for a show that fits before a slot. */
const LOOKAHEAD = 40;

function parseStart(start: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start);
  if (!m) throw new Error(`bad slot start "${start}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Every occurrence of the schedule's slots overlapping [fromMs, toMs), by start time. */
export function slotOccurrences<T extends ScheduleItem>(schedule: SlotSchedule<T>, fromMs: number, toMs: number): SlotOccurrence<T>[] {
  if (!schedule.slots.length) return [];
  const out: SlotOccurrence<T>[] = [];
  // Start a day early to catch slots that began yesterday and run past midnight.
  const first = zonedDate(fromMs - DAY_MS, schedule.timeZone).dateMs;
  const last = zonedDate(toMs, schedule.timeZone).dateMs;
  for (let dateMs = first; dateMs <= last; dateMs += DAY_MS) {
    const date = new Date(dateMs);
    const weekday = date.getUTCDay();
    for (const slot of schedule.slots) {
      if (!slot.days.includes(weekday)) continue;
      const { hour, minute } = parseStart(slot.start);
      const startMs = zonedTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, schedule.timeZone);
      const endMs = startMs + slot.durationMin * 60_000;
      if (endMs > fromMs && startMs < toMs) out.push({ slot, startMs, endMs });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export function slotsKey(schedule: SlotSchedule | null | undefined): string {
  if (!schedule?.slots.length) return '';
  return hashString(
    JSON.stringify([
      schedule.timeZone,
      schedule.slots.map((s) => [s.id, s.days, s.start, s.durationMin, s.order, s.items.map((i) => `${i.id}:${i.durationSec}`)]),
    ]),
  ).toString(36);
}

const EMPTY_STATE: SlotState = { progress: {}, skip: [] };

/** Placeholder items for airings that aren't media. */
function marker<T extends ScheduleItem>(kind: 'ident' | 'offair', title: string, durationSec: number): T {
  return { id: kind, title, durationSec, source: 'local', ref: kind } as unknown as T;
}

/** A lineup for a channel with time slots, joining it at `atMs`. */
export function startScheduledLineup<T extends ScheduleItem>(
  channel: ScheduleChannel<T>,
  schedule: SlotSchedule<T>,
  atMs: number,
): Lineup<T> {
  const base = { channelId: channel.id, itemsKey: itemsKey(channel), slotsKey: slotsKey(schedule), slotState: EMPTY_STATE };
  // Inside a slot right now: start at the slot so its episode is joined mid-way, like real TV.
  const current = slotOccurrences(schedule, atMs, atMs + 1).find((o) => o.startMs <= atMs);
  const plain = nowPlaying(channel, atMs);
  if (current) {
    return { ...base, airings: [], cursor: plain ? { cycle: plain.cycle, index: plain.index } : { cycle: 0, index: 0 }, cursorMs: current.startMs };
  }
  if (!plain) return { ...base, airings: [], cursor: { cycle: 0, index: 0 }, cursorMs: atMs };
  const next = successor(channel, { cycle: plain.cycle, index: plain.index });
  return {
    ...base,
    airings: [{ kind: 'show', item: plain.item, startMs: plain.startMs, endMs: plain.endMs, next, state: EMPTY_STATE }],
    cursor: next,
    cursorMs: plain.endMs,
  };
}

/** Extend a slot channel's lineup to `untilMs`. */
export function extendScheduledLineup<T extends ScheduleItem>(
  lineup: Lineup<T>,
  channel: ScheduleChannel<T>,
  schedule: SlotSchedule<T>,
  untilMs: number,
  breaks: BreakOptions<T> | null,
): Lineup<T> {
  const airings = lineup.airings.slice();
  let { cursor, cursorMs } = lineup;
  let state: SlotState = lineup.slotState ?? EMPTY_STATE;
  const occurrences = slotOccurrences(schedule, cursorMs, untilMs + DAY_MS);
  const recentAds = airings.filter((a) => a.kind === 'commercial').map((a) => a.item.id);
  const hasFill = channel.items.some((i) => i.durationSec > 0);

  const push = (kind: LineupAiring<T>['kind'], item: T, startMs: number, endMs: number, slotId?: string) => {
    airings.push({ kind, item, startMs, endMs, next: cursor, slotId, state });
    if (kind === 'commercial') recentAds.push(item.id);
    cursorMs = endMs;
  };

  /** Commercials for [from, to): a seeded pick of ads that fit, stopping when none do. */
  const adsFor = (seed: string, from: number, to: number, maxCount: number): T[] => {
    if (!breaks || !breaks.pool.length) return [];
    const rand = mulberry32(hashString(`${channel.id}:${seed}`));
    const picks: T[] = [];
    let t = from;
    while (picks.length < maxCount) {
      const recent = new Set(recentAds.slice(-breaks.avoidRepeat).concat(picks.map((p) => p.id)));
      let fits = breaks.pool.filter((p) => t + p.durationSec * 1000 <= to && !recent.has(p.id));
      if (!fits.length) fits = breaks.pool.filter((p) => t + p.durationSec * 1000 <= to && !picks.some((x) => x.id === p.id));
      if (!fits.length) break;
      const ad = fits[Math.floor(rand() * fits.length)]!;
      picks.push(ad);
      t += ad.durationSec * 1000;
    }
    return picks;
  };

  /** Fill [cursorMs, to) with commercials, then a "coming up next" card for whatever's left. */
  const pad = (seed: string, to: number, upNext: string, slotId?: string) => {
    for (const ad of adsFor(seed, cursorMs, Math.min(to, cursorMs + PAD_ADS_MAX_MS), 60)) {
      push('commercial', ad, cursorMs, cursorMs + ad.durationSec * 1000, slotId);
    }
    if (to > cursorMs) push('ident', marker<T>('ident', upNext, (to - cursorMs) / 1000), cursorMs, to, slotId);
  };

  /** A 1–3 commercial break after a show, trimmed so it doesn't run past `limit`. */
  const breakAfter = (seed: string, limit: number, slotId?: string) => {
    if (!breaks || breaks.max <= 0) return;
    const rand = mulberry32(hashString(`${channel.id}:breaklen:${seed}`));
    const count = breaks.min + Math.floor(rand() * (breaks.max - breaks.min + 1));
    for (const ad of adsFor(`break:${seed}`, cursorMs, limit, count)) push('commercial', ad, cursorMs, cursorMs + ad.durationSec * 1000, slotId);
  };

  const playSlot = (o: SlotOccurrence<T>) => {
    const { slot } = o;
    const items = slot.items.filter((i) => i.durationSec > 0);
    if (!items.length) {
      pad(`slot:${slot.id}:${o.startMs}`, o.endMs, slot.title, slot.id);
      return;
    }
    const rand = mulberry32(hashString(`${channel.id}:slot:${slot.id}:${o.startMs}`));
    for (let k = 0; ; k++) {
      let index: number;
      if (slot.order === 'next') {
        index = (state.progress[slot.id] ?? 0) % items.length;
      } else {
        index = Math.floor(rand() * items.length);
      }
      const item = items[index]!;
      const end = cursorMs + item.durationSec * 1000;
      // The first episode always airs (even if it overruns); more only while they fit.
      if (k > 0 && end > o.endMs + SLOT_OVERRUN_MS) break;
      if (slot.order === 'next') state = { ...state, progress: { ...state.progress, [slot.id]: index + 1 } };
      push('show', item, cursorMs, end, slot.id);
      breakAfter(`slot:${slot.id}:${o.startMs}:${k}`, o.endMs, slot.id);
      if (cursorMs >= o.endMs) break;
    }
    if (cursorMs < o.endMs) pad(`slotpad:${slot.id}:${o.startMs}`, o.endMs, `${slot.title}`, slot.id);
  };

  /** Advance the fill cursor past items already played out of order. */
  const nextFill = (): { item: T; at: Cursor } | null => {
    for (let guard = 0; guard < channel.items.length + 2; guard++) {
      const order = cycleOrder(channel, cursor.cycle);
      const item = order[cursor.index];
      if (!item) return null;
      if (state.skip.includes(item.id)) {
        state = { ...state, skip: state.skip.filter((id) => id !== item.id) };
        cursor = successor(channel, cursor);
        continue;
      }
      return { item, at: cursor };
    }
    return null;
  };

  // Walk the occurrences in order. One that a long show ran into (or past) still airs, late.
  let next = occurrences.findIndex((x) => x.endMs > cursorMs);
  if (next < 0) next = occurrences.length;
  while (cursorMs < untilMs) {
    const o = occurrences[next];
    if (o && o.startMs <= cursorMs) {
      playSlot(o);
      next++;
      continue;
    }
    const limit = o ? o.startMs : Infinity;
    const upNext = o ? o.slot.title : '';
    const fill = hasFill ? nextFill() : null;
    if (!fill) {
      if (!o) break; // nothing at all to schedule
      push('offair', marker<T>('offair', upNext, (limit - cursorMs) / 1000), cursorMs, limit);
      continue;
    }

    const gap = limit - cursorMs;
    let item = fill.item;
    let outOfOrder = false;
    if (item.durationSec * 1000 > gap) {
      if (channel.mode === 'shuffle' && gap > FIT_MIN_MS) {
        // Find a shorter show later in this cycle that fits, and play it now.
        const order = cycleOrder(channel, cursor.cycle);
        const fits = order
          .slice(cursor.index + 1, cursor.index + 1 + LOOKAHEAD)
          .find((i) => i.durationSec * 1000 <= gap && !state.skip.includes(i.id));
        if (fits) {
          item = fits;
          outOfOrder = true;
        }
      }
      // Shuffled channels keep the slot on time whatever it takes; in-order ones only for short gaps.
      if (!outOfOrder && (channel.mode === 'shuffle' || gap <= PAD_LIMIT_MS)) {
        pad(`gap:${cursorMs}`, limit, upNext);
        continue;
      }
      // Otherwise (in-order channels with long shows): the show runs long and the slot starts late.
    }

    if (outOfOrder) {
      state = { ...state, skip: [...state.skip, item.id] };
    } else {
      cursor = successor(channel, fill.at);
      // A new cycle starts fresh: anything skipped there has been dealt with.
      if (cursor.cycle !== fill.at.cycle && state.skip.length) state = { ...state, skip: [] };
    }
    const end = cursorMs + item.durationSec * 1000;
    push('show', item, cursorMs, end);
    breakAfter(`fill:${fill.at.cycle}:${fill.at.index}:${item.id}`, limit);
  }

  return { ...lineup, airings, cursor, cursorMs, slotState: state, slotsKey: slotsKey(schedule) };
}
