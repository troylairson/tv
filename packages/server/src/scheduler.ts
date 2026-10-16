/**
 * Owns each channel's stored lineup: extends it ahead of time, adds commercial
 * breaks, regenerates the future when settings or the commercial pool change,
 * and persists it so a restart doesn't reshuffle what's on.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  extendLineup,
  extendScheduledLineup,
  itemsKey,
  pruneLineup,
  rebaseLineup,
  slotsKey,
  startLineup,
  startScheduledLineup,
  truncateLineup,
  type BreakOptions,
  type Lineup,
  type LineupAiring,
  type SlotSchedule,
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

function scheduleFor(channel: Channel): SlotSchedule<ChannelItem> | null {
  return channel.slots?.length ? { timeZone: getSettings().timeZone, slots: channel.slots } : null;
}

/** Make sure the channel's lineup covers [now, untilMs] and return it. */
export function ensureLineup(channel: Channel, untilMs = Date.now() + HORIZON_MS): Lineup<ChannelItem> | null {
  const now = Date.now();
  const schedule = scheduleFor(channel);
  const start = () => (schedule ? startScheduledLineup(channel, schedule, now) : startLineup(channel, now));
  let lineup: Lineup<ChannelItem> | null = lineups.get(channel.id) ?? null;
  const last = lineup?.airings[lineup.airings.length - 1];

  if (!lineup || !last || last.endMs < now) {
    // New channel, or the server was off past the end of the stored lineup: start afresh.
    lineup = start();
  } else if (lineup.itemsKey !== itemsKey(channel)) {
    // Regular programming changed: finish what's on, then join the new list.
    lineup = rebaseLineup(lineup, channel, now) ?? start();
  } else if ((lineup.slotsKey ?? '') !== slotsKey(schedule)) {
    // Time slots (or the house time zone) changed: keep what's on, regenerate after it.
    lineup = truncateLineup(lineup, now);
  }
  if (!lineup) return null;

  if (lineup.cursorMs < untilMs || (lineup.slotsKey ?? '') !== slotsKey(schedule)) {
    const until = Math.max(untilMs, now + HORIZON_MS) + EXTEND_SLACK_MS;
    lineup = schedule
      ? extendScheduledLineup(lineup, channel, schedule, until, breaksFor(channel))
      : { ...extendLineup(lineup, channel, until, breaksFor(channel)), slotsKey: '' };
  }
  lineup = pruneLineup(lineup, now - KEEP_PAST_MS);
  if (lineup !== lineups.get(channel.id)) {
    lineups.set(channel.id, lineup);
    scheduleSave();
  }
  return lineup;
}

/** Details a refresh can add to an item that's already scheduled. */
const LATEST_FIELDS = ['description', 'show', 'episode', 'logo'] as const;

/** Each channel's items by id, rebuilt whenever its item list is replaced. */
const itemIndex = new WeakMap<object, Map<string, ChannelItem>>();
function currentItem(channel: Channel, item: ChannelItem): ChannelItem {
  let index = itemIndex.get(channel.items);
  if (!index) {
    index = new Map();
    for (const list of [channel.items, ...(channel.slots ?? []).map((s) => s.items ?? [])]) for (const i of list) index.set(i.id, i);
    itemIndex.set(channel.items, index);
  }
  return index.get(item.id) ?? item;
}

export function airingsFor(channel: Channel, fromMs: number, toMs: number): LineupAiring<ChannelItem>[] {
  const lineup = ensureLineup(channel, toMs);
  if (!lineup) return [];
  // Stored airings carry a copy of the item from when they were scheduled; show the latest
  // details (a description added by a refresh) without reshuffling what's on.
  return lineup.airings
    .filter((a) => a.endMs > fromMs && a.startMs < toMs)
    .map((a) => {
      if (a.kind !== 'show') return a;
      const latest = currentItem(channel, a.item);
      if (latest === a.item || LATEST_FIELDS.every((k) => latest[k] === a.item[k])) return a;
      const item = { ...a.item };
      for (const k of LATEST_FIELDS) item[k] = latest[k];
      return { ...a, item };
    });
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

export interface GuideBlock {
  title: string;
  startMs: number;
  /** Includes the commercial break that follows, like a printed TV listing. */
  endMs: number;
  kind: 'show' | 'break' | 'offair';
  /** Part of a time slot. */
  slot?: boolean;
  description?: string;
  thumb?: string;
  show?: string;
  episode?: string;
  logo?: string;
}

/** The channel's programmes for a guide row: shows only, each spanning up to the next show. */
export function guideBlocks(channel: Channel, fromMs: number, toMs: number): GuideBlock[] {
  // Look back far enough to find the show that owns a break in progress at `fromMs`.
  const airings = airingsFor(channel, fromMs - 4 * 3600_000, toMs);
  const blocks: GuideBlock[] = [];
  for (const a of airings) {
    const last = blocks[blocks.length - 1];
    if (a.kind === 'show') {
      blocks.push({
        title: a.item.title,
        startMs: a.startMs,
        endMs: a.endMs,
        kind: 'show',
        slot: Boolean(a.slotId) || undefined,
        description: a.item.description,
        thumb: a.item.thumb,
        show: a.item.show,
        episode: a.item.episode,
        logo: a.item.logo,
      });
    } else if (a.kind === 'offair') {
      if (last?.kind === 'offair' && last.endMs === a.startMs) last.endMs = a.endMs;
      else blocks.push({ title: 'Off the Air', startMs: a.startMs, endMs: a.endMs, kind: 'offair' });
    } else if (last && last.kind !== 'offair' && last.endMs === a.startMs) {
      // Commercials and "coming up" cards belong to the show before them.
      last.endMs = a.endMs;
    } else {
      blocks.push({ title: 'Commercial Break', startMs: a.startMs, endMs: a.endMs, kind: 'break' });
    }
  }
  return blocks.filter((b) => b.endMs > fromMs && b.startMs < toMs);
}
