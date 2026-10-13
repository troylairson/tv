import { describe, expect, it } from 'vitest';
import { nowPlaying, type ScheduleChannel } from './index';
import { airingAt, extendLineup, pruneLineup, rebaseLineup, startLineup, truncateLineup, type BreakOptions } from './lineup';

const ANCHOR = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const shows = Array.from({ length: 6 }, (_, i) => ({ id: `show${i}`, durationSec: 600 + i * 60 }));
const channel: ScheduleChannel = { id: 'ch', mode: 'shuffle', anchorMs: ANCHOR, items: shows };
const ads = Array.from({ length: 12 }, (_, i) => ({ id: `ad${i}`, durationSec: 15 + i * 5 }));
const breaks: BreakOptions = { pool: ads, min: 1, max: 3, avoidRepeat: 6 };
const NOW = ANCHOR + 1000 * HOUR + 123_456;

function contiguous(airings: { startMs: number; endMs: number }[]) {
  for (let i = 1; i < airings.length; i++) expect(airings[i]!.startMs).toBe(airings[i - 1]!.endMs);
}

describe('lineup', () => {
  it('starts on what the plain schedule says is on now', () => {
    const lineup = startLineup(channel, NOW)!;
    expect(lineup.airings[0]!.item).toBe(nowPlaying(channel, NOW)!.item);
    expect(airingAt(lineup.airings, NOW)).toBe(lineup.airings[0]);
  });

  it('puts 1-3 commercials after every show, contiguously', () => {
    const lineup = extendLineup(startLineup(channel, NOW)!, channel, NOW + 24 * HOUR, breaks);
    contiguous(lineup.airings);
    expect(lineup.cursorMs).toBeGreaterThanOrEqual(NOW + 24 * HOUR);
    let run = 0;
    let breaksSeen = 0;
    for (const a of lineup.airings.slice(1)) {
      if (a.kind === 'commercial') run++;
      else {
        if (breaksSeen++ > 0 || run > 0) expect(run).toBeGreaterThanOrEqual(1);
        expect(run).toBeLessThanOrEqual(3);
        run = 0;
      }
    }
    expect(lineup.airings.filter((a) => a.kind === 'commercial').length).toBeGreaterThan(50);
  });

  it('avoids repeating recent commercials', () => {
    const lineup = extendLineup(startLineup(channel, NOW)!, channel, NOW + 24 * HOUR, breaks);
    const adIds = lineup.airings.filter((a) => a.kind === 'commercial').map((a) => a.item.id);
    for (let i = 0; i < adIds.length; i++) {
      expect(adIds.slice(Math.max(0, i - 6), i)).not.toContain(adIds[i]);
    }
  });

  it('has no breaks when breaks are off, and keeps the plain show order', () => {
    const lineup = extendLineup(startLineup(channel, NOW)!, channel, NOW + 6 * HOUR, null);
    expect(lineup.airings.every((a) => a.kind === 'show')).toBe(true);
    for (const a of lineup.airings) expect(nowPlaying(channel, a.startMs)!.item).toBe(a.item);
  });

  it('is deterministic', () => {
    const a = extendLineup(startLineup(channel, NOW)!, channel, NOW + 12 * HOUR, breaks);
    const b = extendLineup(startLineup(channel, NOW)!, channel, NOW + 12 * HOUR, breaks);
    expect(b.airings.map((x) => x.item.id)).toEqual(a.airings.map((x) => x.item.id));
  });

  it('extending in steps gives the same lineup as extending at once', () => {
    const once = extendLineup(startLineup(channel, NOW)!, channel, NOW + 12 * HOUR, breaks);
    let stepped = startLineup(channel, NOW)!;
    for (let h = 1; h <= 12; h++) stepped = extendLineup(stepped, channel, NOW + h * HOUR, breaks);
    expect(stepped.airings.map((x) => [x.item.id, x.startMs])).toEqual(once.airings.map((x) => [x.item.id, x.startMs]));
  });

  it('truncating keeps the current airing and regenerates after it', () => {
    const withBreaks = extendLineup(startLineup(channel, NOW)!, channel, NOW + 6 * HOUR, breaks);
    const t = NOW + 2 * HOUR;
    const current = airingAt(withBreaks.airings, t)!;
    const off = extendLineup(truncateLineup(withBreaks, t), channel, NOW + 6 * HOUR, null);
    contiguous(off.airings);
    expect(airingAt(off.airings, t)).toEqual(current);
    expect(off.airings.filter((a) => a.startMs > t).every((a) => a.kind === 'show')).toBe(true);
  });

  it('rebases onto a changed item list without a gap', () => {
    const lineup = extendLineup(startLineup(channel, NOW)!, channel, NOW + 6 * HOUR, breaks);
    const changed: ScheduleChannel = { ...channel, items: [...shows.slice(2), { id: 'new', durationSec: 900 }] };
    const t = NOW + HOUR;
    const rebased = extendLineup(rebaseLineup(lineup, changed, t)!, changed, NOW + 6 * HOUR, breaks);
    contiguous(rebased.airings);
    const { next: _a, ...nowAfter } = airingAt(rebased.airings, t)!;
    const { next: _b, ...nowBefore } = airingAt(lineup.airings, t)!;
    expect(nowAfter).toEqual(nowBefore);
    const ids = new Set(changed.items.map((i) => i.id));
    const after = rebased.airings.filter((a) => a.startMs > t && a.kind === 'show');
    expect(after.every((a) => ids.has(a.item.id))).toBe(true);
  });

  it('prunes old airings', () => {
    const lineup = extendLineup(startLineup(channel, NOW)!, channel, NOW + 6 * HOUR, breaks);
    const pruned = pruneLineup(lineup, NOW + 3 * HOUR);
    expect(pruned.airings[0]!.endMs).toBeGreaterThan(NOW + 3 * HOUR);
  });
});
