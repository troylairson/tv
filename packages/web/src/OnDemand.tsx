import type { ChannelItem } from '@retro-tv/schedule';
import type { MutableRef } from 'preact/hooks';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Action } from './keys';
import { Logo } from './logos/Logo';
import {
  continueWatching,
  fmtClock,
  fmtLeft,
  loadCatalogue,
  loadDetail,
  loadItem,
  progressOf,
  saveProgress,
  WATCHED,
  type OdChannel,
  type OdDetail,
  type OdEntry,
  type Progress,
} from './ondemandStore';
import type { Theme } from './themes';
import type { ChannelInfo, Tuner, TunerState } from './tuner';

/** Where On Demand opens: the home screen, a show, or straight into playing something. */
export type OdStart = { key?: string; itemId?: string } | null;
export type OdView = 'home' | 'show' | 'player';

interface Props {
  theme: Theme;
  channels: ChannelInfo[];
  tuner: Tuner;
  state: TunerState;
  start: OdStart;
  actionRef: MutableRef<((action: Action) => boolean) | null>;
  onView: (view: OdView) => void;
  onExit: () => void;
}

const COLS = 5;
const VISIBLE_GRID_ROWS = 2;
const SKIP_SEC = 30;
const OSD_MS = 4000;

type Menu = { id: 'continue' | 'channels' | 'shows' | 'movies'; label: string } | { id: 'channel'; label: string; channel: OdChannel };
type Tile =
  | { kind: 'entry'; entry: OdEntry }
  | { kind: 'channel'; channel: OdChannel }
  | { kind: 'progress'; progress: Progress };

/**
 * On Demand (channel 1): browse everything the channels play, by channel, show or
 * movie, and watch it from the start or where you left off. Leaving goes back to
 * live TV on the channel you came from, wherever it is now.
 */
