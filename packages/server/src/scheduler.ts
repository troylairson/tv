/**
 * Owns each channel's stored lineup: extends it ahead of time, adds commercial
 * breaks, regenerates the future when settings or the commercial pool change,
 * and persists it so a restart doesn't reshuffle what's on.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  extendLineup,
  itemsKey,
  pruneLineup,
  rebaseLineup,
  startLineup,
  truncateLineup,
  type BreakOptions,
  type Lineup,
  type LineupAiring,
} from '@retro-tv/schedule';
import { MIN_READY_FOR_BREAKS, readyCommercials } from './commercials';
import { config } from './config';
import { getSettings } from './settings';
import type { Channel, ChannelItem } from './types';

const HORIZON_MS = 12 * 3600_000;
/** Extend in chunks rather than on every request. */
const EXTEND_SLACK_MS = 3600_000;
const KEEP_PAST_MS = 2 * 3600_000;

let lineups = new Map<string, Lineup<ChannelItem>>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const file = () => path.join(config.dataDir, 'lineups.json');

export async function loadLineups(): Promise<void> {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8')) as Lineup<ChannelItem>[];
    lineups = new Map(data.map((l) => [l.channelId, l]));
  } catch {
    lineups = new Map();
  }
}

function scheduleSave() {
  saveTimer ??= setTimeout(async () => {
    saveTimer = null;
    await fs.mkdir(config.dataDir, { recursive: true });
    const tmp = `${file()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify([...lineups.values()]));
    await fs.rename(tmp, file());
  }, 2000);
}

function breaksFor(channel: Channel): BreakOptions<ChannelItem> | null {
  if (!getSettings().commercialBreaks || channel.breaks === false) return null;
  const pool = readyCommercials();
  if (pool.length < MIN_READY_FOR_BREAKS) return null;
  return { pool, min: 1, max: 3, avoidRepeat: Math.min(30, Math.floor(pool.length / 2)) };
}

/** Make sure the channel's lineup covers [now, untilMs] and return it. */
export function ensureLineup(channel: Channel, untilMs = Date.now() + HORIZON_MS): Lineup<ChannelItem> | null {
  const now = Date.now();
  let lineup: Lineup<ChannelItem> | null = lineups.get(channel.id) ?? null;
  const last = lineup?.airings[lineup.airings.length - 1];

  if (!lineup || !last || last.endMs < now) {
    // New channel, or the server was off past the end of the stored lineup: join the plain schedule.
    lineup = startLineup(channel, now);
  } else if (lineup.itemsKey !== itemsKey(channel)) {
    lineup = rebaseLineup(lineup, channel, now);
  }
  if (!lineup) return null;

  if (lineup.cursorMs < untilMs) lineup = extendLineup(lineup, channel, Math.max(untilMs, now + HORIZON_MS) + EXTEND_SLACK_MS, breaksFor(channel));
  lineup = pruneLineup(lineup, now - KEEP_PAST_MS);
  if (lineup !== lineups.get(channel.id)) {
    lineups.set(channel.id, lineup);
    scheduleSave();
  }
  return lineup;
}

export function airingsFor(channel: Channel, fromMs: number, toMs: number): LineupAiring<ChannelItem>[] {
  const lineup = ensureLineup(channel, toMs);
  return lineup ? lineup.airings.filter((a) => a.endMs > fromMs && a.startMs < toMs) : [];
}

/** Settings or the commercial pool changed: keep what's on now, regenerate everything after it. */
export function regenerate(channels: Channel[]): void {
  const now = Date.now();
  for (const channel of channels) {
    const lineup = lineups.get(channel.id);
    if (lineup) lineups.set(channel.id, truncateLineup(lineup, now));
    ensureLineup(channel);
  }
  scheduleSave();
}

/** Commercial ids that current or upcoming airings point at (so the pool doesn't delete them). */
export function referencedCommercials(): Set<string> {
  const now = Date.now();
  const ids = new Set<string>();
  for (const lineup of lineups.values()) {
    for (const a of lineup.airings) if (a.kind === 'commercial' && a.endMs > now) ids.add(a.item.id);
  }
  return ids;
}
