# Retro TV — Project Plan

A "classic TV guide" experience over archived video: a grid of channels that are
always playing *something*, a scrolling guide, channel up/down with static between
stations, and user tools to create and reschedule channels. Sources: the Internet
Archive (and other public archives) plus a personal Plex server. Target screens:
any browser, and a Google TV.

---

## 1. The core trick: schedules are math, not streams

A channel never really "streams" anything. It's a **deterministic schedule**:
given a channel definition and the current wall-clock time, every client computes
the same answer to *"what is on, and how many seconds in are we?"* Then the player
loads that file and seeks to that offset.

```
position = (now - channel.anchorTime) mod totalPlaylistDuration
→ walk the playlist to find item i and offset t → play item i from t
```

This gives us, for free:

- **Always on.** Tune in at 3:17am and you land mid-episode, like real TV.
- **No server-side transcoding loop** (the expensive part of tools like ErsatzTV).
- **Shared reality.** Two TVs in the house show the same thing at the same moment.
- **A guide grid is just the same function evaluated over the next N hours.**

Randomness (shuffle, random filler) uses a **seeded PRNG** (seed = channel id +
date/block index) so it stays deterministic and every client agrees.

### Scheduling modes (per channel)

| Mode | Behaviour | Feels like |
|---|---|---|
| **Loop** | Playlist plays end-to-end forever from an anchor time | A marathon channel |
| **Shuffle** | Seeded shuffle, reshuffled each cycle/day | Cable reruns |
| **Time slots** | Rules like "weekdays 19:00 → *Cheers*, next episode"; items snap to :00/:30 and gaps are padded with **filler** (bumpers, vintage commercials, station IDs, test cards) | Real broadcast TV — the guide looks right |
| **Blocks** | Named blocks ("Saturday Morning Cartoons 07:00–12:00") built from a pool | Programming blocks |

Time-slot mode is what makes the guide *look* like a TV guide, so it's the
centrepiece. "Next episode" progress for a series is derived from the slot count
since the anchor, so it's still pure math — no server state needed.

### Materialisation

Pure math gets expensive with rich rules, so the server (or client) **materialises**
the schedule into a concrete list of `Airing { channelId, start, end, mediaId,
offsetIntoMedia }` for a rolling window (e.g. now-2h → now+48h) and caches it.
Editing a channel invalidates from "now" forward — the past stays as it aired.

---

## 2. Sources

### Internet Archive (and similar)
- Discovery: `advancedsearch.php` (collections like `classic_tv`, `prelinger`,
  `classic_tv_commercials`, `tvnews`), metadata via `/metadata/{identifier}`.
- Metadata includes per-file `length` (duration) and format; most items have an
  **h.264 MP4 derivative** that plays everywhere.
- Great filler source: vintage commercials, PSAs, station IDs, test patterns.
- Caveats: durations are occasionally missing/wrong (probe with `ffprobe` once and
  cache), archive.org can be slow to start — mask with static/transition.

### Plex
- Auth with an `X-Plex-Token` (store **server-side only**, never ship to the client).
- Browse: `/library/sections`, `/library/sections/{id}/all`, `/library/metadata/{id}/children`.
  Every item has a `duration` (ms) — perfect for scheduling.
- Playback, two routes:
  1. **Direct play** (`/library/parts/{id}/file`) — zero CPU, but only works if the
     TV/browser supports the container+codecs (MKV/HEVC/AC3/DTS often fail in Chrome).
  2. **Plex transcoder** (`/video/:/transcode/universal/start.m3u8?...&offset=SECONDS`)
     — HLS out, Plex handles codecs and **seeking to our offset server-side**.
     Default to this; allow direct play when we know the codec is safe.
- Network: the Plex server is usually on the LAN over HTTP. A web app served over
  HTTPS can't load HTTP media (mixed content), so our **backend proxies/rewrites**
  Plex URLs, or we use Plex's `*.plex.direct` HTTPS hostnames.

### Local files (later, cheap to add)
A folder on the server, probed with ffprobe, served directly or via ffmpeg HLS.

### Source abstraction
```ts
interface Source {
  id: string; kind: 'archive' | 'plex' | 'local';
  search(q): Promise<MediaItem[]>;
  getItem(id): Promise<MediaItem>;            // includes durationSec
  playbackUrl(item, offsetSec, caps): Promise<PlaybackInfo>; // url, type (mp4|hls), startAt
}
```

