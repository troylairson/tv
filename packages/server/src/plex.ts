import { randomUUID } from 'node:crypto';
import { seededShuffle } from '@retro-tv/schedule';
import { config } from './config';
import { AUDIO_LANGUAGES, getSettings } from './settings';
import { prettifyTitle, shortDescription } from './titles';
import type { ChannelItem } from './types';

function plexHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Token': config.plexToken,
    'X-Plex-Client-Identifier': config.plexClientId,
    'X-Plex-Product': 'Retro TV',
    'X-Plex-Version': '0.0.0',
    'X-Plex-Platform': 'Chrome',
    'X-Plex-Device': 'Retro TV',
  };
}

async function plexJson<T>(pathAndQuery: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${config.plexUrl}${pathAndQuery}`, { headers: plexHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Plex ${pathAndQuery} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface PlexStream {
  id: number;
  /** 1 video, 2 audio, 3 subtitles. */
  streamType: number;
  languageCode?: string;
  language?: string;
  default?: boolean;
  selected?: boolean;
}
interface PlexPart { id?: number; key: string; container?: string; Stream?: PlexStream[] }
interface PlexMedia { container?: string; videoCodec?: string; audioCodec?: string; Part?: PlexPart[] }
interface PlexMetadata {
  ratingKey: string;
  type: string;
  title: string;
  titleSort?: string;
  summary?: string;
  leafCount?: number;
  childCount?: number;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  duration?: number;
  thumb?: string;
  Media?: PlexMedia[];
}
interface PlexContainer<T> { MediaContainer: T }

export async function identity() {
  const data = await plexJson<PlexContainer<{ friendlyName?: string; version?: string; machineIdentifier?: string }>>('/');
  const { friendlyName, version, machineIdentifier } = data.MediaContainer;
  return { friendlyName, version, machineIdentifier };
}

export async function sections() {
  const data = await plexJson<PlexContainer<{ Directory?: { key: string; title: string; type: string }[] }>>('/library/sections');
  return (data.MediaContainer.Directory ?? []).map(({ key, title, type }) => ({ key, title, type }));
}

function displayTitle(m: PlexMetadata): string {
  const title = prettifyTitle(m.title);
  if (m.type === 'episode' && m.grandparentTitle) {
    const s = String(m.parentIndex ?? 0).padStart(2, '0');
    const e = String(m.index ?? 0).padStart(2, '0');
    return `${prettifyTitle(m.grandparentTitle)} S${s}E${e} – ${title}`;
  }
  // Unmatched files often carry the year in the name already: "Movie (1999)".
  return m.year && !title.includes(String(m.year)) ? `${title} (${m.year})` : title;
}

function toItem(m: PlexMetadata): ChannelItem {
  return {
    id: `plex:${m.ratingKey}`,
    source: 'plex',
    ref: m.ratingKey,
    title: displayTitle(m),
    durationSec: (m.duration ?? 0) / 1000,
    thumb: m.thumb ? `/plex${m.thumb}` : undefined,
    description: shortDescription(m.summary, m.title),
  };
}

const playable = (m: PlexMetadata) => (m.type === 'movie' || m.type === 'episode') && (m.duration ?? 0) > 0;

/** Episodes in broadcast order: show, then season, then episode. */
function byEpisodeOrder(a: PlexMetadata, b: PlexMetadata): number {
  return (
    (a.grandparentTitle ?? '').localeCompare(b.grandparentTitle ?? '') ||
    (a.parentIndex ?? 0) - (b.parentIndex ?? 0) ||
    (a.index ?? 0) - (b.index ?? 0)
  );
}

async function metadataList(pathAndQuery: string): Promise<PlexMetadata[]> {
  // Whole libraries can be thousands of entries on a slow server.
  const data = await plexJson<PlexContainer<{ Metadata?: PlexMetadata[] }>>(pathAndQuery, 120_000);
  return data.MediaContainer.Metadata ?? [];
}

/** All of a show's episodes, in order. */
async function showEpisodes(ratingKey: string): Promise<PlexMetadata[]> {
  return (await metadataList(`/library/metadata/${encodeURIComponent(ratingKey)}/allLeaves`)).sort(byEpisodeOrder);
}

/** Expand shows (and seasons) to their episodes; keep movies and episodes as they are. */
async function expand(list: PlexMetadata[]): Promise<PlexMetadata[]> {
  const out: PlexMetadata[] = [];
  for (const m of list) {
    if (m.type === 'show' || m.type === 'season') out.push(...(await showEpisodes(m.ratingKey)));
    else out.push(m);
  }
  return out.filter(playable);
}

// ── Browsing (for the channel manager) ───────────────────────────────────────

export interface PlexBrowseItem {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  /** Episodes in a show, items in a collection. */
  count?: number;
  durationMin?: number;
  thumb?: string;
}

function browseItem(m: PlexMetadata): PlexBrowseItem {
  return {
    ratingKey: m.ratingKey,
    type: m.type,
    title: m.title,
    year: m.year,
    count: m.leafCount ?? m.childCount,
    durationMin: m.duration ? Math.round(m.duration / 60_000) : undefined,
    thumb: m.thumb ? `/plex/photo/:/transcode?width=240&height=360&minSize=1&upscale=1&url=${encodeURIComponent(m.thumb)}` : undefined,
  };
}

/** Shows (show libraries) or movies (movie libraries), optionally filtered by title. */
export async function browseSection(sectionKey: string, query = ''): Promise<PlexBrowseItem[]> {
  const q = query.trim() ? `&title=${encodeURIComponent(query.trim())}` : '';
  const list = await metadataList(`/library/sections/${encodeURIComponent(sectionKey)}/all?sort=titleSort${q}`);
  return list.map(browseItem);
}

export async function browseCollections(sectionKey: string): Promise<PlexBrowseItem[]> {
  const list = await metadataList(`/library/sections/${encodeURIComponent(sectionKey)}/collections`);
  return list.map((m) => ({ ...browseItem(m), type: 'collection' }));
}

// ── Resolving channel sources to playable items ──────────────────────────────

/** A show: every episode in order. */
export async function resolveShow(ratingKey: string): Promise<ChannelItem[]> {
  return (await showEpisodes(ratingKey)).filter(playable).map(toItem);
}

/** A collection: its movies, and every episode of any shows in it. */
export async function resolveCollection(ratingKey: string): Promise<ChannelItem[]> {
  return (await expand(await metadataList(`/library/collections/${encodeURIComponent(ratingKey)}/children`))).map(toItem);
}

/** A whole library: all movies (by title) or all episodes (by show, season, episode). */
export async function resolveLibrary(sectionKey: string, type: 'movie' | 'show'): Promise<ChannelItem[]> {
  const list = await metadataList(`/library/sections/${encodeURIComponent(sectionKey)}/all?type=${type === 'movie' ? 1 : 4}&sort=titleSort`);
  if (type === 'show') list.sort(byEpisodeOrder);
  return list.filter(playable).map(toItem);
}

/** One movie or episode; a show or season expands to its episodes. */
export async function resolveItem(ratingKey: string): Promise<ChannelItem[]> {
  return (await expand(await metadataList(`/library/metadata/${encodeURIComponent(ratingKey)}`))).map(toItem);
}

/** A stable random sample of movies and episodes across video libraries, for the Phase 0 test channel. */
export async function sampleItems(count = 40): Promise<ChannelItem[]> {
  const all: PlexMetadata[] = [];
  for (const section of await sections()) {
    // type=1 movies, type=4 episodes
    const type = section.type === 'movie' ? 1 : section.type === 'show' ? 4 : 0;
    if (!type) continue;
    const data = await plexJson<PlexContainer<{ Metadata?: PlexMetadata[] }>>(
      `/library/sections/${section.key}/all?type=${type}&X-Plex-Container-Start=0&X-Plex-Container-Size=500`,
    );
    all.push(...(data.MediaContainer.Metadata ?? []));
  }
  return seededShuffle(all.filter(playable), 1).slice(0, count).map(toItem);
}

export interface PlexPlayback {
  url: string;
  type: 'hls' | 'file';
  /** Seconds to seek after loading. Transcodes start at the offset server-side, so 0. */
  startAt: number;
  session?: string;
  media?: { container?: string; videoCodec?: string; audioCodec?: string; audioLanguage?: string };
  /** How it's being played (auto picks one). */
  mode: 'transcode' | 'direct';
}

export type PlexPlayMode = 'auto' | 'transcode' | 'direct';

/**
 * Which audio track to play when a file has several. Returns null when there's
 * nothing to choose (one track, no match, or the "file default" setting);
 * `switched` means it isn't the track the file plays by default, so it can't be
 * played directly: browsers always play the default track.
 */
export function pickAudio(streams: PlexStream[] | undefined, language: string): { stream: PlexStream; switched: boolean } | null {
  const audio = (streams ?? []).filter((s) => s.streamType === 2);
  const wanted = AUDIO_LANGUAGES[language]?.codes ?? [];
  if (audio.length < 2 || !wanted.length) return null;
  const matches = (s: PlexStream) => [s.languageCode, s.language].some((v) => v && wanted.includes(v.toLowerCase()));
  const fileDefault = audio.find((s) => s.default) ?? audio[0]!;
  if (matches(fileDefault)) return { stream: fileDefault, switched: false };
  const stream = audio.find(matches);
  return stream ? { stream, switched: true } : null;
}

/** Tell Plex which audio track to use for this file; transcodes follow it. */
async function selectAudio(partId: number, streamId: number): Promise<void> {
  await fetch(`${config.plexUrl}/library/parts/${partId}?audioStreamID=${streamId}&allParts=1`, {
    method: 'PUT',
    headers: plexHeaders(),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/**
 * Files a browser (and the Chromecast WebView) plays natively: MP4/MOV with H.264
 * video and AAC or MP3 audio. These skip Plex's transcoder, which on a small
 * server takes seconds to start; everything else (MKV, AVI, HEVC, AC3…) converts.
 */
export function browserPlayable(media: { container?: string; videoCodec?: string; audioCodec?: string } | undefined): boolean {
  if (!media) return false;
  const container = (media.container ?? '').toLowerCase();
  const video = (media.videoCodec ?? '').toLowerCase();
  const audio = (media.audioCodec ?? '').toLowerCase();
  return ['mp4', 'm4v', 'mov'].includes(container) && video === 'h264' && ['aac', 'mp3'].includes(audio);
}

function transcodeParams(ratingKey: string, offsetSec: number, session: string): URLSearchParams {
  return new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: '0',
    partIndex: '0',
    protocol: 'hls',
    offset: String(Math.max(0, Math.floor(offsetSec))),
    fastSeek: '1',
    directPlay: '0',
    directStream: '1',
    directStreamAudio: '0',
    videoQuality: '100',
    maxVideoBitrate: '8000',
    videoResolution: '1920x1080',
    subtitles: 'none',
    session,
    'X-Plex-Session-Identifier': session,
    'X-Plex-Client-Identifier': config.plexClientId,
    'X-Plex-Product': 'Retro TV',
    'X-Plex-Platform': 'Chrome',
    // Browsers (and the Chromecast WebView) want H.264 + AAC in HLS.
    'X-Plex-Client-Profile-Extra':
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)',
  });
}

export async function playback(ratingKey: string, offsetSec: number, mode: PlexPlayMode): Promise<PlexPlayback> {
  const session = randomUUID();
  const params = transcodeParams(ratingKey, offsetSec, session);
  const metadata = plexJson<PlexContainer<{ Metadata?: PlexMetadata[] }>>(`/library/metadata/${encodeURIComponent(ratingKey)}`);
  // A forced transcode doesn't need the metadata first: ask for the decision at the same time.
  const decision = mode === 'transcode' ? checkDecision(params) : null;
  decision?.catch(() => undefined);
  const media = (await metadata).MediaContainer.Metadata?.[0]?.Media?.[0];
  const part = media?.Part?.[0];
  const audio = pickAudio(part?.Stream, getSettings().audioLanguage);
  const mediaInfo = {
    container: media?.container,
    videoCodec: media?.videoCodec,
    audioCodec: media?.audioCodec,
    audioLanguage: audio?.stream.languageCode ?? audio?.stream.language,
  };

  // A file whose default audio is the wrong language has to convert to swap tracks.
  if (mode === 'direct' || (mode === 'auto' && browserPlayable(mediaInfo) && !audio?.switched)) {
    if (!part) throw new Error(`Plex item ${ratingKey} has no media part`);
    return { url: `/plex${part.key}`, type: 'file', startAt: offsetSec, media: mediaInfo, mode: 'direct' };
  }

  if (audio && !audio.stream.selected && part?.id !== undefined) await selectAudio(part.id, audio.stream.id);
  await (decision ?? checkDecision(params));
  return { url: `/plex/video/:/transcode/universal/start.m3u8?${params}`, type: 'hls', startAt: 0, session, media: mediaInfo, mode: 'transcode' };
}

async function probeStep(url: string, init: RequestInit = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, headers: { ...plexHeaders(), ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    return { status: res.status, contentType: res.headers.get('content-type'), ms: Date.now() - started, body: body.slice(0, 600) };
  } catch (err) {
    return { error: (err as Error).message, ms: Date.now() - started };
  }
}

/**
 * Run the whole playback chain from the server and report every step's response,
 * so a "manifest load error" on the TV can be traced to the step that fails.
 */
export async function selfTest(ratingKey: string, offsetSec = 60) {
  const result: Record<string, unknown> = { plexUrl: config.plexUrl, ratingKey, offsetSec };
  try {
    const data = await plexJson<PlexContainer<{ Metadata?: PlexMetadata[] }>>(`/library/metadata/${encodeURIComponent(ratingKey)}`);
    const item = data.MediaContainer.Metadata?.[0];
    const media = item?.Media?.[0];
    result.item = { title: item?.title, duration: item?.duration, container: media?.container, videoCodec: media?.videoCodec, audioCodec: media?.audioCodec, part: media?.Part?.[0]?.key };
    const part = media?.Part?.[0]?.key;
    if (part) result.direct = await probeStep(`${config.plexUrl}${part}`, { headers: { Range: 'bytes=0-1023' } });
  } catch (err) {
    result.metadataError = (err as Error).message;
    return result;
  }

  const session = randomUUID();
  const params = transcodeParams(ratingKey, offsetSec, session);
  const base = `${config.plexUrl}/video/:/transcode/universal`;
  result.decision = await probeStep(`${base}/decision?${params}`);
  const start = await probeStep(`${base}/start.m3u8?${params}`);
  result.start = start;
  // Follow the master playlist to the media playlist, the step hls.js takes next.
  const variant = 'body' in start && start.status === 200 ? start.body?.split('\n').find((l) => l && !l.startsWith('#')) : undefined;
  if (variant) result.variant = await probeStep(new URL(variant.trim(), `${base}/start.m3u8`).toString());
  // And the same through our own proxy, the path the TV actually uses.
  result.viaProxy = await probeStep(`http://127.0.0.1:${config.port}/plex/video/:/transcode/universal/start.m3u8?${transcodeParams(ratingKey, offsetSec, `${session}-proxy`)}`);
  await stopTranscode(session);
  await stopTranscode(`${session}-proxy`);
  return result;
}

