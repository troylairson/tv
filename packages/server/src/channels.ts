import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChannelMode } from '@retro-tv/schedule';
import { config, plexConfigured } from './config';
import * as ia from './ia';
import * as plex from './plex';
import type { Channel, ChannelItem } from './types';

/** Every channel shares one anchor so schedules stay put across rebuilds and restarts. */
const ANCHOR_MS = Date.UTC(2026, 0, 1);
/** Bump when the lineup format or title cleanup changes; older caches get rebuilt in the background. */
const CHANNEL_CACHE_VERSION = 2;

interface IaSeed {
  number: number;
  name: string;
  mode: ChannelMode;
  query: string;
  items: number;
  filesPerItem: number;
  breaks?: boolean;
}

/** Phase 0 lineup: popular items from a few Internet Archive collections. */
const IA_SEEDS: IaSeed[] = [
  { number: 2, name: 'Classic TV', mode: 'shuffle', query: 'collection:classic_tv', items: 8, filesPerItem: 10 },
  { number: 3, name: 'Cartoons', mode: 'shuffle', query: 'collection:classic_cartoons', items: 40, filesPerItem: 3 },
  { number: 4, name: 'Prelinger', mode: 'shuffle', query: 'collection:prelinger', items: 40, filesPerItem: 1 },
  { number: 5, name: 'Commercials', mode: 'shuffle', query: 'collection:classic_tv_commercials', items: 60, filesPerItem: 5, breaks: false },
  { number: 6, name: 'Feature Films', mode: 'shuffle', query: 'collection:feature_films', items: 16, filesPerItem: 1 },
];

const cacheFile = () => path.join(config.dataDir, 'channels.json');

async function mapLimit<T, R>(inputs: T[], limit: number, fn: (input: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const i = next++;
      results[i] = await fn(inputs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

async function buildIaChannel(seed: IaSeed): Promise<Channel> {
  const { docs } = await ia.search(seed.query, { rows: seed.items });
  const perItem = await mapLimit(docs, 6, async (doc) => {
    try {
      return ia.itemsFromMetadata(doc.identifier, await ia.metadata(doc.identifier), seed.filesPerItem);
    } catch (err) {
      console.warn(`skipping ${doc.identifier}: ${(err as Error).message}`);
      return [] as ChannelItem[];
    }
  });
  return {
    id: `ia-${seed.number}`,
    number: seed.number,
    name: seed.name,
    mode: seed.mode,
    anchorMs: ANCHOR_MS,
    breaks: seed.breaks,
    items: perItem.flat(),
  };
}

export async function buildChannels(): Promise<Channel[]> {
  const channels: Channel[] = [];
  for (const seed of IA_SEEDS) {
    try {
      const channel = await buildIaChannel(seed);
      console.log(`channel ${channel.number} ${channel.name}: ${channel.items.length} items`);
      if (channel.items.length) channels.push(channel);
    } catch (err) {
      console.warn(`could not build ${seed.name}: ${(err as Error).message}`);
    }
  }
  if (plexConfigured()) {
    try {
      const items = await plex.sampleItems();
      console.log(`channel 7 Plex Sampler: ${items.length} items`);
      if (items.length) channels.push({ id: 'plex-7', number: 7, name: 'Plex Sampler', mode: 'shuffle', anchorMs: ANCHOR_MS, items });
    } catch (err) {
      console.warn(`could not build Plex channel: ${(err as Error).message}`);
    }
  }
  return channels;
}

let channels: Channel[] = [];
let builtAt: string | null = null;
let building: Promise<void> | null = null;

export function getChannels() {
  return { channels, builtAt, building: Boolean(building) };
}

export function rebuild(): Promise<void> {
  building ??= (async () => {
    try {
      const next = await buildChannels();
      if (next.length) {
        channels = next;
        builtAt = new Date().toISOString();
        await fs.mkdir(config.dataDir, { recursive: true });
        await fs.writeFile(cacheFile(), JSON.stringify({ version: CHANNEL_CACHE_VERSION, builtAt, channels }, null, 1));
      }
    } finally {
      building = null;
    }
  })();
  return building;
}

/** Load the cached lineup, or build one in the background if there is none. */
export async function initChannels(): Promise<void> {
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as { version?: number; builtAt: string; channels: Channel[] };
    channels = cached.channels;
    builtAt = cached.builtAt;
    console.log(`loaded ${channels.length} channels from cache (built ${builtAt})`);
    if (cached.version !== CHANNEL_CACHE_VERSION) {
      console.log('channel cache is from an older version, rebuilding in the background…');
      void rebuild().catch((err) => console.error('channel build failed', err));
    }
  } catch {
    console.log('no channel cache yet, building lineup from the Internet Archive…');
    void rebuild().catch((err) => console.error('channel build failed', err));
  }
}
