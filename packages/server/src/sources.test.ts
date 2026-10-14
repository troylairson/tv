import { describe, expect, it } from 'vitest';
import { tooRecent } from './sources';

describe('tooRecent', () => {
  it('drops titles that only mention years after the cutoff', () => {
    expect(tooRecent('Pulse (Kairo) 2001 (ENG Sub)', 1975)).toBe(true);
    expect(tooRecent('01 - The Looney Tunes Show - April 9, 2014 - 8am EST', 1975)).toBe(true);
    expect(tooRecent('Password (2019)', 1995)).toBe(true);
  });

  it('keeps old titles, titles without years, and old films with a later restoration date', () => {
    expect(tooRecent('The Cabinet Of Dr. Caligari (1920) 1994 Restoration', 1975)).toBe(false);
    expect(tooRecent('Get Smart S01E01 (Mr. Big)', 1975)).toBe(false);
    expect(tooRecent('Classic Concentration 1987-05-11', 1995)).toBe(false);
    expect(tooRecent('Rocketship X-M (1950)', 1966)).toBe(false);
  });

  it('ignores digits that are not years', () => {
    expect(tooRecent('865 The Giant Gila Monster', 1966)).toBe(false);
    expect(tooRecent('Episode 20190', 1966)).toBe(false);
  });
});
