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

/** A Plex library, browsable in full (not just what the channels play). */
export interface OdLibrary {
  key: string;
  title: string;
  type: string;
}
export interface OdCatalogue {
  entries: OdEntry[];
  channels: OdChannel[];
  libraries: OdLibrary[];
}

const cached = new Map<string, { at: number; data: Promise<unknown> }>();

/** Fetch JSON, kept a few minutes (the catalogue is a few hundred KB). */
function getCached<T>(url: string, ms = 5 * 60_000): Promise<T> {
  const hit = cached.get(url);
  if (hit && Date.now() - hit.at < ms) return hit.data as Promise<T>;
  const data = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
  cached.set(url, { at: Date.now(), data });
  data.catch(() => cached.delete(url));
  return data;
}

export async function loadCatalogue(): Promise<OdCatalogue> {
  const data = await getCached<OdCatalogue>('/api/ondemand');
  return { ...data, libraries: data.libraries ?? [] };
}

export async function loadLibrary(key: string): Promise<OdEntry[]> {
  return (await getCached<{ entries: OdEntry[] }>(`/api/ondemand/library/${encodeURIComponent(key)}`, 10 * 60_000)).entries;
}

const norm = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9 ]/g, '');

/**
 * Titles matching what's been typed on the letter grid: titles starting with it first,
 * then any word starting with it. The same show from a channel and a Plex library shows once.
 */
export function searchEntries(entries: OdEntry[], query: string, limit = 60): OdEntry[] {
  const q = norm(query).trim();
  if (!q) return [];
  const seen = new Set<string>();
  const starts: OdEntry[] = [];
  const words: OdEntry[] = [];
  for (const e of entries) {
    const t = norm(e.title);
    const id = `${e.kind}:${t.replace(/ /g, '')}`;
    if (seen.has(id)) continue;
    if (t.startsWith(q)) starts.push(e);
    else if (` ${t}`.includes(` ${q}`)) words.push(e);
    else continue;
    seen.add(id);
  }
  return [...starts, ...words].slice(0, limit);
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

// ── Progress (shared by every TV in the house, cached on this one) ─────────

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

let mem: Record<string, Progress> | null = null;
/** Changed here and not yet sent to the server. */
const unsent = new Map<string, Progress>();
let sendTimer: ReturnType<typeof setTimeout> | null = null;

function readAll(): Record<string, Progress> {
  if (mem) return mem;
  try {
    mem = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Progress>;
  } catch {
    mem = {};
  }
  return mem;
}

function writeLocal() {
  // Keep the most recent 300 on this TV; the server keeps the rest.
  const kept = Object.values(readAll())
    .sort((a, b) => b.at - a.at)
    .slice(0, 300);
  mem = Object.fromEntries(kept.map((x) => [x.itemId, x]));
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    // Storage full or blocked: the server still has it.
  }
}

export function progressOf(itemId: string): Progress | undefined {
  return readAll()[itemId];
}

export function saveProgress(p: Progress): void {
  readAll()[p.itemId] = p;
  writeLocal();
  unsent.set(p.itemId, p);
  sendTimer ??= setTimeout(() => void flushProgress(), 10_000);
}

/** Send what's changed to the server now (also every 10 s while watching). */
export async function flushProgress(): Promise<void> {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = null;
  if (!unsent.size) return;
  const progress = [...unsent.values()];
  unsent.clear();
  try {
    const r = await fetch('/api/ondemand/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch {
    // Try again with the next save.
    for (const p of progress) if (!unsent.has(p.itemId)) unsent.set(p.itemId, p);
  }
}

/**
 * Bring in what the other TVs have watched (newest wins), and send anything this TV
 * has that the server doesn't (progress from before it was shared).
 */
export async function syncProgress(): Promise<void> {
  try {
    const r = await fetch('/api/ondemand/progress', { cache: 'no-store' });
    if (!r.ok) return;
    const { progress } = (await r.json()) as { progress: Progress[] };
    const all = readAll();
    const server = new Map(progress.map((p) => [p.itemId, p]));
    for (const p of progress) if (!all[p.itemId] || all[p.itemId]!.at < p.at) all[p.itemId] = p;
    for (const p of Object.values(all)) {
      const s = server.get(p.itemId);
      if (!s || s.at < p.at) unsent.set(p.itemId, p);
    }
    writeLocal();
    if (unsent.size) void flushProgress();
  } catch {
    // Offline: this TV's own progress still works.
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
