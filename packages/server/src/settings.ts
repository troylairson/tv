import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

/** House-wide settings: they change the shared schedule, so they apply to every screen. */
export interface Settings {
  commercialBreaks: boolean;
}

const DEFAULTS: Settings = { commercialBreaks: true };
const file = () => path.join(config.dataDir, 'settings.json');

let current: Settings = { ...DEFAULTS };

export async function loadSettings(): Promise<void> {
  try {
    current = { ...DEFAULTS, ...(JSON.parse(await fs.readFile(file(), 'utf8')) as Partial<Settings>) };
  } catch {
    current = { ...DEFAULTS };
  }
}

export const getSettings = (): Settings => current;

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...current };
  if (typeof patch.commercialBreaks === 'boolean') next.commercialBreaks = patch.commercialBreaks;
  current = next;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file(), JSON.stringify(current, null, 1));
  return current;
}
