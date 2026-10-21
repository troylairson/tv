import fs from 'node:fs/promises';
import path from 'node:path';
import { isValidTimeZone } from '@retro-tv/schedule';
import { config } from './config';

/** House-wide settings: they change the shared schedule, so they apply to every screen. */
export interface Settings {
  commercialBreaks: boolean;
  /** IANA zone that time slots are written in ("20:00" means 8 pm here). */
  timeZone: string;
  /** Preferred audio track for Plex files with several (a key of AUDIO_LANGUAGES). */
  audioLanguage: string;
  /**
   * Where shows and movies come from: both, Plex only or Internet Archive only. Commercials
   * always come from the Archive. Channels keep their sources; the other kind is just left out.
   */
  videoSources: VideoSources;
}

export type VideoSources = 'both' | 'plex' | 'ia';
export const VIDEO_SOURCES: VideoSources[] = ['both', 'plex', 'ia'];

/** Audio languages to pick from, with the codes and names Plex may tag a track with. "file" keeps the file's own default. */
export const AUDIO_LANGUAGES: Record<string, { name: string; codes: string[] }> = {
  eng: { name: 'English', codes: ['eng', 'en', 'english'] },
  spa: { name: 'Spanish', codes: ['spa', 'es', 'spanish', 'español'] },
  fra: { name: 'French', codes: ['fra', 'fre', 'fr', 'french', 'français'] },
  deu: { name: 'German', codes: ['deu', 'ger', 'de', 'german', 'deutsch'] },
  ita: { name: 'Italian', codes: ['ita', 'it', 'italian', 'italiano'] },
  jpn: { name: 'Japanese', codes: ['jpn', 'ja', 'japanese', '日本語'] },
  file: { name: 'File default', codes: [] },
};

const envZone = process.env.TZ && isValidTimeZone(process.env.TZ) ? process.env.TZ : 'UTC';
const DEFAULTS: Settings = { commercialBreaks: true, timeZone: envZone, audioLanguage: 'eng', videoSources: 'both' };
const file = () => path.join(config.dataDir, 'settings.json');

let current: Settings = { ...DEFAULTS };

export async function loadSettings(): Promise<void> {
  try {
    current = { ...DEFAULTS, ...(JSON.parse(await fs.readFile(file(), 'utf8')) as Partial<Settings>) };
  } catch {
    current = { ...DEFAULTS };
  }
}

export class SettingsError extends Error {}

export const getSettings = (): Settings => current;

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...current };
  if (typeof patch.commercialBreaks === 'boolean') next.commercialBreaks = patch.commercialBreaks;
  if (patch.timeZone !== undefined) {
    if (typeof patch.timeZone !== 'string' || !isValidTimeZone(patch.timeZone)) throw new SettingsError(`Unknown time zone "${String(patch.timeZone)}"`);
    next.timeZone = patch.timeZone;
  }
  if (patch.audioLanguage !== undefined) {
    if (typeof patch.audioLanguage !== 'string' || !AUDIO_LANGUAGES[patch.audioLanguage]) throw new SettingsError(`Unknown audio language "${String(patch.audioLanguage)}"`);
    next.audioLanguage = patch.audioLanguage;
  }
  if (patch.videoSources !== undefined) {
    if (!VIDEO_SOURCES.includes(patch.videoSources)) throw new SettingsError(`Unknown video sources "${String(patch.videoSources)}"`);
    next.videoSources = patch.videoSources;
  }
  current = next;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file(), JSON.stringify(current, null, 1));
  return current;
}