interface Decision {
  generalDecisionCode?: number;
  generalDecisionText?: string;
  transcodeDecisionCode?: number;
  transcodeDecisionText?: string;
}

/**
 * Ask Plex whether it can stream this item before handing the URL to the TV.
 * Without this, a refusal only shows up as an opaque HLS "manifest load error".
 */
async function checkDecision(params: URLSearchParams): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${config.plexUrl}/video/:/transcode/universal/decision?${params}`, {
      headers: plexHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(`Plex didn't answer the playback decision: ${(err as Error).message}`);
  }
  // Old servers don't have the endpoint; let them try.
  if (res.status === 404) return;
  const body = await res.text();
  if (!res.ok) throw new Error(`Plex refused to stream (HTTP ${res.status}) ${body.slice(0, 200)}`.trim());
  let decision: Decision = {};
  try {
    decision = (JSON.parse(body) as { MediaContainer?: Decision }).MediaContainer ?? {};
  } catch {
    return; // XML or empty: nothing to check
  }
  // Codes 1xxx are OK; 2xxx+ mean Plex can neither direct play nor transcode it.
  if ((decision.generalDecisionCode ?? 1000) >= 2000) {
    throw new Error(`Plex can't play this: ${decision.generalDecisionText ?? ''} ${decision.transcodeDecisionText ?? ''}`.trim());
  }
}

