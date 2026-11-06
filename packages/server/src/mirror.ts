/**
 * Some uploaders mirror their titles: "1997-4-13 lageL yleraB WCE" is ECW's Barely
 * Legal, and the description reads ".gniltserW pihsnoipmahC emertxE sa ...". This
 * spots mirrored text and turns it back round, leaving dates and "cd1"-style part
 * markers where they are.
 *
 * Text is scored for how English it looks (common words, ordinary capitalisation,
 * and the tell-tale "lageL": lowercase with a capital at the end) as written, as a
 * whole read backwards, and word by word backwards (also keeping each letter's case
 * where it was, for "WCE Yap Rep Weiv" → "ECW Pay Per View"). A single string has to be clearly better backwards to be flipped; in
 * an item that is mirrored overall, a tie is enough (so "WCE" alone becomes "ECW").
 */

const COMMON = new Set(
  (
    'the of and a an to in on at as is was were are be been for with by from his her he she it its that this ' +
    'they them their who which what when where not no but or have has had all one two three new old over after ' +
    'before into out up down off then than more most some year years first last next show night day live time ' +
    'man men woman world war story life love home house about against under between during while you your we our ' +
    'pay per view championship wrestling title match vs'
  ).split(' '),
);

/** Ends in a capital after lowercase letters: "lageL", "yleraB". Almost never English. */
const MIRRORED_CAPS = /^[a-z]{2,}[A-Z]$/;

function wordScore(word: string): number {
  const w = word.replace(/[^\p{L}]/gu, '');
  if (!w) return 0;
  let s = 0;
  if (COMMON.has(w.toLowerCase())) s += 2;
  if (/^[A-Z][a-z]+$/.test(w)) s += 1;
  if (MIRRORED_CAPS.test(w)) s -= 2;
  return s;
}

export function englishScore(text: string): number {
  return text.split(/\s+/).reduce((sum, w) => sum + wordScore(w), 0);
}

const reverse = (s: string) => [...s].reverse().join('');
/** Backwards, but each position keeps its case: "Weiv" → "View" (mirrored, then re-capitalised). */
const reverseKeepCase = (s: string) => {
  const chars = [...s];
  return [...chars]
    .reverse()
    .map((c, i) => (chars[i] === chars[i]!.toUpperCase() ? c.toUpperCase() : c.toLowerCase()))
    .join('');
};
/** "cd1", ".cd2", "disc 2", "part3": part markers that stay at the end, unreversed. */
const PART_MARKER = /^\.?(?:cd|disc|dvd|pt|part)\d+$/i;
const hasLetter = (s: string) => /\p{L}/u.test(s);

/** Leading tokens without letters (dates), the text, and trailing part markers. */
function split(text: string): { prefix: string; core: string; suffix: string } {
  const tokens = text.split(/(\s+)/);
  let start = 0;
  while (start < tokens.length && !hasLetter(tokens[start]!)) start++;
  let end = tokens.length;
  while (end > start && (!hasLetter(tokens[end - 1]!) || PART_MARKER.test(tokens[end - 1]!))) end--;
  return { prefix: tokens.slice(0, start).join(''), core: tokens.slice(start, end).join(''), suffix: tokens.slice(end).join('') };
}

interface Reading {
  text: string;
  /** How much better it reads than as written. */
  gain: number;
}

/** The best backwards reading of `text`, and how much better than as written it is. */
export function backwardsReading(text: string): Reading {
  const { prefix, core, suffix } = split(text);
  if (!core) return { text, gain: 0 };
  const asIs = englishScore(core);
  const byWord = (flip: (s: string) => string) =>
    core
      .split(/(\s+)/)
      .map((t) => (/\s/.test(t) ? t : flip(t)))
      .join('');
  // Whole first: on a tie, reading the whole thing backwards is the likelier mirror.
  const candidates = [reverse(core), byWord(reverse), byWord(reverseKeepCase)];
  const best = candidates.reduce((a, b) => (englishScore(b) > englishScore(a) ? b : a));
  return { text: `${prefix}${best}${suffix}`, gain: englishScore(best) - asIs };
}

/** `text` turned the right way round, if it's clearly mirrored. */
export function unmirror(text: string, { mirroredItem = false } = {}): string {
  const r = backwardsReading(text);
  return r.gain >= (mirroredItem ? 0 : 3) ? r.text : text;
}

/** Whether an item's texts (title, file names, description) are mirrored on the whole. */
export function isMirrored(texts: (string | undefined)[]): boolean {
  let gain = 0;
  let flipped = 0;
  for (const t of texts) {
    if (!t) continue;
    const r = backwardsReading(t);
    gain += r.gain;
    if (r.gain >= 3) flipped++;
  }
  return flipped >= 1 && gain >= 6;
}
