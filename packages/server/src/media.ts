import fs from 'node:fs';
import { Readable } from 'node:stream';

/** Serve a local video file with HTTP Range support, so players can seek (and join mid-commercial). */
export async function serveFile(filePath: string, rangeHeader: string | undefined, contentType = 'video/mp4'): Promise<Response> {
  let size: number;
  try {
    size = (await fs.promises.stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
  };

  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    headers['content-length'] = String(size);
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, { status: 200, headers });
  }

  let start: number;
  let end: number;
  if (m[1] === '') {
    // "bytes=-N": the last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  headers['content-range'] = `bytes ${start}-${end}/${size}`;
  headers['content-length'] = String(end - start + 1);
  return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream, { status: 206, headers });
}
