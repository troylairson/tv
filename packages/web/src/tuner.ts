import type Hls from 'hls.js';
import { airingAt, type Channel, type ChannelItem, type LineupAiring } from '@retro-tv/schedule';
import { now } from './clock';
import { report } from './diag';

/** auto: play files the TV handles natively straight from Plex, convert the rest. */
export type PlexMode = 'auto' | 'transcode' | 'direct';
export type Airing = LineupAiring<ChannelItem>;
export type ChannelInfo = Omit<Channel, 'items'> & { itemCount: number };

interface Playback {
  url: string;
  type: 'hls' | 'file';
  /** For HLS: the offset the server started the stream at. */
  baseOffsetSec: number;
  session?: string;
  media?: { container?: string; videoCodec?: string; audioCodec?: string };
  /** The mode actually used (auto resolves to one of the others). */
  plexMode?: 'transcode' | 'direct';
}

export interface TunerState {
  /**
   * standby: the scheduled airing won't play, so we're filling time until the next one.
   * interstitial: a "coming up next" card or off-air screen (nothing to play).
   */
  status: 'idle' | 'tuning' | 'playing' | 'blocked' | 'standby' | 'interstitial';
  channel?: ChannelInfo;
  airing?: Airing;
  /** Airings after the current one (for "Next:" and the guide). */
  upcoming: Airing[];
  playback?: Playback;
  /** What's filling time during standby, if anything. */
  filler?: ChannelItem;
  error?: string;
  latencies: number[];
  driftSec?: number;
  stalls: number;
}

const DRIFT_CHECK_MS = 15_000;
const MAX_DRIFT_SEC = 4;
const LOAD_TIMEOUT_MS = 30_000;
const STALL_TIMEOUT_MS = 20_000;

class Blocked extends Error {}

/**
 * Owns the <video> element: given a channel, finds what's on in the stored
 * schedule, loads it at the right offset, and moves on when the schedule says
 * so. If something won't play it tries the other Plex mode, then fills the
 * slot with commercials rather than leaving the screen broken.
 */
export class Tuner {
  state: TunerState = { status: 'idle', upcoming: [], latencies: [], stalls: 0 };
  plexMode: PlexMode = 'auto';

