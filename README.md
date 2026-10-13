# Retro TV

Always-on, cable-TV-style channels built from the Internet Archive and your Plex
server. Every screen in the house shows the same thing at the same moment: tune in
at 3:17 am and you land mid-episode, like real TV.

See [PLAN.md](PLAN.md) for the design and roadmap. **Status: Phase 0** (spikes on
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
| Enter / OK | Show/hide the info banner |
| → | Diagnostics panel (with it open, OK switches Plex transcode/direct) |
| ← | CRT effect on/off |
| Esc / Back | Close panels |

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
(`../web/dist`), `PLEX_URL`, `PLEX_TOKEN`.

Useful endpoints: `/api/channels`, `/api/time`, `/api/info`, `/api/diag`
(reports from every screen, newest first), `/api/plex/status`.
