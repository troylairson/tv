/** Turn a channel's content sources into the items it plays. */
import { plexConfigured } from './config';
import * as ia from './ia';
import * as plex from './plex';
import type { ChannelItem, SourceRef } from './types';

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

async function iaSearchItems(query: string, items: number, filesPerItem: number): Promise<ChannelItem[]> {
  const { docs } = await ia.search(query, { rows: items });
  const perItem = await mapLimit(docs, 6, async (doc) => {
    try {
      return ia.itemsFromMetadata(doc.identifier, await ia.metadata(doc.identifier), filesPerItem);
    } catch (err) {
      console.warn(`skipping ${doc.identifier}: ${(err as Error).message}`);
      return [] as ChannelItem[];
    }
  });
  return perItem.flat();
}

export async function resolveSource(source: SourceRef): Promise<ChannelItem[]> {
  if (source.kind.startsWith('plex-') && !plexConfigured()) throw new Error('Plex is not configured');
  switch (source.kind) {
    case 'plex-show':
      return plex.resolveShow(source.ratingKey);
    case 'plex-collection':
      return plex.resolveCollection(source.ratingKey);
    case 'plex-library':
      return plex.resolveLibrary(source.sectionKey, source.type);
    case 'plex-item':
      return plex.resolveItem(source.ratingKey);
    case 'plex-sample':
      return plex.sampleItems(source.count);
    case 'ia-search':
      return iaSearchItems(source.query, source.items, source.filesPerItem);
    case 'ia-item':
      return ia.itemsFromMetadata(source.identifier, await ia.metadata(source.identifier));
  }
}

export interface Resolution {
  items: ChannelItem[];
  /** Per-source problems; the other sources still count. */
  errors: string[];
}

/** All sources in order, minus excluded items and duplicates. */
export async function resolveSources(sources: SourceRef[], excluded: string[]): Promise<Resolution> {
  const skip = new Set(excluded);
  const seen = new Set<string>();
  const items: ChannelItem[] = [];
  const errors: string[] = [];
  for (const source of sources) {
    try {
      for (const item of await resolveSource(source)) {
        if (skip.has(item.id) || seen.has(item.id) || item.durationSec <= 0) continue;
        seen.add(item.id);
        items.push(item);
      }
    } catch (err) {
      errors.push(`${source.title}: ${(err as Error).message}`);
    }
  }
  return { items, errors };
}
