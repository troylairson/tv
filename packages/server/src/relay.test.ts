import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relayVideo } from './media';

const BODY = Buffer.from('0123456789abcdefghij');
/** An archive stand-in: /download redirects to a data node, which honours Range. */
const server = http.createServer((req, res) => {
  if (req.url === '/download/x/show.mp4') {
    res.writeHead(302, { location: '/node/x/show.mp4' });
    return res.end();
  }
  if (req.url === '/node/x/show.mp4') {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    if (!m) {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': BODY.length });
      return res.end(BODY);
    }
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : BODY.length - 1;
    res.writeHead(206, { 'content-type': 'video/mp4', 'content-range': `bytes ${start}-${end}/${BODY.length}`, 'content-length': end - start + 1 });
    return res.end(BODY.subarray(start, end + 1));
  }
  res.writeHead(404);
  res.end();
});
let base = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => void server.close());

describe('relayVideo', () => {
  it('follows the redirect and passes Range through', async () => {
    const res = await relayVideo(`${base}/download/x/show.mp4`, 'bytes=5-9', new AbortController().signal);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 5-9/20');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(await res.text()).toBe('56789');
  });
  it('serves the whole file without Range', async () => {
    const res = await relayVideo(`${base}/download/x/show.mp4`, undefined, new AbortController().signal);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BODY.toString());
  });
  it('passes a missing file on as 404, and an unreachable archive as 502', async () => {
    expect((await relayVideo(`${base}/download/x/gone.mp4`, undefined, new AbortController().signal)).status).toBe(404);
    expect((await relayVideo('http://127.0.0.1:1/x.mp4', undefined, new AbortController().signal)).status).toBe(502);
  });
});
