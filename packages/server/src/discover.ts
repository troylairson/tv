/**
 * Discover: ready-made Internet Archive searches ("shelves") plus filters, for
 * finding things worth putting on a channel. Every shelf is just a query, so a
 * channel made from one keeps finding new uploads when it refreshes at night.
 */

export interface Shelf {
  id: string;
  group: 'Off the air' | 'Holidays' | 'Genres';
  name: string;
  blurb: string;
  query: string;
  /** Holidays: month (1-12) and day it falls on (roughly, for movable feasts), to put the next one first. */
  on?: [number, number];
}

const TAPES = '(collection:vhsvault OR collection:television_inbox OR collection:classic_tv OR subject:VHS)';

export const SHELVES: Shelf[] = [
  // Off the air: what people taped
  { id: 'off-air', group: 'Off the air', name: 'Recorded off TV', blurb: 'Home VHS tapes from the VHS Vault, often with the commercials and station breaks.', query: 'collection:vhsvault' },
  { id: 'woc', group: 'Off the air', name: 'With original commercials', blurb: 'Broadcasts kept whole, ad breaks and all ("WOC" in collector-speak).', query: '(title:WOC OR title:"with commercials" OR description:"original commercials" OR description:"with commercials")' },
  { id: 'primetime', group: 'Off the air', name: 'Network prime time nights', blurb: 'Whole evenings taped off ABC, CBS, NBC and Fox.', query: `(title:(primetime OR "prime time") OR subject:"prime time") AND ${TAPES}` },
  { id: 'saturday-morning', group: 'Off the air', name: 'Saturday morning blocks', blurb: 'Cartoon blocks as they aired, cereal ads included.', query: `title:"saturday morning" AND ${TAPES}` },
  { id: 'late-night', group: 'Off the air', name: 'Late-night TV', blurb: 'Talk shows, late movies and horror hosts after the news.', query: `(title:("late night" OR "late show" OR "tonight show" OR "late movie" OR "horror host") OR subject:"horror host") AND ${TAPES}` },
  { id: 'local', group: 'Off the air', name: 'Local stations', blurb: 'Station IDs, local news, kids hosts and sign-offs.', query: `(title:("station id" OR "sign off" OR "sign-off" OR "local news") OR subject:("station id" OR "local television")) AND ${TAPES}` },
  { id: 'inbox', group: 'Off the air', name: 'Unsorted TV uploads', blurb: 'TV people uploaded that nobody has filed yet: the true rabbit hole.', query: 'collection:television_inbox' },

  // Holidays
  { id: 'new-year', group: 'Holidays', name: "New Year's Eve", blurb: 'Countdown specials and New Year broadcasts.', query: 'title:("new year\'s eve" OR "new years eve" OR "new year\'s rockin" OR "happy new year")', on: [12, 31] },
  { id: 'valentines', group: 'Holidays', name: "Valentine's Day", blurb: 'Sweetheart specials, cartoons and romances.', query: '(title:("valentine\'s" OR valentines OR "be my valentine") OR subject:"valentine\'s day")', on: [2, 14] },
  { id: 'st-patricks', group: 'Holidays', name: "St. Patrick's Day", blurb: 'Leprechauns, parades and all things green.', query: 'title:("st. patrick" OR "st patrick" OR "saint patrick" OR leprechaun)', on: [3, 17] },
  { id: 'easter', group: 'Holidays', name: 'Easter', blurb: 'Bunnies, egg hunts and Easter parades.', query: '(title:("easter parade" OR "easter bunny" OR "easter special" OR "happy easter" OR "peter cottontail" OR "easter beagle" OR "here comes peter") OR subject:("easter" AND NOT "easter egg"))', on: [4, 10] },
  { id: 'july-4', group: 'Holidays', name: 'Fourth of July', blurb: 'Fireworks specials and star-spangled cartoons.', query: 'title:("fourth of july" OR "4th of july" OR "independence day" OR "yankee doodle")', on: [7, 4] },
  { id: 'halloween', group: 'Holidays', name: 'Halloween', blurb: 'Spooky movies, specials, cartoons and costume-era commercials.', query: '(title:(halloween OR "trick or treat" OR spooky OR haunted) OR subject:halloween)', on: [10, 31] },
  { id: 'thanksgiving', group: 'Holidays', name: 'Thanksgiving', blurb: 'Parades, specials and the big game, as taped.', query: '(title:(thanksgiving OR "macy\'s parade" OR "macys parade") OR subject:thanksgiving)', on: [11, 26] },
  { id: 'christmas', group: 'Holidays', name: 'Christmas', blurb: 'Classic movies, TV specials, cartoons and holiday ads.', query: '(title:(christmas OR xmas OR santa OR "jingle bells" OR scrooge) OR subject:christmas)', on: [12, 25] },

  // Genres
  { id: 'westerns', group: 'Genres', name: 'Westerns', blurb: 'Cowboys, sheriffs and B-western features.', query: '(subject:western OR title:western)' },
  { id: 'scifi-horror', group: 'Genres', name: 'Sci-fi & horror', blurb: 'Flying saucers, monsters and mad scientists.', query: '(collection:SciFi_Horror OR subject:("science fiction" OR horror))' },
  { id: 'noir', group: 'Genres', name: 'Film noir & crime', blurb: 'Detectives, gangsters and shadows.', query: '(collection:Film_Noir OR subject:("film noir" OR crime OR detective))' },
  { id: 'comedy', group: 'Genres', name: 'Comedy', blurb: 'Screwball, slapstick and sitcoms.', query: '(collection:Comedy_Films OR subject:(comedy OR sitcom))' },
  { id: 'silent', group: 'Genres', name: 'Silent era', blurb: 'Title cards, pianos and pratfalls.', query: '(collection:silent_films OR subject:"silent film")' },
  { id: 'game-shows', group: 'Genres', name: 'Game shows', blurb: 'Quizzes, panels and prize wheels.', query: '(subject:"game show" OR title:"game show")' },
  { id: 'kids', group: 'Genres', name: "Kids' TV", blurb: 'Puppets, hosts and after-school shows.', query: `(subject:("children's television" OR "kids tv" OR puppets) OR title:("kids show" OR "children's show")) AND ${TAPES}` },
  { id: 'music', group: 'Genres', name: 'Music & variety', blurb: 'Music videos, concerts, bandstands and variety hours.', query: `(subject:("music video" OR "variety show" OR concert) OR title:(bandstand OR "music video" OR "soul train" OR "top of the pops" OR "hit parade")) AND (${TAPES} OR date:[1940-01-01 TO 1999-12-31])` },
  { id: 'sports', group: 'Genres', name: 'Sports', blurb: 'Old broadcasts: boxing, wrestling, ballgames.', query: '(collection:sports OR subject:(boxing OR wrestling OR baseball OR football))' },
  { id: 'educational', group: 'Genres', name: 'Educational & industrial', blurb: 'Classroom films, ads for the future, how-tos.', query: '(collection:prelinger OR collection:ephemera)' },
];

