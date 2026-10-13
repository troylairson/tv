/**
 * Materialised schedules. Commercial breaks of random length make each pass
 * through a channel a different length, so "elapsed mod total" no longer works.
 * Instead the server generates airings forward from where the channel is and
 * stores them; every screen reads the same stored lineup. Choices are seeded
 * from (channel, cycle, index), so regenerating gives the same result.
 */
import { cycleOrder, hashString, mulberry32, nowPlaying, type ScheduleChannel, type ScheduleItem } from './index';

export interface Cursor {
  cycle: number;
  index: number;
}

/**
 * show: a programme. commercial: part of a break. ident: a "coming up next"
 * card that pads to a time slot. offair: nothing scheduled (slot-only channels).
 */
export type AiringKind = 'show' | 'commercial' | 'ident' | 'offair';

/** Time-slot bookkeeping, snapshotted on airings so regenerating from any point resumes correctly. */
export interface SlotState {
  /** Next episode index per slot id (for "next episode" slots). */
  progress: Record<string, number>;
  /** Fill items already played out of order this cycle (to fit before a slot), to skip when reached. */
  skip: string[];
}

export interface LineupAiring<T extends ScheduleItem = ScheduleItem> {
  kind: AiringKind;
  item: T;
  startMs: number;
  endMs: number;
  /** The show that follows this airing (and its break). */
  next: Cursor;
  /** Set when the airing belongs to a time slot. */
  slotId?: string;
  /** Slot bookkeeping after this airing (slot channels only). */
  state?: SlotState;
}

export interface Lineup<T extends ScheduleItem = ScheduleItem> {
  channelId: string;
  /** Fingerprint of the channel's item list; when it changes, the cursor is rebased. */
  itemsKey: string;
  airings: LineupAiring<T>[];
  /** Next show to schedule, and when it starts. */
  cursor: Cursor;
  cursorMs: number;
  /** Fingerprint of the channel's time slots (timing and content); a change regenerates the future. */
  slotsKey?: string;
  slotState?: SlotState;
}

export interface BreakOptions<T extends ScheduleItem = ScheduleItem> {
  pool: T[];
  min: number;
  max: number;
  /** Don't repeat any of the last N commercials aired on this channel (when the pool allows). */
  avoidRepeat: number;
}

export function itemsKey(channel: ScheduleChannel): string {
  // Mode is part of it: switching between in-order and shuffle changes what plays next.
  return hashString(channel.mode + '|' + channel.items.map((i) => `${i.id}:${i.durationSec}`).join('|')).toString(36);
}

export function successor(channel: ScheduleChannel, { cycle, index }: Cursor): Cursor {
  return index + 1 < cycleOrder(channel, cycle).length ? { cycle, index: index + 1 } : { cycle: cycle + 1, index: 0 };
}

/** A new lineup that joins the channel's plain (break-free) schedule at `atMs`. */
export function startLineup<T extends ScheduleItem>(channel: ScheduleChannel<T>, atMs: number): Lineup<T> | null {
  const now = nowPlaying(channel, atMs);
  if (!now) return null;
  const at: Cursor = { cycle: now.cycle, index: now.index };
  const next = successor(channel, at);
  return {
    channelId: channel.id,
    itemsKey: itemsKey(channel),
    airings: [{ kind: 'show', item: now.item, startMs: now.startMs, endMs: now.endMs, next }],
    cursor: next,
    cursorMs: now.endMs,
  };
}

function pickBreak<T extends ScheduleItem>(channelId: string, at: Cursor, recent: Set<string>, options: BreakOptions<T>): T[] {
  const { pool, min, max } = options;
  if (!pool.length || max <= 0) return [];
  const rand = mulberry32(hashString(`${channelId}:break:${at.cycle}:${at.index}`));
  const count = Math.max(0, min) + Math.floor(rand() * (Math.max(min, max) - Math.max(0, min) + 1));
  const picks: T[] = [];
  for (let i = 0; i < count; i++) {
    const taken = new Set(picks.map((p) => p.id));
    let candidates = pool.filter((p) => !taken.has(p.id) && !recent.has(p.id));
    if (!candidates.length) candidates = pool.filter((p) => !taken.has(p.id));
    if (!candidates.length) break;
    picks.push(candidates[Math.floor(rand() * candidates.length)]!);
  }
  return picks;
}

