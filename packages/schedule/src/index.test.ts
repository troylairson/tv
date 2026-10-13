import { describe, expect, it } from 'vitest';
import { airingsBetween, cycleOrder, nowPlaying, seededShuffle, type ScheduleChannel } from './index';

const ANCHOR = Date.UTC(2026, 0, 1);
const items = [
  { id: 'a', durationSec: 60 },
  { id: 'b', durationSec: 120 },
  { id: 'c', durationSec: 30 },
];
const loop: ScheduleChannel = { id: 'ch1', mode: 'loop', anchorMs: ANCHOR, items };
const shuffle: ScheduleChannel = { id: 'ch2', mode: 'shuffle', anchorMs: ANCHOR, items };

describe('nowPlaying (loop)', () => {
  it('starts the first item at the anchor', () => {
    const now = nowPlaying(loop, ANCHOR)!;
    expect(now.item.id).toBe('a');
    expect(now.offsetSec).toBe(0);
    expect(now.remainingSec).toBe(60);
  });

  it('finds the item and offset partway through a cycle', () => {
    const now = nowPlaying(loop, ANCHOR + 90_000)!;
    expect(now.item.id).toBe('b');
    expect(now.offsetSec).toBe(30);
    expect(now.startMs).toBe(ANCHOR + 60_000);
    expect(now.endMs).toBe(ANCHOR + 180_000);
  });

  it('switches items exactly at the boundary', () => {
    expect(nowPlaying(loop, ANCHOR + 59_999)!.item.id).toBe('a');
    expect(nowPlaying(loop, ANCHOR + 60_000)!.item.id).toBe('b');
  });

  it('wraps around after a full cycle', () => {
    const now = nowPlaying(loop, ANCHOR + 210_000 * 1000 + 65_000)!;
    expect(now.item.id).toBe('b');
    expect(now.offsetSec).toBe(5);
    expect(now.cycle).toBe(1000);
  });

  it('works before the anchor', () => {
    const now = nowPlaying(loop, ANCHOR - 10_000)!;
    expect(now.item.id).toBe('c');
    expect(now.offsetSec).toBe(20);
    expect(now.cycle).toBe(-1);
  });

  it('returns null for a channel with nothing playable', () => {
    expect(nowPlaying({ ...loop, items: [] }, ANCHOR)).toBeNull();
    expect(nowPlaying({ ...loop, items: [{ id: 'x', durationSec: 0 }] }, ANCHOR)).toBeNull();
  });

  it('skips zero-length items', () => {
    const ch = { ...loop, items: [{ id: 'z', durationSec: 0 }, ...items] };
    expect(nowPlaying(ch, ANCHOR)!.item.id).toBe('a');
  });
});

describe('shuffle', () => {
  it('is deterministic per cycle and contains every item once', () => {
    const order = cycleOrder(shuffle, 7).map((i) => i.id);
    expect(cycleOrder(shuffle, 7).map((i) => i.id)).toEqual(order);
    expect([...order].sort()).toEqual(['a', 'b', 'c']);
  });

  it('varies between cycles', () => {
    const orders = new Set(Array.from({ length: 20 }, (_, c) => cycleOrder(shuffle, c).map((i) => i.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('agrees with nowPlaying', () => {
    for (let t = 0; t < 2_000_000; t += 7_919) {
      const now = nowPlaying(shuffle, ANCHOR + t)!;
      expect(cycleOrder(shuffle, now.cycle)[now.index]).toBe(now.item);
    }
  });

  it('seededShuffle does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    seededShuffle(input, 42);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('airingsBetween', () => {
  it('covers the window with contiguous airings', () => {
    const from = ANCHOR + 45_000;
    const to = from + 3_600_000;
    for (const ch of [loop, shuffle]) {
      const airings = airingsBetween(ch, from, to);
      expect(airings[0]!.startMs).toBeLessThanOrEqual(from);
      expect(airings[airings.length - 1]!.endMs).toBeGreaterThanOrEqual(to);
      for (let i = 1; i < airings.length; i++) expect(airings[i]!.startMs).toBe(airings[i - 1]!.endMs);
    }
  });

  it('matches nowPlaying at every airing start', () => {
    for (const a of airingsBetween(shuffle, ANCHOR, ANCHOR + 3_600_000)) {
      expect(nowPlaying(shuffle, a.startMs)!.item).toBe(a.item);
    }
  });

  it('is empty for an empty channel', () => {
    expect(airingsBetween({ ...loop, items: [] }, ANCHOR, ANCHOR + 1000)).toEqual([]);
  });
});
