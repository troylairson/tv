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
import tapedOffTv from './packs/taped-off-tv.json';
import eightiesCartoonRewind from './packs/eighties-cartoon-rewind.json';
import varietyHour from './packs/variety-hour.json';
import gumshoeTv from './packs/gumshoe-tv.json';
import strangeTales from './packs/strange-tales.json';
import cliffhangerSerials from './packs/cliffhanger-serials.json';
import kiddieMatinee from './packs/kiddie-matinee.json';
import driveInDoubleFeature from './packs/drive-in-double-feature.json';
import kungFuTheater from './packs/kung-fu-theater.json';
import silentLaughs from './packs/silent-laughs.json';
import comedyTeams from './packs/comedy-teams.json';
import jukeboxSoundies from './packs/jukebox-soundies.json';
import newsreelTheater from './packs/newsreel-theater.json';
import spaceRace from './packs/space-race.json';
import fightNight from './packs/fight-night.json';
import holidayHearth from './packs/holiday-hearth.json';
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
  tapedOffTv,
  eightiesCartoonRewind,
  varietyHour,
  gumshoeTv,
  strangeTales,
  cliffhangerSerials,
  kiddieMatinee,
  driveInDoubleFeature,
  kungFuTheater,
  silentLaughs,
  comedyTeams,
  jukeboxSoundies,
  newsreelTheater,
  spaceRace,
  fightNight,
  holidayHearth,
] as ChannelPack[];

export const getPack = (id: string) => PACKS.find((p) => p.id === id);