---

## 3. Google TV: web app vs. app — the honest trade-offs

| Option | How it reaches the TV | Pros | Cons |
|---|---|---|---|
| **A. Plain web app in a TV browser** | Sideload a browser (TV Bro, etc.); Google TV ships no browser | Zero extra work | D-pad nav is clunky, no proper "app" launcher, autoplay quirks, browser chrome |
| **B. Thin Android TV wrapper (WebView)** | Small Kotlin APK that full-screens our web app; sideload via Developer Options + `adb install` | Real launcher icon, remote keys (CH+/CH−, numbers, Back) forwarded to JS, same codebase as the web | Same codec limits as Chrome; need to build/sign an APK (one-time) |
| **C. Google Cast custom receiver** | Phone/laptop casts; the receiver is an HTML/JS page running on the Chromecast/Google TV | Web tech, phone becomes the remote/guide | $5 Cast dev registration, needs a sender device, receiver UI is meant to be passive |
| **D. Native Android TV (Compose for TV + Media3/ExoPlayer)** | Full native app | Best codec support (direct-play MKV/HEVC/AC3), smoothest | Second codebase for the UI |
| **E. IPTV export (M3U + XMLTV)** | Server exposes channels as an IPTV tuner; watch in Plex Live TV / TiviMate / Channels | Works on every TV app today | Requires a server-side ffmpeg restream per channel; no custom retro UI |

**Recommendation:** build a **TV-first web app** (10-foot UI, D-pad focus
navigation from day one), and ship it to Google TV via **Option B (WebView
wrapper)**. It's one codebase, gets proper remote-key handling, and the codec
problem is solved by routing Plex through its transcoder. Keep **D** as a later
upgrade path for the player only (native ExoPlayer surface under a web overlay) if
playback quality disappoints. **E** is a nice stretch goal because the schedule
engine already produces exactly what XMLTV needs.

### Web-on-TV gotchas to design for up front
- **Autoplay with sound** needs a user gesture → a "power on" screen (press OK to
  turn the TV on) is both required *and* on-theme. The WebView wrapper can disable
  this restriction (`setMediaPlaybackRequiresUserGesture(false)`).
- **Low-power hardware** (Chromecast w/ Google TV is weak): no heavy WebGL CRT
  shader on top of video by default; CSS scanlines + vignette are cheap, WebGL
  is an opt-in.
- **Channel-change latency:** show a static/"snow" clip + channel number OSD
  while the next source buffers; optionally pre-warm channel ±1.
- **D-pad navigation:** use a spatial-navigation library (e.g.
  `@noriginmedia/norigin-spatial-navigation`) rather than hand-rolled focus.
- **Overscan / safe area:** keep UI inside ~5% margins.

---

## 4. Architecture

```
┌────────────────────────── Home server / NAS (Docker) ─────────────────────────┐
│  API server (TypeScript, Fastify or Hono)                                      │
│   ├─ Source adapters: Archive.org, Plex, Local                                 │
│   ├─ Schedule engine (pure, shared package) + materialised airings cache       │
│   ├─ Channel/rules store (SQLite)                                              │
│   ├─ Playback resolver: "channel 7 @ now" → {url, offset, type}                │
│   ├─ Plex proxy (hides token, fixes mixed content)                             │
│   └─ (stretch) M3U + XMLTV + ffmpeg restream for IPTV clients                  │
└──────────────▲──────────────────────────────────────────────▲─────────────────┘
               │ REST/JSON                                     │
   ┌───────────┴───────────┐                       ┌───────────┴───────────┐
   │ Web app (browser)     │                       │ Android TV wrapper    │
   │ Vite + Preact/React   │  same bundle  ─────►  │ WebView + key bridge  │
   │ hls.js, spatial nav   │                       │ (sideloaded APK)      │
   └───────────────────────┘                       └───────────────────────┘
```

Why a backend at all (vs. pure client)? Plex token safety, mixed-content/CORS
proxying, caching archive.org metadata and probed durations, and one shared
channel lineup for every screen in the house. It runs naturally next to Plex.