export function OnDemand({ theme, channels, tuner, state, start, actionRef, onView, onExit }: Props) {
  const [view, setView] = useState<OdView>(start?.itemId ? 'player' : start?.key ? 'show' : 'home');
  const [data, setData] = useState<{ entries: OdEntry[]; channels: OdChannel[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Home
  const [menuIndex, setMenuIndex] = useState(0);
  const [pane, setPane] = useState<'menu' | 'grid'>('menu');
  const [tileIndex, setTileIndex] = useState(0);
  const [channelMenu, setChannelMenu] = useState<OdChannel | null>(null);
  // Show
  const [detail, setDetail] = useState<OdDetail | null>(null);
  const [season, setSeason] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  // Player
  const [playing, setPlaying] = useState<{ item: ChannelItem; key: string } | null>(null);
  const [osdUntil, setOsdUntil] = useState(0);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const cameFrom = useRef<OdView>('home');
  const [cw, setCw] = useState<Progress[]>(() => continueWatching());

  useEffect(() => onView(view), [view]);

  useEffect(() => {
    loadCatalogue()
      .then(setData)
      .catch((e: Error) => setError(`Couldn't load On Demand (${e.message})`));
  }, []);

  // Opened on a show, or to play something right away (from the guide).
  useEffect(() => {
    if (start?.itemId) {
      cameFrom.current = 'home';
      void loadItem(start.itemId)
        .then(({ key, item }) => play(item, key, 0))
        .catch((e: Error) => setError(`Couldn't find that to play (${e.message})`));
    } else if (start?.key) openShow(start.key);
  }, []);

  // A second's tick for the player clock, and progress saved every 5 s.
  useEffect(() => {
    if (view !== 'player') return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (playing && state.status === 'ondemand') record(playing.item, playing.key);
    }, 1000);
    return () => clearInterval(t);
  });

  // Next episode when one ends.
  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>('video.screen');
    if (!video || view !== 'player') return;
    const onEnded = () => {
      if (!playing) return;
      record(playing.item, playing.key, playing.item.durationSec);
      const next = nextEpisode(playing.item);
      if (next) play(next, playing.key, 0);
      else leavePlayer();
    };
    const onPause = () => setPaused(true);
    const onPlay = () => setPaused(false);
    video.addEventListener('ended', onEnded);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    return () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  });

  function record(item: ChannelItem, key: string, at = tuner.position()) {
    if (!(at > 0)) return;
    saveProgress({ itemId: item.id, key, title: item.title, show: item.show, episode: item.episode, thumb: item.thumb, pos: at, dur: item.durationSec, at: Date.now() });
  }

  function openShow(key: string) {
    setDetail(null);
    setView('show');
    setRowIndex(0);
    loadDetail(key)
      .then((d) => {
        setDetail(d);
        // Start on the season of whatever's in progress.
        const resume = resumePoint(d);
        setSeason(Math.max(0, resume ? d.seasons.findIndex((s) => s.episodes.some((e) => e.item.id === resume.item.id)) : 0));
      })
      .catch((e: Error) => setError(`Couldn't load that (${e.message})`));
  }

  function play(item: ChannelItem, key: string, from?: number) {
    const saved = progressOf(item.id);
    const offset = from ?? (saved && saved.pos / saved.dur < WATCHED ? Math.max(0, saved.pos - 5) : 0);
    setPlaying({ item, key });
    setView('player');
    setOsdUntil(Date.now() + OSD_MS);
    void tuner.playOnDemand(item, offset);
  }

  function leavePlayer() {
    if (playing && state.status === 'ondemand') record(playing.item, playing.key);
    tuner.stop();
    setCw(continueWatching());
    setPlaying(null);
    if (cameFrom.current === 'show' && detail) setView('show');
    else setView('home');
  }

  /** The episode after this one in the show's order, if we know the show. */
  function nextEpisode(item: ChannelItem): ChannelItem | undefined {
    if (!detail || !detail.seasons.length) return undefined;
    const all = detail.seasons.filter((s) => s.season !== 0).flatMap((s) => s.episodes.map((e) => e.item));
    const i = all.findIndex((x) => x.id === item.id);
    return i >= 0 ? all[i + 1] : undefined;
  }

  // ── Home ──
  const menus: Menu[] = [
    ...(cw.length ? [{ id: 'continue' as const, label: 'Continue watching' }] : []),
    { id: 'channels', label: 'Channels' },
    { id: 'shows', label: 'Shows A–Z' },
    { id: 'movies', label: 'Movies' },
    ...(channelMenu ? [{ id: 'channel' as const, label: `${channelMenu.number} ${channelMenu.name}`, channel: channelMenu }] : []),
  ];
  const menu = menus[Math.min(menuIndex, menus.length - 1)]!;
  const byKey = new Map((data?.entries ?? []).map((e) => [e.key, e]));
  const tiles: Tile[] =
    menu.id === 'continue'
      ? cw.map((progress) => ({ kind: 'progress', progress }))
      : menu.id === 'channels'
        ? (data?.channels ?? []).map((channel) => ({ kind: 'channel', channel }))
        : menu.id === 'shows'
          ? (data?.entries ?? []).filter((e) => e.kind === 'show').map((entry) => ({ kind: 'entry', entry }))
          : menu.id === 'movies'
            ? (data?.entries ?? []).filter((e) => e.kind === 'movie').map((entry) => ({ kind: 'entry', entry }))
            : menu.id === 'channel'
              ? menu.channel.keys.map((k) => byKey.get(k)).filter((e): e is OdEntry => !!e).map((entry) => ({ kind: 'entry', entry }))
              : [];

  function openTile(tile: Tile) {
    if (tile.kind === 'channel') {
      setChannelMenu(tile.channel);
      setMenuIndex(menus.filter((m) => m.id !== 'channel').length);
      setTileIndex(0);
      setPane('grid');
    } else if (tile.kind === 'entry') {
      cameFrom.current = 'home';
      if (tile.entry.kind === 'show') openShow(tile.entry.key);
      else
        void loadDetail(tile.entry.key).then((d) => {
          setDetail(d);
          cameFrom.current = 'home';
          const item = d.seasons[0]?.episodes[0]?.item;
          if (item) play(item, d.key);
        });
    } else {
      cameFrom.current = 'home';
      void loadDetail(tile.progress.key)
        .then((d) => {
          setDetail(d);
          const item = d.seasons.flatMap((s) => s.episodes).find((e) => e.item.id === tile.progress.itemId)?.item;
          if (item) play(item, d.key);
        })
        .catch((e: Error) => setError(e.message));
    }
  }

  // ── Show rows: buttons, then the season's episodes ──
  const seasonData = detail?.seasons[Math.min(season, (detail?.seasons.length ?? 1) - 1)];
  const resume = detail ? resumePoint(detail) : null;
  const firstEpisode = detail?.seasons.find((s) => s.season !== 0)?.episodes[0]?.item ?? detail?.seasons[0]?.episodes[0]?.item;
  const buttons: { label: string; act: () => void }[] = detail
    ? [
        ...(resume ? [{ label: `▶ Resume${resume.item.episode ? ` ${resume.item.episode.split(' · ')[0]}` : ''}`, act: () => play(resume.item, detail.key) }] : []),
        ...(firstEpisode
          ? [{ label: detail.kind === 'show' ? `${resume ? '' : '▶ '}Play from the start` : resume ? 'Play from the beginning' : '▶ Play', act: () => play(firstEpisode, detail.key, 0) }]
          : []),
      ]
    : [];
  const episodes = detail?.kind === 'show' ? (seasonData?.episodes ?? []) : [];
  const showRows = buttons.length + episodes.length;

  actionRef.current = (action) => {
    if (view === 'player') {
      setOsdUntil(Date.now() + OSD_MS);
      switch (action.type) {
        case 'ok': {
          const video = document.querySelector<HTMLVideoElement>('video.screen');
          if (state.status !== 'ondemand' || !video) return true;
          if (video.paused) void video.play();
          else video.pause();
          return true;
        }
        case 'left':
          tuner.seek(tuner.position() - SKIP_SEC);
          return true;
        case 'right':
          tuner.seek(tuner.position() + SKIP_SEC);
          return true;
        case 'channelDown':
          // ▼: the show's episode list.
          if (playing) {
            record(playing.item, playing.key);
            tuner.stop();
            cameFrom.current = 'home';
            openShow(playing.key);
            setPlaying(null);
          }
          return true;
        case 'back':
          leavePlayer();
          return true;
        default:
          return true;
      }
    }
    if (view === 'show') {
      switch (action.type) {
        case 'channelUp':
          setRowIndex(Math.max(0, rowIndex - 1));
          return true;
        case 'channelDown':
          setRowIndex(Math.min(showRows - 1, rowIndex + 1));
          return true;
        case 'left':
        case 'right': {
          if (!detail || detail.seasons.length < 2) return true;
          const next = Math.max(0, Math.min(detail.seasons.length - 1, season + (action.type === 'left' ? -1 : 1)));
          setSeason(next);
          setRowIndex(Math.min(rowIndex, buttons.length));
          return true;
        }
        case 'ok': {
          if (!detail) return true;
          cameFrom.current = 'show';
          if (rowIndex < buttons.length) buttons[rowIndex]!.act();
          else {
            const ep = episodes[rowIndex - buttons.length];
            if (ep) play(ep.item, detail.key);
          }
          return true;
        }
        case 'back':
          setView('home');
          setCw(continueWatching());
          return true;
        default:
          return true;
      }
    }
    // Home
    switch (action.type) {
      case 'channelUp':
        if (pane === 'menu') setMenuIndex(Math.max(0, menuIndex - 1));
        else if (tileIndex >= COLS) setTileIndex(tileIndex - COLS);
        return true;
      case 'channelDown':
        if (pane === 'menu') {
          setMenuIndex(Math.min(menus.length - 1, menuIndex + 1));
          setTileIndex(0);
        } else setTileIndex(Math.min(tiles.length - 1, tileIndex + COLS));
        return true;
      case 'left':
        if (pane === 'grid' && tileIndex % COLS === 0) setPane('menu');
        else if (pane === 'grid') setTileIndex(tileIndex - 1);
        return true;
      case 'right':
        if (pane === 'menu' && tiles.length) {
          setPane('grid');
          setTileIndex(0);
        } else if (pane === 'grid') setTileIndex(Math.min(tiles.length - 1, tileIndex + 1));
        return true;
      case 'ok':
        if (pane === 'menu' && tiles.length) {
          setPane('grid');
          setTileIndex(0);
        } else if (pane === 'grid' && tiles[tileIndex]) openTile(tiles[tileIndex]!);
        return true;
      case 'back':
        if (pane === 'grid') setPane('menu');
        else if (menu.id === 'channel') {
          setChannelMenu(null);
          setMenuIndex(menus.findIndex((m) => m.id === 'channels'));
        } else onExit();
        return true;
      case 'digit':
        // A channel number leaves On Demand for that channel (handled by the TV).
        return false;
    }
    return true;
  };

  if (view === 'player') {
    const item = playing?.item ?? state.onDemand?.item;
    const pos = tuner.position();
    const dur = item?.durationSec ?? 0;
    const showOsd = osdUntil > Date.now() || paused || state.status !== 'ondemand';
    return (
      <div class="od od-player">
        {state.status === 'standby' && state.error && (
          <div class="card panel">
            <h1 class="heading">Can't play this</h1>
            <p>{state.error}</p>
            <p class="dim">Back to On Demand</p>
          </div>
        )}
        {paused && <div class="od-paused heading">❚❚ Paused</div>}
        {showOsd && item && (
          <>
            <div class="od-badge heading">On Demand</div>
            <div class="od-osd panel">
              <div class="od-osd-row">
                <span class="od-osd-title">{item.show ?? item.title}</span>
                <span class="od-osd-time">{state.status === 'tuning' ? 'Loading…' : `${fmtClock(pos)} / ${fmtClock(dur)}`}</span>
              </div>
              {item.episode && <div class="od-osd-episode">{item.episode}</div>}
              <div class="od-progress">
                <i style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
              </div>
              <div class="od-keys">
                <span>OK play / pause</span>
                <span>◀▶ {SKIP_SEC} s</span>
                {item.show && <span>▼ episodes</span>}
                <span class="od-keys-end">Back: stop</span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (view === 'show') {
    return (
      <div class="od od-page">
        {detail?.thumb && <div class="od-backdrop" style={{ backgroundImage: `url(${detail.thumb})` }} />}
        {!detail && !error && <div class="od-loading heading">Loading…</div>}
        {error && <div class="od-loading">{error}</div>}
        {detail && (
          <div class="od-show">
            <div class="od-show-side">
              <div class="od-show-art" style={detail.thumb ? { backgroundImage: `url(${detail.thumb})` } : undefined} />
              <div class="od-show-title heading">{detail.title}</div>
              <div class="od-show-meta">
                {[detail.kind === 'show' ? `${detail.count} episodes` : detail.year, `on channel${detail.channels.length > 1 ? 's' : ''} ${detail.channels.join(', ')}`].filter(Boolean).join(' · ')}
              </div>
              {detail.description && <div class="od-show-desc">{detail.description}</div>}
              <div class="od-buttons">
                {buttons.map((b, i) => (
                  <div key={b.label} class={`od-button ${rowIndex === i ? 'focused' : ''}`}>
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
            {detail.kind === 'show' && (
              <div class="od-show-main">
                {detail.seasons.length > 1 && (
                  <div class="od-seasons">
                    {detail.seasons.map((s, i) => (
                      <span key={s.season} class={`od-season ${i === season ? 'on' : ''}`}>
                        {s.season === 0 ? 'Specials' : `Season ${s.season}`}
                      </span>
                    ))}
                  </div>
                )}
                <EpisodeList episodes={episodes} focus={rowIndex - buttons.length} />
              </div>
            )}
          </div>
        )}
        <div class="od-hint panel">{detail?.kind === 'show' ? '▲▼ choose · ◀▶ seasons · OK play · Back' : '▲▼ choose · OK play · Back'}</div>
      </div>
    );
  }

  // Home
  const firstRow = Math.max(0, Math.floor(tileIndex / COLS) - (VISIBLE_GRID_ROWS - 1));
  const shown = tiles.slice(firstRow * COLS, (firstRow + VISIBLE_GRID_ROWS + 1) * COLS);
  return (
    <div class="od od-page">
      <div class="od-head">
        <span class="od-head-number">1</span>
        <span class="od-head-title heading">On Demand</span>
        <span class="od-head-sub">Anything from your channels, any time</span>
      </div>
      <div class="od-home">
        <div class="od-menu">
          {menus.map((m, i) => (
            <div key={m.id + m.label} class={`od-menu-item ${i === menuIndex ? (pane === 'menu' ? 'focused' : 'on') : ''}`}>
              {m.label}
            </div>
          ))}
        </div>
        <div class="od-grid-wrap">
          {error && <div class="od-loading">{error}</div>}
          {!data && !error && <div class="od-loading heading">Loading…</div>}
          {data && !tiles.length && <div class="od-loading">{menu.id === 'continue' ? 'Nothing in progress.' : 'Nothing here yet.'}</div>}
          <div class="od-section heading">
            {menu.label} <span class="od-count">{tiles.length > COLS ? `${Math.min(tileIndex + 1, tiles.length)} of ${tiles.length}` : ''}</span>
          </div>
          <div class="od-grid">
            {shown.map((tile, j) => {
              const i = firstRow * COLS + j;
              return <TileView key={i} tile={tile} focused={pane === 'grid' && i === tileIndex} theme={theme} channels={channels} />;
            })}
          </div>
        </div>
      </div>
      <div class="od-hint panel">▲▼◀▶ browse · OK open · Back: live TV</div>
    </div>
  );
}

function resumePoint(d: OdDetail): { item: ChannelItem; progress: Progress } | null {
  let best: { item: ChannelItem; progress: Progress } | null = null;
  for (const s of d.seasons)
    for (const e of s.episodes) {
      const p = progressOf(e.item.id);
      if (p && p.pos / p.dur < WATCHED && p.pos > 30 && (!best || p.at > best.progress.at)) best = { item: e.item, progress: p };
    }
  return best;
}

function TileView({ tile, focused, theme, channels }: { tile: Tile; focused: boolean; theme: Theme; channels: ChannelInfo[] }) {
  if (tile.kind === 'channel') {
    const info = channels.find((c) => c.id === tile.channel.id);
    return (
      <div class={`od-tile od-tile-channel ${focused ? 'focused' : ''}`}>
        <div class="od-tile-art">{info ? <Logo channel={info} theme={theme.logo} /> : <span class="od-tile-num">{tile.channel.number}</span>}</div>
        <div class="od-tile-title">
          <span class="od-tile-chnum">{tile.channel.number}</span> {tile.channel.name}
        </div>
        <div class="od-tile-sub">{tile.channel.keys.length} shows and movies</div>
      </div>
    );
  }
  if (tile.kind === 'progress') {
    const p = tile.progress;
    return (
      <div class={`od-tile ${focused ? 'focused' : ''}`}>
        <div class="od-tile-art" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined}>
          <div class="od-tile-progress">
            <i style={{ width: `${Math.min(100, (p.pos / p.dur) * 100)}%` }} />
          </div>
        </div>
        <div class="od-tile-title">{p.show ?? p.title}</div>
        <div class="od-tile-sub">{[p.episode?.split(' · ')[0], fmtLeft(p.dur - p.pos)].filter(Boolean).join(' · ')}</div>
      </div>
    );
  }
  const e = tile.entry;
  return (
    <div class={`od-tile ${focused ? 'focused' : ''}`}>
      <div class="od-tile-art" style={e.thumb ? { backgroundImage: `url(${e.thumb})` } : undefined} />
      <div class="od-tile-title">{e.title}</div>
      <div class="od-tile-sub">{e.kind === 'show' ? `${e.count} episode${e.count === 1 ? '' : 's'}` : (e.year ?? 'Movie')}</div>
    </div>
  );
}

function EpisodeList({ episodes, focus }: { episodes: OdDetail['seasons'][number]['episodes']; focus: number }) {
  const VISIBLE = 6;
  const first = Math.max(0, Math.min(focus - 2, episodes.length - VISIBLE));
  return (
    <div class="od-episodes">
      {episodes.slice(first, first + VISIBLE).map((e, j) => {
        const i = first + j;
        const p = progressOf(e.item.id);
        const done = p && p.pos / p.dur >= WATCHED;
        const label = e.item.episode?.split(' · ') ?? [];
        return (
          <div key={e.item.id} class={`od-episode ${i === focus ? 'focused' : ''}`}>
            <span class="od-episode-num">{label.length > 1 ? label[0] : ''}</span>
            <span class="od-episode-title">{label.length > 1 ? label.slice(1).join(' · ') : (e.item.episode ?? e.item.title)}</span>
            {done ? (
              <span class="od-episode-done">✓</span>
            ) : p && p.pos > 30 ? (
              <span class="od-episode-bar">
                <i style={{ width: `${(p.pos / p.dur) * 100}%` }} />
              </span>
            ) : null}
            <span class="od-episode-len">{p && !done && p.pos > 30 ? fmtLeft(p.dur - p.pos) : `${Math.round(e.item.durationSec / 60)} min`}</span>
          </div>
        );
      })}
      {episodes[focus]?.item.description && <div class="od-episode-desc">{episodes[focus]!.item.description}</div>}
    </div>
  );
}
