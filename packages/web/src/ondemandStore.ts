import type { ChannelItem } from '@retro-tv/schedule';

/** What On Demand shows and plays (see the server's ondemand.ts). */
export interface OdEntry {
  key: string;
  title: string;
  kind: 'show' | 'movie';
  count: number;
  thumb?: string;
  logo?: string;
  description?: string;
  year?: number;
  channels: number[];
}
export interface OdChannel {
  id: string;
  number: number;
  name: string;
  keys: string[];
}
export interface OdDetail extends OdEntry {
  seasons: { season: number; episodes: { item: ChannelItem; season: number; order: number }[] }[];
}

let catalogue: { at: number; data: Promise<{ entries: OdEntry[]; channels: OdChannel[] }> } | null = null;

/** The library, fetched once and kept a few minutes (it's a few hundred KB). */
export function loadCatalogue(): Promise<{ entries: OdEntry[]; channels: OdChannel[] }> {
  if (!catalogue || Date.now() - catalogue.at > 5 * 60_000) {
    const data = fetch('/api/ondemand').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ entries: OdEntry[]; channels: OdChannel[] }>;
    });
    catalogue = { at: Date.now(), data };
    data.catch(() => (catalogue = null));
  }
  return catalogue.data;
}

export async function loadDetail(key: string): Promise<OdDetail> {
  const r = await fetch(`/api/ondemand/entry?key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as OdDetail;
}

export async function loadItem(id: string): Promise<{ key: string; item: ChannelItem }> {
  const r = await fetch(`/api/ondemand/item/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as { key: string; item: ChannelItem };
}

// ── Progress (per TV) ─────────────────────────────────────────────────────

export interface Progress {
  itemId: string;
  key: string;
  title: string;
  show?: string;
  episode?: string;
  thumb?: string;
  pos: number;
  dur: number;
  at: number;
}

const KEY = 'retro-tv:od-progress';
/** At 90 % something counts as watched. */
export const WATCHED = 0.9;

function readAll(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Progress>;
  } catch {
    return {};
  }
}

export function progressOf(itemId: string): Progress | undefined {
  return readAll()[itemId];
}

export function saveProgress(p: Progress): void {
  const all = readAll();
  all[p.itemId] = p;
  // Keep the most recent 300.
  const kept = Object.values(all)
    .sort((a, b) => b.at - a.at)
    .slice(0, 300);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept.map((x) => [x.itemId, x]))));
  } catch {
    // Storage full or blocked: progress just isn't kept.
  }
}

/** Started but not finished, newest first, one per show. */
export function continueWatching(): Progress[] {
  const seen = new Set<string>();
  return Object.values(readAll())
    .filter((p) => p.pos > 30 && p.pos / p.dur < WATCHED)
    .sort((a, b) => b.at - a.at)
    .filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
    .slice(0, 20);
}

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtLeft = (sec: number) => {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} left` : `${m} min left`;
};
