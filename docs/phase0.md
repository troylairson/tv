# Phase 0: test on the real hardware

Goal: find out what the Chromecast with Google TV and the ZimaOS laptop can
actually do before building the real features. Everything below can be read off
the TV's **diagnostics panel** (press → on the remote). Each screen also reports
to the server, so you can read the results from any browser at
`http://<laptop-ip>:8420/api/diag`.

## Already verified (in development)

- Schedule engine: loop + seeded shuffle, offsets exact at boundaries, before the
  anchor and across cycles (14 unit tests).
- Internet Archive: the lineup builds from `classic_tv`, `classic_cartoons`,
  `prelinger`, `classic_tv_commercials` and `feature_films` (about 285 videos,
  about 125 hours). It picks one H.264 MP4 per episode and drops duplicate originals.
- In a browser: power on → tunes to the right file at the right offset (within
  0.1 s); channel up/down shows static; number entry works; switches to the next
  item on schedule.
- Plex adapter against a mock server: library sampling, direct-play URLs, transcode
  URLs, a proxy that adds the token server-side and passes range requests, and
  stopping transcode sessions.

## To test on your setup

### Server on ZimaOS
- [ ] Container starts. `http://<laptop-ip>:8420/api/info` shows 5 channels
      (6 with Plex). The first build takes a minute or two.
- [ ] `/api/plex/status` returns your server's name (token and URL are right).

### Browser (laptop or phone)
- [ ] Channels 2–6 play. Note any **TECHNICAL DIFFICULTIES** screens and the
      error text.
- [ ] Channel 7 (Plex Sampler) plays with **transcode** mode (the default).
- [ ] Diagnostics → OK to switch to **direct**: which of your files play directly?
      (The panel shows each file's container/video/audio codecs.)

### Chromecast with Google TV (in the Retro TV app)
- [ ] App appears in the apps row with its banner; the setup screen accepts the
      server address.
- [ ] Plays with sound immediately (no "PRESS OK" card). That means autoplay works.
- [ ] D-pad ↑/↓ changes channels; Back closes panels, then exits.
- [ ] **Tune time** in diagnostics: a typical value for Internet Archive channels
      and for the Plex channel.
- [ ] **Frames dropped** with the CRT effect on vs off (← toggles it).
- [ ] **Drift / stalls** after 10+ minutes on one channel.
- [ ] **Codecs** row: does it report HEVC, AC-3 and E-AC-3 support? (Decides how
      much Plex can direct-play.)
- [ ] Plex in direct mode: do MKV/HEVC files play?

### Laptop capacity
- [ ] Two screens watching the Plex channel at once in transcode mode: check CPU
      on the ZimaOS dashboard. Does it keep up?

## What the answers decide

| Finding | Decision for Phase 1+ |
|---|---|
| Tune time for archive.org is high (> 3 s) | Pre-buffer the next/adjacent channels, lengthen the static |
| Chromecast plays HEVC/AC-3 directly | Prefer direct play for Plex; transcode only as fallback |
| Laptop struggles with 2 transcodes | Direct play by default; limit Plex channels on screen at once |
| CRT effect drops frames | CRT off by default on the TV |
| HLS drift is large/irregular | Restart Plex streams at the scheduled offset when drift exceeds a threshold |
