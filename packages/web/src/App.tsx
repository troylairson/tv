import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { airingsBetween, type Channel } from '@retro-tv/schedule';
import { clockStats, now, syncClock } from './clock';
import { capabilities, report } from './diag';
import { lastKeyInfo, toAction, type Action, type KeyInfo } from './keys';
import { initStaticAudio, Static } from './Static';
import { Tuner, type TunerState } from './tuner';

const params = new URLSearchParams(location.search);
/** Set by the Android TV wrapper, which allows autoplay without a gesture. */
const IN_TV_APP = params.get('tv') === '1';
const LAST_CHANNEL_KEY = 'retro-tv:last-channel';
const CRT_KEY = 'retro-tv:crt';

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: settings just won't persist.
  }
  return null;
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function App() {
  const video = useRef<HTMLVideoElement>(null);
  const tuner = useRef<Tuner | null>(null);
  const [poweredOn, setPoweredOn] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [building, setBuilding] = useState(false);
  const [index, setIndex] = useState(0);
  const [tunerState, setTunerState] = useState<TunerState>({ status: 'idle', latencies: [], stalls: 0 });
  const [osdUntil, setOsdUntil] = useState(0);
  const [infoUntil, setInfoUntil] = useState(0);
  const [showDiag, setShowDiag] = useState(false);
  const [crt, setCrt] = useState(store(CRT_KEY) !== 'off');
  const [digits, setDigits] = useState('');
  const [lastKey, setLastKey] = useState<KeyInfo | null>(null);
  const [, setTick] = useState(0);
  const caps = useMemo(() => capabilities(), []);

  // Re-render every second for clocks and progress bars.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!video.current) return;
    tuner.current = new Tuner(video.current, setTunerState);
    report('caps', { ...caps });
  }, []);

  useEffect(() => {
    if (IN_TV_APP) powerOn();
  }, []);

  async function loadChannels() {
    const res = await fetch('/api/channels');
    const body = (await res.json()) as { channels: Channel[]; building: boolean };
    setBuilding(body.building);
    const list = body.channels.slice().sort((a, b) => a.number - b.number);
    setChannels(list);
    return list;
  }

  async function powerOn() {
    if (poweredOn) return;
    initStaticAudio();
    setPoweredOn(true);
    await syncClock();
    let list = await loadChannels().catch(() => [] as Channel[]);
    while (!list.length) {
      await new Promise((r) => setTimeout(r, 5000));
      list = await loadChannels().catch(() => [] as Channel[]);
    }
    const last = Number(store(LAST_CHANNEL_KEY));
    const start = Math.max(0, list.findIndex((c) => c.number === last));
    tuneTo(list, start);
  }

  function tuneTo(list: Channel[], i: number) {
    const channel = list[i];
    if (!channel || !tuner.current) return;
    setIndex(i);
    store(LAST_CHANNEL_KEY, String(channel.number));
    const t = Date.now();
    setOsdUntil(t + 3000);
    setInfoUntil(t + 5000);
    void tuner.current.tune(channel);
  }

  // Key handling reads the latest state through a ref so the listener is attached once.
  const handlerRef = useRef<(action: Action) => boolean>(() => false);
  handlerRef.current = (action) => {
    if (!poweredOn) {
      if (action.type === 'ok') void powerOn();
      return true;
    }
    if (tunerState.status === 'blocked' && action.type === 'ok') {
      tuner.current?.retune();
      return true;
    }
    switch (action.type) {
      case 'channelUp':
        tuneTo(channels, (index + 1) % channels.length);
        return true;
      case 'channelDown':
        tuneTo(channels, (index - 1 + channels.length) % channels.length);
        return true;
      case 'ok':
        if (showDiag && tuner.current) {
          tuner.current.plexMode = tuner.current.plexMode === 'transcode' ? 'direct' : 'transcode';
          if (tunerState.airing?.item.source === 'plex') tuner.current.retune();
          setTick((n) => n + 1);
        } else {
          setInfoUntil(infoUntil > Date.now() ? 0 : Date.now() + 8000);
        }
        return true;
      case 'right':
        setShowDiag(!showDiag);
        return true;
      case 'left':
        store(CRT_KEY, crt ? 'off' : 'on');
        setCrt(!crt);
        return true;
      case 'digit': {
        const next = (digits + action.digit).slice(-3);
        setDigits(next);
        setOsdUntil(Date.now() + 2000);
        return true;
      }
      case 'back':
        if (showDiag) setShowDiag(false);
        else if (infoUntil > Date.now()) setInfoUntil(0);
        else return false;
        return true;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setLastKey(lastKeyInfo(e));
      const action = toAction(e);
      if (action && handlerRef.current(action)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    // The Android wrapper calls this on the remote's Back button; false lets it exit the app.
    (window as unknown as { __retroTvBack?: () => boolean }).__retroTvBack = () => handlerRef.current({ type: 'back' });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Number entry: tune 1.5 s after the last digit.
  useEffect(() => {
    if (!digits) return;
    const t = setTimeout(() => {
      const i = channels.findIndex((c) => c.number === Number(digits));
      if (i >= 0) tuneTo(channels, i);
      setDigits('');
    }, 1500);
    return () => clearTimeout(t);
  }, [digits]);

  const channel = channels[index];
  const airing = tunerState.airing;
  const t = Date.now();
  const upNext = channel && airing ? airingsBetween(channel, airing.endMs, airing.endMs + 1)[0] : undefined;
  const progress = airing ? Math.min(1, Math.max(0, (now() - airing.startMs) / (airing.endMs - airing.startMs))) : 0;
  const showStatic = poweredOn && (tunerState.status === 'tuning' || tunerState.status === 'error' || tunerState.status === 'idle');

  return (
    <div class={`tv ${crt ? 'crt' : ''}`}>
      <video ref={video} class="screen" playsInline />
      <Static visible={showStatic} />

      {!poweredOn && (
        <button class="power" onClick={() => void powerOn()} autoFocus>
          <span class="power-icon">⏻</span>
          <span>Press OK to turn on the TV</span>
        </button>
      )}

      {poweredOn && !channels.length && (
        <div class="card">
          <h1>PLEASE STAND BY</h1>
          <p>{building ? 'Building the channel lineup from the Internet Archive…' : 'Waiting for the server…'}</p>
        </div>
      )}

      {tunerState.status === 'error' && (
        <div class="card">
          <h1>TECHNICAL DIFFICULTIES</h1>
          <p>{tunerState.error}</p>
          <p class="dim">Retrying shortly…</p>
        </div>
      )}

      {tunerState.status === 'blocked' && (
        <div class="card">
          <h1>PRESS OK</h1>
          <p>The browser needs a button press before it will play sound.</p>
        </div>
      )}

      {(digits || (channel && osdUntil > t)) && (
        <div class="osd">
          <div class="osd-number">{digits || channel?.number}</div>
          {!digits && <div class="osd-name">{channel?.name}</div>}
        </div>
      )}

      {channel && airing && infoUntil > t && (
        <div class="banner">
          <div class="banner-row">
            <span class="banner-ch">
              {channel.number} {channel.name}
            </span>
            <span class="banner-clock">{fmtTime(now())}</span>
          </div>
          <div class="banner-title">{airing.item.title}</div>
          <div class="banner-row dim">
            <span>
              {fmtTime(airing.startMs)} – {fmtTime(airing.endMs)}
            </span>
            {upNext && <span>Next: {upNext.item.title}</span>}
          </div>
          <div class="progress">
            <div class="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {showDiag && (
        <Diagnostics state={tunerState} caps={caps} lastKey={lastKey} plexMode={tuner.current?.plexMode ?? 'transcode'} video={video.current} />
      )}

      {poweredOn && !showDiag && infoUntil > t && (
        <div class="hint">▲▼ channel · OK info · ◀ CRT effect · ▶ diagnostics</div>
      )}
    </div>
  );
}

function Diagnostics({
  state,
  caps,
  lastKey,
  plexMode,
  video,
}: {
  state: TunerState;
  caps: ReturnType<typeof capabilities>;
  lastKey: KeyInfo | null;
  plexMode: string;
  video: HTMLVideoElement | null;
}) {
  const { offsetMs, rttMs } = clockStats();
  const lat = state.latencies;
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const quality = video?.getVideoPlaybackQuality?.();
  let bufferedAhead = 0;
  if (video) {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
        bufferedAhead = video.buffered.end(i) - video.currentTime;
      }
    }
  }
  return (
    <div class="diag">
      <h2>Diagnostics</h2>
      <dl>
        <dt>Status</dt>
        <dd>
          {state.status}
          {state.error ? ` – ${state.error}` : ''}
        </dd>
        <dt>Item</dt>
        <dd>
          {state.airing?.item.title ?? '–'} ({state.airing?.item.source})
        </dd>
        <dt>Playback</dt>
        <dd>
          {state.playback?.type ?? '–'} {state.playback?.media ? JSON.stringify(state.playback.media) : ''}
        </dd>
        <dt>Video</dt>
        <dd>
          {video ? `${video.videoWidth}x${video.videoHeight}, t=${video.currentTime.toFixed(1)}s, buffer ${bufferedAhead.toFixed(1)}s` : '–'}
        </dd>
        <dt>Frames</dt>
        <dd>{quality ? `${quality.droppedVideoFrames} dropped / ${quality.totalVideoFrames}` : 'n/a'}</dd>
        <dt>Tune time</dt>
        <dd>
          {lat.length ? `last ${lat[lat.length - 1]} ms, avg ${avg} ms over ${lat.length}` : '–'}
        </dd>
        <dt>Drift / stalls</dt>
        <dd>
          {state.driftSec ?? '–'} s / {state.stalls}
        </dd>
        <dt>Clock</dt>
        <dd>
          offset {offsetMs} ms, rtt {rttMs ?? '–'} ms
        </dd>
        <dt>Plex mode</dt>
        <dd>{plexMode} (OK to switch)</dd>
        <dt>Last key</dt>
        <dd>{lastKey ? `key="${lastKey.key}" code="${lastKey.code}" keyCode=${lastKey.keyCode}` : '–'}</dd>
        <dt>Screen</dt>
        <dd>{caps.screen}</dd>
        <dt>HLS</dt>
        <dd>
          native {caps.nativeHls ? 'yes' : 'no'}, MSE {caps.mse ? 'yes' : 'no'}
        </dd>
        <dt>Codecs</dt>
        <dd class="codecs">
          {Object.entries(caps.codecs).map(([name, c]) => (
            <span key={name} class={c.mse || c.video !== 'no' ? 'ok' : 'no'}>
              {name}: {c.video}
              {c.mse ? ' +MSE' : ''}
            </span>
          ))}
        </dd>
        <dt>Agent</dt>
        <dd class="small">{caps.userAgent}</dd>
      </dl>
    </div>
  );
}
