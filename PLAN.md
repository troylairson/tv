# Retro TV — Project Plan

A "classic TV guide" experience over archived video: a grid of channels that are
always playing *something*, a scrolling guide, channel up/down with static between
stations, and user tools to create and reschedule channels. Sources: the Internet
Archive (and other public archives) plus a personal Plex server. Target screens:
any browser, and a Google TV.

## 0. Decisions so far

| Question | Answer | Consequence |
|---|---|---|
| Where does the backend run? | On the old laptop running **ZimaOS**, next to Plex | Ship as a Docker image + compose file installable as a ZimaOS custom app; SQLite on a mounted volume; talks to Plex over `localhost`/LAN |
| Home-only or remote too? | **Home only** for now | No auth beyond a simple admin PIN, no remote-Plex relay, plain HTTP on the LAN is fine (no mixed-content problem if the app itself is served over HTTP) |
| Device | **Chromecast with Google TV** | Weak CPU/GPU, ~2 GB RAM: keep the UI light (Preact), CRT effects in CSS only by default, prefer H.264 MP4/HLS; verify HEVC/AC3 behaviour in Phase 0 |
| Distribution | **Sideloaded APK** is fine | Option B (WebView wrapper) confirmed |
| Internet Archive | Must be able to **discover IA content in-app and build channels from it**, like spelunkr | First-class "Discover" feature (section 2b) |

## 0b. What spelunkr.tv does (from its public front-end)

Worth copying:
- **Synchronized "live" channels:** like the plan below, clients compute position
  from wall-clock time. To make sure clients agree, it **corrects for clock skew**:
  it fetches its own origin a few times, reads the HTTP `Date` header, takes the
  lowest-RTT sample and applies the offset if it's > 2 s. We should do the same
  against our server (cheap and it matters on TVs with drifting clocks).
- **Items are files, not identifiers.** It resolves an IA identifier through
  `https://archive.org/metadata/{id}`, picks the best playable file (prefers MP4/
  h.264), and plays `https://archive.org/download/{id}/{file}`. Thumbnails come from
  `https://archive.org/services/img/{id}`. Many IA items are *whole series in one
  item* ("Green Acres Complete Series"), so one identifier → many episodes.
- **In/out points per program** (`out_s`), so a reel can be trimmed of dead air or
  a 2-hour compilation can be cut into slots.
- **A curation pipeline:** found items go onto a **"bench"** as *candidates*, get
  screened (playable? actually video? taken down / "dark"? has a title &
  description?), then *approved* onto a channel. Dead items are replaced by an
  **"understudy"** from the bench with a similar duration so the schedule doesn't
  break.
- **Channel character:** themed channels with their own intro/bumper "scenes",
  "UP NEXT ON {channel}" cards, period fonts/skins. Social extras (comments,
  reactions, clips) live in Supabase — not needed for us.

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

**Decision (from commercial breaks, section 2c): materialise from Phase 1.**
Random 1–3 commercial breaks make every pass through a channel a different
length, so "position = elapsed mod total" stops working. Instead the server
*generates* airings forward and **persists them** (SQLite): it keeps each channel
≥ 48 h ahead, appending show → break → show… with the seeded PRNG making the
choices. Clients fetch `/api/channels/:id/airings?from&to` and binary-search for
"now". The schedule stays deterministic and shared by every screen, and the same
machinery later handles time slots and blocks. The pure engine stays as the
generator and for tests.

---

## 2. Sources

### Internet Archive (and similar)
- Search: `advancedsearch.php` (sortable, paged; e.g.
  `collection:classic_tv AND mediatype:movies` sorted by `downloads desc` →
  11k+ results) and `services/search/v1/scrape` (cursor paging for pulling a whole
  collection). Search-level fields (`runtime`, `year`) are often missing — real
  durations come from metadata.
- Metadata: `/metadata/{identifier}` lists every file with `format` and `length`;
  most items have an **h.264 MP4 derivative** that plays on the Chromecast.
  Check `is_dark` (taken down) and `mediatype === "movies"`.
- Playback: `https://archive.org/download/{id}/{file}` (redirects to a storage
  node, supports range requests, so seeking to an offset works).
- Great filler source: vintage commercials, PSAs, station IDs, test patterns.
- Caveats: durations are occasionally missing/wrong (probe with `ffprobe` once and
  cache), archive.org can be slow to start — mask with static/transition.

### 2b. Discover: building channels from the Internet Archive

The in-app equivalent of spelunkr's curation, usable from a phone/laptop browser
(and in a simpler form from the TV remote):

