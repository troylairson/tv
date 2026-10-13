import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ep = (key: string, show: string, s: number, e: number, title: string) => ({
  ratingKey: key, type: 'episode', title, grandparentTitle: show, parentIndex: s, index: e, duration: 1_500_000,
});
const SHOWS = [
  { ratingKey: '100', type: 'show', title: 'Cheers', leafCount: 3, thumb: '/library/metadata/100/thumb/1' },
  { ratingKey: '200', type: 'show', title: 'Taxi', leafCount: 2 },
];
// Deliberately out of order: the resolver must sort by season/episode.
const EPISODES: Record<string, unknown[]> = {
  '100': [ep('103', 'Cheers', 2, 1, 'Power Play'), ep('101', 'Cheers', 1, 1, 'Give Me a Ring'), ep('102', 'Cheers', 1, 2, 'Sams Women')],
  '200': [ep('202', 'Taxi', 1, 2, 'Blind Date'), ep('201', 'Taxi', 1, 1, 'Like Father')],
};
const MOVIE = { ratingKey: '10', type: 'movie', title: 'His Girl Friday', year: 1940, duration: 5_520_000 };
const ROUTES: Record<string, unknown[]> = {
  '/library/sections/1/all': [MOVIE],
  '/library/sections/1/collections': [{ ratingKey: '500', type: 'collection', title: 'Noir', childCount: 2 }],
  '/library/collections/500/children': [MOVIE, SHOWS[1]],
  '/library/metadata/10': [MOVIE],
  '/library/metadata/100': [SHOWS[0]],
  '/library/metadata/100/allLeaves': EPISODES['100']!,
  '/library/metadata/200/allLeaves': EPISODES['200']!,
};

const plex = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://plex');
  if (req.headers['x-plex-token'] !== 'secret') {
    res.writeHead(401);
    return res.end();
  }
  let list = ROUTES[url.pathname];
  if (url.pathname === '/library/sections') {
    return res.end(JSON.stringify({ MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }, { key: '2', title: 'TV Shows', type: 'show' }] } }));
  }
  if (url.pathname === '/library/sections/2/all') {
    list = url.searchParams.get('type') === '4' ? [...EPISODES['200']!, ...EPISODES['100']!] : SHOWS;
    const title = url.searchParams.get('title');
    if (title) list = list.filter((m) => (m as { title: string }).title.toLowerCase().includes(title.toLowerCase()));
  }
  if (!list) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ MediaContainer: { Metadata: list } }));
});

let plexMod: typeof import('./plex');
let sources: typeof import('./sources');

beforeAll(async () => {
  await new Promise<void>((r) => plex.listen(0, '127.0.0.1', r));
  process.env.PLEX_URL = `http://127.0.0.1:${(plex.address() as AddressInfo).port}`;
  process.env.PLEX_TOKEN = 'secret';
  plexMod = await import('./plex');
  sources = await import('./sources');
});
afterAll(() => void plex.close());

describe('Plex browsing', () => {
  it('lists shows with episode counts and proxied thumbnails, filtered by title', async () => {
    const shows = await plexMod.browseSection('2');
    expect(shows.map((s) => [s.title, s.count])).toEqual([['Cheers', 3], ['Taxi', 2]]);
    expect(shows[0]!.thumb).toContain('/plex/photo/:/transcode');
    expect((await plexMod.browseSection('2', 'tax')).map((s) => s.title)).toEqual(['Taxi']);
  });

  it('lists collections', async () => {
    expect(await plexMod.browseCollections('1')).toMatchObject([{ ratingKey: '500', title: 'Noir', type: 'collection' }]);
  });
});

describe('Plex sources', () => {
  it('a show plays every episode in season/episode order', async () => {
    const items = await sources.resolveSource({ kind: 'plex-show', ratingKey: '100', title: 'Cheers' });
    expect(items.map((i) => i.title)).toEqual([
      'Cheers S01E01 – Give Me a Ring',
      'Cheers S01E02 – Sams Women',
      'Cheers S02E01 – Power Play',
    ]);
    expect(items[0]).toMatchObject({ id: 'plex:101', source: 'plex', ref: '101', durationSec: 1500 });
  });

  it('a collection expands shows into episodes', async () => {
    const items = await sources.resolveSource({ kind: 'plex-collection', ratingKey: '500', title: 'Noir' });
    expect(items.map((i) => i.ref)).toEqual(['10', '201', '202']);
  });

  it('a library of shows lists all episodes by show, season, episode', async () => {
    const items = await sources.resolveSource({ kind: 'plex-library', sectionKey: '2', type: 'show', title: 'TV' });
    expect(items.map((i) => i.ref)).toEqual(['101', '102', '103', '201', '202']);
  });

  it('a single item that is a show expands; a movie stays one item', async () => {
    expect((await sources.resolveSource({ kind: 'plex-item', ratingKey: '100', title: 'Cheers' })).length).toBe(3);
    expect((await sources.resolveSource({ kind: 'plex-item', ratingKey: '10', title: 'Movie' })).map((i) => i.title)).toEqual([
      'His Girl Friday (1940)',
    ]);
  });

  it('combines sources in order, drops duplicates and excluded items, and reports failures', async () => {
    const { items, errors } = await sources.resolveSources(
      [
        { kind: 'plex-show', ratingKey: '200', title: 'Taxi' },
        { kind: 'plex-collection', ratingKey: '500', title: 'Noir' },
        { kind: 'plex-show', ratingKey: '999', title: 'Missing show' },
      ],
      ['plex:10'],
    );
    expect(items.map((i) => i.ref)).toEqual(['201', '202']);
    expect(errors).toEqual([expect.stringContaining('Missing show')]);
  });
});
