/**
 * The schedule engine: turns a channel definition plus a wall-clock time into
 * "what is on and how far in are we". Pure and deterministic, so every client
 * (and the server) computes the same answer without any shared state.
 */

export interface ScheduleItem {
  id: string;
  durationSec: number;
}

export type ChannelMode = 'loop' | 'shuffle';

export interface ScheduleChannel<T extends ScheduleItem = ScheduleItem> {
  id: string;
  mode: ChannelMode;
  /** Epoch ms at which the first cycle starts. Times before it work too. */
  anchorMs: number;
  items: T[];
}

export interface Airing<T extends ScheduleItem = ScheduleItem> {
  item: T;
  /** Position of the item within its cycle's play order. */
  index: number;
  /** Which pass through the playlist this airing belongs to (can be negative). */
  cycle: number;
  startMs: number;
  endMs: number;
}

export interface NowPlaying<T extends ScheduleItem = ScheduleItem> extends Airing<T> {
  offsetSec: number;
  remainingSec: number;
}

export function totalDurationSec(items: readonly ScheduleItem[]): number {
  let total = 0;
  for (const item of items) total += Math.max(0, item.durationSec);
  return total;
}

/** Play order for one cycle: as-is for loop, a seeded shuffle for shuffle. */
export function cycleOrder<T extends ScheduleItem>(channel: ScheduleChannel<T>, cycle: number): T[] {
  const playable = channel.items.filter((item) => item.durationSec > 0);
  if (channel.mode === 'loop') return playable;
  return seededShuffle(playable, hashString(`${channel.id}:${cycle}`));
}

/** What is on `channel` at `nowMs`, or null if the channel has nothing playable. */
export function nowPlaying<T extends ScheduleItem>(channel: ScheduleChannel<T>, nowMs: number): NowPlaying<T> | null {
  const totalMs = totalDurationSec(channel.items) * 1000;
  if (totalMs <= 0) return null;

  const elapsed = nowMs - channel.anchorMs;
  const cycle = Math.floor(elapsed / totalMs);
  const cycleStart = channel.anchorMs + cycle * totalMs;
  let into = elapsed - cycle * totalMs;

  const order = cycleOrder(channel, cycle);
  let startMs = cycleStart;
  for (let index = 0; index < order.length; index++) {
    const item = order[index]!;
    const durMs = item.durationSec * 1000;
    // The last item absorbs floating point leftovers so we never fall off the end.
    if (into < durMs || index === order.length - 1) {
      const endMs = startMs + durMs;
      return {
        item,
        index,
        cycle,
        startMs,
        endMs,
        offsetSec: into / 1000,
        remainingSec: (endMs - nowMs) / 1000,
      };
    }
    into -= durMs;
    startMs += durMs;
  }
  return null;
}

/** Every airing that overlaps [fromMs, toMs), in order. This is a guide row. */
export function airingsBetween<T extends ScheduleItem>(
  channel: ScheduleChannel<T>,
  fromMs: number,
  toMs: number,
): Airing<T>[] {
  const first = nowPlaying(channel, fromMs);
  if (!first) return [];

  const airings: Airing<T>[] = [];
  let { cycle, index, startMs } = first;
  let order = cycleOrder(channel, cycle);
  while (startMs < toMs) {
    const item = order[index]!;
    const endMs = startMs + item.durationSec * 1000;
    airings.push({ item, index, cycle, startMs, endMs });
    startMs = endMs;
    index++;
    if (index >= order.length) {
      index = 0;
      cycle++;
      order = cycleOrder(channel, cycle);
    }
  }
  return airings;
}

/** FNV-1a, 32-bit. Stable across platforms, good enough to seed a shuffle. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
export type { Channel, ChannelConfig, ChannelItem, IaSort, PlexFilterSource, SlotConfig, SourceRef } from './types';
export * from './lineup';
export * from './slots';
export * from './timezone';
