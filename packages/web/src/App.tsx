import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clockStats, now, syncClock } from './clock';
import qrcode from 'qrcode-generator';
import { capabilities, report } from './diag';
import { Guide } from './Guide';
import { lastKeyInfo, toAction, type Action, type KeyInfo } from './keys';
import { Settings, type SettingRow } from './Settings';
import { initStaticAudio, setStaticMuted, Static } from './Static';
import { Tuner, type ChannelInfo, type PlexMode, type TunerState } from './tuner';
import { Logo, logoSvg } from './logos/Logo';
import { findTheme, THEMES } from './themes';

const params = new URLSearchParams(location.search);
/** Set by the Android TV wrapper, which allows autoplay without a gesture. */
const IN_TV_APP = params.get('tv') === '1';
const LAST_CHANNEL_KEY = 'retro-tv:last-channel';
const CRT_KEY = 'retro-tv:crt';
const PLEX_MODE_KEY = 'retro-tv:plex-mode';
const THEME_KEY = 'retro-tv:theme';
const STATIC_SOUND_KEY = 'retro-tv:static-sound';
const LOGO_BUG_KEY = 'retro-tv:logo-bug';

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

interface HouseSettings {
  commercialBreaks: boolean;
}
interface PoolStatus {
  ready: number;
  target: number;
  state: string;
  message?: string;
}