/** Append shows (and breaks after each, if `breaks` is given) until the lineup reaches `untilMs`. */
export function extendLineup<T extends ScheduleItem>(
  lineup: Lineup<T>,
  channel: ScheduleChannel<T>,
  untilMs: number,
  breaks: BreakOptions<T> | null,
): Lineup<T> {
  const airings = lineup.airings.slice();
  let { cursor, cursorMs } = lineup;
  const recentIds = airings
    .filter((a) => a.kind === 'commercial')
    .slice(-(breaks?.avoidRepeat ?? 0))
    .map((a) => a.item.id);

  while (cursorMs < untilMs) {
    const order = cycleOrder(channel, cursor.cycle);
    const show = order[cursor.index];
    if (!show) break; // channel has nothing playable
    const next = successor(channel, cursor);
    const showEnd = cursorMs + show.durationSec * 1000;
    airings.push({ kind: 'show', item: show, startMs: cursorMs, endMs: showEnd, next });
    cursorMs = showEnd;

    if (breaks) {
      const recent = new Set(recentIds.slice(-breaks.avoidRepeat));
      for (const ad of pickBreak(channel.id, cursor, recent, breaks)) {
        const end = cursorMs + ad.durationSec * 1000;
        airings.push({ kind: 'commercial', item: ad, startMs: cursorMs, endMs: end, next });
        recentIds.push(ad.id);
        cursorMs = end;
      }
    }
    cursor = next;
  }
  return { ...lineup, airings, cursor, cursorMs };
}

/**
 * Keep what's already aired or airing at `atMs` and drop the rest, so the
 * lineup can be regenerated (settings changed, commercial pool changed).
 * Whatever is on right now finishes normally.
 */
export function truncateLineup<T extends ScheduleItem>(lineup: Lineup<T>, atMs: number): Lineup<T> {
  const keep = lineup.airings.filter((a) => a.startMs <= atMs);
  const last = keep[keep.length - 1];
  if (!last) return { ...lineup, airings: [] };
  return { ...lineup, airings: keep, cursor: last.next, cursorMs: last.endMs, slotState: last.state ?? lineup.slotState };
}

/** After the channel's items changed: finish the current airing, then join the new item list's schedule. */
export function rebaseLineup<T extends ScheduleItem>(lineup: Lineup<T>, channel: ScheduleChannel<T>, atMs: number): Lineup<T> | null {
  const kept = truncateLineup(lineup, atMs);
  const last = kept.airings[kept.airings.length - 1];
  if (!last) return startLineup(channel, atMs);
  // The show that's "on" in the new schedule at hand-over time starts from its beginning.
  const now = nowPlaying(channel, kept.cursorMs);
  if (!now) return null;
  const cursor = { cycle: now.cycle, index: now.index };
  const airings = [...kept.airings.slice(0, -1), { ...last, next: cursor }];
  return { ...kept, itemsKey: itemsKey(channel), airings, cursor };
}

export function pruneLineup<T extends ScheduleItem>(lineup: Lineup<T>, beforeMs: number): Lineup<T> {
  const airings = lineup.airings.filter((a) => a.endMs > beforeMs);
  return airings.length === lineup.airings.length ? lineup : { ...lineup, airings };
}

/** Binary search for the airing on at `t`. */
export function airingAt<T extends ScheduleItem>(airings: readonly LineupAiring<T>[], t: number): LineupAiring<T> | null {
  let lo = 0;
  let hi = airings.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const a = airings[mid]!;
    if (t < a.startMs) hi = mid - 1;
    else if (t >= a.endMs) lo = mid + 1;
    else return a;
  }
  return null;
}