### Repo layout (monorepo, pnpm workspaces)
```
packages/
  schedule/   # pure TS: channel rules → airings. Zero deps, heavily unit-tested.
  sources/    # Archive, Plex, Local adapters
  server/     # API, SQLite, Plex proxy, (later) IPTV export
  web/        # TV UI: Player, Guide, Channel editor, Settings
android-tv/   # Kotlin WebView wrapper
```

### Data model (first cut)
```
Source       { id, kind, config (plex url/token, archive collections…) }
MediaItem    { id, sourceId, externalId, title, series?, season?, episode?,
               year?, durationSec, thumb?, tags[] }
Channel      { id, number, name, logo?, mode, anchorTime, rules[], fillerPoolIds[],
               style? (era, CRT preset) }
Rule         { kind: 'slot'|'block'|'loop'|'shuffle', days?, start?, end?,
               contentRef: {mediaIds | seriesId | collection | query}, order: 'next'|'random' }
FillerPool   { id, mediaIds[], kind: 'commercial'|'bumper'|'station_id'|'test_card' }
Airing       { channelId, start, end, mediaId, offsetSec, isFiller }   // materialised
```

---

## 5. UI

- **Watching:** full-screen video, CRT styling, channel number + title OSD on tune
  (fades), CH+/CH−/number keys, Back → guide.
- **Guide:** the classic grid — channels down the left, 30-minute columns across,
  current time line, live preview in the corner. Optional "Prevue Channel" mode: a
  channel whose content *is* the auto-scrolling guide.
- **Info banner:** what's on now/next with progress bar.
- **Channel editor** (best on phone/laptop, also usable with D-pad):
  - New channel: name, number, logo, mode.
  - Add content: search Plex/Archive, pick shows/movies/collections.
  - Slot editor: a weekly grid; drag shows into slots ("reschedule").
  - Filler settings: commercial breaks on/off, era-appropriate pools.
  - Preview: the materialised next 24h before saving.
- **Settings:** sources (Plex sign-in via PIN flow at plex.tv/link), CRT effects,
  static transition, parental/hidden channels.

---

## 6. Phased roadmap

**Phase 0 — Spikes (de-risk first)**
- Schedule engine: loop mode + offset calculation with tests.
- Play an archive.org MP4 at a computed offset in the browser.
- Play a Plex item via the transcoder HLS at an offset.
- Load a test page on the actual Google TV (sideloaded browser *and* a minimal
  WebView APK) — confirm autoplay, hls.js, key events, performance.

**Phase 1 — MVP: "it's a TV"**
- Channels defined in a JSON file; Archive.org source only.
- Full-screen player, channel up/down, number entry, static transition, OSD.
- Guide grid with D-pad navigation.

**Phase 2 — Server + Plex**
- Backend with SQLite, Plex adapter + proxy, materialised airings API.
- Time-slot mode + filler padding.

**Phase 3 — Customisation**
- Channel editor (create, edit, reschedule slots, filler pools), preview.

**Phase 4 — Google TV**
- Android TV WebView wrapper: launcher banner, key bridge, autoplay, keep-screen-on.
- Docs for sideloading (Developer Options → `adb connect` → `adb install`).

**Phase 5 — Polish & stretch**
- CRT presets (CSS + optional WebGL), era bumpers, Prevue-style guide channel.
- M3U/XMLTV export so channels also appear in Plex Live TV / TiviMate.
- Native ExoPlayer playback in the wrapper for direct-play codecs.

---

## 7. Prior art worth borrowing from
- **ErsatzTV**, **Tunarr** (successor to dizqueTV): Plex-backed custom channels
  exported as IPTV. Good reference for scheduling rules and filler; they restream
  server-side, whereas we compute-and-seek client-side for a custom retro UI.
- **Pseudo Channel**, **FieldStation42** (broadcast-TV simulators, FS42 is very
  close in spirit).

## 8. Open questions
1. Where will the backend run — the same box as Plex (Docker on a NAS/PC)? Is it OK
   for the TV experience to require that box to be on?
2. Is this single-household, or should it also work away from home (remote Plex)?
3. Which device exactly — Chromecast with Google TV, Google TV Streamer, or a TV
   with Google TV built in? (Affects performance budget.)
4. Comfortable sideloading an APK, or do you want a Play Store path eventually?
5. Frontend preference: React vs. Preact/Solid (Preact is lighter for weak TV CPUs).
