import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MEDIA: Record<string, { container: string; videoCodec: string; audioCodec: string }> = {
  '1': { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
  '2': { container: 'mkv', videoCodec: 'hevc', audioCodec: 'ac3' },
};
let requests: { path: string; at: number }[] = [];

/** A Plex stand-in: slow metadata, instant playback decisions. */
const plex = http.createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0]!;
  requests.push({ path, at: Date.now() });
  const meta = /^\/library\/metadata\/(\d+)$/.exec(path);
  if (meta) {
    const media = MEDIA[meta[1]!]!;
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ MediaContainer: { Metadata: [{ Media: [{ ...media, Part: [{ key: `/library/parts/${meta[1]}/file.${media.container}` }] }] }] } }));
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

beforeAll(async () => {
  await new Promise<void>((r) => plex.listen(0, '127.0.0.1', r));
  process.env.PLEX_URL = `http://127.0.0.1:${(plex.address() as AddressInfo).port}`;
  process.env.PLEX_TOKEN = 'secret';
  ({ playback } = await import('./plex'));
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
});
