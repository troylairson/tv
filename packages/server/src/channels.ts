/**
 * Channels as the user defines them (saved in channels-config.json) and the
 * items their sources resolve to (cached in channels.json). Editing a channel's
 * name or number is instant; changing its sources re-resolves it in the
 * background while the old items keep playing.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashString, type ChannelMode } from '@retro-tv/schedule';
import { config as serverConfig } from './config';
import { healthVersion, isChecking, isUnavailable } from './health';
import { resolveSources } from './sources';
import type { Channel, ChannelConfig, ChannelItem, SlotConfig, SourceRef } from './types';

/** Original lineup channels keep this anchor so their schedules don't jump. */
const LEGACY_ANCHOR_MS = Date.UTC(2026, 0, 1);
const CACHE_VERSION = 3;
const REFRESH_EVERY_MS = 24 * 3600_000;

/** Commercials, PSAs and promos up to the 80s; no 2000s kids'-channel tapes or full shows "with commercials". */
const COMMERCIALS_SOURCE: SourceRef = {
  kind: 'ia-search',
  title: 'Vintage TV commercials (Internet Archive)',
  query:
    'collection:classic_tv_commercials ' +
    'AND mediatype:movies ' +
    'AND (year:[1940 TO 1989] OR (*:* -year:[* TO *])) ' +
    'AND title:(commercial OR commercials OR ad OR ads OR advert OR adverts OR advertising OR PSA OR "public service" OR promo) ' +
    'AND NOT title:(2000s OR 2000 OR 90s OR 1990s OR banned OR toonami OR "cartoon network" OR nickelodeon OR nick OR noggin OR disney OR sprout OR "nostalgia critic" OR stimpy OR "with commercials" OR "air cut" OR elvis OR "commercial breaks" OR parody OR top OR election OR campaign OR political)',
  items: 80,
  filesPerItem: 5,
  maxYear: 1989,
};

/** Feature-length films 1920–1975, minus exploitation, nudie and propaganda reels. */
const FEATURE_FILMS_SOURCE: SourceRef = {
  kind: 'ia-search',
  title: 'Classic feature films (Internet Archive)',
  query:
    'collection:feature_films ' +
    'AND mediatype:movies ' +
    'AND year:[1920 TO 1975] ' +
    'AND NOT collection:german_cinema ' +
    'AND NOT title:(sex OR sexual OR porn OR nudist OR nudity OR madness OR nazi OR concentration OR hitler OR marihuana OR marijuana OR reefer OR cocaine OR "white slavery" OR prostitution OR burlesque OR striptease OR teaserama OR "child bride") ' +
    'AND NOT subject:(exploitation OR sexploitation OR nudity OR erotic OR burlesque OR propaganda OR holocaust OR documentary)',
  items: 60,
  filesPerItem: 1,
  minMinutes: 60,
  maxYear: 1975,
};

