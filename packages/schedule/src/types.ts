import type { ChannelMode, ScheduleItem } from './index';

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
  items: ChannelItem[];
}
