import { describe, expect, it } from 'vitest';
import type { LibraryTitle } from './plex';
import { proposeForLibrary } from './plexgen';

let n = 0;
const show = (title: string, year: number, genres: string[], extra: Partial<LibraryTitle> = {}): LibraryTitle => ({
  ratingKey: String(++n),
  title,
  year,
  genres,
  episodes: 50,
  minutes: 22,
  ...extra,
});

const SHOWS = [
  show('Cheers', 1982, ['Comedy'], { studio: 'NBC', episodes: 275 }),
  show('Family Ties', 1982, ['Comedy'], { studio: 'NBC', episodes: 176 }),
  show('Night Court', 1984, ['Comedy'], { studio: 'NBC' }),
  show('Seinfeld', 1989, ['Comedy'], { studio: 'NBC', episodes: 180 }),
  show('Friends', 1994, ['Comedy', 'Romance'], { studio: 'NBC', episodes: 236 }),
  show('Frasier', 1993, ['Comedy'], { studio: 'NBC' }),
  show('Home Improvement', 1991, ['Comedy'], { studio: 'ABC' }),
  show('DuckTales', 1987, ['Animation', 'Kids'], { contentRating: 'TV-Y7', studio: 'Syndication' }),
  show('Rugrats', 1991, ['Animation', 'Kids'], { contentRating: 'TV-Y', studio: 'Nickelodeon' }),
  show('Doug', 1991, ['Animation'], { contentRating: 'TV-Y', studio: 'Nickelodeon' }),
  show('The X-Files', 1993, ['Drama', 'Sci-Fi & Fantasy'], { studio: 'FOX' }),
];

describe('proposeForLibrary', () => {
  const props = proposeForLibrary({ key: '2', title: 'TV Shows', type: 'show' }, SHOWS);
  const names = props.map((p) => p.name);

  it('makes era + genre channels where there are enough shows', () => {
    expect(names).toContain('80s Sitcoms');
    expect(names).toContain('90s Sitcoms');
    expect(names).not.toContain('80s Cartoons'); // only one 80s cartoon
  });
  it('falls back to an all-eras channel for a thin genre', () => {
    expect(names).toContain('Cartoons');
  });
  it('proposes networks, kids and marathons', () => {
    expect(names).toContain('NBC');
    expect(names).not.toContain('ABC');
    expect(names).toContain("Kids' TV");
    expect(names).toContain('Cheers Marathon');
    expect(props.find((p) => p.name === 'Cheers Marathon')!.mode).toBe('loop');
  });
  it('describes what each would play', () => {
    const p = props.find((x) => x.name === '80s Sitcoms')!;
    expect(p.summary).toMatch(/^4 shows · 681 episodes · about 2\d\d hours$/);
    expect(p.examples[0]).toBe('Cheers (1982)');
    expect(p.sources[0]).toMatchObject({ kind: 'plex-filter', sectionKey: '2', type: 'show', genres: ['Comedy'], years: [1980, 1989] });
  });
});