/** What kind of video, as a query clause. */
export const KINDS: Record<string, { name: string; query: string }> = {
  any: { name: 'Anything', query: '' },
  tv: { name: 'TV', query: '(collection:(classic_tv OR television_inbox OR vhsvault) OR subject:(television OR tv OR episode OR vhs))' },
  movies: { name: 'Movies', query: '(collection:(feature_films OR SciFi_Horror OR Film_Noir OR Comedy_Films OR silent_films) OR subject:(film OR movie OR "feature film"))' },
  cartoons: { name: 'Cartoons', query: '(collection:(animationandcartoons OR classic_cartoons) OR subject:(cartoon OR cartoons OR animation))' },
  commercials: { name: 'Commercials', query: '(subject:(commercial OR commercials OR advertisement OR advertising) OR title:(commercial OR commercials))' },
};

export const DECADES: Record<string, [number, number]> = {
  '1920s': [1920, 1929],
  '1930s': [1930, 1939],
  '1940s': [1940, 1949],
  '1950s': [1950, 1959],
  '1960s': [1960, 1969],
  '1970s': [1970, 1979],
  '1980s': [1980, 1989],
  '1990s': [1990, 1999],
};

export type DiscoverSort = 'popular' | 'gems' | 'newest' | 'oldest';
export const SORTS: Record<DiscoverSort, string> = {
  popular: 'downloads desc',
  // Within GEMS_RANGE: the best-liked of what few people have seen.
  gems: 'downloads desc',
  newest: 'addeddate desc',
  oldest: 'date asc',
};
const GEMS_RANGE = 'downloads:[25 TO 2500]';
/** Undated uploads count as vintage only in collections that are (old film, classic TV, tape captures). */
const VINTAGE =
  '(date:[1890-01-01 TO 1999-12-31] OR collection:(classic_tv OR vhsvault OR feature_films OR SciFi_Horror OR Film_Noir OR Comedy_Films OR silent_films OR prelinger OR classic_cartoons))';
