/**
 * Health checks: find videos that no longer play (deleted from the Internet
 * Archive, removed from Plex) and keep them out of the schedule.
 *
 * Every night the shows airing in the next day are checked, plus anything
 * already marked unavailable (so items that come back are put back). A TV that
 * can't play something asks for that item to be checked straight away. Only a
 * definite answer counts ("not found", "forbidden"): network trouble, a server
 * that's down or a check where most things fail at once (the Archive or Plex
 * having a bad night) changes nothing. Two failed checks in a row and the item
 * is left out of its channel until a later check finds it again.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { mediaStatus } from './plex';
import type { ChannelItem } from './types';

const FAILS_TO_DROP = 2;
const RECHECK_AFTER_MS = 10 * 60_000;
const CONCURRENCY = 4;
const NIGHTLY_MS = 24 * 3600_000;
const FIRST_RUN_MS = 15 * 60_000;
/** A run where more than this share of items fails says more about the network than the items. */
const SYSTEMIC_SHARE = 0.5;

interface ItemHealth {
  failures: number;
  checkedAt: string;
  error?: string;
}

export interface HealthRun {
  at: string;
  checked: number;
  failed: number;
  inconclusive: number;
  /** True when the run's failures were ignored as a likely outage. */
  ignored?: boolean;
}

let items = new Map<string, ItemHealth>();
let lastRun: HealthRun | null = null;
let version = 0;
let onChange: () => void = () => undefined;
const checking = new Set<string>();
const recent = new Map<string, number>();

const file = () => path.join(config.dataDir, 'health.json');

export async function loadHealth(): Promise<void> {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8')) as { items?: Record<string, ItemHealth>; lastRun?: HealthRun };
    items = new Map(Object.entries(data.items ?? {}));
    lastRun = data.lastRun ?? null;
  } catch {
    // First run.
  }
}

async function save(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ lastRun, items: Object.fromEntries(items) }, null, 1));
  await fs.rename(tmp, file());
}

export const isUnavailable = (id: string) => (items.get(id)?.failures ?? 0) >= FAILS_TO_DROP;
export const unavailableError = (id: string) => (isUnavailable(id) ? items.get(id)?.error : undefined);
/** Bumped whenever an item becomes unavailable or comes back. */
export const healthVersion = () => version;
export const lastHealthRun = () => lastRun;
export const isChecking = (ids: Iterable<string>) => [...ids].some((id) => checking.has(id));

type Verdict = { ok: true } | { ok: false; error: string } | null;

/** One item: ok, definitely broken, or null when the check itself didn't work out. */
async function checkOne(item: ChannelItem): Promise<Verdict> {
  try {
    if (item.source === 'plex') {
      const status = await mediaStatus(item.ref);
      return status === 'ok' ? { ok: true } : { ok: false, error: status === 'missing' ? 'No longer in Plex' : 'Plex has no file for it' };
    }
    if (item.source === 'ia' && item.url) {
      const res = await fetch(item.url, {
        headers: { range: 'bytes=0-0', 'user-agent': 'retro-tv/0.0 (home use)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.ok) return { ok: true };
      if ([401, 403, 404, 410].includes(res.status)) return { ok: false, error: `Gone from the Internet Archive (HTTP ${res.status})` };
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

async function inBatches<T>(list: T[], fn: (t: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
      while (next < list.length) await fn(list[next++]!);
    }),
  );
}

/** Check a list of items and record the results. */
export async function checkItems(list: ChannelItem[], { record = true } = {}): Promise<HealthRun> {
  const unique = [...new Map(list.filter((i) => i.source === 'ia' || i.source === 'plex').map((i) => [i.id, i])).values()];
  const verdicts = new Map<string, Verdict>();
  for (const i of unique) checking.add(i.id);
  try {
    await inBatches(unique, async (item) => {
      verdicts.set(item.id, await checkOne(item));
      recent.set(item.id, Date.now());
    });
  } finally {
    for (const i of unique) checking.delete(i.id);
  }

  const failed = [...verdicts.values()].filter((v) => v && !v.ok).length;
  const inconclusive = [...verdicts.values()].filter((v) => !v).length;
  // A handful of checks can all fail for real (one dead tape); a big batch shouldn't.
  const ignored = unique.length >= 10 && failed > unique.length * SYSTEMIC_SHARE;
  const before = new Set([...items.keys()].filter(isUnavailable));
  const at = new Date().toISOString();
  for (const [id, verdict] of verdicts) {
    if (!verdict) continue;
    if (verdict.ok) items.delete(id);
    else if (!ignored) items.set(id, { failures: (items.get(id)?.failures ?? 0) + 1, checkedAt: at, error: verdict.error });
  }
  const after = new Set([...items.keys()].filter(isUnavailable));
  const changed = before.size !== after.size || [...after].some((id) => !before.has(id));

  const run: HealthRun = { at, checked: unique.length, failed, inconclusive, ...(ignored && { ignored }) };
  if (ignored) console.warn(`health check: ${failed} of ${unique.length} failed — probably an outage, ignoring`);
  if (record) lastRun = run;
  await save().catch((err: Error) => console.warn(`could not save health.json: ${err.message}`));
  if (changed) {
    version++;
    const gone = [...after].filter((id) => !before.has(id)).length;
    const back = [...before].filter((id) => !after.has(id)).length;
    console.log(`health check: ${gone ? `${gone} item(s) now unavailable` : ''}${gone && back ? ', ' : ''}${back ? `${back} back` : ''}`);
    onChange();
  }
  return run;
}

/** A TV couldn't play this: check it now (at most once every few minutes per item). */
export function checkSoon(item: ChannelItem): void {
  if (checking.has(item.id) || Date.now() - (recent.get(item.id) ?? 0) < RECHECK_AFTER_MS) return;
  void checkItems([item], { record: false });
}

export interface HealthSources {
  /** Shows airing over the next day, across all channels. */
  upcoming: () => ChannelItem[];
  /** Every item channels know about, including unavailable ones. */
  all: () => ChannelItem[];
  /** Availability changed: rebuild schedules. */
  changed: () => void;
}

export function startHealthChecks(sources: HealthSources): void {
  onChange = sources.changed;
  const nightly = async () => {
    const unavailable = sources.all().filter((i) => items.has(i.id));
    const run = await checkItems([...sources.upcoming(), ...unavailable]);
    console.log(`health check: ${run.checked} checked, ${run.failed} failed, ${run.inconclusive} couldn't be checked`);
    // Forget items no channel has any more.
    const known = new Set(sources.all().map((i) => i.id));
    for (const id of items.keys()) if (!known.has(id)) items.delete(id);
  };
  setTimeout(() => {
    void nightly();
    setInterval(() => void nightly(), NIGHTLY_MS);
  }, FIRST_RUN_MS);
}