1. **Browse & search** — free text plus filters: collection (with a curated
   shortlist: `classic_tv`, `prelinger`, `classic_cartoons`, `feature_films`,
   `classic_tv_commercials`, `tvnews`, `ephemera`…), decade/year, subject,
   sort (most downloaded, newest, random). Results show the IA thumbnail, title,
   year, download count.
2. **Expand an item** — fetch its metadata and list playable *files* with
   durations, so "Get Smart (complete)" becomes 138 episodes you can pick from.
   Inline preview player.
3. **Bench** — add files or whole items to a bench (a shopping cart of
   candidates). Each gets an automatic **screening**: playable MP4 exists, not
   dark, duration known (ffprobe on the server if not), not a duplicate.
   Optional manual trim (in/out points).
4. **Make a channel** from the bench — choose a mode (loop / shuffle / time slots),
   number, name, era skin; or **add to an existing channel** or its **filler pool**.
5. **Smart channels (query-backed)** — save a search as a channel source
   ("collection:prelinger AND subject:automobiles, 1950–1965"). The server
   re-runs it nightly, screens new results, and adds them, so the channel grows
   on its own.
6. **Health checks & understudies** — a nightly job re-checks items. If one goes
   dark or unplayable, swap in an approved bench item of similar duration
   (spelunkr's "understudy"), so already-published guide slots still play.

All IA calls go through our server, which caches metadata in SQLite. That keeps
the TV fast and keeps us polite to archive.org.

### 2c. Commercial breaks between shows

Goal: when a show ends, play **1–3 vintage commercials**, then the next show, like
real broadcast TV. The first pool is the Internet Archive item
[`commercials-clean`](https://archive.org/download/commercials-clean)
("Commercials (Clean)").

**The source is one 20.9 GB ZIP** (`Commercials (Clean).zip`), not individual
videos. So archive.org hasn't made MP4 copies or recorded durations, and it can't
be used like the other IA items. Plan:

1. **Read the ZIP remotely, never download all of it.** A ZIP's table of contents
   (central directory) sits at the end of the file. The server fetches it with
   HTTP `Range` requests (a few MB at most), giving every member's name, size,
   offset and compression method. That's the commercial catalogue.
2. **Fetch commercials on demand.** For each commercial picked, range-request just
   its bytes (inflate it if the member is deflated, usually it's stored) and save
   it to `/DATA/AppData/retro-tv/cache/commercials/`.
3. **Probe and normalise.** `ffprobe` for duration and codecs. If it isn't
   H.264/AAC in MP4, transcode once with `ffmpeg` (commercials are short, so it's
   cheap even on the old laptop). Record each one as a `MediaItem` in a
   `FillerPool` of kind `commercial`.
4. **Keep a rolling pool.** A background job keeps N ready-to-air commercials
   cached (e.g. 300, or a disk budget like 3 GB) and slowly rotates new ones in,
   so breaks stay varied without storing all 21 GB. Members that fail to probe or
   play are marked dead and skipped.
5. **Serve from the laptop.** Cached commercials are served by our server
   (`/media/commercials/…`) with `Range` support, so they start instantly and can
   be joined mid-commercial when someone tunes in.

Fallback if range reads ever fail: archive.org can extract single members on the
fly (`/download/commercials-clean/Commercials%20(Clean).zip/<member>`). Use that
URL for fetching instead; caching and probing stay the same.

**Scheduling a break** (per channel, configurable):

```
breaks: { poolId, min: 1, max: 3, after: 'every-item' | 'every-n-items' | 'none',
          avoidRepeatWithin: '2h' }
```

- After each show, the generator picks k ∈ [min, max] commercials with the
  channel's seeded PRNG, never repeating one aired on that channel in the last
  `avoidRepeatWithin`.
- Breaks are real airings (`isFiller: true`): the guide shows only the shows
  (start times include the break), and the info banner says "Commercial break".
- Changing channels into a break joins it mid-commercial, like real TV.
- Later, **time-slot mode** uses the same pool to *pad* a show out to the next
  :00/:30, filling the exact gap with as many commercials as fit, then a station
  ID or test card for any leftover seconds.

Measured: 2,032 entries in a ZIP64 archive (277 KB index), almost all deflated
MP4s with a median size of 3.7 MB. Anything over 3 minutes (infomercials) is
skipped.

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
- **The Chromecast with Google TV remote has no channel or number keys**: D-pad
  ↑/↓ changes channel while watching, so the guide needs another way in (e.g. OK
  opens it). Channel/number keys still work on other remotes and keyboards.
- **D-pad navigation:** use a spatial-navigation library (e.g.
  `@noriginmedia/norigin-spatial-navigation`) rather than hand-rolled focus.
- **Overscan / safe area:** keep UI inside ~5% margins.

---

## 4. Architecture

```
┌───────────── ZimaOS laptop (Docker, same box as Plex) ────────────────────────┐
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

Why a backend at all (vs. pure client)? Plex token safety, CORS proxying,
caching archive.org metadata and probed durations, the nightly IA jobs (smart
channels, health checks), and one shared channel lineup for every screen in the
house. It runs next to Plex on the ZimaOS laptop.

**Deployment on ZimaOS:** one Docker image (server + built web app served
statically), a `docker-compose.yml` that can be imported as a ZimaOS custom app,
a volume for SQLite + cache under `/DATA/AppData/retro-tv`, port e.g. `8420`.
The app gets the Plex URL (`http://<laptop-ip>:32400`) and token via the settings
UI (Plex PIN sign-in) or env vars. The TV loads `http://<laptop-ip>:8420`; give
the laptop a DHCP reservation so the address doesn't change.

**Clock sync:** the server exposes `/api/time`. Clients sample it 3× on startup
and adjust their offset (the spelunkr technique), so every TV agrees on "now".

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
MediaItem    { id, sourceId, externalId (IA: identifier/filename; Plex: ratingKey),
               title, series?, season?, episode?, year?, durationSec,
               inSec?, outSec?, thumb?, tags[], status: 'candidate'|'approved'|'rejected'|'dead',
               lastCheckedAt }
SavedQuery   { id, sourceId, query, filters, targetChannelId?, targetFillerPoolId?, lastRunAt }
Channel      { id, number, name, logo?, mode, anchorTime, rules[], fillerPoolIds[],
               breaks?: { poolId, min, max, after, avoidRepeatWithin },
               style? (era, CRT preset) }
Rule         { kind: 'slot'|'block'|'loop'|'shuffle', days?, start?, end?,
               contentRef: {mediaIds | seriesId | collection | query}, order: 'next'|'random' }
FillerPool   { id, mediaIds[], kind: 'commercial'|'bumper'|'station_id'|'test_card',
               source?: { kind: 'ia-zip', identifier, file, cacheBudgetMb } }
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
- **Discover** (section 2b): search the Internet Archive, expand items into
  episodes, bench, screen, make channels or smart channels.
- **Channel editor** (best on phone/laptop, also usable with D-pad):
  - New channel: name, number, logo, mode.
  - Add content: from the bench, Plex libraries/collections, or a saved IA query.
  - Slot editor: a weekly grid; drag shows into slots ("reschedule").
  - Filler settings: commercial breaks on/off, era-appropriate pools.
  - Preview: the materialised next 24h before saving.
- **Settings:** sources (Plex sign-in via PIN flow at plex.tv/link), CRT effects,
  static transition, parental/hidden channels.

---

## 6. Phased roadmap

**Phase 0 — Spikes (de-risk on the real hardware)** — ✅ *done*
- Result: the server runs on ZimaOS, the app runs on the Chromecast with Google TV,
  and every Internet Archive channel plays. The TV-side failure handling
  (decision check, fallback to the other Plex mode, commercials or colour bars
  instead of endless retries) and title cleanup came out of this round.
- **Plex channel didn't play: fixed and confirmed on the real setup.** `/api/plex/test` showed every step working server→Plex
  directly but failing through our `/plex` proxy. Plex gzips its playlists;
  `fetch()` decompresses them, but the proxy forwarded Plex's original
  (compressed) `content-length`, so the TV received a truncated playlist,
  which hls.js reports as "manifestLoadError". The proxy now asks Plex for
  uncompressed bytes and never forwards a stale length (regression test in
  `plex.test.ts`). If it still fails, the checklist below applies:
  0. `http://<laptop-ip>:8420/api/plex/test`: runs metadata → direct read →
     decision → start.m3u8 → media playlist, plus the same through our proxy,
     and shows each step's status and body. First diag (Safari on a Mac, old
     build) showed the very first request (start.m3u8) failing, before any video.
  1. `docker logs retro-tv`: the server now logs Plex's refusal reason and the
     proxy's upstream HTTP status/body.
  2. `/api/diag`: each failed tune records both attempts (convert and direct)
     with their errors.
  3. `/api/plex/status`: confirms URL and token from inside the container
     (`host.docker.internal` vs the laptop's LAN IP).
  4. Whether Plex rejects the transcode parameters (try without
     `X-Plex-Client-Profile-Extra`, or with the decision's session reused) and
     whether direct play fails on codecs (MKV/HEVC/AC-3) vs the network.
- Schedule engine: loop mode + offset calculation, with unit tests.
- A minimal server in Docker on the ZimaOS laptop serving a test page + `/api/time`.
- On the Chromecast with Google TV, via a minimal WebView APK: play an archive.org
  MP4 at a computed offset; play a Plex item through the transcoder HLS at an
  offset; check autoplay, remote key events (CH+/CH−, numbers, Back), channel-change
  latency and CPU headroom for CSS CRT effects.
- Measure how many simultaneous Plex transcodes the old laptop can handle (it
  decides whether we prefer direct play).

**Phase 1 — MVP: "it's a TV" (Internet Archive only)**
- Server: SQLite, IA adapter with metadata cache, clock sync.
- **Materialised schedule:** generator writes airings ≥ 48 h ahead; airings API;
  clients look up "now" from airings instead of computing it.
- **Commercial breaks:** read the `commercials-clean` ZIP index remotely, cache and
  normalise a rolling pool of commercials, and insert 1–3 between shows (section 2c).
  *Done early (with the stored schedule and a Settings panel to turn breaks on/off).*
  The archive turned out to hold 2,032 entries (1,858 MP4, 108 MKV, 31 WebM; most
  H.264/AAC, so a remux is enough), in year folders 2000–2015 plus "Holiday
  Commercials". Year folders allow era-matched breaks later.
- A few hand-seeded channels (e.g. classic TV, Prelinger, cartoons) in loop/shuffle.
- TV UI: full-screen player, channel up/down, number entry, static transition, OSD,
  guide grid with D-pad navigation. *Guide done: OK opens it; live channel in
  the corner, programme details beside it, channels × half-hours grid with a
  now line; breaks fold into the preceding show's block; Settings lives in
  the guide header (`GET /api/guide`).*

**Channel management** — ✅ *done (pulled forward, Plex first)*
- Channels are user-owned config (`channels-config.json`) with ordered content
  sources: Plex show / collection / library / item, IA search (refreshed
  nightly) / IA item. The server resolves sources to items in the background
  (cached in `channels.json`); renames/renumbers are instant; content changes
  apply after the current airing. Episodes removed by hand are excluded.
- `/manage` page for phone/laptop: channel list, editor, Plex browser (library,
  title search, collections, whole library), Internet Archive search, resolved
  item list, 24-hour preview. TV Settings → *Manage channels* shows URL + QR code.
- New channels start at their first item when created (anchor = creation time).
- Upgrading kept the existing five IA channels (and the Plex sampler) as
  ordinary editable channels without re-resolving.
- Still to do from Phase 2 below: the bench/screening workflow, in/out points,
  health checks and understudies.

**Phase 2 — Discover (IA channel building)**
- Search/filter UI, expand items into episodes, preview, bench, screening,
  "make channel from bench", filler pools.
- Smart (query-backed) channels + nightly refresh and health checks / understudies.

**Phase 3 — Plex**
- First: fix the Plex channel not playing (see the known issue under Phase 0).
- Plex PIN sign-in, library browser, Plex adapter + proxy, transcode vs direct play.
- Plex shows/collections as channel content (e.g. "next episode" series slots).

**Time slots** — ✅ *done*
- Slots (days, start, length, content, next/random) on top of regular programming,
  in a house time zone (`settings.timeZone`, DST-safe via Intl). Fill stops when the
  next show won't fit; gaps are padded (≤ 6 min of commercials, then a "Coming up
  next" card); shuffled channels fit a shorter show first and always keep slots on
  time; in-order channels let a long show run over only when the gap is > 30 min.
  Slots fit as many episodes as they can, padded to their end. Slot-only channels
  are "off the air" between slots. Missed slots start late rather than vanish.
- Lineup airings carry slot bookkeeping so regenerating (settings/slot edits) resumes
  exactly; overlapping slots are rejected (wrapping midnight and the week).
- Manager: weekly grid + per-slot form; TV: "Coming up next" card, off-air bars,
  slot shows marked in the guide.
- Not yet: drag-to-reschedule on the grid, programming blocks (pools of shows in a
  time range), era-matched commercials.

**Channel packs (curated "Channel ideas")** — ✅ *first one done*
- No AI API at runtime: themes are researched and curated in a Claude Code session
  and committed as JSON packs (`packages/server/src/packs/`), installable in one tap
  from the manager. IA sources gained `minMinutes` (drop clips) and `sort`
  (archive order for "next episode" slots).
- Packs: Retro Pro Wrestling, Atomic Age Theater, Saturday Morning Cartoons, Classic
  Sitcoms, Film Noir After Dark, Shock Theater, Saddle Up (westerns), Game Show
  Classics. IA sources also gained `maxYear` (drop titles that only mention later
  years). Every pack was installed against the live archive and every title scanned
  for junk before shipping. More ideas: old-time news & PSAs, holiday specials,
  70s/80s cartoons, kung fu theater, Mystery Science Theater-style B-movies.
- Later, if an API key is ever available: an AI channel builder that screens
  search results the same way.

**Phase 4 — Real scheduling + editor**
- Time-slot and block modes with filler padding.
- Channel editor: weekly slot grid, drag to reschedule, 24h preview.

**Phase 5 — Google TV polish**
- WebView wrapper: launcher banner, key bridge, autoplay, keep-screen-on, launch
  straight to the last channel.
- Sideloading doc (Developer Options → Network debugging → `adb connect` → `adb install`).

**Phase 6 — Polish & stretch**
- Era skins, bumpers / "UP NEXT" cards, Prevue-style guide channel.
- M3U/XMLTV export so channels also appear in Plex Live TV / TiviMate.
- Native ExoPlayer playback in the wrapper for direct-play codecs.

---

## TODO (requested)

- [x] **Clean up the UI and add themes**: Settings → *Theme* picks one of six looks
      from the design board (`docs/mockups/design-board-*.png`): *Prevue '89* (beveled
      cable guide), *VCR* (pixel on-screen display, blue menu guide), *Streaming*
      (artwork, scrims, rounded cards, countdown), *Broadcast* (angled lower third,
      ticker), *Station ID* (cream cards, rainbow stripes, sunburst) and *Console*
      (walnut and brass, TV-listings-page guide). Shared markup in App/Guide, each
      look a block in `packages/web/src/themes.css`; names and theme-specific text in
      `themes.ts`. Artwork comes from item thumbnails (IA / Plex). Old settings map
      Retro → Prevue, Modern → Streaming, 70s → Station ID.
- [x] **Setting to mute the static sound when tuning**: Settings → *Static sound*
      (per TV). The snow still shows; it's just silent.

- [ ] **Channel bumpers ("Coming up on …")**: a 5–10 s card at the end of a
      commercial break listing what's next on this channel (the next 3–4 shows with
      start times), styled per theme with the channel name/number, like a
      90s cable "Up next" screen. The schedule already knows the upcoming airings
      (the guide uses them), so this is a new `bumper` airing kind the scheduler
      places at the end of each break (time taken from the break, so shows stay on
      schedule), rendered like the existing "Coming up next" ident card. Options:
      per-channel on/off in the manager; optional short music bed; also show a
      bumper when tuning into a channel mid-break. Later: a full-screen
      "TV Guide channel" that scrolls every channel's next few hours.
- [x] **Channel logos** (mock-up: [docs/mockups/channel-logos.png](docs/mockups/channel-logos.png)):
      12 hand-drawn transparent SVG logos (`packages/web/src/logos/hand.ts`) for the
      packs and default channels, picked automatically; a generator for every other
      channel (keywords → motif, hash → layout/palette/font, follows the TV theme);
      fonts bundled. Shown as the tune-in OSD, banner badge, guide channel column,
      "Coming up next" card and an optional corner bug (Settings → *Logo bug*). The
      manager shows them and has a picker (automatic / generated + *Try another* /
      any hand-drawn / number only). New packs get a logo by adding it to
      `AUTO_HAND_LOGO`.
- [ ] **Upload your own channel logo** in the manager (stored in the data dir).
- [x] **Paste an Internet Archive link** into the manager's IA search box
      (`archive.org/details/<id>`) to jump straight to that item and add it.

## 7. Prior art worth borrowing from
- **ErsatzTV**, **Tunarr** (successor to dizqueTV): Plex-backed custom channels
  exported as IPTV. Good reference for scheduling rules and filler; they restream
  server-side, whereas we compute-and-seek client-side for a custom retro UI.
- **Pseudo Channel**, **FieldStation42** (broadcast-TV simulators, FS42 is very
  close in spirit).

## 8. Open questions
1. What CPU is in the ZimaOS laptop, and is the Plex library mostly H.264? An old
   CPU without Quick Sync may manage only 1–2 transcodes, which pushes us toward
   direct play wherever possible.
2. Frontend: proposing **Preact + Vite + TypeScript** (light enough for the
   Chromecast). Server: **Node + Hono + SQLite**. Speak up if you prefer otherwise.
3. Any must-have IA collections or channel ideas for the first seeded lineup?
4. ~~Commercial breaks~~: after every show for now (not on the Commercials channel),
   with an on/off setting. Disk budget defaults to 3 GB (`COMMERCIAL_CACHE_MB`).