export function App() {
  const video = useRef<HTMLVideoElement>(null);
  const tuner = useRef<Tuner | null>(null);
  const [poweredOn, setPoweredOn] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [building, setBuilding] = useState(false);
  const [index, setIndex] = useState(0);
  const [tunerState, setTunerState] = useState<TunerState>({ status: 'idle', upcoming: [], latencies: [], stalls: 0 });
  const [osdUntil, setOsdUntil] = useState(0);
  const [infoUntil, setInfoUntil] = useState(0);
  const [showDiag, setShowDiag] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showManage, setShowManage] = useState(false);
  /** The channel being watched, by id, so it survives the list changing under us. */
  const currentId = useRef<string | null>(null);
  const guideAction = useRef<((action: Action) => boolean) | null>(null);
  const [settingsFocus, setSettingsFocus] = useState(0);
  const [house, setHouse] = useState<HouseSettings | null>(null);
  const [pool, setPool] = useState<PoolStatus | null>(null);
  const [crt, setCrt] = useState(store(CRT_KEY) !== 'off');
  const [plexMode, setPlexMode] = useState<PlexMode>(store(PLEX_MODE_KEY) === 'direct' ? 'direct' : 'transcode');
  const [themeId, setThemeId] = useState(() => findTheme(store(THEME_KEY)).id);
  const theme = findTheme(themeId);
  const [staticSound, setStaticSound] = useState(store(STATIC_SOUND_KEY) !== 'off');
  const [logoBug, setLogoBug] = useState(store(LOGO_BUG_KEY) !== 'off');
  useEffect(() => setStaticMuted(!staticSound), [staticSound]);
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
    tuner.current.plexMode = plexMode;
    report('caps', { ...caps });
  }, []);

  useEffect(() => {
    if (IN_TV_APP) void powerOn();
  }, []);

  async function loadChannels() {
    const res = await fetch('/api/channels');
    const body = (await res.json()) as { channels: ChannelInfo[]; building: boolean };
    setBuilding(body.building);
    const list = body.channels.slice().sort((a, b) => a.number - b.number);
    setChannels(list);
    // Channels can be added, renumbered or deleted from the manager while we watch.
    if (currentId.current) {
      const i = list.findIndex((c) => c.id === currentId.current);
      if (i >= 0) setIndex(i);
      else if (list.length) tuneTo(list, 0);
    }
    return list;
  }

  useEffect(() => {
    if (!poweredOn) return;
    const t = setInterval(() => void loadChannels().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, [poweredOn]);

  async function loadHouseSettings() {
    try {
      const [s, p] = await Promise.all([fetch('/api/settings').then((r) => r.json()), fetch('/api/commercials').then((r) => r.json())]);
      setHouse(s as HouseSettings);
      setPool(p as PoolStatus);
    } catch {
      // Shown as "unavailable" in the panel.
    }
  }

  // Enter on the focused power button fires both its click and our key handler; only power on once.
  const powering = useRef(false);
  async function powerOn() {
    if (powering.current) return;
    powering.current = true;
    initStaticAudio();
    setPoweredOn(true);
    await syncClock();
    let list = await loadChannels().catch(() => [] as ChannelInfo[]);
    while (!list.length) {
      await new Promise((r) => setTimeout(r, 5000));
      list = await loadChannels().catch(() => [] as ChannelInfo[]);
    }
    const last = Number(store(LAST_CHANNEL_KEY));
    const start = Math.max(0, list.findIndex((c) => c.number === last));
    tuneTo(list, start);
  }

  function tuneTo(list: ChannelInfo[], i: number) {
    const channel = list[i];
    if (!channel || !tuner.current) return;
    setIndex(i);
    currentId.current = channel.id;
    store(LAST_CHANNEL_KEY, String(channel.number));
    const t = Date.now();
    setOsdUntil(t + 3000);
    setInfoUntil(t + 5000);
    void tuner.current.tune(channel);
  }

  function openGuide() {
    setInfoUntil(0);
    setShowDiag(false);
    setShowGuide(true);
    void loadChannels().catch(() => undefined);
  }

  function tuneToNumber(number: number) {
    const i = channels.findIndex((c) => c.number === number);
    setShowGuide(false);
    if (i >= 0 && i !== index) tuneTo(channels, i);
    else setInfoUntil(Date.now() + 5000);
  }

  function openSettings() {
    setInfoUntil(0);
    setSettingsFocus(0);
    setShowSettings(true);
    void loadHouseSettings();
  }

  const poolNote = !pool
    ? ''
    : pool.state === 'disabled' || pool.state === 'error'
      ? ` · ${pool.message ?? pool.state}`
      : pool.ready < pool.target
        ? ` · ${pool.ready} of ${pool.target} commercials downloaded`
        : ` · ${pool.ready} commercials ready`;

  const settingsRows: SettingRow[] = [
    {
      label: 'Commercial breaks',
      value: house ? (house.commercialBreaks ? 'On' : 'Off') : '…',
      note: `1–3 vintage commercials between shows. Applies to every TV${poolNote}`,
      activate: async () => {
        if (!house) return;
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ commercialBreaks: !house.commercialBreaks }),
        });
        setHouse((await res.json()) as HouseSettings);
      },
    },
    {
      label: 'CRT effect',
      value: crt ? 'On' : 'Off',
      note: 'Scanlines and vignette. This TV only',
      activate: () => {
        store(CRT_KEY, crt ? 'off' : 'on');
        setCrt(!crt);
      },
    },
    {
      label: 'Theme',
      value: theme.name,
      note: `The whole look of this TV: ${THEMES.map((t) => t.name).join(', ')}`,
      activate: () => {
        const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!.id;
        store(THEME_KEY, next);
        setThemeId(next);
      },
    },
    {
      label: 'Static sound',
      value: staticSound ? 'On' : 'Off',
      note: 'The hiss of static while changing channels. This TV only',
      activate: () => {
        store(STATIC_SOUND_KEY, staticSound ? 'off' : 'on');
        setStaticSound(!staticSound);
      },
    },
    {
      label: 'Logo bug',
      value: logoBug ? 'On' : 'Off',
      note: "The channel's logo in the corner while a show plays, like a network watermark. This TV only",
      activate: () => {
        store(LOGO_BUG_KEY, logoBug ? 'off' : 'on');
        setLogoBug(!logoBug);
      },
    },
    {
      label: 'Plex playback',
      value: plexMode === 'transcode' ? 'Convert' : 'Direct',
      note: 'Convert: Plex converts video for this TV. Direct: play files as-is. Falls back to the other if one fails',
      activate: () => {
        const next: PlexMode = plexMode === 'transcode' ? 'direct' : 'transcode';
        store(PLEX_MODE_KEY, next);
        setPlexMode(next);
        if (tuner.current) {
          tuner.current.plexMode = next;
          if (tunerState.airing?.item.source === 'plex') tuner.current.retune();
        }
      },
    },
    {
      label: 'Manage channels',
      value: 'Open on phone',
      note: 'Add, edit and delete channels from a phone or laptop on your home network',
      activate: () => setShowManage(true),
    },
    {
      label: 'Diagnostics',
      value: showDiag ? 'Shown' : 'Hidden',
      note: 'Playback details for troubleshooting (also: ▶ while watching)',
      activate: () => {
        setShowDiag(!showDiag);
        setShowSettings(false);
        setShowGuide(false);
      },
    },
  ];

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
    if (showManage) {
      if (action.type === 'back' || action.type === 'ok') setShowManage(false);
      return true;
    }
    if (showSettings) {
      switch (action.type) {
        case 'channelUp':
          setSettingsFocus((settingsFocus - 1 + settingsRows.length) % settingsRows.length);
          return true;
        case 'channelDown':
          setSettingsFocus((settingsFocus + 1) % settingsRows.length);
          return true;
        case 'ok':
          void settingsRows[settingsFocus]?.activate();
          return true;
        case 'back':
        case 'left':
          setShowSettings(false);
          return true;
        default:
          return true;
      }
    }
    if (showGuide) return guideAction.current?.(action) ?? true;
    switch (action.type) {
      case 'channelUp':
        tuneTo(channels, (index + 1) % channels.length);
        return true;
      case 'channelDown':
        tuneTo(channels, (index - 1 + channels.length) % channels.length);
        return true;
      case 'ok':
        openGuide();
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
  const { airing, status, filler } = tunerState;
  const t = Date.now();
  const nextShow = tunerState.upcoming.find((a) => a.kind === 'show');
  const progress = airing ? Math.min(1, Math.max(0, (now() - airing.startMs) / (airing.endMs - airing.startMs))) : 0;
  const isBreak = airing?.kind === 'commercial';
  const hasLogo = channel ? logoSvg(channel, theme.logo) !== null : false;
  // A network-style watermark while a show plays (not over the banner, guide or menus).
  const showBug = logoBug && hasLogo && channel && status === 'playing' && airing?.kind === 'show' && infoUntil <= t && !showGuide && !showSettings && !showDiag;

  return (
    <div class={`tv ${crt ? 'crt' : ''} ${showGuide ? 'guide-open' : ''} ${channel && airing && infoUntil > t && airing.kind !== 'ident' ? 'banner-open' : ''}`} data-theme={theme.id}>
      <video ref={video} class="screen" playsInline />
      {poweredOn && ((status === 'standby' && !filler) || (status === 'interstitial' && airing?.kind === 'offair')) && <div class="bars" />}
      {status === 'interstitial' && airing?.kind === 'ident' && channel && (
        <div class="ident">
          {nextShow?.item.thumb && <div class="ident-backdrop" style={{ backgroundImage: `url(${nextShow.item.thumb})` }} />}
          <div class="ident-flag">{theme.upNext}</div>
          <div class="ident-panel">
            <div class="ident-masthead">
              <span class="ident-masthead-badge">TV LOG</span>
              <span>{nextShow ? theme.upNext : 'Thanks for watching'}</span>
              <span class="ident-masthead-ch">
                Channel {channel.number} · {channel.name}
              </span>
            </div>
            <div class="ident-main">
              {nextShow?.item.thumb && <div class="ident-art" style={{ backgroundImage: `url(${nextShow.item.thumb})` }} />}
              <div class="ident-text">
                {hasLogo ? (
                  <div class="ident-logo">
                    <Logo channel={channel} theme={theme.logo} />
                  </div>
                ) : (
                  <div class="ident-channel">
                    <span class="ident-number">{channel.number}</span> {channel.name}
                  </div>
                )}
                <div class="ident-label heading">{nextShow ? theme.upNext : 'Thanks for watching'}</div>
                <div class="ident-title">{nextShow ? nextShow.item.title : channel.name}</div>
                {nextShow && (
                  <div class="ident-time">
                    at {fmtTime(nextShow.startMs)} <span class="ident-time-ch">on channel {channel.number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {nextShow && (
            <div class="ident-count">
              <b>{Math.max(1, Math.ceil((nextShow.startMs - now()) / 60_000))}</b>
              <small>min</small>
            </div>
          )}
        </div>
      )}
      {status === 'interstitial' && airing?.kind === 'offair' && (
        <div class="card panel">
          <h1 class="heading">Off the Air</h1>
          <p>
            {channel?.name} returns at {fmtTime(airing.endMs)}
            {nextShow ? ` with ${nextShow.item.title}` : ''}
          </p>
        </div>
      )}
      <Static visible={poweredOn && (status === 'tuning' || status === 'idle')} />

      {!poweredOn && (
        <button class="power" onClick={() => void powerOn()} autoFocus>
          <span class="power-icon">⏻</span>
          <span>Press OK to turn on the TV</span>
        </button>
      )}

      {poweredOn && !channels.length && (
        <div class="card panel">
          <h1 class="heading">Please Stand By</h1>
          <p>{building ? 'Building the channel lineup from the Internet Archive…' : 'Waiting for the server…'}</p>
        </div>
      )}

      {status === 'standby' && !filler && (
        <div class="card panel">
          <h1 class="heading">Please Stand By</h1>
          <p>We're experiencing technical difficulties.</p>
          {nextShow && <p class="dim">Back at {fmtTime(airing?.endMs ?? nextShow.startMs)} with {nextShow.item.title}</p>}
        </div>
      )}

      {status === 'standby' && filler && <div class="bug">We'll be right back</div>}

      {status === 'blocked' && (
        <div class="card panel">
          <h1 class="heading">Press OK</h1>
          <p>The browser needs a button press before it will play sound.</p>
        </div>
      )}

      {showBug && <Logo channel={channel} theme={theme.logo} class="logo-bug" />}

      {(digits || (channel && osdUntil > t)) && (
        <div class="osd">
          <div class="osd-number">{digits || channel?.number}</div>
          {!digits && channel && (hasLogo ? <Logo channel={channel} theme={theme.logo} class="osd-logo" /> : <div class="osd-name">{channel.name}</div>)}
        </div>
      )}

      {channel && airing && infoUntil > t && airing.kind !== 'ident' && (
        <div class={`banner panel ${hasLogo ? 'has-logo' : ''}`}>
          <div class="banner-badge">
            {hasLogo && <Logo channel={channel} theme={theme.logo} />}
            <span class="banner-badge-number">{channel.number}</span>
            <span class="banner-badge-name">{channel.name}</span>
          </div>
          <div class="banner-chnum">CH {channel.number}</div>
          <div class="banner-play">{airing.kind === 'show' ? '▶ PLAY' : isBreak ? '▶ COMMERCIAL' : '■ STOP'}</div>
          {airing.kind === 'show' && airing.item.thumb && <div class="banner-art" style={{ backgroundImage: `url(${airing.item.thumb})` }} />}
          <div class="banner-body">
            <div class="banner-row">
              <span class="banner-label">
                {isBreak ? 'Commercial break' : airing.kind === 'offair' ? 'Off the air' : 'Now playing'}
                <span class="banner-label-ch"> on {channel.name}</span>
              </span>
              <span class="banner-clock">{fmtTime(now())}</span>
            </div>
            <div class="banner-title">{airing.kind === 'show' || isBreak ? airing.item.title : (nextShow?.item.title ?? channel.name)}</div>
            <div class="banner-row banner-meta">
              <span>
                {airing.kind === 'show' ? `${fmtTime(airing.startMs)} – ${fmtTime(airing.endMs)}` : `until ${fmtTime(airing.endMs)}`}
              </span>
              {nextShow && airing.kind === 'show' && <span class="banner-next">Next: {nextShow.item.title}</span>}
              {nextShow && isBreak && <span class="banner-next">Up next: {nextShow.item.title}</span>}
            </div>
            <div class="progress">
              <div class="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          {nextShow && (
            <div class="banner-upnext">
              Up next · {fmtTime(nextShow.startMs)}
              <b>{nextShow.item.title}</b>
            </div>
          )}
          {hasLogo && (
            <div class="banner-endlogo">
              <Logo channel={channel} theme={theme.logo} />
            </div>
          )}
        </div>
      )}

      {channel && airing && infoUntil > t && airing.kind !== 'ident' && tunerState.upcoming.some((a) => a.kind === 'show') && (
        <div class="ticker">
          <b>Up next</b>
          <div class="ticker-track">
            {tunerState.upcoming
              .filter((a) => a.kind === 'show')
              .slice(0, 5)
              .map((a) => (
                <span key={a.startMs}>
                  {a.item.title} <i>{fmtTime(a.startMs)}</i>
                </span>
              ))}
          </div>
        </div>
      )}

      {showGuide && (
        <Guide
          currentNumber={channel?.number}
          channels={channels}
          theme={theme}
          actionRef={guideAction}
          onTune={tuneToNumber}
          onSettings={openSettings}
          onClose={() => setShowGuide(false)}
        />
      )}

      {showSettings && !showManage && <Settings rows={settingsRows} focus={settingsFocus} />}

      {showManage && <ManageQr />}

      {showDiag && !showSettings && (
        <Diagnostics state={tunerState} caps={caps} lastKey={lastKey} plexMode={plexMode} video={video.current} />
      )}

      {poweredOn && !showDiag && !showSettings && infoUntil > t && (
        <div class="hint">▲▼ channel · OK guide</div>
      )}
    </div>
  );
}

/** The manager's address as a QR code, for opening it on a phone. */
function ManageQr() {
  const url = `${location.origin}/manage`;
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }, [url]);
  return (
    <div class="manage-qr panel">
      <h2 class="heading">Manage channels</h2>
      <div class="manage-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Scan with your phone, or open</p>
      <p class="manage-qr-url">{url}</p>
      <p class="dim">on any device on your home network. Back to close.</p>
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
    <div class="diag panel">
      <h2 class="heading">Diagnostics</h2>
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
        <dd>{plexMode} (change in Settings)</dd>
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