/** Never useful on a TV channel: video-game footage, social-media templates, fan cams, graphic or adult material. */
const JUNK = [
  '-title:(capcut OR template OR playthrough OR "let\'s play" OR gameplay OR walkthrough OR "fan cam" OR fancam OR minecraft OR fortnite OR roblox OR "status video" OR tiktok OR "graphic warning" OR suicide OR "budd dwyer" OR "easter egg" OR xxx)',
  '-subject:(nsfw OR porn OR pornography OR erotic OR erotica OR softcore OR sexploitation OR xxx OR adult OR gore OR "video game" OR "video games" OR gameplay OR "let\'s play" OR minecraft)',
];

export interface DiscoverInput {
  shelf?: string;
  q?: string;
  kind?: string;
  decade?: string;
  /** Leave out anything dated 2000 or later (undated items stay). */
  vintage?: boolean;
  sort?: DiscoverSort;
}

/** The Internet Archive query for a set of Discover choices. */
export function discoverQuery({ shelf, q, kind, decade, vintage = true, sort = 'popular' }: DiscoverInput): string {
  const parts: string[] = [];
  const s = SHELVES.find((x) => x.id === shelf);
  if (s) parts.push(s.query);
  if (q?.trim()) parts.push(q.trim());
  const k = KINDS[kind ?? 'any'];
  if (k?.query) parts.push(k.query);
  const d = decade ? DECADES[decade] : undefined;
  if (d) parts.push(`date:[${d[0]}-01-01 TO ${d[1]}-12-31]`);
  else if (vintage) parts.push(VINTAGE, '-date:[2000-01-01 TO 2100-01-01]');
  parts.push(...JUNK);
  if (sort === 'gems') parts.push(GEMS_RANGE);
  if (sort === 'oldest' && !d) parts.push('date:[1890-01-01 TO 2100-01-01]');
  return parts.map((p) => (p.startsWith('-') ? p : `(${p})`)).join(' AND ');
}

/** Shelves with the holidays reordered so the next one comes first ("in season" within six weeks). */
export function shelvesFor(now = new Date()): (Shelf & { inSeason?: boolean })[] {
  const daysUntil = ([m, d]: [number, number]) => {
    const year = now.getFullYear();
    let when = new Date(year, m - 1, d);
    if (when.getTime() < now.getTime() - 86_400_000) when = new Date(year + 1, m - 1, d);
    return (when.getTime() - now.getTime()) / 86_400_000;
  };
  const holidays = SHELVES.filter((s) => s.on)
    .map((s) => ({ ...s, inSeason: daysUntil(s.on!) <= 42 }))
    .sort((a, b) => daysUntil(a.on!) - daysUntil(b.on!));
  return [...SHELVES.filter((s) => s.group === 'Off the air'), ...holidays, ...SHELVES.filter((s) => s.group === 'Genres')];
}
