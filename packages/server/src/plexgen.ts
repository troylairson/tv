/**
 * "Build channels from my Plex": reads the libraries and proposes a lineup —
 * era + genre channels ("80s Sitcoms"), network channels, marathons of big
 * shows, a kids channel, collections, movie channels by genre and decade. The
 * manager shows them as checkboxes; ticked ones become ordinary channels.
 *
 * Proposals use Plex filters rather than fixed lists, so a channel picks up
 * what's added to the library later.
 */
import type { PlexFilterSource, SourceRef } from '@retro-tv/schedule';
import * as plex from './plex';
import type { LibraryTitle } from './plex';

export interface Proposal {
  id: string;
  group: string;
  name: string;
  /** "12 shows · 1,240 episodes · about 520 hours" */
  summary: string;
  /** A few of the titles it would play. */
  examples: string[];
  mode: 'loop' | 'shuffle';
  sources: SourceRef[];
}

/** Plex genre names → how a channel would call them, per library type. */
const SHOW_GENRES: Record<string, string> = {
  comedy: 'Sitcoms',
  animation: 'Cartoons',
  drama: 'Dramas',
  'action/adventure': 'Action',
  action: 'Action',
  adventure: 'Adventure',
  'sci-fi & fantasy': 'Sci-Fi',
  'science fiction': 'Sci-Fi',
  'science-fiction': 'Sci-Fi',
  fantasy: 'Fantasy',
  crime: 'Crime',
  mystery: 'Mystery',
  western: 'Westerns',
  reality: 'Reality TV',
  'game show': 'Game Shows',
  documentary: 'Documentaries',
  children: "Kids' Shows",
  kids: "Kids' Shows",
  family: 'Family Shows',
  horror: 'Horror',
  'talk show': 'Talk Shows',
  talk: 'Talk Shows',
  'war & politics': 'War',
  war: 'War',
  soap: 'Soaps',
  news: 'News',
  anime: 'Anime',
  music: 'Music',
  sport: 'Sports',
  sports: 'Sports',
};
const MOVIE_GENRES: Record<string, string> = {
  comedy: 'Comedy Movies',
  action: 'Action Movies',
  adventure: 'Adventure Movies',
  animation: 'Animated Movies',
  horror: 'Horror Movies',
  'science fiction': 'Sci-Fi Movies',
  'sci-fi': 'Sci-Fi Movies',
  thriller: 'Thrillers',
  drama: 'Dramas',
  romance: 'Romance Movies',
  western: 'Westerns',
  crime: 'Crime Movies',
  mystery: 'Mysteries',
  family: 'Family Movies',
  fantasy: 'Fantasy Movies',
  war: 'War Movies',
  musical: 'Musicals',
  music: 'Music Movies',
  documentary: 'Documentaries',
  history: 'Historical Movies',
};
/** Children's ratings only: TV-G covers plenty of family sitcoms. */
const KIDS_RATINGS = ['TV-Y', 'TV-Y7', 'TV-Y7-FV'];
/** Show genres the Kids' TV channel covers better than a genre channel would. */
const SKIP_SHOW_GENRES = new Set(['kids', 'children', 'family']);

const MIN_SHOWS = 3;
const MIN_MOVIES = 8;
const MARATHON_EPISODES = 40;
const PER_GROUP = 10;

const decadeOf = (year?: number) => (year ? Math.floor(year / 10) * 10 : undefined);
const decadeName = (d: number) => (d >= 1900 && d < 2000 ? `${String(d).slice(2)}s` : `${d}s`);
const fmt = (n: number) => n.toLocaleString('en-US');

function summarise(titles: LibraryTitle[], type: 'movie' | 'show'): string {
  const hours = Math.round(titles.reduce((h, t) => h + (t.episodes * t.minutes) / 60, 0));
  if (type === 'movie') return `${fmt(titles.length)} movies · about ${fmt(hours)} hours`;
  const episodes = titles.reduce((n, t) => n + t.episodes, 0);
  return `${fmt(titles.length)} show${titles.length === 1 ? '' : 's'} · ${fmt(episodes)} episodes · about ${fmt(hours)} hours`;
}

function examples(titles: LibraryTitle[]): string[] {
  // Biggest first: the shows (or movies) that will be on most.
  return titles
    .slice()
    .sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title))
    .slice(0, 6)
    .map((t) => (t.year ? `${t.title} (${t.year})` : t.title));
}

const sourceId = (s: SourceRef) => JSON.stringify(s);

