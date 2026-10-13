/**
 * The commercial pool: vintage commercials pulled one at a time out of the
 * 21 GB "commercials-clean" ZIP on the Internet Archive, checked with ffprobe,
 * remuxed (or transcoded) to streaming-friendly H.264/AAC MP4 and cached on the
 * laptop. A rolling pool keeps breaks varied without storing the whole archive.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from './config';
import { commercialTitle } from './titles';
import type { ChannelItem } from './types';
import { extractEntry, readCentralDirectory, resolveUrl, type ZipEntry } from './zip';

const run = promisify(execFile);

const SOURCE_URL = 'https://archive.org/download/commercials-clean/Commercials%20(Clean).zip';
const VIDEO = /\.(mp4|m4v|mkv|webm|mov|avi|mpe?g)$/i;
const MIN_SEC = 5;
const MAX_SEC = 180;
/** Skip anything this big before downloading: it's an infomercial, not a commercial. */
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const ROTATE_EVERY_MS = 12 * 3600_000;
const RETRY_AFTER_ERROR_MS = 5 * 60_000;

export const MIN_READY_FOR_BREAKS = 5;

export interface Commercial {
  id: string;
  name: string;
  title: string;
  year?: number;
  durationSec: number;
  file: string;
  bytes: number;
  addedAt: string;
}

interface PoolIndex {
  catalog: ZipEntry[];
  ready: Commercial[];
  rejected: string[];
}

export interface PoolStatus {
  ready: number;
  target: number;
  catalog: number;
  state: 'starting' | 'filling' | 'idle' | 'error' | 'disabled';
  message?: string;
}

const target = () => Number(process.env.COMMERCIAL_POOL_SIZE ?? 200);
const budgetBytes = () => Number(process.env.COMMERCIAL_CACHE_MB ?? 3000) * 1024 * 1024;
const dir = () => path.join(config.dataDir, 'commercials');
const mediaDir = () => path.join(dir(), 'media');
const indexFile = () => path.join(dir(), 'index.json');

let index: PoolIndex = { catalog: [], ready: [], rejected: [] };
let status: PoolStatus = { ready: 0, target: target(), catalog: 0, state: 'starting' };
let changeListener: (() => void) | null = null;
let referenced: () => Set<string> = () => new Set();

export function poolStatus(): PoolStatus {
  return { ...status, ready: index.ready.length, target: target(), catalog: index.catalog.length };
}

/** Commercials ready to air, as schedule items served by our own server. */
export function readyCommercials(): ChannelItem[] {
  return index.ready.map((c) => ({
    id: c.id,
    source: 'local' as const,
    ref: c.name,
    title: c.year ? `${c.title} (${c.year})` : c.title,
    durationSec: c.durationSec,
    url: `/media/commercials/${c.file}`,
  }));
}

export function mediaPath(file: string): string | null {
  return /^[a-f0-9]{16}\.mp4$/.test(file) ? path.join(mediaDir(), file) : null;
}

