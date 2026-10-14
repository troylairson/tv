import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MEDIA: Record<string, { container: string; videoCodec: string; audioCodec: string }> = {
  '1': { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
  '2': { container: 'mkv', videoCodec: 'hevc', audioCodec: 'ac3' },
  '3': { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
};
/** Item 3: a dub whose default audio is Spanish, with English as a second track. */
const STREAMS: Record<string, unknown[]> = {
  '3': [
    { id: 30, streamType: 1 },
    { id: 31, streamType: 2, languageCode: 'spa', default: true, selected: true },
    { id: 32, streamType: 2, languageCode: 'eng' },
  ],
};
let requests: { path: string; at: number }[] = [];

/** A Plex stand-in: slow metadata, instant playback decisions. */
const plex = http.createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0]!;
  requests.push({ path: req.method === 'PUT' ? `PUT ${req.url}` : path, at: Date.now() });
  if (req.method === 'PUT') {
    res.writeHead(200);
    return res.end();
  }
  const meta = /^\/library\/metadata\/(\d+)$/.exec(path);
  if (meta) {
    const media = MEDIA[meta[1]!]!;
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const part = { id: Number(meta[1]), key: `/library/parts/${meta[1]}/file.${media.container}`, Stream: STREAMS[meta[1]!] };
      res.end(JSON.stringify({ MediaContainer: { Metadata: [{ Media: [{ ...media, Part: [part] }] }] } }));
    }, 150);
    return;
  }
  if (path.endsWith('/decision')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ MediaContainer: { generalDecisionCode: 1000 } }));
  }
  res.writeHead(404);
  res.end();
});

let playback: typeof import('./plex').playback;
let pickAudio: typeof import('./plex').pickAudio;

beforeAll(async () => {
  await new Promise<void>((r) => plex.listen(0, '127.0.0.1', r));
  process.env.PLEX_URL = `http://127.0.0.1:${(plex.address() as AddressInfo).port}`;
  process.env.PLEX_TOKEN = 'secret';
  ({ playback, pickAudio } = await import('./plex'));
});
afterAll(() => void plex.close());
beforeEach(() => {
  requests = [];
});

describe('Plex playback', () => {
  it('auto plays a browser-friendly file directly, without asking for a transcode', async () => {
    const p = await playback('1', 120, 'auto');
    expect(p).toMatchObject({ type: 'file', mode: 'direct', startAt: 120, url: '/plex/library/parts/1/file.mp4' });
    expect(requests.some((r) => r.path.endsWith('/decision'))).toBe(false);
  });

  it('auto converts anything else', async () => {
    const p = await playback('2', 120, 'auto');
    expect(p).toMatchObject({ type: 'hls', mode: 'transcode', startAt: 0 });
    expect(p.url).toContain('offset=120');
  });

  it('a forced transcode asks for the decision while the metadata is still loading', async () => {
    const started = Date.now();
    await playback('1', 0, 'transcode');
    const decision = requests.find((r) => r.path.endsWith('/decision'))!;
    expect(decision.at - started).toBeLessThan(100);
  });

  it('converts a file whose default audio is the wrong language, with the right track selected', async () => {
    const p = await playback('3', 0, 'auto');
    expect(p).toMatchObject({ type: 'hls', mode: 'transcode' });
    expect(p.media?.audioLanguage).toBe('eng');
    expect(requests.map((r) => r.path)).toContain('PUT /library/parts/3?audioStreamID=32&allParts=1');
  });
});

describe('pickAudio', () => {
  const tracks = [
    { id: 1, streamType: 2, languageCode: 'jpn', default: true },
    { id: 2, streamType: 2, language: 'English' },
  ];
  it('picks the preferred language and says when it is not the default track', () => {
    expect(pickAudio(tracks, 'eng')).toEqual({ stream: tracks[1], switched: true });
    expect(pickAudio(tracks, 'jpn')).toEqual({ stream: tracks[0], switched: false });
  });
  it('leaves single-track files, missing languages and "file default" alone', () => {
    expect(pickAudio([tracks[0]!], 'eng')).toBeNull();
    expect(pickAudio(tracks, 'fra')).toBeNull();
    expect(pickAudio(tracks, 'file')).toBeNull();
  });
});
