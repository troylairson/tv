/**
 * On Demand: everything the channels play, as a library you can browse and
 * watch any time. Built from the channels' resolved items (so it follows the
 * Video sources setting and health checks): episodes are grouped into shows by
 * their split titles, everything else is a movie (or a one-off).
 */
import { getChannels } from './channels';
import * as plex from './plex';
import type { Channel, ChannelItem } from './types';

/** Clips and ads aren't worth listing on their own. */
const MIN_MOVIE_SEC = 4 * 60;

export interface OnDemandEntry {
  key: string;
  title: string;
  kind: 'show' | 'movie';
  /** Episodes in a show. */
  count: number;
  thumb?: string;
  logo?: string;
  description?: string;
  year?: number;
  /** Which channels play it (numbers). */
  channels: number[];
}

export interface OnDemandEpisode {
  item: ChannelItem;
  season: number;
  /** Position within the season, for ordering. */
  order: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const yearOf = (s: string) => {
  const m = /\((?:19|20)\d{2}\)|\b(?:19|20)\d{2}\b/.exec(s);
  return m ? Number(m[0].replace(/\D/g, '')) : undefined;
};
export const keyOf = (item: ChannelItem) => (item.show ? `show:${norm(item.show)}` : `item:${item.id}`);

/** Season and episode numbers from an episode line ("S2E14 · …", "Ep. 6 · …", "Part 3 of 9 · …"). */
export function episodeNumbers(episode: string | undefined): { season: number; order: number } | null {
  if (!episode) return null;
  let m = /^S(\d+)E(\d+)/.exec(episode);
  if (m) return { season: Number(m[1]), order: Number(m[2]) };
  m = /^Special(?: (\d+))?/.exec(episode);
  if (m) return { season: 0, order: Number(m[1] ?? 0) };
  m = /^(?:Ep\.|Part) (\d+)/.exec(episode);
  if (m) return { season: 1, order: Number(m[1]) };
  return null;
}

interface Group {
  entry: OnDemandEntry;
  items: Map<string, ChannelItem>;
}

let cache: { stamp: string; groups: Map<string, Group> } | null = null;

function channelItems(ch: Channel): ChannelItem[] {
  return [...ch.items, ...(ch.slots ?? []).flatMap((s) => s.items)];
}

function build(): Map<string, Group> {
  const { channels, builtAt } = getChannels();
  const stamp = `${builtAt}:${channels.map((c) => `${c.id}:${c.items.length}`).join(',')}`;
  if (cache?.stamp === stamp) return cache.groups;
  const groups = new Map<string, Group>();
  for (const ch of channels) {
    for (const item of channelItems(ch)) {
      if (item.source === 'local') continue;
      if (!item.show && item.durationSec < MIN_MOVIE_SEC) continue;
      const key = keyOf(item);
      let g = groups.get(key);
      if (!g) {
        g = {
          entry: {
            key,
            title: item.show ?? item.title,
            kind: item.show ? 'show' : 'movie',
            count: 0,
            thumb: item.thumb,
            logo: item.logo,
            description: item.show ? undefined : item.description,
            year: yearOf(item.title),
            channels: [],
          },
          items: new Map(),
        };
        groups.set(key, g);
      }
      if (!g.items.has(item.id)) g.items.set(item.id, item);
      if (!g.entry.channels.includes(ch.number)) g.entry.channels.push(ch.number);
      g.entry.thumb ??= item.thumb;
      g.entry.logo ??= item.logo;
    }
  }
  for (const g of groups.values()) g.entry.count = g.items.size;
  cache = { stamp, groups };
  return groups;
}

/** Every show and movie, A–Z, plus which entries each channel has. */
export function catalogue(): { entries: OnDemandEntry[]; channels: { id: string; number: number; name: string; keys: string[] }[] } {
  const groups = build();
  const entries = [...groups.values()].map((g) => g.entry).sort((a, b) => a.title.replace(/^the /i, '').localeCompare(b.title.replace(/^the /i, '')));
  const { channels } = getChannels();
  return {
    entries,
    channels: channels
      .filter((ch) => entries.some((e) => e.channels.includes(ch.number)))
      .map((ch) => ({ id: ch.id, number: ch.number, name: ch.name, keys: entries.filter((e) => e.channels.includes(ch.number)).map((e) => e.key) })),
  };
}

/** One show (seasons of episodes, in order) or movie. */
export function entryDetail(key: string): (OnDemandEntry & { seasons: { season: number; episodes: OnDemandEpisode[] }[] }) | null {
  const g = build().get(key);
  if (!g) return null;
  let fallback = 0;
  const episodes: OnDemandEpisode[] = [...g.items.values()].map((item) => {
    const n = episodeNumbers(item.episode);
    return { item, season: n?.season ?? 1, order: n?.order ?? 10_000 + fallback++ };
  });
  const seasons = [...new Set(episodes.map((e) => e.season))]
    .sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map((season) => ({ season, episodes: episodes.filter((e) => e.season === season).sort((a, b) => a.order - b.order) }));
  const description = g.entry.description ?? [...g.items.values()].find((i) => i.description)?.description;
  return { ...g.entry, description, seasons };
}

/** Where an item lives in On Demand, for "watch now" from the guide. */
export function findItem(id: string): { key: string; item: ChannelItem } | null {
  for (const [key, g] of build()) {
    const item = g.items.get(id);
    if (item) return { key, item };
  }
  // Not in the library (a short clip, say): still playable on its own.
  for (const ch of getChannels().channels) {
    const item = channelItems(ch).find((i) => i.id === id);
    if (item) return { key: keyOf(item), item };
  }
  return null;
}

// ── Plex libraries, beyond what the channels play ──────────────────────────

/** Every show or movie in a Plex library, as On Demand entries ("plex:<ratingKey>"). */
export async function plexLibraryEntries(sectionKey: string): Promise<OnDemandEntry[]> {
  const list = await plex.browseSection(sectionKey);
  return list
    .filter((m) => m.type === 'show' || m.type === 'movie')
    .map((m) => ({
      key: `plex:${m.ratingKey}`,
      title: m.title,
      kind: m.type === 'show' ? ('show' as const) : ('movie' as const),
      count: m.type === 'show' ? (m.count ?? 0) : 1,
      thumb: m.thumb,
      year: m.year,
      channels: [],
    }));
}

/** A Plex show (its episodes, by season) or movie, straight from Plex. */
export async function plexEntryDetail(ratingKey: string): Promise<ReturnType<typeof entryDetail>> {
  const items = await plex.resolveItem(ratingKey);
  if (!items.length) return null;
  const first = items[0]!;
  const isShow = items.length > 1 || Boolean(first.show);
  let fallback = 0;
  const episodes: OnDemandEpisode[] = items.map((item) => {
    const n = episodeNumbers(item.episode);
    return { item, season: n?.season ?? 1, order: n?.order ?? 10_000 + fallback++ };
  });
  const seasons = [...new Set(episodes.map((e) => e.season))]
    .sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map((season) => ({ season, episodes: episodes.filter((e) => e.season === season).sort((a, b) => a.order - b.order) }));
  return {
    key: `plex:${ratingKey}`,
    title: isShow ? (first.show ?? first.title) : first.title,
    kind: isShow ? 'show' : 'movie',
    count: items.length,
    thumb: first.thumb,
    logo: first.logo,
    description: isShow ? items.find((i) => i.description)?.description : first.description,
    year: yearOf(first.title),
    channels: [],
    seasons,
  };
}
