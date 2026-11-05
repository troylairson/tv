import { describe, expect, it } from 'vitest';
import { episodeNumbers } from './ondemand';

describe('episodeNumbers', () => {
  it('reads seasons and episodes from episode lines', () => {
    expect(episodeNumbers('S2E14 · The Big Con')).toEqual({ season: 2, order: 14 });
    expect(episodeNumbers('Ep. 6 · Furniture')).toEqual({ season: 1, order: 6 });
    expect(episodeNumbers('Part 3 of 9 · Forever Free')).toEqual({ season: 1, order: 3 });
    expect(episodeNumbers('Special · Here Comes the Nelsons')).toEqual({ season: 0, order: 0 });
    expect(episodeNumbers('01-07-95 · Saturday Night')).toBeNull();
    expect(episodeNumbers(undefined)).toBeNull();
  });
});