/** The first-run lineup: popular items from a few Internet Archive collections. */
const DEFAULT_CHANNELS: Omit<ChannelConfig, 'anchorMs' | 'excluded'>[] = [
  { id: 'ia-2', number: 2, name: 'Classic TV', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Classic TV (Internet Archive)', query: 'collection:classic_tv', items: 8, filesPerItem: 10 }] },
  { id: 'ia-3', number: 3, name: 'Cartoons', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Classic cartoons (Internet Archive)', query: 'collection:classic_cartoons', items: 40, filesPerItem: 3 }] },
  { id: 'ia-4', number: 4, name: 'Prelinger', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Prelinger Archives', query: 'collection:prelinger', items: 40, filesPerItem: 1 }] },
  { id: 'ia-5', number: 5, name: 'Commercials', mode: 'shuffle', breaks: false, sources: [COMMERCIALS_SOURCE] },
  { id: 'ia-6', number: 6, name: 'Feature Films', mode: 'shuffle', breaks: true, sources: [FEATURE_FILMS_SOURCE] },
];

/**
 * The first lineup's bare collection searches, replaced on existing installs if
 * still untouched: they pulled in modern uploads, kids'-channel recordings,
 * exploitation films and documentaries.
 */
const OLD_DEFAULT_SOURCES: Record<string, { old: SourceRef; now: SourceRef }> = {
  'ia-5': { old: { kind: 'ia-search', title: 'Classic TV commercials (Internet Archive)', query: 'collection:classic_tv_commercials', items: 60, filesPerItem: 5 }, now: COMMERCIALS_SOURCE },
  'ia-6': { old: { kind: 'ia-search', title: 'Feature films (Internet Archive)', query: 'collection:feature_films', items: 16, filesPerItem: 1 }, now: FEATURE_FILMS_SOURCE },
};

interface Resolved {
  configHash: string;
  items: ChannelItem[];
  /** Items for each time slot, by slot id. */
  slotItems?: Record<string, ChannelItem[]>;
  resolvedAt: string;
  errors: string[];
}

let configs: ChannelConfig[] = [];
const resolved = new Map<string, Resolved>();
const resolving = new Set<string>();

const configFile = () => path.join(serverConfig.dataDir, 'channels-config.json');
const cacheFile = () => path.join(serverConfig.dataDir, 'channels.json');

/** Only what changes the items: renaming or renumbering doesn't need a re-resolve. */
const contentHash = (c: ChannelConfig) =>
  hashString(JSON.stringify([c.sources, [...c.excluded].sort(), (c.slots ?? []).map((s) => [s.id, s.source])])).toString(36);

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(serverConfig.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

const saveConfigs = () => writeJson(configFile(), { channels: configs });
/**
 * What resolved items carry beyond the basics: 1 descriptions, 2 show/episode split, 3 more splits and Plex title art, 4 cleaner show names.
 * An older cache stays playable and gets one full refresh in the background to catch up.
 */
const ITEM_DETAILS = 4;
const saveCache = () => writeJson(cacheFile(), { version: CACHE_VERSION, details: ITEM_DETAILS, resolved: Object.fromEntries(resolved) });

/**
 * A list without the items health checks found unavailable. The same array comes back
 * until something changes, so schedules (keyed on the list) stay put.
 */
const playableCache = new WeakMap<ChannelItem[], { version: number; items: ChannelItem[] }>();
function playable(list: ChannelItem[]): ChannelItem[] {
  const hit = playableCache.get(list);
  if (hit?.version === healthVersion()) return hit.items;
  const kept = list.filter((i) => !isUnavailable(i.id));
  // Never empty a list on the checks' say-so: a channel of dead videos stays as it was.
  const items = kept.length === list.length || !kept.length ? list : kept;
  playableCache.set(list, { version: healthVersion(), items });
  return items;
}

function toChannel(c: ChannelConfig): Channel | null {
  const raw = resolved.get(c.id);
  if (!raw) return null;
  const r = { items: playable(raw.items), slotItems: Object.fromEntries(Object.entries(raw.slotItems ?? {}).map(([id, list]) => [id, playable(list)])) };
  const slots = (c.slots ?? []).map((s) => ({
    id: s.id,
    days: s.days,
    start: s.start,
    durationMin: s.durationMin,
    order: s.order,
    title: s.source.title,
    items: r.slotItems[s.id] ?? [],
  }));
  // A channel needs regular programming or at least one slot with something in it.
  if (!r.items.length && !slots.some((s) => s.items.length)) return null;
  const logoHint = [...c.sources.map((s) => s.title), ...(c.slots ?? []).map((s) => s.source.title)].join(' · ');
  return {
    id: c.id,
    number: c.number,
    name: c.name,
    mode: c.mode,
    anchorMs: c.anchorMs,
    breaks: c.breaks,
    items: r.items,
    slots: slots.length ? slots : undefined,
    logo: c.logo,
    bumpers: c.bumpers,
    packId: c.packId,
    logoHint,
  };
}

/** Playable channels (those with resolved items), by number. */
export function getChannels() {
  const channels = configs
    .map(toChannel)
    .filter((c): c is Channel => c !== null)
    .sort((a, b) => a.number - b.number);
  const times = [...resolved.values()].map((r) => r.resolvedAt).sort();
  return { channels, builtAt: times[times.length - 1] ?? null, building: resolving.size > 0 };
}

export interface ChannelStatus extends ChannelConfig {
  itemCount: number;
  /** Episode counts per slot id. */
  slotItemCounts: Record<string, number>;
  totalSec: number;
  resolving: boolean;
  resolvedAt: string | null;
  errors: string[];
  /** false while saved changes haven't been resolved yet. */
  upToDate: boolean;
  /** Items health checks found broken (left out of the schedule). */
  unavailable: number;
  /** A health check of this channel is running. */
  checking: boolean;
}

export function channelStatuses(): ChannelStatus[] {
  return configs
    .map((c) => {
      const r = resolved.get(c.id);
      return {
        ...c,
        itemCount: r?.items.length ?? 0,
        slotItemCounts: Object.fromEntries(Object.entries(r?.slotItems ?? {}).map(([id, items]) => [id, items.length])),
        totalSec: Math.round(r?.items.reduce((sum, i) => sum + i.durationSec, 0) ?? 0),
        resolving: resolving.has(c.id),
        resolvedAt: r?.resolvedAt ?? null,
        errors: r?.errors ?? [],
        upToDate: r?.configHash === contentHash(c),
        unavailable: allItemsOf(c.id).filter((i) => isUnavailable(i.id)).length,
        checking: isChecking(allItemsOf(c.id).map((i) => i.id)),
      };
    })
    .sort((a, b) => a.number - b.number);
}

export const getConfig = (id: string) => configs.find((c) => c.id === id);
export const resolvedItems = (id: string) => resolved.get(id)?.items ?? [];
/** Regular programming and time-slot items, unavailable ones included. */
export const allItemsOf = (id: string): ChannelItem[] => {
  const r = resolved.get(id);
  return r ? [...r.items, ...Object.values(r.slotItems ?? {}).flat()] : [];
};
export const allItems = (): ChannelItem[] => configs.flatMap((c) => allItemsOf(c.id));

/** Re-resolve one channel's sources. Concurrent calls for the same channel share the work. */
const inFlight = new Map<string, Promise<void>>();
export function resolveChannel(id: string): Promise<void> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  // Deferred a tick so the job is registered before its body can finish.
  const job = Promise.resolve().then(async () => {
    const c = getConfig(id);
    if (!c) return;
    resolving.add(id);
    try {
      const hash = contentHash(c);
      const { items, errors } = await resolveSources(c.sources, c.excluded);
      const slotItems: Record<string, ChannelItem[]> = {};
      for (const slot of c.slots ?? []) {
        const r = await resolveSources([slot.source], c.excluded);
        slotItems[slot.id] = r.items;
        errors.push(...r.errors.map((e) => `Time slot: ${e}`));
      }
      // The config may have been edited or deleted meanwhile; only store results that still apply.
      const now = getConfig(id);
      if (!now || contentHash(now) !== hash) return;
      // Keep the previous items if a temporary failure left the channel empty.
      const hasContent = items.length || Object.values(slotItems).some((list) => list.length);
      if (!hasContent && errors.length && resolved.get(id)?.items.length) {
        resolved.set(id, { ...resolved.get(id)!, errors });
      } else {
        resolved.set(id, { configHash: hash, items, slotItems, resolvedAt: new Date().toISOString(), errors });
      }
      console.log(`channel ${c.number} ${c.name}: ${items.length} items${errors.length ? ` (${errors.join('; ')})` : ''}`);
      await saveCache();
    } catch (err) {
      console.warn(`could not resolve channel ${c.number} ${c.name}: ${(err as Error).message}`);
    } finally {
      resolving.delete(id);
      inFlight.delete(id);
      // If it was edited while resolving, go again with the new config.
      const latest = getConfig(id);
      if (latest && resolved.get(id)?.configHash !== contentHash(latest) && !inFlight.has(id)) void resolveChannel(id);
    }
  });
  inFlight.set(id, job);
  return job;
}

/** Re-resolve everything one channel at a time (nightly, and for stale caches). */
export async function refreshAll(onlyStale = false): Promise<void> {
  for (const c of [...configs]) {
    if (onlyStale && resolved.get(c.id)?.configHash === contentHash(c)) continue;
    await resolveChannel(c.id);
  }
}

// ── Editing ─────────────────────────────────────────────────────────────────

export class ValidationError extends Error {}

export interface ChannelInput {
  number?: unknown;
  name?: unknown;
  mode?: unknown;
  breaks?: unknown;
  sources?: unknown;
  excluded?: unknown;
  slots?: unknown;
  logo?: unknown;
  bumpers?: unknown;
}

const SOURCE_KINDS = new Set(['plex-show', 'plex-collection', 'plex-library', 'plex-item', 'plex-sample', 'ia-search', 'ia-item']);

function validSources(value: unknown): SourceRef[] {
  if (!Array.isArray(value)) throw new ValidationError('sources must be a list');
  for (const s of value) {
    if (!s || typeof s !== 'object' || !SOURCE_KINDS.has((s as SourceRef).kind) || typeof (s as SourceRef).title !== 'string') {
      throw new ValidationError(`not a valid source: ${JSON.stringify(s)}`);
    }
  }
  return value as SourceRef[];
}

const WEEK_MIN = 7 * 24 * 60;

function validSlots(value: unknown): SlotConfig[] {
  if (!Array.isArray(value)) throw new ValidationError('slots must be a list');
  const slots = value.map((raw, i): SlotConfig => {
    const s = raw as Partial<SlotConfig>;
    const label = `Time slot ${i + 1}`;
    if (!Array.isArray(s.days) || !s.days.length || s.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ValidationError(`${label}: pick at least one day`);
    }
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s.start ?? ''));
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ValidationError(`${label}: start time must be HH:MM`);
    const durationMin = Number(s.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 12 * 60) throw new ValidationError(`${label}: length must be 5 minutes to 12 hours`);
    if (s.order !== 'next' && s.order !== 'random') throw new ValidationError(`${label}: order must be next or random`);
    const [source] = validSources([s.source]);
    return {
      id: typeof s.id === 'string' && s.id ? s.id : `slot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      days: [...new Set(s.days)].sort(),
      start: `${m[1]!.padStart(2, '0')}:${m[2]}`,
      durationMin,
      order: s.order,
      source: source!,
    };
  });
  // No two slots may overlap (minutes into the week, wrapping Saturday night into Sunday).
  const spans = slots.flatMap((slot, i) =>
    slot.days.map((day) => {
      const [h, min] = slot.start.split(':').map(Number) as [number, number];
      const start = day * 1440 + h * 60 + min;
      return { i, start, end: start + slot.durationMin };
    }),
  );
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const a of spans) {
    for (const b of spans) {
      if (a.i >= b.i) continue;
      for (const shift of [-WEEK_MIN, 0, WEEK_MIN]) {
        if (a.start < b.end + shift && b.start + shift < a.end) {
          const day = dayNames[Math.floor((((a.start % WEEK_MIN) + WEEK_MIN) % WEEK_MIN) / 1440)];
          throw new ValidationError(`Time slots ${a.i + 1} and ${b.i + 1} overlap (${day})`);
        }
      }
    }
  }
  return slots;
}

function applyInput(base: ChannelConfig, input: ChannelInput, selfId?: string): ChannelConfig {
  const next = { ...base };
  if (input.number !== undefined) {
    const n = Number(input.number);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new ValidationError('Channel number must be 1–999');
    const clash = configs.find((c) => c.number === n && c.id !== selfId);
    if (clash) throw new ValidationError(`Channel ${n} is already ${clash.name}`);
    next.number = n;
  }
  if (input.logo !== undefined) {
    const logo = String(input.logo);
    if (logo === 'auto' || logo === '') delete next.logo;
    else if (/^(none|hand:[a-z0-9-]{1,40}|gen:\d{1,4}|upload:\d{1,15})$/.test(logo)) next.logo = logo;
    else throw new ValidationError(`not a valid logo: ${logo}`);
  }
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > 40) throw new ValidationError('Name must be 1–40 characters');
    next.name = name;
  }
  if (input.mode !== undefined) {
    if (input.mode !== 'loop' && input.mode !== 'shuffle') throw new ValidationError('mode must be loop or shuffle');
    next.mode = input.mode as ChannelMode;
  }
  if (input.breaks !== undefined) next.breaks = Boolean(input.breaks);
  if (input.bumpers !== undefined) {
    if (input.bumpers === false) next.bumpers = false;
    else delete next.bumpers;
  }
  if (input.sources !== undefined) next.sources = validSources(input.sources);
  if (input.slots !== undefined) next.slots = validSlots(input.slots);
  if (input.excluded !== undefined) {
    if (!Array.isArray(input.excluded)) throw new ValidationError('excluded must be a list');
    next.excluded = input.excluded.map(String);
  }
  return next;
}

export async function createChannel(input: ChannelInput, extra: { packId?: string } = {}): Promise<ChannelConfig> {
  const used = new Set(configs.map((c) => c.number));
  let number = 2;
  while (used.has(number)) number++;
  const base: ChannelConfig = {
    id: `ch-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    number,
    name: 'New Channel',
    mode: 'loop',
    breaks: true,
    // New channels start at their first item right now (episode 1 of a show, say).
    anchorMs: Date.now(),
    sources: [],
    excluded: [],
  };
  const created = { ...applyInput(base, input), ...(extra.packId ? { packId: extra.packId } : {}) };
  configs.push(created);
  await saveConfigs();
  void resolveChannel(created.id);
  return created;
}

export interface UpdateResult {
  config: ChannelConfig;
  breaksChanged: boolean;
}

export async function updateChannel(id: string, input: ChannelInput): Promise<UpdateResult | null> {
  const i = configs.findIndex((c) => c.id === id);
  const current = configs[i];
  if (!current) return null;
  const next = applyInput(current, input, id);
  configs[i] = next;
  await saveConfigs();
  if (contentHash(next) !== contentHash(current)) void resolveChannel(id);
  return { config: next, breaksChanged: next.breaks !== current.breaks };
}

export async function deleteChannel(id: string): Promise<boolean> {
  const before = configs.length;
  configs = configs.filter((c) => c.id !== id);
  if (configs.length === before) return false;
  resolved.delete(id);
  await saveConfigs();
  await saveCache();
  return true;
}

// ── Startup ─────────────────────────────────────────────────────────────────

interface LegacyCache {
  version?: number;
  details?: number;
  channels?: Channel[];
  resolved?: Record<string, Resolved>;
}

export async function initChannels(): Promise<void> {
  let cache: LegacyCache = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as LegacyCache;
  } catch {
    // First run.
  }

  try {
    configs = (JSON.parse(await fs.readFile(configFile(), 'utf8')) as { channels: ChannelConfig[] }).channels;
  } catch {
    // First run, or upgrading from the fixed lineup: start from the defaults.
    configs = DEFAULT_CHANNELS.map((c) => ({ ...c, anchorMs: LEGACY_ANCHOR_MS, excluded: [] }));
    // Keep the Phase 0 Plex sampler channel if it existed.
    if (cache.channels?.some((c) => c.id === 'plex-7')) {
      configs.push({ id: 'plex-7', number: 7, name: 'Plex Sampler', mode: 'shuffle', breaks: true, anchorMs: LEGACY_ANCHOR_MS, excluded: [], sources: [{ kind: 'plex-sample', count: 40, title: 'Random sample of your Plex libraries' }] });
    }
    await saveConfigs();
    console.log(`created ${configs.length} channels from the default lineup`);
  }

  let migrated = false;
  for (const c of configs) {
    const swap = OLD_DEFAULT_SOURCES[c.id];
    if (swap && c.sources.length === 1 && JSON.stringify(c.sources[0]) === JSON.stringify(swap.old)) {
      c.sources = [swap.now];
      migrated = true;
      console.log(`${c.name}: replaced the original search with a cleaner one`);
    }
  }
  if (migrated) await saveConfigs();

  if (cache.version === CACHE_VERSION && cache.resolved) {
    for (const [id, r] of Object.entries(cache.resolved)) resolved.set(id, r);
  } else if (cache.channels) {
    // Upgrading: reuse the old lineup's items so nothing needs rebuilding.
    for (const old of cache.channels) {
      const c = getConfig(old.id);
      if (c) resolved.set(c.id, { configHash: contentHash(c), items: old.items, resolvedAt: new Date().toISOString(), errors: [] });
    }
    await saveCache();
  }

  const stale = configs.filter((c) => resolved.get(c.id)?.configHash !== contentHash(c)).length;
  console.log(`${configs.length} channels configured, ${configs.length - stale} ready${stale ? `, resolving ${stale}…` : ''}`);
  // Caches from before newer item details: re-resolve everything once (what's cached keeps playing meanwhile).
  const current = cache.details === ITEM_DETAILS;
  if (!current && resolved.size) console.log('updating show details for every channel in the background…');
  void refreshAll(current || !resolved.size);
  setInterval(() => void refreshAll(), REFRESH_EVERY_MS);
}
