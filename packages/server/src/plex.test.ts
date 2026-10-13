import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PLAYLIST = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=7502000\nsession/x/base/index.m3u8\n'.repeat(20);

/** A Plex stand-in that gzips its playlist no matter what the client asks for. */
const plex = http.createServer((req, res) => {
  if (req.headers['x-plex-token'] !== 'secret') {
    res.writeHead(401);
    return res.end();
  }
  const body = zlib.gzipSync(PLAYLIST);
  res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'content-encoding': 'gzip', 'content-length': body.length });
  res.end(body);
});

let proxy: (req: Request) => Promise<Response>;

beforeAll(async () => {
  await new Promise<void>((r) => plex.listen(0, '127.0.0.1', r));
  process.env.PLEX_URL = `http://127.0.0.1:${(plex.address() as AddressInfo).port}`;
  process.env.PLEX_TOKEN = 'secret';
  ({ proxy } = await import('./plex'));
});
afterAll(() => void plex.close());

describe('Plex proxy', () => {
  it('passes on the whole body when Plex compresses it (no stale content-length)', async () => {
    const res = await proxy(new Request('http://tv.local/plex/video/:/transcode/universal/start.m3u8?session=x'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBeNull();
    expect(await res.text()).toBe(PLAYLIST);
  });
});
