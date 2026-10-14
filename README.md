# Retro TV

Always-on, cable-TV-style channels built from the Internet Archive and your Plex
server. Every screen in the house shows the same thing at the same moment: tune in
at 3:17 am and you land mid-episode, like real TV.

See [PLAN.md](PLAN.md) for the design and roadmap. **Status: Phase 0 and Phase 1 done; channel management (Plex and Internet
Archive sources) and time-slot scheduling are in.** (spikes on
the real hardware). See [docs/phase0.md](docs/phase0.md) for what to test.

## What's here

| Path | What |
|---|---|
| `packages/schedule` | The schedule engine: channel + clock → "what's on, how far in". Pure TS, shared by server and web. |
| `packages/server` | Node + Hono server: Internet Archive and Plex adapters, Plex proxy (keeps the token server-side), clock sync, diagnostics, serves the web app. |
| `packages/web` | The TV interface (Preact). Works in any browser and inside the Android TV app. |
| `android-tv` | A small Android TV app: a full-screen WebView pointed at your server, with remote-key handling. |

## Run it on ZimaOS (the laptop with Plex)

The server runs as one Docker container next to Plex. GitHub Actions publishes
the image to `ghcr.io/troylairson/tv:latest`.

1. **Get your Plex token**: open any item in Plex Web → ⋯ → *Get Info* → *View
   XML*; the URL ends in `X-Plex-Token=…`
   ([Plex's guide](https://support.plex.tv/articles/204059436)).
2. **Install the app**: in the ZimaOS dashboard, open the App Store → **Custom
   Install** → **Import**, then paste [`docker-compose.yml`](docker-compose.yml).
   Set `PLEX_TOKEN` to your token. Leave `PLEX_URL` as-is if Plex runs on the same
   laptop.
   *Or over SSH:* `git clone https://github.com/troylairson/tv && cd tv &&
   PLEX_TOKEN=xxxx docker compose up -d` (this builds locally if the image can't
   be pulled).
3. Open `http://<laptop-ip>:8420` in a browser. The first start takes a minute or
   two while it builds the channel lineup from the Internet Archive.
4. In your router, give the laptop a **fixed IP (DHCP reservation)** so the TV can
   always find it.

Data (channel cache, diagnostics log) lives in `/DATA/AppData/retro-tv`. To rebuild
the lineup: `curl -X POST http://<laptop-ip>:8420/api/channels/rebuild`.

If the image pull says *denied*, open the `tv` package on GitHub (your profile →
Packages) → *Package settings* → set visibility to **Public**.

## Watch in a browser

Any device on your home network: `http://<laptop-ip>:8420`. Press Enter (or click)
to turn the TV on.

| Key | Does |
|---|---|
| ↑ / ↓ (also PgUp/PgDn, CH+/CH−) | Channel up / down |
| 0–9 | Type a channel number |
| Enter / OK | Open the **TV guide** |
| → | Diagnostics panel |
| ← | CRT effect on/off |
| Esc / Back | Close panels |

**In the guide:** ▲▼ move between channels, ◀▶ move through programmes (the
grid pages through time), OK watches the highlighted channel, Back closes. The
live channel keeps playing in the corner. ▲ from the top row reaches **Settings**:
commercial breaks on/off (applies to every TV in the house); CRT effect,
**theme** (six looks: *Prevue '89*, *VCR*, *Streaming*, *Broadcast*, *Station ID*
and *Console*; see [docs/mockups](docs/mockups)), **static sound** on/off, **logo bug** (the
channel's logo in the corner while a show plays) and Plex playback (*Auto*, the
default, plays MP4/H.264 files straight from Plex and converts the rest; or force
*Convert* / *Direct*) (this TV
only); diagnostics.

## Managing channels

Open **`http://<laptop-ip>:8420/manage`** on a phone or laptop (on the TV:
guide → Settings → *Manage channels* shows the address and a QR code).

- **Channels:** add, rename, renumber, delete; play in order or shuffled;
  commercial breaks on/off per channel.
- **Content** (mix as many sources as you like, played top to bottom when
  in order):
  - **Plex:** a show (every episode, in season/episode order), a collection, a
    whole library, or single movies. Browse by library, search by title.
  - **Internet Archive:** search a collection (Classic TV, cartoons, feature
    films, Prelinger, film noir…) and add single items, or add the search
    itself, which picks up new results nightly. Or paste an `archive.org/details/…`
    link into the search box to go straight to that item.
- **Logo:** every channel has one. Channel ideas and the default channels come
  with hand-drawn logos; others get one generated from the name and content (it
  follows each TV's theme). Pick *Try another* for a different design, choose any
  hand-drawn logo, or just the number.
- **What plays:** the resolved episode list; ✕ removes an episode without
  removing its show.
- **Next 24 hours:** the schedule as the guide will show it.

- **Time slots:** "these days, at this time, for this long, play this", e.g.
  weeknights 8:00 pm, 30 min, *Cheers*, next episode. Slots sit on top of the
  regular programming: it plays around them and is padded with commercials and a
  "Coming up next" card so each slot starts on time (shuffled channels fit in a
  shorter show when they can). A long slot plays as many episodes as fit;
  "next episode" carries on from night to night. A channel with only slots is
  *off the air* between them. A weekly grid shows the whole week. Slot times are
  in the house time zone (shown in the manager, with a button to use your
  device's).

- **Channel ideas:** ready-made, hand-curated channels you add with one tap
  (content, order and time slots included), then tweak like any other channel.
  Available now:
  - **Retro Pro Wrestling**: 1979–1999 wrestling TV (~690 h); *Saturday Night's Main
    Event* Saturdays 11:30 pm, NWA supercards Sunday nights, *Rock 'n' Wrestling* cartoon
    Saturday mornings.
  - **Atomic Age Theater**: black-and-white sci-fi to 1965 (~120 h); the 1936 *Flash
    Gordon* serial Saturdays at noon.
  - **Saturday Morning Cartoons**: Fleischer, early Looney Tunes, Felix, Woody (~45 h).
  - **Classic Sitcoms**: 50s–60s TV comedy (~85 h); *Get Smart* weeknights at 8 pm.
  - **Film Noir After Dark**: 40s–50s noir (~190 h).
  - **Shock Theater**: classic horror to 1970 (~160 h); Creature Double Feature Fri & Sat 11 pm.
  - **Saddle Up**: western TV and B-westerns (~205 h); *The Lone Ranger* Saturdays 10 am.
  - **Game Show Classics**: *What's My Line?*, *You Bet Your Life* and friends (~120 h);
    *What's My Line?* weeknights 7:30 pm. Packs live in
  `packages/server/src/packs/`; new ones are curated by researching the Internet
  Archive (ask Claude for a theme).

Changes take effect after whatever is on now. A new channel starts at its first
episode the moment it's created. Sources are refreshed nightly (new Plex
episodes, new Internet Archive search results). Settings live in
`/DATA/AppData/retro-tv/channels-config.json`.

## Commercial breaks

Between shows, every channel (except the Commercials channel) plays 1–3 vintage
commercials from the Internet Archive's
[`commercials-clean`](https://archive.org/download/commercials-clean) archive
(about 2,000 commercials from 2000–2015). The archive is one 21 GB ZIP, so the
server never downloads all of it: it reads the ZIP's index, then pulls
commercials one at a time, checks them with ffprobe, remuxes them for streaming
and keeps a rolling pool on disk (`/DATA/AppData/retro-tv/commercials`). Breaks
start once 5 commercials are ready, usually within a minute of first start.

Tune with environment variables: `COMMERCIAL_POOL_SIZE` (default 200) and
`COMMERCIAL_CACHE_MB` (default 3000).

If a show won't play (a dead link, or Plex refuses), the TV first tries the other
Plex mode, then fills the slot with commercials under a "We'll be right back"
bug (or colour bars) and returns for the next show on schedule.

## Install on the Chromecast with Google TV

The APK is built by GitHub Actions and published at a fixed URL:
`https://github.com/troylairson/tv/releases/download/android-latest/retro-tv.apk`

**Option A, no computer needed (Downloader app):**
1. On the TV: *Settings → System → About* → click **Android TV OS build** 7 times
   to enable developer options.
2. Install **Downloader** (by AFTVnews) from the Play Store.
3. *Settings → Apps → Security & restrictions → Unknown sources* → allow
   **Downloader**.
4. In Downloader, enter the APK URL above, then install.

**Option B, from a computer with `adb`:**
1. Enable developer options as above, then *Settings → System → Developer options*
   → **USB debugging** on.
2. `adb connect <tv-ip>:5555` (accept the prompt on the TV), then
   `adb install -r retro-tv.apk`.

Open **Retro TV** from the apps row. On first launch, enter
`http://<laptop-ip>:8420`. If the server can't be reached later, the app shows
this setup screen again. The Chromecast remote has no channel buttons: use the
D-pad **↑/↓** to change channels, **OK** for info and **Back** to exit.

## Development

```sh
pnpm install
pnpm dev          # server on :8420 + Vite on :5173 (proxies /api and /plex)
pnpm test         # schedule engine + IA file picking
pnpm typecheck
pnpm build        # packages/server/dist/server.js (single bundle) + packages/web/dist
```

Server environment: `PORT` (8420), `DATA_DIR` (`./data`), `WEB_DIR`
(`../web/dist`), `PLEX_URL`, `PLEX_TOKEN`, `COMMERCIAL_POOL_SIZE`,
`COMMERCIAL_CACHE_MB`. Commercials need `ffmpeg`/`ffprobe` on the PATH (the Docker
image includes them).

Useful endpoints: `/api/channels`, `/api/channels/<id>/airings` (the stored
schedule, commercials included), `/api/settings`, `/api/commercials` (pool status),
`/api/time`, `/api/info`, `/api/diag` (reports from every screen, newest first),
`/api/plex/status`, `/api/plex/test` (runs the whole Plex playback chain from the
server and shows each step's response). Plex problems are also logged by the
server (`docker logs retro-tv`).
