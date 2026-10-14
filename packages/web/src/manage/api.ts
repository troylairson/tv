import type { ChannelConfig, ChannelItem, SourceRef } from '@retro-tv/schedule';

export interface ChannelStatus extends ChannelConfig {
  itemCount: number;
  slotItemCounts: Record<string, number>;
  totalSec: number;
  resolving: boolean;
  resolvedAt: string | null;
  errors: string[];
  upToDate: boolean;
}

export interface PlexSection {
  key: string;
  title: string;
  type: string;
}

export interface PlexBrowseItem {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  count?: number;
  durationMin?: number;
  thumb?: string;
}

export interface IaResult {
  identifier: string;
  title?: string;
  year?: string | number;
  downloads?: number;
  thumb: string;
}

export interface PackInfo {
  id: string;
  name: string;
  description: string;
  curated: string;
  sourceCount: number;
  slotCount: number;
  installed: { id: string; number: number; name: string }[];
}

export interface PreviewBlock {
  title: string;
  startMs: number;
  endMs: number;
  kind: 'show' | 'break' | 'offair';
  slot?: boolean;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export type ChannelFields = Pick<ChannelConfig, 'number' | 'name' | 'mode' | 'breaks' | 'sources' | 'excluded' | 'slots'>;

export const api = {
  channels: () => call<{ channels: ChannelStatus[]; plexConfigured: boolean }>('/api/manage/channels'),
  create: (fields: Partial<ChannelFields>) => call<ChannelConfig>('/api/manage/channels', json('POST', fields)),
  update: (id: string, fields: Partial<ChannelFields>) => call<ChannelConfig>(`/api/manage/channels/${id}`, json('PUT', fields)),
  remove: (id: string) => call<{ ok: true }>(`/api/manage/channels/${id}`, { method: 'DELETE' }),
  refresh: (id: string) => call<{ ok: true }>(`/api/manage/channels/${id}/refresh`, { method: 'POST' }),
  items: (id: string) => call<{ items: ChannelItem[] }>(`/api/manage/channels/${id}/items`),
  preview: (id: string) => call<{ blocks: PreviewBlock[] }>(`/api/manage/channels/${id}/preview?hours=24`),
  packs: () => call<{ packs: PackInfo[] }>('/api/manage/packs'),
  installPack: (id: string) => call<ChannelConfig>(`/api/manage/packs/${id}/install`, { method: 'POST' }),
  plexSections: () => call<PlexSection[]>('/api/plex/sections'),
  plexBrowse: (key: string, q: string) => call<PlexBrowseItem[]>(`/api/plex/sections/${key}/items?q=${encodeURIComponent(q)}`),
  plexCollections: (key: string) => call<PlexBrowseItem[]>(`/api/plex/sections/${key}/collections`),
  iaSearch: (q: string, collection: string) =>
    call<{ query: string; total: number; link?: boolean; results: IaResult[] }>(
      `/api/ia/search?q=${encodeURIComponent(q)}&collection=${encodeURIComponent(collection)}`,
    ),
};

export function sourceLabel(s: SourceRef): string {
  switch (s.kind) {
    case 'plex-show':
      return 'Plex show · every episode';
    case 'plex-collection':
      return 'Plex collection';
    case 'plex-library':
      return `Plex library · all ${s.type === 'movie' ? 'movies' : 'episodes'}`;
    case 'plex-item':
      return 'Plex';
    case 'plex-sample':
      return `Plex · random ${s.count}`;
    case 'ia-search':
      return `Internet Archive search · top ${s.items} items · updates nightly`;
    case 'ia-item':
      return 'Internet Archive item';
  }
}

export const sameSource = (a: SourceRef, b: SourceRef) => JSON.stringify(a) === JSON.stringify(b);

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