export async function stopTranscode(session: string): Promise<void> {
  await fetch(`${config.plexUrl}/video/:/transcode/universal/stop?session=${encodeURIComponent(session)}`, {
    headers: plexHeaders(),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

const PASS_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag'];

/**
 * Forward /plex/<path> to the Plex server with the token attached, so the
 * token never reaches the browser. HLS playlists use relative URLs, so their
 * segments come back through here too.
 */
export async function proxy(req: Request): Promise<Response> {
  const incoming = new URL(req.url);
  const upstream = `${config.plexUrl}${incoming.pathname.replace(/^\/plex/, '')}${incoming.search}`;
  const headers: Record<string, string> = { ...plexHeaders() };
  delete headers.Accept;
  // Ask for the bytes as stored. fetch() transparently decompresses gzip, so a
  // compressed reply's content-length would no longer match the body we pass on
  // and Node cuts the response short: that truncated Plex playlists (hls.js
  // "manifestLoadError") and would break byte ranges for direct play.
  headers['Accept-Encoding'] = 'identity';
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  const res = await fetch(upstream, { method: req.method, headers, signal: req.signal });
  if (!res.ok && res.status !== 206) {
    const body = (await res.text()).slice(0, 300);
    console.warn(`plex proxy: ${req.method} ${incoming.pathname} → HTTP ${res.status} ${body}`);
    return new Response(body, { status: res.status, headers: { 'content-type': 'text/plain' } });
  }
  const out = new Headers();
  const encoded = Boolean(res.headers.get('content-encoding'));
  for (const name of PASS_RESPONSE_HEADERS) {
    // If Plex compressed anyway, the body is already decoded: its length is unknown, so let Node chunk it.
    if (encoded && name === 'content-length') continue;
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers: out });
}