async function save() {
  await fs.mkdir(dir(), { recursive: true });
  const tmp = `${indexFile()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(index));
  await fs.rename(tmp, indexFile());
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffprobe', ['-version']);
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

interface Probe {
  durationSec: number;
  video?: string;
  audio?: string;
  container: string;
}

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {
    maxBuffer: 4 * 1024 * 1024,
  });
  const data = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: { codec_type?: string; codec_name?: string }[];
  };
  return {
    durationSec: Number(data.format?.duration ?? 0),
    video: data.streams?.find((s) => s.codec_type === 'video')?.codec_name,
    audio: data.streams?.find((s) => s.codec_type === 'audio')?.codec_name,
    container: data.format?.format_name ?? '',
  };
}

/** H.264/AAC MP4s just get the index moved to the front; anything else is transcoded (capped at 480p). */
async function normalise(input: string, output: string, p: Probe): Promise<void> {
  const copyable = p.video === 'h264' && (!p.audio || p.audio === 'aac') && p.container.includes('mp4');
  const args = copyable
    ? ['-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy']
    : ['-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale=-2:'min(480,ih)'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'];
  await run('ffmpeg', ['-y', '-v', 'error', ...args, '-movflags', '+faststart', output], { timeout: 10 * 60_000 });
}

function candidates(): ZipEntry[] {
  const have = new Set(index.ready.map((c) => c.name));
  const rejected = new Set(index.rejected);
  return index.catalog.filter(
    (e) =>
      VIDEO.test(e.name) &&
      !e.name.split('/').some((part) => part.startsWith('._') || part === '__MACOSX') &&
      e.compressedSize > 0 &&
      e.compressedSize <= MAX_DOWNLOAD_BYTES &&
      !have.has(e.name) &&
      !rejected.has(e.name),
  );
}

/** Fetch, check and cache one commercial. Returns null (and remembers why) when it doesn't qualify. */
async function addOne(url: string, entry: ZipEntry): Promise<Commercial | null> {
  const id = createHash('sha1').update(entry.name).digest('hex').slice(0, 16);
  const raw = path.join(dir(), `${id}.download`);
  const file = `${id}.mp4`;
  const out = path.join(mediaDir(), file);
  try {
    await extractEntry(url, entry, raw);
    const p = await probe(raw);
    if (!p.video || p.durationSec < MIN_SEC || p.durationSec > MAX_SEC) {
      index.rejected.push(entry.name);
      return null;
    }
    await normalise(raw, `${out}.tmp.mp4`, p);
    await fs.rename(`${out}.tmp.mp4`, out);
    const final = await probe(out);
    const { size } = await fs.stat(out);
    const { title, year } = commercialTitle(entry.name);
    return { id: `ad:${id}`, name: entry.name, title, year, durationSec: Math.round(final.durationSec * 100) / 100, file, bytes: size, addedAt: new Date().toISOString() };
  } catch (err) {
    // Network trouble (or a full disk) is worth retrying later; anything else means this file is bad.
    if (isTransient(err)) throw err;
    console.warn(`commercials: rejecting ${entry.name}: ${(err as Error).message.split('\n')[0]}`);
    index.rejected.push(entry.name);
    return null;
  } finally {
    await fs.rm(raw, { force: true });
    await fs.rm(`${out}.tmp.mp4`, { force: true });
  }
}

function isTransient(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: unknown };
  return (
    e.name === 'TypeError' || // fetch failed
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    e.code === 'ENOSPC' ||
    /HTTP (5\d\d|429)/.test(e.message ?? '')
  );
}

async function removeCommercial(c: Commercial) {
  index.ready = index.ready.filter((r) => r.id !== c.id);
  await fs.rm(path.join(mediaDir(), c.file), { force: true });
}

const usedBytes = () => index.ready.reduce((sum, c) => sum + c.bytes, 0);

/** Add up to `count` new commercials (stopping at the disk budget). */
async function fill(url: string, count: number): Promise<number> {
  let added = 0;
  let sinceNotify = 0;
  while (added < count && usedBytes() < budgetBytes()) {
    const pool = candidates();
    if (!pool.length) break;
    const entry = pool[Math.floor(Math.random() * pool.length)]!;
    const commercial = await addOne(url, entry);
    if (commercial) {
      index.ready.push(commercial);
      added++;
      sinceNotify++;
      // Tell the scheduler when breaks first become possible, then every 25 additions.
      if (index.ready.length === MIN_READY_FOR_BREAKS || sinceNotify >= 25) {
        sinceNotify = 0;
        changeListener?.();
      }
    }
    await save();
  }
  if (sinceNotify) changeListener?.();
  return added;
}

/** Swap ~10% of the pool for new commercials, never removing ones already on the schedule. */
async function rotate(url: string) {
  const swap = Math.max(1, Math.round(target() * 0.1));
  const added = await fill(url, swap);
  const inUse = referenced();
  const removable = index.ready
    .filter((c) => !inUse.has(c.id))
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .slice(0, Math.max(0, index.ready.length - target()));
  for (const c of removable) await removeCommercial(c);
  if (added || removable.length) {
    await save();
    changeListener?.();
  }
}

export interface PoolOptions {
  onChange: () => void;
  /** Commercial ids that upcoming airings still point at. */
  referenced: () => Set<string>;
}

export async function startCommercialPool(options: PoolOptions): Promise<void> {
  changeListener = options.onChange;
  referenced = options.referenced;
  try {
    index = JSON.parse(await fs.readFile(indexFile(), 'utf8')) as PoolIndex;
  } catch {
    index = { catalog: [], ready: [], rejected: [] };
  }
  // Drop entries whose files went missing (e.g. the cache folder was cleared).
  const present = await Promise.all(index.ready.map((c) => fs.access(path.join(mediaDir(), c.file)).then(() => true, () => false)));
  index.ready = index.ready.filter((_, i) => present[i]);

  if (!(await hasFfmpeg())) {
    status = { ...poolStatus(), state: 'disabled', message: 'ffmpeg/ffprobe not found, so commercials are off' };
    console.warn(status.message);
    return;
  }
  await fs.mkdir(mediaDir(), { recursive: true });
  void loop();
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      const { url, length } = await resolveUrl(SOURCE_URL);
      if (!index.catalog.length) {
        status = { ...poolStatus(), state: 'starting', message: 'Reading the commercials archive index…' };
        index.catalog = await readCentralDirectory(url, length);
        await save();
        console.log(`commercials: ${index.catalog.length} entries in the archive`);
      }
      if (index.ready.length < target()) {
        status = { ...poolStatus(), state: 'filling', message: undefined };
        const added = await fill(url, target() - index.ready.length);
        console.log(`commercials: added ${added}, ${index.ready.length} ready`);
      }
      status = { ...poolStatus(), state: 'idle', message: undefined };
      await new Promise((r) => setTimeout(r, ROTATE_EVERY_MS));
      await rotate(url);
    } catch (err) {
      status = { ...poolStatus(), state: 'error', message: (err as Error).message };
      console.warn(`commercials: ${(err as Error).message}; retrying in 5 min`);
      await new Promise((r) => setTimeout(r, RETRY_AFTER_ERROR_MS));
    }
  }
}
