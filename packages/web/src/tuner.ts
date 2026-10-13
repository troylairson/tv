import type Hls from 'hls.js';
import { nowPlaying, type Channel, type ChannelItem, type NowPlaying } from '@retro-tv/schedule';
import { now } from './clock';
import { report } from './diag';

export type PlexMode = 'transcode' | 'direct';

interface Playback {
  url: string;
  type: 'hls' | 'file';
  /** For HLS: the offset the server started the stream at. */
  baseOffsetSec: number;
  session?: string;
  media?: { container?: string; videoCodec?: string; audioCodec?: string };
}

export interface TunerState {
  status: 'idle' | 'tuning' | 'playing' | 'blocked' | 'error';
  channel?: Channel;
  airing?: NowPlaying<ChannelItem>;
  playback?: Playback;
  error?: string;
  latencies: number[];
  driftSec?: number;
  stalls: number;
}

const DRIFT_CHECK_MS = 15_000;
const MAX_DRIFT_SEC = 4;
const RETRY_MS = 10_000;

/**
 * Owns the <video> element: given a channel, works out what's on, loads it at
 * the right offset, and moves to the next item when the schedule says so.
 */
export class Tuner {
  state: TunerState = { status: 'idle', latencies: [], stalls: 0 };
  plexMode: PlexMode = 'transcode';

  private token = 0;
  private hls: Hls | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private driftTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private video: HTMLVideoElement, private onChange: (state: TunerState) => void) {
    video.addEventListener('waiting', () => this.set({ stalls: this.state.stalls + 1 }));
  }

  private set(patch: Partial<TunerState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async tune(channel: Channel): Promise<void> {
    const token = ++this.token;
    const started = performance.now();
    this.teardown();

    const airing = nowPlaying(channel, now());
    if (!airing) {
      this.set({ status: 'error', channel, airing: undefined, error: 'Nothing scheduled on this channel' });
      return;
    }
    this.set({ status: 'tuning', channel, airing, playback: undefined, error: undefined, driftSec: undefined });
    // The schedule, not the video's 'ended' event, decides when the next item starts.
    this.timers.push(setTimeout(() => void this.tune(channel), airing.endMs - now() + 50));

    try {
      const playback = await this.resolve(airing.item, (now() - airing.startMs) / 1000);
      if (token !== this.token) {
        if (playback.session) void stopPlexSession(playback.session);
        return;
      }
      this.set({ playback });
      await this.load(playback, airing, token);
      if (token !== this.token) return;

      const latencyMs = Math.round(performance.now() - started);
      this.set({ status: 'playing', latencies: [...this.state.latencies, latencyMs].slice(-20) });
      this.startDriftCheck(playback, airing, token);
      report('tune', {
        channel: channel.number,
        title: airing.item.title,
        source: airing.item.source,
        playbackType: playback.type,
        plexMode: airing.item.source === 'plex' ? this.plexMode : undefined,
        media: playback.media,
        latencyMs,
        videoSize: `${this.video.videoWidth}x${this.video.videoHeight}`,
      });
    } catch (err) {
      if (token !== this.token) return;
      const error = err instanceof Error ? err.message : String(err);
      if (error === 'blocked') {
        this.set({ status: 'blocked' });
        return;
      }
      this.set({ status: 'error', error });
      report('error', { channel: channel.number, title: airing.item.title, error, url: this.state.playback?.url });
      this.timers.push(setTimeout(() => token === this.token && void this.tune(channel), RETRY_MS));
    }
  }

  /** Re-tune the current channel (e.g. after the Plex mode changed or autoplay was unblocked). */
  retune(): void {
    if (this.state.channel) void this.tune(this.state.channel);
  }

  private async resolve(item: ChannelItem, offsetSec: number): Promise<Playback> {
    if (item.source === 'ia') {
      if (!item.url) throw new Error('Item has no URL');
      return { url: item.url, type: 'file', baseOffsetSec: 0 };
    }
    const res = await fetch(`/api/plex/play/${encodeURIComponent(item.ref)}?offset=${offsetSec.toFixed(1)}&mode=${this.plexMode}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Plex play failed (HTTP ${res.status})`);
    return { url: body.url, type: body.type, baseOffsetSec: body.type === 'hls' ? offsetSec : 0, session: body.session, media: body.media };
  }

  private async load(playback: Playback, airing: NowPlaying<ChannelItem>, token: number): Promise<void> {
    const video = this.video;
    // hls.js is big; only Plex transcodes need it, so load it on demand.
    const HlsLib = playback.type === 'hls' ? (await import('hls.js')).default : null;
    if (token !== this.token) return;
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
        video.removeEventListener('loadedmetadata', onMetadata);
      };
      const onPlaying = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(video.error?.message || `Media error ${video.error?.code ?? ''}`.trim()));
      };
      const onMetadata = () => {
        if (token !== this.token) return;
        if (playback.type === 'file') {
          const target = (now() - airing.startMs) / 1000;
          video.currentTime = Math.max(0, Math.min(target, (video.duration || Infinity) - 1));
        }
        video.play().catch((err: Error) => {
          cleanup();
          reject(new Error(err.name === 'NotAllowedError' ? 'blocked' : err.message));
        });
      };
      video.addEventListener('playing', onPlaying);
      video.addEventListener('error', onError);
      video.addEventListener('loadedmetadata', onMetadata);

      if (HlsLib && HlsLib.isSupported()) {
        const hls = new HlsLib({ maxBufferLength: 20 });
        this.hls = hls;
        hls.on(HlsLib.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          cleanup();
          reject(new Error(`HLS ${data.type}: ${data.details}`));
        });
        hls.loadSource(playback.url);
        hls.attachMedia(video);
      } else {
        video.src = playback.url;
      }
    });
  }

  private startDriftCheck(playback: Playback, airing: NowPlaying<ChannelItem>, token: number) {
    this.driftTimer = setInterval(() => {
      if (token !== this.token || this.video.seeking) return;
      const expected = (now() - airing.startMs) / 1000;
      const actual = playback.baseOffsetSec + this.video.currentTime;
      const driftSec = Math.round((actual - expected) * 10) / 10;
      this.set({ driftSec });
      // Only seekable for plain files; HLS drift is recorded so Phase 0 can tell us how Plex behaves.
      if (playback.type === 'file' && Math.abs(driftSec) > MAX_DRIFT_SEC) this.video.currentTime = expected;
    }, DRIFT_CHECK_MS);
  }

  private teardown() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = null;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const session = this.state.playback?.session;
    if (session) void stopPlexSession(session);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}

function stopPlexSession(session: string) {
  return fetch(`/api/plex/stop/${encodeURIComponent(session)}`, { method: 'POST', keepalive: true }).catch(() => undefined);
}