/** Proposals for one library. */
export function proposeForLibrary(section: { key: string; title: string; type: 'movie' | 'show' }, titles: LibraryTitle[], collections: plex.PlexBrowseItem[] = []): Proposal[] {
  const { key, type } = section;
  const out: Proposal[] = [];
  const genreNames = type === 'show' ? SHOW_GENRES : MOVIE_GENRES;
  const min = type === 'show' ? MIN_SHOWS : MIN_MOVIES;
  const filter = (title: string, f: Omit<PlexFilterSource, 'kind' | 'sectionKey' | 'type' | 'title'>): PlexFilterSource => ({ kind: 'plex-filter', sectionKey: key, type, title, ...f });
  const matching = (f: PlexFilterSource) => titles.filter((t) => plex.matchesFilter(t, f));
  const add = (group: string, name: string, source: SourceRef, picked: LibraryTitle[], mode: 'loop' | 'shuffle' = 'shuffle') =>
    out.push({ id: sourceId(source), group, name, summary: summarise(picked, type), examples: examples(picked), mode, sources: [source] });

  // Genres as Plex names them (first spelling seen), with how many titles have each.
  const genres = new Map<string, { tag: string; count: number }>();
  for (const t of titles) for (const g of t.genres) {
    const k = g.toLowerCase();
    genres.set(k, { tag: genres.get(k)?.tag ?? g, count: (genres.get(k)?.count ?? 0) + 1 });
  }

  // Era + genre ("80s Sitcoms"); a genre too thin to split by decade gets one all-eras channel.
  const eraGroup = type === 'show' ? 'By era and genre' : 'Movies by genre and era';
  for (const [k, { tag, count }] of [...genres].sort((a, b) => b[1].count - a[1].count)) {
    if (count < min || (type === 'show' && SKIP_SHOW_GENRES.has(k))) continue;
    const label = genreNames[k] ?? (type === 'show' ? `${tag} Shows` : `${tag} Movies`);
    const decades = new Map<number, number>();
    for (const t of titles) if (t.genres.some((g) => g.toLowerCase() === k)) {
      const d = decadeOf(t.year);
      if (d) decades.set(d, (decades.get(d) ?? 0) + 1);
    }
    const strong = [...decades].filter(([, n]) => n >= min).sort((a, b) => a[0] - b[0]);
    for (const [d] of strong) {
      const f = filter(`${decadeName(d)} ${label}`, { genres: [tag], years: [d, d + 9] });
      add(eraGroup, `${decadeName(d)} ${label}`, f, matching(f));
    }
    // Everything in the genre too, when the decades don't cover most of it.
    const covered = strong.reduce((n, [, c]) => n + c, 0);
    if (covered < count * 0.7) {
      const f = filter(label, { genres: [tag] });
      add(eraGroup, label, f, matching(f));
    }
  }

  if (type === 'movie') {
    // Decades of movies, whatever the genre.
    const decades = new Map<number, number>();
    for (const t of titles) {
      const d = decadeOf(t.year);
      if (d) decades.set(d, (decades.get(d) ?? 0) + 1);
    }
    for (const [d, n] of [...decades].sort((a, b) => a[0] - b[0])) {
      if (n < MIN_MOVIES + 2) continue;
      const f = filter(`${decadeName(d)} Movies`, { years: [d, d + 9] });
      add('Movies by decade', `${decadeName(d)} Movies`, f, matching(f));
    }
  }

  if (type === 'show') {
    // Networks: Plex keeps a show's original network in "studio".
    const studios = new Map<string, number>();
    for (const t of titles) if (t.studio) studios.set(t.studio, (studios.get(t.studio) ?? 0) + 1);
    for (const [studio, n] of [...studios].sort((a, b) => b[1] - a[1])) {
      if (n < MIN_SHOWS) continue;
      const f = filter(studio, { studios: [studio] });
      add('Networks', studio, f, matching(f));
    }
    // Kids: by rating, or cartoons/children's genres.
    const kidsF = filter("Kids' TV", { ratings: KIDS_RATINGS });
    const kids = matching(kidsF);
    if (kids.length >= MIN_SHOWS) add('Specials', "Kids' TV", kidsF, kids);
    // Marathons: the biggest shows, every episode in order.
    for (const t of titles.filter((x) => x.episodes >= MARATHON_EPISODES).sort((a, b) => b.episodes - a.episodes).slice(0, PER_GROUP)) {
      add('Marathons', `${t.title} Marathon`, { kind: 'plex-show', ratingKey: t.ratingKey, title: t.title }, [t], 'loop');
    }
  }

  // Collections the library already has.
  for (const c of collections.filter((x) => (x.count ?? 0) >= (type === 'show' ? 2 : 3)).slice(0, PER_GROUP)) {
    out.push({
      id: sourceId({ kind: 'plex-collection', ratingKey: c.ratingKey, title: c.title }),
      group: 'Your collections',
      name: c.title,
      summary: `${fmt(c.count ?? 0)} ${type === 'show' ? 'shows' : 'movies'} in this Plex collection`,
      examples: [],
      mode: 'shuffle',
      sources: [{ kind: 'plex-collection', ratingKey: c.ratingKey, title: c.title }],
    });
  }

  // Keep each group to its biggest proposals.
  const sizes = new Map(out.map((p) => [p.id, Number(/([\d,]+) (?:show|movie)/.exec(p.summary)?.[1]?.replace(/,/g, '') ?? 0)]));
  const byGroup = new Map<string, Proposal[]>();
  for (const p of out) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  return [...byGroup.values()].flatMap((list) =>
    list.length <= PER_GROUP ? list : list.slice().sort((a, b) => (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0)).slice(0, PER_GROUP),
  );
}

/** Proposals for every movie and show library, labelled with the library's name. */
export async function proposals(): Promise<{ library: string; type: 'movie' | 'show'; proposals: Proposal[] }[]> {
  const out = [];
  for (const s of await plex.sections()) {
    if (s.type !== 'movie' && s.type !== 'show') continue;
    const [titles, collections] = await Promise.all([plex.libraryTitles(s.key), plex.browseCollections(s.key).catch(() => [])]);
    out.push({ library: s.title, type: s.type as 'movie' | 'show', proposals: proposeForLibrary({ key: s.key, title: s.title, type: s.type }, titles, collections) });
  }
  return out;
}
