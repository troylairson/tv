import type { ChannelMode, ScheduleItem } from './index';
import type { TimeSlot } from './slots';

/** Shared between server and web: what /api/channels returns. */
export interface ChannelItem extends ScheduleItem {
  title: string;
  source: 'ia' | 'plex' | 'local';
  /** IA: "identifier/filename". Plex: ratingKey. */
  ref: string;
  /** Direct URL when the client can play it as-is (IA). Plex items resolve via /api/plex/play. */
  url?: string;
  thumb?: string;
}

export interface Channel {
  id: string;
  number: number;
  name: string;
  mode: ChannelMode;
  anchorMs: number;
  /** false: never insert commercial breaks (e.g. the Commercials channel itself). */
  breaks?: boolean;
  /** Regular programming (plays outside time slots). */
  items: ChannelItem[];
  /** Time slots with their resolved items. */
  slots?: TimeSlot<ChannelItem>[];
  /** Logo choice: hand:<id>, gen:<seed>, none; unset = automatic. */
  logo?: string;
  /** The channel pack it was added from (picks its hand-drawn logo). */
  packId?: string;
  /** What the channel plays (source titles), for generated logos' motifs. */
  logoHint?: string;
}

/** Where a channel's content comes from. A channel plays its sources' items in order (or shuffled). */
export type SourceRef =
  | { kind: 'plex-show'; ratingKey: string; title: string }
  | { kind: 'plex-collection'; ratingKey: string; title: string }
  | { kind: 'plex-library'; sectionKey: string; type: 'movie' | 'show'; title: string }
  | { kind: 'plex-item'; ratingKey: string; title: string }
  | { kind: 'plex-sample'; count: number; title: string }
  | {
      kind: 'ia-search';
      query: string;
      items: number;
      filesPerItem: number;
      title: string;
      /** Skip videos shorter than this (clips, promos). */
      minMinutes?: number;
      /** Skip videos whose title only mentions years after this ("Looney Tunes Show (2014)"). */
      maxYear?: number;
      /** Which results to take, and their order: popular first (default), or archive order (oldest first). */
      sort?: IaSort;
    }
  | { kind: 'ia-item'; identifier: string; title: string; minMinutes?: number; maxYear?: number };

export type IaSort = 'popular' | 'identifier' | 'date' | 'title';

/** "These days, at this time, for this long, play this." Times are in the house time zone. */
export interface SlotConfig {
  id: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** "HH:MM", 24-hour. */
  start: string;
  durationMin: number;
  order: 'next' | 'random';
  source: SourceRef;
}

/** A channel as the user defines it; the server resolves its sources into items. */
export interface ChannelConfig {
  id: string;
  number: number;
  name: string;
  /** loop = in order. */
  mode: ChannelMode;
  breaks: boolean;
  anchorMs: number;
  sources: SourceRef[];
  /** Item ids the user removed from what the sources produced. */
  excluded: string[];
  /** Time slots on top of the regular programming. */
  slots?: SlotConfig[];
  /** Set when the channel was added from a channel pack. */
  packId?: string;
  /** Logo choice: hand:<id>, gen:<seed>, none; unset = automatic. */
  logo?: string;
}
