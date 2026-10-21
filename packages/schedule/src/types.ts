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
  /** A sentence or two about it (IA description, Plex summary), for the guide and "up next" cards. */
  description?: string;
  /** For two-line listings: the series, and the episode under it. Unset for movies and one-offs. */
  show?: string;
  episode?: string;
  /** The show's title art (a transparent "clear logo"), when there is one. */
  logo?: string;
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
  /** false: no "Coming up on…" card at the end of commercial breaks. */
  bumpers?: boolean;
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
  | PlexFilterSource
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

/**
 * Everything in a Plex library matching a filter: shows (all their episodes) or movies.
 * Re-evaluated on every refresh, so new additions to the library join the channel.
 */
export interface PlexFilterSource {
  kind: 'plex-filter';
  sectionKey: string;
  type: 'movie' | 'show';
  title: string;
  /** Any of these genres (Plex's names, e.g. "Comedy"). */
  genres?: string[];
  /** First and last year, inclusive. */
  years?: [number, number];
  /** Any of these studios / networks ("NBC"). */
  studios?: string[];
  /** Any of these content ratings ("TV-Y", "G"). */
  ratings?: string[];
}

export type IaSort = 'popular' | 'identifier' | 'date' | 'title' | 'gems' | 'newest';

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
  /** false: no "Coming up on…" card at the end of commercial breaks (default on). */
  bumpers?: boolean;
}
