/** Turn filename-ish titles ("Ken.Burns.The.Civil.War.5of9…") into something fit for a TV guide. */

const VIDEO_EXT = /\.(mp4|m4v|mkv|avi|mov|webm|mpe?g|ogv|wmv|ts)$/i;
const JUNK =
  /\b(480p|576p|720p|1080p|2160p|4k|uhd|x264|x265|h ?264|h ?265|hevc|avc|xvid|divx|dvdrip|bdrip|brrip|bluray|web-?dl|webrip|hdtv|hdrip|aac|ac3|dts|mp3|remux|proper|repack|internal)\b/gi;
const SMALL_WORDS = new Set(['of', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an', 'or', 'with', 'from', 'by']);

/** True when a title looks like a file name rather than a human-written title. */
export function looksLikeFilename(title: string): boolean {
  return !/\s/.test(title.trim()) && /[A-Za-z][._][A-Za-z0-9]/.test(title);
}

function titleCaseSmallWords(t: string): string {
  return t
    .split(' ')
    .map((word, i, words) => {
      const lower = word.toLowerCase();
      const afterBreak = i === 0 || /[(\-–:]$/.test(words[i - 1] ?? '');
      if (!afterBreak && SMALL_WORDS.has(lower) && /^[A-Z][a-z]*$/.test(word)) return lower;
      return word;
    })
    .join(' ');
}

/**
 * Clean a title. Human-written titles pass through untouched unless `filename`
 * is set (IA file stems are always file names) or the title has no spaces and
 * uses dots/underscores as separators.
 */
export function prettifyTitle(raw: string, { filename = false } = {}): string {
  let t = raw.trim();
  if (!filename && !looksLikeFilename(t)) return t;
  const wasAllLower = t === t.toLowerCase();

  t = t.replace(VIDEO_EXT, '');
  // Drop release junk along with its separator: "Movie.1999.1080p.x264" → "Movie.1999".
  t = t.replace(new RegExp(`[._ -]*${JUNK.source}`, 'gi'), '');
  t = t.replace(/_/g, ' ');
  // Dots become spaces, except inside numbers ("2.5") and before a space ("Mr. Big").
  t = t.replace(/(?<!\d)\.(?! )|\.(?![\d ])/g, ' ');
  t = t.replace(/\b(\d+) ?of ?(\d+)\b/gi, '($1 of $2)');
  t = t.replace(/\bs(\d{1,2}) ?e(\d{1,3})\b/gi, (_, s: string, e: string) => `S${s.padStart(2, '0')}E${e.padStart(2, '0')}`);
  t = t.replace(/([a-z])([A-Z])/g, '$1 $2');
  t = t.replace(/\s+/g, ' ').trim();
  // A trailing release year reads better in parentheses.
  t = t.replace(/ ((?:19|20)\d{2})$/, ' ($1)');
  t = t.replace(/[\s\-–]+$/, '');
  if (wasAllLower) t = t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return titleCaseSmallWords(t);
}

/** "Commercials/2003/[2003] Goodyear Tires - Stopping Power.mp4" → { title: "Goodyear Tires - Stopping Power", year: 2003 } */
export function commercialTitle(path: string): { title: string; year?: number } {
  const parts = path.split('/');
  const base = (parts[parts.length - 1] ?? path).replace(VIDEO_EXT, '');
  const folder = parts[parts.length - 2] ?? '';
  let year: number | undefined = /^(19|20)\d{2}$/.test(folder) ? Number(folder) : undefined;

  let t = base;
  const bracketYear = t.match(/^\[((?:19|20)\d{2})\]\s*/);
  if (bracketYear) {
    year ??= Number(bracketYear[1]);
    t = t.slice(bracketYear[0].length);
  }
  t = t
    .replace(/_s\b/g, "'s") // "Tony Hawk_s" (apostrophes that didn't survive the file system)
    .replace(/[⧸∕]/g, '/')
    .replace(/^(?:19|20)\d{2}\s+/, '') // "2001 Atlantis …"
    .replace(/^\d{1,3}\s*-\s*/, '') // "087 - Progressive …"
    .replace(/\s*[([]?(?:19|20)\d{2}[)\]]?$/, '') // trailing year
    .replace(/\s*-?\s*\b(?:US |UK |Japanese )?(?:TV Spot|TV Commercial|Commercial|Advert|TV Ad|Ad)(?:\s*\/\s*(?:Commercial|Advert|Ad))*$/i, '')
    .replace(/\s*-\s*\d+$/, '') // "Lego city - 3"
    .trim();
  return { title: prettifyTitle(t || base, { filename: looksLikeFilename(t) }), year };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
/** Sentences about the file rather than the show: uploads, rips, links, licences, appeals. */
const NOT_ABOUT_THE_SHOW = /https?:|www\.|\.com\b|upload|ripped|\brip\b|digiti[sz]|transferred|subscribe|donat|patreon|paypal|copyright|public domain|licen[cs]e|creative commons|torrent|download|\bvhs\b.*\b(quality|tracking)|please (note|enjoy)|enjoy!?$/i;

/**
 * A short plain-text description for the guide: HTML stripped, entities decoded,
 * housekeeping sentences dropped, cut at a sentence end near `max` characters.
 * Undefined when nothing worth showing is left.
 */
export function shortDescription(raw: unknown, title = '', max = 240): string | undefined {
  const DOT = '․'; // stands in for full stops that don't end a sentence
  const text = (Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, ' ¶ ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/(https?:\/\/|www\.)\S+|\b[\w.-]+\.(com|org|net|edu|tv)\b\S*/gi, ' LINK ')
    .replace(/\.\.\.+/g, '…')
    .replace(/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|Lt|Sgt|Capt|Col|Gen|Prof|Rev|No|Vol|Ep|Pt|[A-Z])\./g, `$1${DOT}`)
    .replace(/\s+/g, ' ');
  // Paragraph breaks end sentences too (headings and credit lines rarely have a full stop).
  const sentences = text
    .split('¶')
    .flatMap((para) => para.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((s) => s.trim().replace(/^(from )?(imdb|wikipedia)\s*:\s*/i, ''))
    .filter(
      (s) =>
        s.split(' ').length >= 3 &&
        /[a-z]/i.test(s) &&
        !/\bLINK\b/.test(s) &&
        !NOT_ABOUT_THE_SHOW.test(s) &&
        // The uploader talking ("episodes I have", "let me know", "thanks to…").
        !/\b(I|I'm|I've|my|me|we|our|thanks?|thank you)\b/i.test(s),
    )
    .map((s) => (/[.!?…]["')\]]*$/.test(s) ? s : `${s}.`));
  let out = sentences.join(' ').split(DOT).join('.');
  if (out.length > max) {
    // End at the last full sentence that fits, unless that leaves too little.
    const cut = out.slice(0, max + 1);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    out = end >= max * 0.4 ? cut.slice(0, end + 1) : `${out.slice(0, max).replace(/[\s,;:–-]+\S*$/, '')}…`;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Just the title again, or a few words of it ("Flash Gordon Complete Serial"), isn't a description.
  if (out.split(' ').length < 6 || norm(out).includes(norm(title)) && out.length < title.length + 20) return undefined;
  return out;
}

export interface TitleParts {
  /** The series ("Get Smart"). */
  show: string;
  /** Which one, on the line under it ("S1E2 · Diplomat's Daughter", "Part 3 of 9 · Forever Free"). */
  episode: string;
}

const tidyName = (s: string) =>
  s
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ') // [360p], [HD], {50-01L01}
    .replace(/\(\s*\)/g, ' ')
    .replace(/^[\s\-–—:·|.,!?)\]]+|[\s\-–—:·|.,(\[]+$/g, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/-\d{5,}$/, '') // upload ids: "A Gal for Grandma-510018"
    .replace(/\s{2,}/g, ' ')
    .trim();
const SMALL = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
/** "BAD MEN OF RIMROCK" → "Bad Men of Rimrock"; anything already in mixed case is left alone. */
const unshout = (s: string) =>
  /[a-z]/.test(s) || !/[A-Z]{3}/.test(s)
    ? s
    : s.toLowerCase().replace(/[a-z][a-z']*/g, (w, i: number) => (i > 0 && SMALL.has(w) ? w : w[0]!.toUpperCase() + w.slice(1)));
const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const DATE = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/;
/** Leading dates and running numbers in front of a show's name: "1962-01-02 - ", "001 - ", "001. ". */
const LEADING_JUNK = /^(?:\d{1,4}[-./]\d{1,2}[-./]\d{1,4}|\d{1,4}\.?)(?:\s*[-–.]\s*|\s+)/;

/** A collection's title as a show name: "Green Acres Complete Series" → "Green Acres". */
function seriesName(collection: string): string {
  let s = collection
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–]\s+.*$/, '')
    .replace(/[:\s-]+the\s+collector'?s\s+edition\b/gi, ' ')
    .replace(/\b(the\s+)?(complete\s+(tv\s+)?series|complete\s+collection|updated\s+collection|collection|tv\s+show|tv\s+series)\b/gi, ' ');
  s = tidyName(s);
  return unshout(s || tidyName(collection));
}

/** The show's name from the text before the episode number, falling back to the collection. */
function showName(before: string, series: string | undefined): { show: string; rest: string } {
  let text = before;
  while (LEADING_JUNK.test(text)) text = text.replace(LEADING_JUNK, '');
  text = text.replace(/\b(ep(isode)?\.?)\s*$/i, '');
  // "Bonanza - The Abduction" before the number: the show, then the episode's name.
  const dash = /^(.+?)\s+[-–]\s+(.+)$/.exec(tidyName(text));
  let show = tidyName(dash ? dash[1]! : text);
  let rest = dash ? tidyName(dash[2]!) : '';
  // The collection's name is cleaner when the file name is the same show with extras ("The Rifleman TV 1958 colorized").
  if (series && (!show || (norm(show).startsWith(norm(series)) && norm(show) !== norm(series)))) show = series;
  if (!show || DATE.test(show)) show = series ?? '';
  if (dash && !series && !rest) rest = '';
  return { show: unshout(show), rest };
}

function episodeLine(label: string, name: string, show: string): string {
  let n = tidyName(name);
  // "S01E186 To Tell the Truth 1970 04 21": don't repeat the show.
  if (show && norm(n) !== norm(show)) {
    const words = show.split(/\W+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (words.length) n = tidyName(n.replace(new RegExp(`^\\W*${words.join('\\W+')}(?![\\w'’])`, 'i'), '')) || n;
  }
  n = capitalise(unshout(n));
  if (!label) return n;
  return n ? `${label} · ${n}` : label;
}

/**
 * Split an episode's title into the show and the episode, for two-line guide listings.
 * `collection` is the title of what it came from (an Internet Archive item holding a
 * whole series), used when the file name leaves the show out. Null for anything that
 * doesn't look like an episode of something (a movie, a one-off).
 */
export function splitTitle(title: string, collection?: string): TitleParts | null {
  const series = collection ? seriesName(collection) : undefined;
  // A bare number left over ("Sky King 1", "… Vol. 1") is a tape split in parts, not an episode.
  const done = (show: string, episode: string) => (show && episode && norm(show) !== norm(episode) && !/^\d+$/.test(episode) ? { show, episode } : null);
  const seLabel = (s: number, e: number) => (s === 0 && e === 0 ? 'Special' : s === 0 ? `Special ${e}` : `S${s}E${e}`);

  // "Get Smart S01E02 (Diplomat's Daughter)", "S01e03The Lone Rangers Triumph", "Bonanza - The Abduction Ep 2x08", "(S04E01)"
  const se = /^(.*?)\(?\bS(\d{1,2})\s*E(\d{1,3})(?!\d)\)?(.*)$/i.exec(title) ?? /^(.*?)\(?\b(\d{1,2})x(\d{2,3})\b\)?(.*)$/i.exec(title);
  if (se) {
    const { show, rest } = showName(se[1]!, series);
    return done(show, episodeLine(seLabel(Number(se[2]), Number(se[3])), [rest, se[4]!].filter((x) => tidyName(x)).join(' – '), show));
  }
  // "Green Acres - 001 - Oliver Buys a Farm", "01-07-95 - 1 - Saturday Night"
  const numbered = /^(.+?)\s+[-–]\s+(?:ep(?:isode)?\.?\s*)?(\d{1,3})\s+[-–]\s+(.+)$/i.exec(title);
  if (numbered) {
    const lead = tidyName(numbered[1]!);
    if (DATE.test(lead)) return series ? done(series, episodeLine(lead, numbered[3]!, series)) : null;
    const { show } = showName(lead, series);
    const n = Number(numbered[2]);
    return done(show, episodeLine(n ? `Ep. ${n}` : '', numbered[3]!, show));
  }
  // "Ken Burns The Civil War (3 of 9) Forever Free"
  const part = /^(.*?)\(?\b(\d{1,2}) of (\d{1,2})\b\)?(.*)$/i.exec(title);
  if (part && !/\(\s*(ad|part|pt)\s*$/i.test(part[1]!)) {
    const { show } = showName(part[1]!, series);
    return done(show, episodeLine(`Part ${Number(part[2])} of ${Number(part[3])}`, part[4]!, show));
  }
  if (!series) return null;
  // "01 A New Germany (1933–1939)", "01-01 - Life Begins for Andy Panda", "000 - Knock-Knock (1940)"
  const lead = /^(\d{1,3})(?:-(\d{1,3}))?(?:[\s.\-–)]+|(?=[A-Z]))(.+)$/.exec(title);
  if (lead && !norm(title).startsWith(norm(series))) {
    const label = lead[2] ? seLabel(Number(lead[1]), Number(lead[2])) : Number(lead[1]) ? `Ep. ${Number(lead[1])}` : '';
    return done(series, episodeLine(label, lead[3]!, series));
  }
  // "Dragnet - The Big Con" from the collection "Dragnet"; "Portland Wrestling … (part 1)"
  if (norm(title).startsWith(norm(series)) && norm(title) !== norm(series)) {
    return done(series, episodeLine('', title, series));
  }
  return null;
}
