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
import { resolveSources } from './sources';
import type { Channel, ChannelConfig, ChannelItem, SourceRef } from './types';

/** Original lineup channels keep this anchor so their schedules don't jump. */
const LEGACY_ANCHOR_MS = Date.UTC(2026, 0, 1);
const CACHE_VERSION = 3;
const REFRESH_EVERY_MS = 24 * 3600_000;

/** The first-run lineup: popular items from a few Internet Archive collections. */
const DEFAULT_CHANNELS: Omit<ChannelConfig, 'anchorMs' | 'excluded'>[] = [
  { id: 'ia-2', number: 2, name: 'Classic TV', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Classic TV (Internet Archive)', query: 'collection:classic_tv', items: 8, filesPerItem: 10 }] },
  { id: 'ia-3', number: 3, name: 'Cartoons', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Classic cartoons (Internet Archive)', query: 'collection:classic_cartoons', items: 40, filesPerItem: 3 }] },
  { id: 'ia-4', number: 4, name: 'Prelinger', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Prelinger Archives', query: 'collection:prelinger', items: 40, filesPerItem: 1 }] },
  { id: 'ia-5', number: 5, name: 'Commercials', mode: 'shuffle', breaks: false, sources: [{ kind: 'ia-search', title: 'Classic TV commercials (Internet Archive)', query: 'collection:classic_tv_commercials', items: 60, filesPerItem: 5 }] },
  { id: 'ia-6', number: 6, name: 'Feature Films', mode: 'shuffle', breaks: true, sources: [{ kind: 'ia-search', title: 'Feature films (Internet Archive)', query: 'collection:feature_films', items: 16, filesPerItem: 1 }] },
];

interface Resolved {
  configHash: string;
  items: ChannelItem[];
  resolvedAt: string;
  errors: string[];
}

let configs: ChannelConfig[] = [];
const resolved = new Map<string, Resolved>();
const resolving = new Set<string>();

const configFile = () => path.join(serverConfig.dataDir, 'channels-config.json');
const cacheFile = () => path.join(serverConfig.dataDir, 'channels.json');

/** Only what changes the items: renaming or renumbering doesn't need a re-resolve. */
const contentHash = (c: ChannelConfig) => hashString(JSON.stringify([c.sources, [...c.excluded].sort()])).toString(36);

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(serverConfig.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

const saveConfigs = () => writeJson(configFile(), { channels: configs });
const saveCache = () => writeJson(cacheFile(), { version: CACHE_VERSION, resolved: Object.fromEntries(resolved) });

function toChannel(c: ChannelConfig): Channel | null {
  const items = resolved.get(c.id)?.items;
  if (!items?.length) return null;
  return { id: c.id, number: c.number, name: c.name, mode: c.mode, anchorMs: c.anchorMs, breaks: c.breaks, items };
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
  totalSec: number;
  resolving: boolean;
  resolvedAt: string | null;
  errors: string[];
  /** false while saved changes haven't been resolved yet. */
  upToDate: boolean;
}

export function channelStatuses(): ChannelStatus[] {
  return configs
    .map((c) => {
      const r = resolved.get(c.id);
      return {
        ...c,
        itemCount: r?.items.length ?? 0,
        totalSec: Math.round(r?.items.reduce((sum, i) => sum + i.durationSec, 0) ?? 0),
        resolving: resolving.has(c.id),
        resolvedAt: r?.resolvedAt ?? null,
        errors: r?.errors ?? [],
        upToDate: r?.configHash === contentHash(c),
      };
    })
    .sort((a, b) => a.number - b.number);
}

export const getConfig = (id: string) => configs.find((c) => c.id === id);
export const resolvedItems = (id: string) => resolved.get(id)?.items ?? [];

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
      // The config may have been edited or deleted meanwhile; only store results that still apply.
      const now = getConfig(id);
      if (!now || contentHash(now) !== hash) return;
      // Keep the previous items if a temporary failure left the channel empty.
      if (!items.length && errors.length && resolved.get(id)?.items.length) {
        resolved.set(id, { ...resolved.get(id)!, errors });
      } else {
        resolved.set(id, { configHash: hash, items, resolvedAt: new Date().toISOString(), errors });
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

function applyInput(base: ChannelConfig, input: ChannelInput, selfId?: string): ChannelConfig {
  const next = { ...base };
  if (input.number !== undefined) {
    const n = Number(input.number);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new ValidationError('Channel number must be 1–999');
    const clash = configs.find((c) => c.number === n && c.id !== selfId);
    if (clash) throw new ValidationError(`Channel ${n} is already ${clash.name}`);
    next.number = n;
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
  if (input.sources !== undefined) next.sources = validSources(input.sources);
  if (input.excluded !== undefined) {
    if (!Array.isArray(input.excluded)) throw new ValidationError('excluded must be a list');
    next.excluded = input.excluded.map(String);
  }
  return next;
}

export async function createChannel(input: ChannelInput): Promise<ChannelConfig> {
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
  const created = applyInput(base, input);
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
  void refreshAll(true);
  setInterval(() => void refreshAll(), REFRESH_EVERY_MS);
}
