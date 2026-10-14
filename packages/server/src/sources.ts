/** Turn a channel's content sources into the items it plays. */
import { plexConfigured } from './config';
import * as ia from './ia';
import * as plex from './plex';
import type { IaSort } from '@retro-tv/schedule';
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

const IA_SORTS: Record<IaSort, string> = {
  popular: 'downloads desc',
  identifier: 'identifier asc',
  date: 'date asc',
  title: 'titleSorter asc',
};

async function iaSearchItems(query: string, items: number, filesPerItem: number, sort: IaSort = 'popular'): Promise<ChannelItem[]> {
  const { docs } = await ia.search(query, { rows: items, sort: IA_SORTS[sort] ?? IA_SORTS.popular });
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

/** True if the title names years and all of them are after `maxYear` (a 1920 film "restored 1994" stays). */
export function tooRecent(title: string, maxYear: number): boolean {
  const years = [...title.matchAll(/(?:^|\D)((?:19|20)\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  return years.length > 0 && Math.min(...years) > maxYear;
}

export async function resolveSource(source: SourceRef): Promise<ChannelItem[]> {
  const items = await resolveSourceItems(source);
  const min = 'minMinutes' in source && source.minMinutes ? source.minMinutes * 60 : 0;
  const maxYear = 'maxYear' in source ? source.maxYear : undefined;
  return items.filter((i) => i.durationSec >= min && !(maxYear && tooRecent(i.title, maxYear)));
}

async function resolveSourceItems(source: SourceRef): Promise<ChannelItem[]> {
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
      return iaSearchItems(source.query, source.items, source.filesPerItem, source.sort);
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