  private token = 0;
  private hls: Hls | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private video: HTMLVideoElement, private onChange: (state: TunerState) => void) {
    video.addEventListener('waiting', () => {
      this.set({ stalls: this.state.stalls + 1 });
      if (this.state.status === 'playing' && !this.stallTimer) {
        const token = this.token;
        this.stallTimer = setTimeout(() => {
          this.stallTimer = null;
          if (token === this.token && this.state.status === 'playing') void this.standby(token, 'Playback stalled');
        }, STALL_TIMEOUT_MS);
      }
    });
    video.addEventListener('playing', () => this.clearStall());
  }

  private set(patch: Partial<TunerState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private clearStall() {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  async tune(channel: ChannelInfo): Promise<void> {
    const token = ++this.token;
    const started = performance.now();
    this.teardown();
    this.set({ status: 'tuning', channel, airing: undefined, upcoming: [], playback: undefined, filler: undefined, error: undefined, driftSec: undefined });

    let airings: Airing[];
    try {
      airings = await fetchAirings(channel.id);
    } catch (err) {
      if (token !== this.token) return;
      // No schedule (server unreachable): try again shortly.
      this.set({ status: 'standby', error: `Couldn't load the schedule: ${(err as Error).message}` });
      this.timers.push(setTimeout(() => token === this.token && void this.tune(channel), 10_000));
      return;
    }
    if (token !== this.token) return;

    const t = now();
    const airing = airingAt(airings, t);
    if (!airing) {
      this.set({ status: 'standby', error: 'Nothing scheduled right now' });
      this.timers.push(setTimeout(() => token === this.token && void this.tune(channel), 30_000));
      return;
    }
    this.set({ airing, upcoming: airings.filter((a) => a.startMs >= airing.endMs) });
    // The schedule, not the video's 'ended' event, decides when the next airing starts.
    this.timers.push(setTimeout(() => token === this.token && void this.tune(channel), airing.endMs - t + 50));
    if (airing.kind === 'ident' || airing.kind === 'offair') {
      this.set({ status: 'interstitial' });
      return;
    }

    const errors: string[] = [];
    const modes = this.attemptModes(airing.item);
    const tried = new Set<string>();
    while (modes.length) {
      const mode = modes.shift();
      let used: string | undefined = mode;
      try {
        const resolveStarted = performance.now();
        const playback = await this.resolve(airing.item, (now() - airing.startMs) / 1000, mode);
        used = playback.plexMode ?? mode;
        const resolveMs = Math.round(performance.now() - resolveStarted);
        if (token !== this.token) {
          if (playback.session) void stopPlexSession(playback.session);
          return;
        }
        this.set({ playback });
        const loadStarted = performance.now();
        await this.load(playback, airing, token);
        if (token !== this.token) return;
        const loadMs = Math.round(performance.now() - loadStarted);

        const latencyMs = Math.round(performance.now() - started);
        this.set({ status: 'playing', latencies: [...this.state.latencies, latencyMs].slice(-20) });
        this.startDriftCheck(playback, airing, token);
        report('tune', {
          channel: channel.number,
          title: airing.item.title,
          kind: airing.kind,
          source: airing.item.source,
          playbackType: playback.type,
          plexMode: playback.plexMode,
          media: playback.media,
          latencyMs,
          resolveMs,
          loadMs,
          videoSize: `${this.video.videoWidth}x${this.video.videoHeight}`,
          earlierErrors: errors.length ? errors : undefined,
        });
        return;
      } catch (err) {
        if (token !== this.token) return;
        if (err instanceof Blocked) {
          this.set({ status: 'blocked' });
          return;
        }
        errors.push(`${used ?? 'default'}: ${(err as Error).message}`);
        this.unload();
        // Plex gets a second try in whichever mode hasn't failed yet.
        if (used) tried.add(used);
        if (airing.item.source === 'plex' && !modes.length) {
          const other = (['direct', 'transcode'] as const).find((m) => !tried.has(m));
          if (other && tried.size < 2) modes.push(other);
        }
      }
    }
    await this.standby(token, errors.join(' · '));
  }

  /** Re-tune the current channel (e.g. after the Plex mode changed or autoplay was unblocked). */
  retune(): void {
    if (this.state.channel) void this.tune(this.state.channel);
  }

  /** Plex starts in the preferred mode; a failure falls back to the other one (see tune). */
  private attemptModes(item: ChannelItem): (PlexMode | undefined)[] {
    return item.source === 'plex' ? [this.plexMode] : [undefined];
  }

  /**
   * The scheduled airing won't play. Like a real station, cut to commercials
   * (or a test card) until the next airing, which the advance timer tunes as usual.
   */
  private async standby(token: number, error: string): Promise<void> {
    const { channel, airing } = this.state;
    this.unload();
    this.set({ status: 'standby', error, filler: undefined });
    report('error', { channel: channel?.number, title: airing?.item.title, source: airing?.item.source, error });

    let fillers: ChannelItem[] = [];
    try {
      const res = await fetch('/api/commercials/random?count=12');
      fillers = ((await res.json()) as { commercials: ChannelItem[] }).commercials ?? [];
    } catch {
      // No commercials: the test card stays up.
    }
    for (const filler of fillers) {
      if (token !== this.token) return;
      try {
        this.set({ filler });
        await this.load({ url: filler.url!, type: 'file', baseOffsetSec: 0 }, null, token);
        await new Promise<void>((resolve) => {
          // 'emptied' fires when a re-tune unloads the video, so this never hangs.
          const events = ['ended', 'error', 'emptied'] as const;
          const done = () => {
            for (const e of events) this.video.removeEventListener(e, done);
            resolve();
          };
          for (const e of events) this.video.addEventListener(e, done);
        });
      } catch {
        // Skip a broken filler.
      }
      this.unload();
    }
    if (token === this.token) this.set({ filler: undefined });
  }

  private async resolve(item: ChannelItem, offsetSec: number, mode: PlexMode | undefined): Promise<Playback> {
    if (item.source !== 'plex') {
      if (!item.url) throw new Error('Item has no URL');
      return { url: item.url, type: 'file', baseOffsetSec: 0 };
    }
    const res = await fetch(`/api/plex/play/${encodeURIComponent(item.ref)}?offset=${offsetSec.toFixed(1)}&mode=${mode}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Plex play failed (HTTP ${res.status})`);
    return {
      url: body.url,
      type: body.type,
      baseOffsetSec: body.type === 'hls' ? offsetSec : 0,
      session: body.session,
      media: body.media,
      plexMode: body.mode ?? (mode === 'direct' ? 'direct' : 'transcode'),
    };
  }

  /** Load and start playing. `airing` null means play from the start (filler). */
  private async load(playback: Playback, airing: Airing | null, token: number): Promise<void> {
    const video = this.video;
    // hls.js is big; only Plex transcodes need it, so load it on demand.
    const HlsLib = playback.type === 'hls' ? (await import('hls.js')).default : null;
    if (token !== this.token) return;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => fail(new Error('Timed out waiting for video')), LOAD_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
        video.removeEventListener('loadedmetadata', onMetadata);
      };
      const fail = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onPlaying = () => {
        cleanup();
        resolve();
      };
      const onError = () => fail(new Error(describeMediaError(video.error)));
      const onMetadata = () => {
        if (token !== this.token) return;
        if (playback.type === 'file' && airing) {
          const target = (now() - airing.startMs) / 1000;
          video.currentTime = Math.max(0, Math.min(target, (video.duration || Infinity) - 1));
        }
        video.play().catch((err: Error) => fail(err.name === 'NotAllowedError' ? new Blocked() : err));
      };
      video.addEventListener('playing', onPlaying);
      video.addEventListener('error', onError);
      video.addEventListener('loadedmetadata', onMetadata);

      if (HlsLib && HlsLib.isSupported()) {
        const hls = new HlsLib({
          maxBufferLength: 20,
          // An old laptop can take a while to start a transcode.
          manifestLoadingTimeOut: 30_000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 30_000,
          fragLoadingTimeOut: 60_000,
        });
        this.hls = hls;
        hls.on(HlsLib.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          const status = (data.response as { code?: number } | undefined)?.code;
          fail(new Error(`Stream ${data.details}${status ? ` (HTTP ${status})` : ''}`));
        });
        hls.loadSource(playback.url);
        hls.attachMedia(video);
      } else {
        video.src = playback.url;
      }
    });
  }

  private startDriftCheck(playback: Playback, airing: Airing, token: number) {
    this.driftTimer = setInterval(() => {
      if (token !== this.token || this.video.seeking) return;
      const expected = (now() - airing.startMs) / 1000;
      const actual = playback.baseOffsetSec + this.video.currentTime;
      const driftSec = Math.round((actual - expected) * 10) / 10;
      this.set({ driftSec });
      // Only seekable for plain files; HLS drift is recorded so we can learn how Plex behaves.
      if (playback.type === 'file' && Math.abs(driftSec) > MAX_DRIFT_SEC) this.video.currentTime = expected;
    }, DRIFT_CHECK_MS);
  }

  /** Stop the video and any Plex session, but keep timers. */
  private unload() {
    this.clearStall();
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = null;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const session = this.state.playback?.session;
    if (session) void stopPlexSession(session);
    if (this.state.playback) this.state = { ...this.state, playback: undefined };
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  private teardown() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.unload();
  }
}

async function fetchAirings(channelId: string): Promise<Airing[]> {
  const t = now();
  const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}/airings?from=${t - 60_000}&to=${t + 4 * 3600_000}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { airings: Airing[] }).airings;
}

function describeMediaError(error: MediaError | null): string {
  if (!error) return 'Media error';
  const kinds: Record<number, string> = { 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'format not supported' };
  return `Video ${kinds[error.code] ?? `error ${error.code}`}${error.message ? `: ${error.message}` : ''}`;
}

function stopPlexSession(session: string) {
  return fetch(`/api/plex/stop/${encodeURIComponent(session)}`, { method: 'POST', keepalive: true }).catch(() => undefined);
}
