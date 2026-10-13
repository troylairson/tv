import fs from 'node:fs/promises';
import path from 'node:path';
import { isValidTimeZone } from '@retro-tv/schedule';
import { config } from './config';

/** House-wide settings: they change the shared schedule, so they apply to every screen. */
export interface Settings {
  commercialBreaks: boolean;
  /** IANA zone that time slots are written in ("20:00" means 8 pm here). */
  timeZone: string;
}

const envZone = process.env.TZ && isValidTimeZone(process.env.TZ) ? process.env.TZ : 'UTC';
const DEFAULTS: Settings = { commercialBreaks: true, timeZone: envZone };
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
  current = next;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file(), JSON.stringify(current, null, 1));
  return current;
}
