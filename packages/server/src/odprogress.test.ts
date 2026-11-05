import { describe, expect, it } from 'vitest';
import { allProgress, recordProgress } from './odprogress';

const base = { itemId: 'plex:1', key: 'plex:9', title: 'Pilot', pos: 120, dur: 1500 };

describe('shared On Demand progress', () => {
  it('keeps the newest position for each item', () => {
    expect(recordProgress({ ...base, at: 1000 })).toBe(true);
    expect(recordProgress({ ...base, pos: 600, at: 3000 })).toBe(true);
    // An older report (a TV that was offline) doesn't wind it back.
    expect(recordProgress({ ...base, pos: 60, at: 2000 })).toBe(true);
    expect(allProgress().find((p) => p.itemId === 'plex:1')?.pos).toBe(600);
  });

  it('turns away nonsense', () => {
    expect(recordProgress(null)).toBe(false);
    expect(recordProgress({ ...base, dur: 0 })).toBe(false);
    expect(recordProgress({ ...base, pos: -5 })).toBe(false);
    expect(recordProgress({ ...base, itemId: 7 })).toBe(false);
  });

  it('never dates an entry in the future', () => {
    recordProgress({ ...base, itemId: 'x', at: Date.now() + 1e9 });
    expect(allProgress().find((p) => p.itemId === 'x')!.at).toBeLessThanOrEqual(Date.now());
  });
});
