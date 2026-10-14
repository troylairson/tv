/**
 * Channel packs: ready-made, hand-curated channel definitions (sources, order,
 * time slots) that the manager can add in one tap. Each pack is a JSON file in
 * ./packs, bundled into the server.
 */
import retroProWrestling from './packs/retro-pro-wrestling.json';
import atomicAgeSciFi from './packs/atomic-age-sci-fi.json';
import saturdayMorningCartoons from './packs/saturday-morning-cartoons.json';
import classicSitcoms from './packs/classic-sitcoms.json';
import filmNoirAfterDark from './packs/film-noir-after-dark.json';
import shockTheater from './packs/shock-theater.json';
import saddleUpWesterns from './packs/saddle-up-westerns.json';
import gameShowClassics from './packs/game-show-classics.json';
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

export const PACKS = [
  retroProWrestling,
  atomicAgeSciFi,
  saturdayMorningCartoons,
  classicSitcoms,
  filmNoirAfterDark,
  shockTheater,
  saddleUpWesterns,
  gameShowClassics,
] as ChannelPack[];

export const getPack = (id: string) => PACKS.find((p) => p.id === id);
