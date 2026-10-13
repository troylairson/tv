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
