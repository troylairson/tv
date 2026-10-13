/**
 * Read members out of a huge remote ZIP (the 21 GB commercials archive) with
 * HTTP range requests, without downloading the whole thing. Supports ZIP64,
 * stored and deflated members.
 */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const UA = { 'user-agent': 'retro-tv/0.0 (home use)' };

/** Follow archive.org's redirect to the storage node once, so range requests don't redirect each time. */
export async function resolveUrl(url: string): Promise<{ url: string; length: number }> {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HEAD ${url} → HTTP ${res.status}`);
  const length = Number(res.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) throw new Error(`${url} has no content-length`);
  return { url: res.url, length };
}

async function fetchRange(url: string, start: number, end: number): Promise<Response> {
  const res = await fetch(url, { headers: { ...UA, Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(120_000) });
  if (res.status !== 206) throw new Error(`range ${start}-${end} → HTTP ${res.status} (server must support ranges)`);
  return res;
}

async function readRange(url: string, start: number, end: number): Promise<Buffer> {
  return Buffer.from(await (await fetchRange(url, start, end)).arrayBuffer());
}

/** Parse the end-of-central-directory (+ ZIP64 records) and return every entry. */
export async function readCentralDirectory(url: string, length: number): Promise<ZipEntry[]> {
  // EOCD is 22 bytes plus a comment of up to 64 KB, at the very end.
  const tailStart = Math.max(0, length - 65_557);
  const tail = await readRange(url, tailStart, length - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a ZIP (no end-of-central-directory record)');

  let entries = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error('ZIP64 locator missing');
    const zip64Offset = Number(tail.readBigUInt64LE(locator + 8));
    const rec = zip64Offset >= tailStart ? tail.subarray(zip64Offset - tailStart) : await readRange(url, zip64Offset, zip64Offset + 55);
    if (rec.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 end-of-central-directory record missing');
    entries = Number(rec.readBigUInt64LE(32));
    cdSize = Number(rec.readBigUInt64LE(40));
    cdOffset = Number(rec.readBigUInt64LE(48));
  }

  const cd = await readRange(url, cdOffset, cdOffset + cdSize - 1);
  return parseCentralDirectory(cd, entries);
}

export function parseCentralDirectory(cd: Buffer, expected = Infinity): ZipEntry[] {
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50 && out.length < expected) {
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let localHeaderOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);

    // ZIP64 extra field (0x0001) holds whichever values overflowed, in this order.
    const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    for (let q = 0; q + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(q);
      const len = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let k = q + 4;
        if (size === 0xffffffff) {
          size = Number(extra.readBigUInt64LE(k));
          k += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = Number(extra.readBigUInt64LE(k));
          k += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = Number(extra.readBigUInt64LE(k));
      }
      q += 4 + len;
    }
    out.push({ name, method, compressedSize, size, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Download one member to `dest`, inflating if needed. */
export async function extractEntry(url: string, entry: ZipEntry, dest: string): Promise<void> {
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`unsupported compression method ${entry.method}`);
  // The local header's name/extra lengths can differ from the central directory's.
  const header = await readRange(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (entry.compressedSize === 0) {
    await fs.promises.writeFile(dest, Buffer.alloc(0));
    return;
  }
  const res = await fetchRange(url, dataStart, dataStart + entry.compressedSize - 1);
  if (!res.body) throw new Error('empty response');
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  const out = fs.createWriteStream(dest);
  if (entry.method === 8) await pipeline(body, zlib.createInflateRaw(), out);
  else await pipeline(body, out);
}
