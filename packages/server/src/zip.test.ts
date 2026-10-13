import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractEntry, readCentralDirectory, resolveUrl } from './zip';

const fixtures = path.join(__dirname, '..', 'test-fixtures');

/** Serves byte ranges of a "virtual file" made of chunks at fixed offsets; anything else is 416. */
function rangeServer(length: number, chunks: { offset: number; data: Buffer }[]) {
  return http.createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-length': length, 'accept-ranges': 'bytes' });
      return res.end();
    }
    const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '');
    if (!m) {
      res.writeHead(400);
      return res.end();
    }
    const start = Number(m[1]);
    const end = Number(m[2]);
    const chunk = chunks.find((c) => start >= c.offset && end < c.offset + c.data.length);
    if (!chunk) {
      res.writeHead(416);
      return res.end();
    }
    res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${length}` });
    res.end(chunk.data.subarray(start - chunk.offset, end - chunk.offset + 1));
  });
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/archive.zip`;
}

describe('remote ZIP64 (real commercials-clean index)', () => {
  const LENGTH = 20_882_179_437;
  const CD_OFFSET = 20_881_902_192;
  // The fixture is the archive's last 64 KiB; the reader asks for 21 bytes more, which pad as zeros.
  const tail = Buffer.concat([Buffer.alloc(21), zlib.gunzipSync(fs.readFileSync(path.join(fixtures, 'commercials-tail.bin.gz')))]);
  const cd = zlib.gunzipSync(fs.readFileSync(path.join(fixtures, 'commercials-cd.bin.gz')));
  const server = rangeServer(LENGTH, [
    { offset: LENGTH - tail.length, data: tail },
    { offset: CD_OFFSET, data: cd },
  ]);
  let url = '';
  beforeAll(async () => {
    url = await listen(server);
  });
  afterAll(() => void server.close());

  it('reads every entry with 64-bit offsets', async () => {
    const { length } = await resolveUrl(url);
    expect(length).toBe(LENGTH);
    const entries = await readCentralDirectory(url, length);
    expect(entries).toHaveLength(2032);
    const mac = entries.find((e) => e.name === 'Commercials/2009/Get A Mac - Teeter Tottering.mp4');
    expect(mac).toMatchObject({ method: 8 });
    expect(Math.max(...entries.map((e) => e.localHeaderOffset))).toBeGreaterThan(2 ** 32);
  });
});

describe('extractEntry', () => {
  const zip = fs.readFileSync(path.join(fixtures, 'small.zip'));
  const server = rangeServer(zip.length, [{ offset: 0, data: zip }]);
  let url = '';
  beforeAll(async () => {
    url = await listen(server);
  });
  afterAll(() => void server.close());

  it('extracts stored and deflated members', async () => {
    const entries = await readCentralDirectory(url, zip.length);
    expect(entries.map((e) => e.name)).toEqual([
      'Commercials/2003/stored.txt',
      'Commercials/2004/[2004] deflated.txt',
      'Commercials/',
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
    await extractEntry(url, entries[0]!, path.join(dir, 'a'));
    await extractEntry(url, entries[1]!, path.join(dir, 'b'));
    expect(fs.readFileSync(path.join(dir, 'a'), 'utf8')).toBe('hello stored member');
    expect(fs.readFileSync(path.join(dir, 'b'), 'utf8')).toBe('deflate me '.repeat(200));
  });
});
