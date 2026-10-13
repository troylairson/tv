/**
 * Channel packs: ready-made, hand-curated channel definitions (sources, order,
 * time slots) that the manager can add in one tap. Each pack is a JSON file in
 * ./packs, bundled into the server.
 */
import retroProWrestling from './packs/retro-pro-wrestling.json';
import type { ChannelMode, SlotConfig, SourceRef } from './types';

export interface ChannelPack {
  id: string;
  name: string;
  description: string;
  /** When and how the content was picked. */
  curated: string;
  mode: ChannelMode;
  breaks: boolean;
  sources: SourceRef[];
  slots: Omit<SlotConfig, 'id'>[];
}

export const PACKS: ChannelPack[] = [retroProWrestling as ChannelPack];

export const getPack = (id: string) => PACKS.find((p) => p.id === id);
