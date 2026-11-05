/**
 * On Demand progress, shared by every TV in the house: start an episode in the
 * living room, finish it in the bedroom. Kept in <data dir>/ondemand-progress.json.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

export interface Progress {
  itemId: string;
  key: string;
  title: string;
  show?: string;
  episode?: string;
  thumb?: string;
  pos: number;
  dur: number;
  at: number;
}

const KEEP = 2000;
let all = new Map<string, Progress>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const file = () => path.join(config.dataDir, 'ondemand-progress.json');

export async function loadProgress(): Promise<void> {
  try {
    const list = JSON.parse(await fs.readFile(file(), 'utf8')) as Progress[];
    all = new Map(list.map((p) => [p.itemId, p]));
  } catch {
    // First run.
  }
}

export const allProgress = (): Progress[] => [...all.values()];

/** Validate and store one entry (newest wins); returns false for nonsense. */
export function recordProgress(raw: unknown): boolean {
  const p = raw as Partial<Progress>;
  if (!p || typeof p.itemId !== 'string' || typeof p.key !== 'string' || typeof p.title !== 'string') return false;
  if (typeof p.pos !== 'number' || typeof p.dur !== 'number' || !(p.dur > 0) || !(p.pos >= 0)) return false;
  const at = typeof p.at === 'number' ? Math.min(p.at, Date.now()) : Date.now();
  const old = all.get(p.itemId);
  if (old && old.at > at) return true;
  const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : undefined);
  all.set(p.itemId, {
    itemId: p.itemId.slice(0, 500),
    key: p.key.slice(0, 500),
    title: p.title.slice(0, 300),
    show: clip(p.show, 200),
    episode: clip(p.episode, 300),
    thumb: clip(p.thumb, 1000),
    pos: p.pos,
    dur: p.dur,
    at,
  });
  if (all.size > KEEP) {
    const oldest = [...all.values()].sort((a, b) => a.at - b.at).slice(0, all.size - KEEP);
    for (const o of oldest) all.delete(o.itemId);
  }
  saveTimer ??= setTimeout(() => {
    saveTimer = null;
    void fs
      .mkdir(config.dataDir, { recursive: true })
      .then(() => fs.writeFile(file(), JSON.stringify([...all.values()])))
      .catch((err: Error) => console.warn(`could not save On Demand progress: ${err.message}`));
  }, 3000);
  return true;
}
