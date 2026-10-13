import { randomUUID } from 'node:crypto';
import { seededShuffle } from '@retro-tv/schedule';
import { config } from './config';
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

async function plexJson<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${config.plexUrl}${pathAndQuery}`, { headers: plexHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Plex ${pathAndQuery} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface PlexPart { key: string; container?: string }
interface PlexMedia { container?: string; videoCodec?: string; audioCodec?: string; Part?: PlexPart[] }
interface PlexMetadata {
  ratingKey: string;
  type: string;
  title: string;
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
  if (m.type === 'episode' && m.grandparentTitle) {
    const s = String(m.parentIndex ?? 0).padStart(2, '0');
    const e = String(m.index ?? 0).padStart(2, '0');
    return `${m.grandparentTitle} S${s}E${e} – ${m.title}`;
  }
  return m.year ? `${m.title} (${m.year})` : m.title;
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
  return seededShuffle(all.filter((m) => (m.duration ?? 0) > 0), 1)
    .slice(0, count)
    .map((m) => ({
      id: `plex:${m.ratingKey}`,
      source: 'plex' as const,
      ref: m.ratingKey,
      title: displayTitle(m),
      durationSec: (m.duration ?? 0) / 1000,
      thumb: m.thumb ? `/plex${m.thumb}` : undefined,
    }));
}

export interface PlexPlayback {
  url: string;
  type: 'hls' | 'file';
  /** Seconds to seek after loading. Transcodes start at the offset server-side, so 0. */
  startAt: number;
  session?: string;
  media?: { container?: string; videoCodec?: string; audioCodec?: string };
}

export async function playback(ratingKey: string, offsetSec: number, mode: 'transcode' | 'direct'): Promise<PlexPlayback> {
  const data = await plexJson<PlexContainer<{ Metadata?: PlexMetadata[] }>>(`/library/metadata/${encodeURIComponent(ratingKey)}`);
  const media = data.MediaContainer.Metadata?.[0]?.Media?.[0];
  const mediaInfo = { container: media?.container, videoCodec: media?.videoCodec, audioCodec: media?.audioCodec };

  if (mode === 'direct') {
    const part = media?.Part?.[0];
    if (!part) throw new Error(`Plex item ${ratingKey} has no media part`);
    return { url: `/plex${part.key}`, type: 'file', startAt: offsetSec, media: mediaInfo };
  }

  const session = randomUUID();
  const params = new URLSearchParams({
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
  // Newer Plex servers want a decision before start; older ones don't care. Failure here is not fatal.
  await fetch(`${config.plexUrl}/video/:/transcode/universal/decision?${params}`, {
    headers: plexHeaders(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
  return { url: `/plex/video/:/transcode/universal/start.m3u8?${params}`, type: 'hls', startAt: 0, session, media: mediaInfo };
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
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  const res = await fetch(upstream, { method: req.method, headers, signal: req.signal });
  const out = new Headers();
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers: out });
}
