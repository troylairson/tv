import { prettifyTitle } from './titles';
import type { ChannelItem } from './types';

const IA = 'https://archive.org';

export interface IaFile {
  name: string;
  source?: string;
  format?: string;
  length?: string;
  original?: string;
}

export interface IaMetadata {
  is_dark?: boolean;
  metadata?: { identifier?: string; title?: string | string[]; mediatype?: string };
  files?: IaFile[];
}

/** Playable formats, best first. Everything here is MP4; "h.264" derivatives are IA-encoded so always safe. */
const FORMAT_RANK = ['h.264', 'h.264 IA', 'MPEG4', 'HiRes MPEG4', '512Kb MPEG4'];

export function parseLength(length: string | undefined): number {
  if (!length) return 0;
  if (length.includes(':')) return Math.round(length.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0));
  const n = parseFloat(length);
  return Number.isFinite(n) ? n : 0;
}

/** "Get Smart S01E01 (Mr. Big).ia.mp4" → "Get Smart S01E01 (Mr. Big)" */
export function fileStem(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  return base
    .replace(/(\.ia)?\.[a-z0-9]+$/i, '')
    .replace(/_512kb$/i, '');
}

export interface PlayableFile {
  name: string;
  stem: string;
  durationSec: number;
}

/**
 * One playable MP4 per distinct video in an item. IA stores an original plus
 * derivatives (h.264, 512Kb, Ogg…) and sometimes several originals of the same
 * film (e.g. .avi, .mpeg and _edit.mp4), so we group by source file, pick the
 * best-ranked MP4 per group, then drop near-duplicates.
 */
export function pickPlayableFiles(files: IaFile[]): PlayableFile[] {
  const groups = new Map<string, IaFile[]>();
  for (const f of files) {
    const rank = FORMAT_RANK.indexOf(f.format ?? '');
    if (rank < 0 && !f.name.toLowerCase().endsWith('.mp4')) continue;
    const key = f.source === 'derivative' && f.original && !f.original.endsWith('.torrent') ? f.original : f.name;
    const group = groups.get(key) ?? [];
    group.push(f);
    groups.set(key, group);
  }

  const rankOf = (f: IaFile) => {
    const r = FORMAT_RANK.indexOf(f.format ?? '');
    return r < 0 ? FORMAT_RANK.length : r;
  };

  const picked: PlayableFile[] = [];
  for (const [key, group] of groups) {
    group.sort((a, b) => rankOf(a) - rankOf(b));
    const best = group[0]!;
    const durationSec = parseLength(best.length) || Math.max(...group.map((g) => parseLength(g.length)));
    if (durationSec < 5) continue;
    picked.push({ name: best.name, stem: fileStem(key), durationSec });
  }

  // Drop near-duplicates: same stem prefix and (almost) the same length.
  picked.sort((a, b) => a.stem.length - b.stem.length || a.name.localeCompare(b.name));
  const out: PlayableFile[] = [];
  for (const p of picked) {
    const dupe = out.some(
      (o) =>
        (p.stem === o.stem || p.stem.startsWith(o.stem + '_') || p.stem.startsWith(o.stem + ' ')) &&
        Math.abs(p.durationSec - o.durationSec) < 3,
    );
    if (!dupe) out.push(p);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function downloadUrl(identifier: string, file: string): string {
  return `${IA}/download/${encodeURIComponent(identifier)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

/** The item identifier in a pasted archive.org link (details, download, embed…), if it is one. */
export function identifierFromLink(text: string): string | null {
  const m = /archive\.org\/(?:details|download|embed|metadata)\/([A-Za-z0-9._-]+)/.exec(text.trim());
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function thumbUrl(identifier: string): string {
  return `${IA}/services/img/${encodeURIComponent(identifier)}`;
}

/** File and folder names that say nothing about what's on them: DVD rips' VTS_01_1, "video", "tape 2"… */
const GENERIC_NAME = /^(vts[\s_-]*\d+([\s_-]*\d+)?|video_ts|video|movie|tape[\s_-]*\d*|disc[\s_-]*\d*|title[\s_-]*\d*|track[\s_-]*\d+|part[\s_-]*\d+|\d+)$/i;
export const isGenericName = (name: string) => GENERIC_NAME.test(name.trim());

/** For a file with a generic name: the item's title, or failing that the nearest folder with a real name. */
function fallbackName(identifier: string, itemTitle: string, path: string): string {
  if (!isGenericName(itemTitle) && !isGenericName(itemTitle.replace(/[_-]\d{8}.*$/, ''))) return itemTitle;
  const folder = path.split('/').slice(0, -1).reverse().find((d) => !isGenericName(d));
  return folder ?? identifier;
}

export function itemsFromMetadata(identifier: string, meta: IaMetadata, maxFiles = Infinity): ChannelItem[] {
  if (meta.is_dark || !meta.files || meta.metadata?.mediatype !== 'movies') return [];
  const rawTitle = meta.metadata?.title;
  const title = (Array.isArray(rawTitle) ? rawTitle[0] : rawTitle) ?? identifier;
  const files = pickPlayableFiles(meta.files).slice(0, maxFiles);
  let part = 0;
  const fileTitle = (f: (typeof files)[number]) => {
    if (files.length === 1) return prettifyTitle(isGenericName(title) ? fallbackName(identifier, title, f.name) : title);
    if (!isGenericName(f.stem)) return prettifyTitle(f.stem, { filename: true });
    // DVD rips of off-air tapes: "ABC Primetime 11-30-80 (part 2)" rather than "VTS 01 2".
    return `${prettifyTitle(fallbackName(identifier, title, f.name))} (part ${++part})`;
  };
  return files.map((f) => ({
    id: `ia:${identifier}/${f.name}`,
    source: 'ia' as const,
    ref: `${identifier}/${f.name}`,
    title: fileTitle(f),
    durationSec: Math.round(f.durationSec * 100) / 100,
    url: downloadUrl(identifier, f.name),
    thumb: thumbUrl(identifier),
  }));
}

/** GET JSON from archive.org, retrying network errors and 5xx (it has the occasional hiccup). */
async function getJson<T>(url: string, attempts = 3, timeoutMs = 20_000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'retro-tv/0.0 (home use)' } });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 || attempt >= attempts) throw new Error(`${url} → HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= attempts || (err instanceof Error && err.message.includes('→ HTTP 4'))) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

export interface SearchOptions {
  rows?: number;
  page?: number;
  sort?: string;
}

export interface SearchDoc {
  identifier: string;
  title?: string;
  year?: string | number;
  downloads?: number;
}

export async function search(query: string, { rows = 50, page = 1, sort = 'downloads desc' }: SearchOptions = {}) {
  const params = new URLSearchParams({ q: `(${query}) AND mediatype:movies`, rows: String(rows), page: String(page), output: 'json' });
  for (const field of ['identifier', 'title', 'year', 'downloads']) params.append('fl[]', field);
  params.append('sort[]', sort);
  const data = await getJson<{ response: { numFound: number; docs: SearchDoc[] } }>(`${IA}/advancedsearch.php?${params}`);
  return data.response;
}

export function metadata(identifier: string): Promise<IaMetadata> {
  return getJson<IaMetadata>(`${IA}/metadata/${encodeURIComponent(identifier)}`);
}
