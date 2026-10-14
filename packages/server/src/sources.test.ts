import { describe, expect, it } from 'vitest';
import { tooRecent, uploadKey } from './sources';

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

describe('uploadKey', () => {
  it('matches re-uploads of the same film', () => {
    expect(uploadKey({ title: 'McLintock!', durationSec: 7620 })).toBe(uploadKey({ title: 'Mclintock', durationSec: 7650 }));
    expect(uploadKey({ title: 'House on Haunted Hill', durationSec: 4500 })).toBe(uploadKey({ title: 'The House On Haunted Hill', durationSec: 4510 }));
  });

  it('keeps different cuts and different films apart', () => {
    expect(uploadKey({ title: 'Nosferatu', durationSec: 5580 })).not.toBe(uploadKey({ title: 'Nosferatu', durationSec: 3900 }));
    expect(uploadKey({ title: 'Scarlet Street', durationSec: 6060 })).not.toBe(uploadKey({ title: 'Detour', durationSec: 6060 }));
  });
});
